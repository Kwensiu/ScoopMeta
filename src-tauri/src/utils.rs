use crate::commands::settings;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};
use url::Url;

#[derive(Debug, Clone)]
pub struct ScoopAppShortcut {
    pub name: String,
    pub display_name: String,
    pub target_path: String,
    pub working_directory: String,
    pub icon_path: Option<String>,
}

/// Checks if the application is installed via Scoop
pub fn is_scoop_installation() -> bool {
    if let Ok(exe_path) = env::current_exe() {
        let path_str = exe_path.to_string_lossy().to_lowercase();
        let result = path_str.contains("scoop") && path_str.contains("apps") && path_str.contains("rscoop");
        result
    } else {
        log::info!("is_scoop_installation check: failed to get current exe path");
        false
    }
}

#[derive(Debug, Clone)]
struct ScoopRootCandidateInfo {
    path: PathBuf,
    score: u32,
    installed_count: usize,
    has_apps_dir: bool,
    has_buckets_dir: bool,
}

fn push_candidate(seen: &mut HashSet<String>, candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if path.as_os_str().is_empty() {
        return;
    }

    let key = path.to_string_lossy().to_lowercase();
    if seen.insert(key) {
        log::debug!("Adding candidate path: {}", path.display());
        candidates.push(path);
    }
}

fn collect_common_candidates(seen: &mut HashSet<String>, candidates: &mut Vec<PathBuf>) {
    log::info!("Collecting common Scoop path candidates");
    
    // Priority 1: Environment variables
    if let Ok(scoop_path) = env::var("SCOOP") {
        log::info!("Found SCOOP environment variable: {}", scoop_path);
        push_candidate(seen, candidates, PathBuf::from(scoop_path));
    }

    if let Ok(global_path) = env::var("SCOOP_GLOBAL") {
        log::info!("Found SCOOP_GLOBAL environment variable: {}", global_path);
        push_candidate(seen, candidates, PathBuf::from(global_path));
    }

    // Priority 2: Try to get scoop root from scoop command itself (most reliable)
    if let Ok(scoop_root) = get_scoop_root_from_command() {
        log::info!("Found scoop root from command: {}", scoop_root.display());
        push_candidate(seen, candidates, scoop_root);
    } else {
        // Priority 3: Common fallback paths
        log::info!("Using fallback detection");
        
        // User profile scoop installation
        if let Ok(user_profile) = env::var("USERPROFILE") {
            push_candidate(seen, candidates, PathBuf::from(user_profile).join("scoop"));
        }
        
        // System-wide installation
        if let Ok(program_data) = env::var("PROGRAMDATA") {
            push_candidate(seen, candidates, PathBuf::from(program_data).join("scoop"));
        }
        
        // System drive dynamic detection
        if let Ok(system_drive) = env::var("SystemDrive") {
            let drive_root = system_drive.trim_end_matches('\\');
            push_candidate(seen, candidates, PathBuf::from(format!("{}\\scoop", drive_root)));
        }
        
        // Common hardcoded paths
        push_candidate(seen, candidates, PathBuf::from(r"C:\scoop"));
        push_candidate(seen, candidates, PathBuf::from(r"D:\scoop"));
    }
}



pub fn build_candidate_list<I>(extras: I) -> Vec<PathBuf>
where
    I: IntoIterator<Item = PathBuf>,
{
    log::info!("Building candidate list");
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    for path in extras {
        log::info!("Adding extra path to candidates: {}", path.display());
        push_candidate(&mut seen, &mut candidates, path);
    }

    collect_common_candidates(&mut seen, &mut candidates);

    log::info!("Built candidate list with {} paths", candidates.len());
    for (i, candidate) in candidates.iter().enumerate() {
        log::debug!("Candidate {}: {}", i, candidate.display());
    }
    
    candidates
}

fn evaluate_scoop_candidate(path: PathBuf) -> Option<ScoopRootCandidateInfo> {
    log::info!("Evaluating Scoop candidate: {}", path.display());
    
    if !path.is_dir() {
        log::info!("Candidate path is not a directory");
        return None;
    }

    let apps_dir = path.join("apps");
    let buckets_dir = path.join("buckets");
    let has_apps_dir = apps_dir.is_dir();
    let has_buckets_dir = buckets_dir.is_dir();

    log::info!("Candidate evaluation - apps_dir: {} ({}), buckets_dir: {} ({})", 
               apps_dir.display(), has_apps_dir, buckets_dir.display(), has_buckets_dir);

    if !has_apps_dir && !has_buckets_dir {
        log::info!("Candidate rejected - missing both apps and buckets directories");
        return None;
    }

    let installed_count = if has_apps_dir {
        match fs::read_dir(&apps_dir) {
            Ok(entries) => {
                let count = entries
                    .filter_map(Result::ok)
                    .filter(|entry| entry.path().is_dir())
                    .take(200)
                    .count();
                log::info!("Found {} installed apps in apps directory", count);
                count
            },
            Err(e) => {
                log::warn!("Failed to read apps directory: {}", e);
                0
            }
        }
    } else {
        log::info!("No apps directory found");
        0
    };

    let mut score = 0;
    if has_buckets_dir {
        score += 10;
        log::info!("+10 points for having buckets directory");
    }
    if has_apps_dir {
        score += 30;
        log::info!("+30 points for having apps directory");
    }
    score += installed_count.min(50) as u32;
    log::info!("+{} points for installed apps (capped at 50)", installed_count.min(50));

    log::info!("Total score for candidate {}: {}", path.display(), score);

    Some(ScoopRootCandidateInfo {
        path,
        score,
        installed_count,
        has_apps_dir,
        has_buckets_dir,
    })
}

fn select_best_scoop_root(
    candidates: Vec<PathBuf>,
    preferred: Option<&PathBuf>,
) -> Option<ScoopRootCandidateInfo> {
    log::info!("Selecting best Scoop root from {} candidates", candidates.len());
    let mut best: Option<ScoopRootCandidateInfo> = None;

    for candidate in candidates {
        let candidate_display = candidate.display().to_string();
        let evaluated_candidate = evaluate_scoop_candidate(candidate);
        
        if evaluated_candidate.is_some() {
            let mut info = evaluated_candidate.unwrap();
            
            if preferred.is_some() && preferred.unwrap().eq(&info.path) {
                info.score += 5;
                log::info!("+5 points for being the preferred path");
            }

            log::debug!(
                "Scored potential Scoop root {} => score {} (apps_dir={}, buckets_dir={}, installed={})",
                info.path.display(),
                info.score,
                info.has_apps_dir,
                info.has_buckets_dir,
                info.installed_count
            );

            let replace = if best.is_some() {
                let current = best.as_ref().unwrap();
                let should_replace = info.score > current.score
                    || (info.score == current.score
                        && info.installed_count > current.installed_count);
                log::debug!("Comparing with current best - current score: {}, candidate score: {}, replace: {}", 
                           current.score, info.score, should_replace);
                should_replace
            } else { 
                true // No current best, always replace
            };

            if replace {
                log::info!("Setting new best candidate: {} with score {}", info.path.display(), info.score);
                best = Some(info);
            }
        } else {
            log::debug!("Skipping invalid candidate: {}", candidate_display);
        }
    }

    log::info!("Best Scoop root selection completed. Best candidate: {:?}", best.as_ref().map(|b| b.path.display().to_string()));
    best
}

/// Resolve the root directory of Scoop on the host machine.
///
/// The resolver inspects the persisted setting first, then scores a set of
/// likely directories (environment variables, known install paths, user
/// profiles) by checking for Scoop buckets and installed apps. The best match
/// is remembered for future runs so MSI/Elevated launches still find the
/// user's Scoop data.
///
/// # Errors
/// Returns Err when no plausible Scoop installation directory could be found.
pub fn resolve_scoop_root<R: Runtime>(app: AppHandle<R>) -> Result<PathBuf, String> {
    log::info!("Resolving Scoop root directory");
    
    let stored_path = settings::get_scoop_path(app.clone())
        .ok()
        .flatten()
        .map(PathBuf::from);

    if let Some(path) = stored_path.as_ref() {
        log::info!("Found stored Scoop path: {}", path.display());
        if evaluate_scoop_candidate(path.clone()).is_none() {
            log::warn!(
                "Stored scoop path is invalid or inaccessible: {}",
                path.display()
            );
        }
    } else {
        log::info!("No stored Scoop path found");
    }

    let candidates = build_candidate_list(stored_path.clone().into_iter());
    log::info!("Built {} candidates for Scoop root", candidates.len());

    if let Some(best) = select_best_scoop_root(candidates, stored_path.as_ref()) {
        let best_path = best.path.clone();
        let stored_matches = stored_path
            .as_ref()
            .map(|p| p == &best_path)
            .unwrap_or(false);

        if stored_matches {
            log::info!("Using user-defined scoop path: {}", best_path.display());
        } else {
            log::info!(
                "Auto-detected Scoop root: {} (apps_dir={}, buckets_dir={}, installs={})",
                best_path.display(),
                best.has_apps_dir,
                best.has_buckets_dir,
                best.installed_count
            );

            if let Err(e) =
                settings::set_scoop_path(app.clone(), best_path.to_string_lossy().to_string())
            {
                log::warn!(
                    "Failed to persist detected Scoop path '{}': {}",
                    best_path.display(),
                    e
                );
            }
        }

        log::info!("Resolved Scoop root to: {}", best_path.display());
        return Ok(best_path);
    }

    let error_msg = "Unable to determine Scoop root directory. Please configure it explicitly in Settings.";
    log::error!("{}", error_msg);
    Err(error_msg.to_string())
}

// -----------------------------------------------------------------------------
// Manifest helpers
// -----------------------------------------------------------------------------

/// Locate a manifest file for `package_name` within the Scoop buckets.
///
/// If `package_source` is supplied it will be treated as an exact bucket name
/// and only that bucket will be inspected. Otherwise all buckets are searched
/// in parallel and the first match is returned.
///
/// The returned tuple contains the fully qualified path to the manifest file
/// and the bucket name the manifest originated from.
///
/// # Errors
/// Propagates any I/O failure and returns a domain-specific error when the
/// manifest cannot be located.
pub fn locate_package_manifest(
    scoop_dir: &std::path::Path,
    package_name: &str,
    package_source: Option<String>,
) -> Result<(PathBuf, String), String> {
    locate_package_manifest_impl(scoop_dir, package_name, package_source)
}

// Internal implementation that contains the previous logic. This avoids code
// duplication while giving us the opportunity to phase out the old API.
fn locate_package_manifest_impl(
    scoop_dir: &std::path::Path,
    package_name: &str,
    package_source: Option<String>,
) -> Result<(PathBuf, String), String> {
    let buckets_dir = scoop_dir.join("buckets");

    let search_buckets = |bucket_path: PathBuf| -> Result<(PathBuf, String), String> {
        if bucket_path.is_dir() {
            let bucket_name = bucket_path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string();

            let manifest_filename = format!("{}.json", package_name);

            let manifest_path = bucket_path.join(&manifest_filename);
            if manifest_path.exists() {
                return Ok((manifest_path, bucket_name));
            }

            let nested_manifest_path = bucket_path.join("bucket").join(&manifest_filename);
            if nested_manifest_path.exists() {
                return Ok((nested_manifest_path, bucket_name));
            }
        }
        Err(format!("Package '{}' not found.", package_name))
    };

    // 1. Try to find in specific bucket if provided
    if let Some(source) = &package_source {
        if !source.is_empty() && source != "None" && buckets_dir.is_dir() {
            let specific_bucket_path = buckets_dir.join(source);
            if let Ok(found) = search_buckets(specific_bucket_path) {
                return Ok(found);
            }
        }
    }

    // 2. Search all buckets
    if buckets_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&buckets_dir) {
            for entry in entries.flatten() {
                if let Ok(found) = search_buckets(entry.path()) {
                    return Ok(found);
                }
            }
        }
    }

    // 3. Check installed apps if not found in buckets
    let installed_manifest_path = scoop_dir
        .join("apps")
        .join(package_name)
        .join("current")
        .join("manifest.json");

    if installed_manifest_path.exists() {
        // Try to read install.json to get the original bucket name if possible
        let install_json_path = scoop_dir
            .join("apps")
            .join(package_name)
            .join("current")
            .join("install.json");

        let mut bucket_name = "Installed (Bucket missing)".to_string();

        if install_json_path.exists() {
            if let Ok(content) = std::fs::read_to_string(install_json_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(bucket) = json.get("bucket").and_then(|b| b.as_str()) {
                        bucket_name = format!("{} (missing)", bucket);
                    }
                }
            }
        }

        return Ok((installed_manifest_path, bucket_name));
    }

    if let Some(source) = package_source {
        if !source.is_empty() && source != "None" {
            return Err(format!(
                "Package '{}' not found in bucket '{}'.",
                package_name, source
            ));
        }
    }

    Err(format!(
        "Package '{}' not found in any bucket.",
        package_name
    ))
}

// -----------------------------------------------------------------------------
// Scoop Apps Shortcuts helpers
// -----------------------------------------------------------------------------

/// Scans the Windows Start Menu for Scoop Apps shortcuts
///
/// Returns a list of shortcuts found in %AppData%\Microsoft\Windows\Start Menu\Programs\Scoop Apps
pub fn get_scoop_app_shortcuts_with_path(
    scoop_path: &std::path::Path,
) -> Result<Vec<ScoopAppShortcut>, String> {
    let app_data =
        env::var("APPDATA").map_err(|_| "Could not find APPDATA environment variable")?;
    let scoop_apps_path = PathBuf::from(app_data)
        .join("Microsoft")
        .join("Windows")
        .join("Start Menu")
        .join("Programs")
        .join("Scoop Apps");

    if !scoop_apps_path.exists() {
        log::debug!(
            "Scoop Apps directory not found: {}",
            scoop_apps_path.display()
        );
        return Ok(Vec::new());
    }

    let mut shortcuts = Vec::new();

    for entry in fs::read_dir(&scoop_apps_path)
        .map_err(|e| format!("Failed to read Scoop Apps directory: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("lnk") {
            if let Some(file_stem) = path.file_stem().and_then(|s| s.to_str()) {
                if let Ok(shortcut_info) = parse_shortcut(&path, scoop_path) {
                    shortcuts.push(ScoopAppShortcut {
                        name: file_stem.to_string(),
                        display_name: file_stem.replace("_", " ").to_string(),
                        target_path: shortcut_info.target_path,
                        working_directory: shortcut_info.working_directory,
                        icon_path: shortcut_info.icon_path,
                    });
                } else {
                    log::trace!("Failed to parse shortcut: {}", path.display());
                }
            }
        }
    }

    if !shortcuts.is_empty() {
        log::info!("Scoop Apps shortcuts detected: {}", shortcuts.len());
    }
    Ok(shortcuts)
}

/// Try to get scoop root by running scoop config command
fn get_scoop_root_from_command() -> Result<PathBuf, Box<dyn std::error::Error>> {
    use std::process::Command;
    
    log::info!("Attempting to get scoop root from command");
    
    let output = Command::new("scoop")
        .args(&["config", "root_path"])
        .output();
    
    match output {
        Ok(result) => {
            if result.status.success() {
                let scoop_path = String::from_utf8(result.stdout)?;
                let trimmed_path = scoop_path.trim();
                
                if !trimmed_path.is_empty() && PathBuf::from(trimmed_path).exists() {
                    log::info!("Found scoop root from command: {}", trimmed_path);
                    return Ok(PathBuf::from(trimmed_path));
                }
            } else {
                let stderr = String::from_utf8_lossy(&result.stderr);
                log::debug!("scoop config root_path failed: {}", stderr);
            }
        }
        Err(e) => {
            log::debug!("Failed to execute scoop command: {}", e);
        }
    }
    
    Err("Failed to get scoop root from command".into())
}

/// Legacy wrapper for backwards compatibility - tries to find Scoop root automatically
pub fn get_scoop_app_shortcuts() -> Result<Vec<ScoopAppShortcut>, String> {
    // Try to find Scoop root automatically for backwards compatibility
    let scoop_root = get_scoop_root_fallback();
    get_scoop_app_shortcuts_with_path(&scoop_root)
}

/// Check if a path is a valid Scoop candidate (has apps or buckets directory)
pub fn is_valid_scoop_candidate(path: &PathBuf) -> bool {
    if !path.exists() || !path.is_dir() {
        return false;
    }
    
    let apps_dir = path.join("apps");
    let buckets_dir = path.join("buckets");
    
    let has_apps = apps_dir.exists() && apps_dir.is_dir();
    let has_buckets = buckets_dir.exists() && buckets_dir.is_dir();
    
    // A valid scoop installation should have at least one of these directories
    has_apps || has_buckets
}

use std::sync::{Mutex, OnceLock};

// Global cache for Scoop root to avoid repeated detection
static SCOOP_ROOT_CACHE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

/// Get Scoop root directory as fallback when AppState is not available
pub fn get_scoop_root_fallback() -> PathBuf {
    // Try to get from cache first
    let cache = SCOOP_ROOT_CACHE.get_or_init(|| Mutex::new(None));
    
    // Check if we have a cached value
    {
        let cached_value = cache.lock().unwrap();
        if let Some(ref path) = *cached_value {
            log::debug!("Using cached Scoop root: {}", path.display());
            return path.clone();
        }
    }
    
    // No cached value, perform detection
    let candidates = build_candidate_list(Vec::<PathBuf>::new());

    if let Some(best) = select_best_scoop_root(candidates, None) {
        log::info!(
            "Using Scoop root fallback: {} (apps_dir={}, buckets_dir={}, installs={})",
            best.path.display(),
            best.has_apps_dir,
            best.has_buckets_dir,
            best.installed_count
        );
        
        // Cache the result
        {
            let mut cached_value = cache.lock().unwrap();
            *cached_value = Some(best.path.clone());
        }
        
        return best.path;
    }

    log::warn!("Could not find Scoop root directory, using default");
    let default_path = PathBuf::from("C:\\scoop");
    
    // Cache the default as well
    {
        let mut cached_value = cache.lock().unwrap();
        *cached_value = Some(default_path.clone());
    }
    
    default_path
}

/// Clear the Scoop root cache (useful when Scoop configuration changes)
pub fn clear_scoop_root_cache() {
    if let Some(cache) = SCOOP_ROOT_CACHE.get() {
        let mut cached_value = cache.lock().unwrap();
        *cached_value = None;
        log::info!("Scoop root cache cleared");
    }
}

#[derive(Debug)]
struct ShortcutInfo {
    target_path: String,
    working_directory: String,
    icon_path: Option<String>,
}

/// Parse a Windows .lnk shortcut file to extract target and working directory
/// Uses the lnk crate to parse LNK files directly
/// Verbose byte-level output from the lnk crate is gated behind TRACE level
#[cfg(windows)]
fn parse_shortcut(path: &PathBuf, _scoop_root: &std::path::Path) -> Result<ShortcutInfo, String> {
    // Use the lnk crate to parse the shortcut file
    match lnk::ShellLink::open(path, lnk::encoding::WINDOWS_1252) {
        Ok(shortcut) => {
            // Extract target path - try different methods to get the target
            let mut target_path = {
                let string_data = shortcut.string_data();
                // Try relative path first
                if let Some(relative_path) = string_data.relative_path() {
                    relative_path.to_string()
                } else {
                    String::new()
                }
            };

            // If target path is still empty, try to get it from link info
            if target_path.is_empty() {
                if let Some(link_info) = shortcut.link_info() {
                    if let Some(local_path) = link_info.local_base_path() {
                        target_path = local_path.to_string();
                    }
                }
            }

            // Convert relative path to absolute path if needed
            if !target_path.is_empty() && target_path.starts_with("..") {
                // The relative path is relative to the shortcut's directory
                if let Some(shortcut_dir) = path.parent() {
                    let absolute_path = shortcut_dir.join(&target_path);
                    if let Ok(canonical_path) = absolute_path.canonicalize() {
                        target_path = canonical_path.to_string_lossy().to_string();
                        log::trace!("Resolved relative path to: {}", target_path);
                    } else {
                        log::warn!("Failed to canonicalize path: {}", absolute_path.display());
                    }
                }
            }

            // Extract working directory
            let working_directory = {
                let string_data = shortcut.string_data();
                if let Some(working_dir) = string_data.working_dir() {
                    working_dir.to_string()
                } else {
                    String::new()
                }
            };

            // If no working directory specified, use target path's parent directory
            let working_directory = if working_directory.is_empty() && !target_path.is_empty() {
                if let Some(parent) = std::path::Path::new(&target_path).parent() {
                    parent.to_string_lossy().to_string()
                } else {
                    env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string())
                }
            } else if working_directory.is_empty() {
                env::var("USERPROFILE").unwrap_or_else(|_| "C:\\".to_string())
            } else {
                working_directory
            };

            // Extract icon location if available
            let icon_path = {
                let string_data = shortcut.string_data();
                string_data.icon_location().as_ref().map(|s| s.to_string())
            };

            Ok(ShortcutInfo {
                target_path,
                working_directory,
                icon_path,
            })
        }
        Err(e) => {
            log::trace!("Failed to parse LNK file: {}", e);

            // Return error instead of fallback for cleaner error handling
            Err(format!("Failed to parse LNK file: {}", e))
        }
    }
}

#[cfg(not(windows))]
fn parse_shortcut(_path: &PathBuf, _scoop_root: &std::path::Path) -> Result<ShortcutInfo, String> {
    Err("Shortcut parsing is only supported on Windows".to_string())
}

/// Launch a Scoop app using its target path
pub fn launch_scoop_app(target_path: &str, working_directory: &str) -> Result<(), String> {
    log::info!(
        "Launching app: '{}' from '{}'",
        target_path,
        working_directory
    );

    // Validate that we have a target path
    if target_path.is_empty() {
        return Err("No target path specified for app launch".to_string());
    }

    // Check if the target path exists
    if !std::path::Path::new(target_path).exists() {
        return Err(format!("Target executable not found: {}", target_path));
    }

    use std::process::Command;

    let mut cmd = Command::new(target_path);

    // Set working directory if provided and valid
    if !working_directory.is_empty() {
        let working_dir_path = std::path::Path::new(working_directory);
        if working_dir_path.exists() {
            cmd.current_dir(working_directory);
        } else {
            log::warn!(
                "Working directory does not exist: {}, using default",
                working_directory
            );
        }
    }

    // Detach the process so it doesn't block
    match cmd.spawn() {
        Ok(_) => {
            log::info!("Successfully launched app: {}", target_path);
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("Failed to launch app '{}': {}", target_path, e);
            log::error!("{}", error_msg);
            Err(error_msg)
        }
    }
}

/// Checks if the current working directory matches the executable directory.
/// If not, it relaunches the application with the correct working directory using ShellExecute.
/// This fixes issues with MSI installers launching the app with the wrong CWD and restricted tokens.
#[cfg(windows)]
pub fn ensure_correct_cwd_and_launch() {
    // Skip this check in development mode
    if cfg!(debug_assertions) {
        return;
    }

    use std::env;
    use std::fs;
    use std::process::Command;

    let sentinel_path = env::temp_dir().join("rscoop_relaunch.lock");

    // Check for sentinel file (loop breaker)
    if sentinel_path.exists() {
        // If sentinel exists, we are the relaunched process.
        // Force CWD to exe dir and clean up.
        if let Ok(exe_path) = env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                let _ = env::set_current_dir(exe_dir);
            }
        }
        let _ = fs::remove_file(&sentinel_path);
        return;
    }

    if let (Ok(exe_path), Ok(_cwd)) = (env::current_exe(), env::current_dir()) {
        if let Some(_exe_dir) = exe_path.parent() {
            // Use the shared mismatch check
            if !is_cwd_mismatch() {
                return;
            }

            // Create sentinel file to prevent loop
            let _ = fs::write(&sentinel_path, "Relaunching...");

            // Relaunch via Explorer to escape MSI environment
            let _ = Command::new("explorer").arg(&exe_path).spawn();
            std::process::exit(0);
        }
    }
}

/// Checks if the current working directory matches the application's install directory.
/// Returns true if they don't match.
pub fn is_cwd_mismatch() -> bool {
    // Helper to strip UNC prefix for comparison
    fn normalize(p: &std::path::Path) -> PathBuf {
        let s = p.to_string_lossy();
        if s.starts_with(r"\\?\") {
            PathBuf::from(&s[4..])
        } else {
            p.to_path_buf()
        }
    }

    if let (Ok(exe_path), Ok(cwd)) = (env::current_exe(), env::current_dir()) {
        // Get the directory containing the executable
        let exe_dir = if let Some(parent) = exe_path.parent() {
            parent.to_path_buf()
        } else {
            return false;
        };

        let exe_dir_norm = normalize(&exe_dir).to_string_lossy().to_lowercase();
        let cwd_norm = normalize(&cwd).to_string_lossy().to_lowercase();

        exe_dir_norm != cwd_norm
    } else {
        false
    }
}

/// Counts the number of manifest (.json) files in a bucket directory.
/// Handles both flat structure and bucket/ subdirectory structure.
pub fn count_manifests(bucket_path: &std::path::Path) -> u32 {
    let mut count = 0;

    // Check for manifests in the root of the bucket
    if let Ok(entries) = fs::read_dir(bucket_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                // Skip certain files that aren't package manifests
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if !file_name.starts_with('.') && file_name != "bucket.json" {
                        count += 1;
                    }
                }
            }
        }
    }

    // Always check the bucket/ subdirectory as well (many buckets primarily use this structure)
    let bucket_subdir = bucket_path.join("bucket");
    if bucket_subdir.is_dir() {
        if let Ok(entries) = fs::read_dir(bucket_subdir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("json") {
                    count += 1;
                }
            }
        }
    }

    count
}

// -----------------------------------------------------------------------------
// URL and Bucket Helpers
// -----------------------------------------------------------------------------

// Regex to validate and normalize Git URLs
static GIT_URL_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(?:https?://)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)/([^/]+)/([^/]+?)(?:\.git)?/?$").unwrap()
});

/// Validate and normalize repository URL
pub fn validate_and_normalize_url(url: &str) -> Result<String, String> {
    // Handle common URL formats
    let normalized_url = if url.starts_with("http://") || url.starts_with("https://") {
        url.to_string()
    } else if url.contains("github.com")
        || url.contains("gitlab.com")
        || url.contains("bitbucket.org")
    {
        if url.starts_with("git@") {
            // Convert SSH format to HTTPS
            if let Some(captures) = Regex::new(r"git@([^:]+):([^/]+)/(.+?)(?:\.git)?$")
                .unwrap()
                .captures(url)
            {
                let host = &captures[1];
                let user = &captures[2];
                let repo = &captures[3];
                format!("https://{}/{}/{}.git", host, user, repo)
            } else {
                return Err("Invalid SSH Git URL format".to_string());
            }
        } else {
            // Assume it's a GitHub shorthand like "user/repo"
            if url.split('/').count() == 2 && !url.contains('.') {
                format!("https://github.com/{}.git", url)
            } else {
                format!("https://{}", url.trim_start_matches("www."))
            }
        }
    } else if url.split('/').count() == 2 && !url.contains('.') {
        // Handle GitHub shorthand "user/repo"
        format!("https://github.com/{}.git", url)
    } else {
        return Err(
            "URL must be a valid Git repository (GitHub, GitLab, or Bitbucket)".to_string(),
        );
    };

    // Ensure .git extension for consistency
    let final_url = if !normalized_url.ends_with(".git")
        && (normalized_url.contains("github.com")
            || normalized_url.contains("gitlab.com")
            || normalized_url.contains("bitbucket.org"))
    {
        format!("{}.git", normalized_url)
    } else {
        normalized_url
    };

    // Validate URL format
    match Url::parse(&final_url) {
        Ok(_) => Ok(final_url),
        Err(_) => Err("Invalid URL format".to_string()),
    }
}

/// Extract bucket name from URL or use provided name
pub fn extract_bucket_name_from_url(
    url: &str,
    provided_name: Option<&str>,
) -> Result<String, String> {
    if let Some(name) = provided_name {
        if !name.is_empty() {
            return Ok(name.to_lowercase().trim().to_string());
        }
    }

    // Try to extract from URL
    if let Some(captures) = GIT_URL_REGEX.captures(url) {
        let repo_name = captures.get(2).unwrap().as_str();
        // Remove common prefixes and clean up
        let clean_name = repo_name
            .replace("scoop-", "")
            .replace("Scoop-", "")
            .replace("scoop_", "")
            .to_lowercase();

        if clean_name.is_empty() {
            return Err("Could not extract valid bucket name from URL".to_string());
        }

        Ok(clean_name)
    } else {
        Err("Could not extract bucket name from URL. Please provide a name.".to_string())
    }
}
