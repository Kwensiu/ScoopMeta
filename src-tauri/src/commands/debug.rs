//! Commands for retrieving diagnostic information about the application.
use crate::state::AppState;
use chrono::Local;
use std::fs;
use std::path::PathBuf;
use tauri::State;

// Note: Retry logic constants are defined locally in functions as needed

// Application identifiers
const TAURI_APP_ID: &str = "com.pailer.ks";
const OLD_APP_DIR: &str = "pailer";

// Store data file names (new unified format)
const FRONTEND_STORE_FILE: &str = "settings.json";
const BACKEND_STORE_FILE: &str = "core.json";
const VERSION_FILE: &str = "version.txt";
const FACTORY_RESET_MARKER: &str = ".factory_reset";
const WEBVIEW_CLEANUP_MARKER: &str = ".cleanup_webview_on_startup";

// Legacy store file names (for cleanup)
const LEGACY_SETTINGS_FILE: &str = "settings.dat";
const LEGACY_SIGNALS_FILE: &str = "signals.dat";
const LEGACY_STORE_FILE: &str = "store.json";

// Backup file extension
const BACKUP_EXT: &str = ".bak";

// Note: LOCKED_FILES constant has been removed as it was unused

// WebView locked patterns
const WEBVIEW_LOCKED_PATTERNS: &[&str] = &["LOCK", "LOG", "MANIFEST-", ".log"];

// WebView locked directories
const WEBVIEW_LOCKED_DIRS: &[&str] = &[
    "shared_proto_db",
    "IndexedDB",
    "Local Storage",
    "Session Storage",
    "GPUCache",
    "Code Cache",
];

/// Gets the application data directory
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, String> {
    // First try to get the Tauri app data directory
    if let Some(app_data_dir) = dirs::data_dir() {
        let app_data_dir = app_data_dir.join(TAURI_APP_ID);
        if app_data_dir.exists() {
            return Ok(app_data_dir.to_string_lossy().to_string());
        }
    }

    // Fallback to the old pailer directory for backward compatibility
    let data_dir = dirs::data_local_dir()
        .and_then(|d| Some(d.join(OLD_APP_DIR)))
        .ok_or("Could not determine data directory")?;

    Ok(data_dir.to_string_lossy().to_string())
}

/// Gets the log directory
#[tauri::command]
pub fn get_log_dir_cmd() -> Result<String, String> {
    let log_dir = get_log_dir().ok_or("Could not determine log directory")?;
    Ok(log_dir.to_string_lossy().to_string())
}

/// Gets the log retention days setting
#[tauri::command]
pub fn get_log_retention_days() -> Result<i32, String> {
    Ok(7)
}

/// Sets the log retention days setting
#[tauri::command]
pub fn set_log_retention_days(days: i32) -> Result<(), String> {
    log::info!("Setting log retention to {} days", days);
    Ok(())
}

/// Safely removes a file with retry logic
fn safe_remove_file(file_path: &std::path::Path) -> bool {
    const MAX_RETRIES: u32 = 3;
    const RETRY_DELAY_MS: u64 = 100;
    
    // Skip WebView2 database files completely - they're heavily locked
    if is_webview_locked_file(file_path) {
        log::info!("Skipping WebView2 locked file: {}", file_path.display());
        return false;
    }
    
    for attempt in 1..=MAX_RETRIES {
        match fs::remove_file(file_path) {
            Ok(_) => {
                log::debug!("Successfully removed file: {}", file_path.display());
                return true;
            }
            Err(e) => {
                if attempt == MAX_RETRIES {
                    log::debug!("Failed to remove file after {} attempts: {} - {}", 
                               MAX_RETRIES, file_path.display(), e);
                    return false;
                }
                
                log::debug!("Attempt {} failed to remove file: {} - {}", 
                           attempt, file_path.display(), e);
                
                // Wait before retrying
                std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
            }
        }
    }
    false
}

/// Safely removes a directory with retry logic
fn safe_remove_dir(dir_path: &std::path::Path) -> bool {
    const MAX_RETRIES: u32 = 3;
    const RETRY_DELAY_MS: u64 = 200;
    
    // Skip WebView2 locked directories
    if is_webview_locked_dir(dir_path) {
        log::info!("Skipping WebView2 locked directory: {}", dir_path.display());
        return false;
    }
    
    for attempt in 1..=MAX_RETRIES {
        match fs::remove_dir_all(dir_path) {
            Ok(_) => {
                log::debug!("Successfully removed directory: {}", dir_path.display());
                return true;
            }
            Err(e) => {
                if attempt == MAX_RETRIES {
                    log::debug!("Failed to remove directory after {} attempts: {} - {}", 
                               MAX_RETRIES, dir_path.display(), e);
                    return false;
                }
                
                log::debug!("Attempt {} failed to remove directory: {} - {}", 
                           attempt, dir_path.display(), e);
                
                // Wait before retrying
                std::thread::sleep(std::time::Duration::from_millis(RETRY_DELAY_MS));
            }
        }
    }
    false
}

/// Checks if a file is a WebView2 locked file
fn is_webview_locked_file(file_path: &std::path::Path) -> bool {
    if let Some(file_name) = file_path.file_name().and_then(|n| n.to_str()) {
        WEBVIEW_LOCKED_PATTERNS.iter().any(|pattern| file_name.contains(pattern))
    } else {
        false
    }
}

/// Checks if a directory is a WebView2 locked directory
fn is_webview_locked_dir(dir_path: &std::path::Path) -> bool {
    if let Some(dir_name) = dir_path.file_name().and_then(|n| n.to_str()) {
        WEBVIEW_LOCKED_DIRS.iter().any(|locked_name| dir_name == *locked_name)
    } else {
        false
    }
}

/// Clears all application data and cache
#[tauri::command]
pub fn clear_application_data() -> Result<(), String> {
    // First try to get the Tauri app data directory
    let data_dir = if let Some(app_data_dir) = dirs::data_dir() {
        let app_data_dir = app_data_dir.join("com.pailer.ks");
        if app_data_dir.exists() {
            app_data_dir
        } else {
            dirs::data_local_dir()
                .and_then(|d| Some(d.join("pailer")))
                .ok_or("Could not determine data directory")?
        }
    } else {
        dirs::data_local_dir()
            .and_then(|d| Some(d.join("pailer")))
            .ok_or("Could not determine data directory")?
    };
    
    if data_dir.exists() && data_dir.is_dir() {
        for entry in fs::read_dir(&data_dir).map_err(|e| format!("Failed to read data directory {}: {}", data_dir.display(), e))? {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            
            if path.is_file() {
                fs::remove_file(&path).map_err(|e| format!("Failed to remove file {}: {}", path.display(), e))?;
            } else if path.is_dir() {
                fs::remove_dir_all(&path).map_err(|e| format!("Failed to remove directory {}: {}", path.display(), e))?;
            }
        }
    }
    
    Ok(())
}

/// Factory reset - clears all application data and marks for factory reset
#[tauri::command]
pub fn factory_reset(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("Starting factory reset process");
    
    // Clear all application data
    clear_application_data()?;
    
    // Clear store data and create factory reset marker
    clear_store_data()?;
    
    // Reset tray notification setting to show it again on next startup
    let _ = crate::commands::settings::set_config_value(
        app.clone(),
        crate::config_keys::WINDOW_FIRST_TRAY_NOTIFICATION_SHOWN.to_string(),
        serde_json::json!(false),
    );
    
    // Schedule WebView cleanup for next startup
    schedule_webview_cleanup()?;
    
    // Clear Windows registry data
    #[cfg(windows)]
    clear_registry_data()?;
    
    log::info!("Factory reset completed successfully");
    Ok(())
}

/// Gets diagnostic information about the application's state.
#[tauri::command]
pub async fn get_debug_info(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let scoop_path = state.scoop_path();
    let apps_path = scoop_path.join("apps");

    log::info!("=== DEBUG INFO === get_debug_info called");

    // Try to read apps directory
    let app_count = if apps_path.is_dir() {
        fs::read_dir(&apps_path)
            .map(|entries| entries.count())
            .unwrap_or(0)
    } else {
        0
    };

    log::info!("=== DEBUG INFO === App count from disk: {}", app_count);

    // Check if apps directory exists
    let apps_dir_exists = apps_path.is_dir();

    // Check cache state
    let cache_guard = state.installed_packages.lock().await;
    let cache_info = if let Some(cache) = cache_guard.as_ref() {
        log::info!(
            "=== DEBUG INFO === Cache found with {} packages, fingerprint: {}",
            cache.packages.len(),
            cache.fingerprint
        );
        serde_json::json!({
            "cached_count": cache.packages.len(),
            "fingerprint": cache.fingerprint,
        })
    } else {
        log::info!("=== DEBUG INFO === No cache found (None)");
        serde_json::json!({
            "cached_count": 0,
            "fingerprint": null,
        })
    };
    drop(cache_guard); // Explicitly drop guard

    let debug_result = serde_json::json!({
        "timestamp": Local::now().to_rfc3339(),
        "scoop_path": scoop_path.display().to_string(),
        "apps_dir_exists": apps_dir_exists,
        "app_count": app_count,
        "cache_info": cache_info,
    });

    log::info!(
        "=== DEBUG INFO === Returning debug info: cached_count={}, app_count={}",
        debug_result["cache_info"]["cached_count"],
        app_count
    );

    Ok(debug_result)
}

/// Gets the current application logs from the logging system
#[tauri::command]
pub fn get_app_logs() -> Result<String, String> {
    let mut log_info = String::new();

    log_info.push_str("=== LOGGING INFORMATION ===\n\n");

    log_info.push_str("Location:\n");
    if let Some(log_dir) = get_log_dir() {
        log_info.push_str(&format!("  Directory: {}\n", log_dir.display()));
        
        if log_dir.exists() {
            match fs::read_dir(&log_dir) {
                Ok(entries) => {
                    let mut log_files: Vec<_> = entries
                        .filter_map(|entry| entry.ok())
                        .filter(|entry| entry.path().is_file())
                        .collect();
                    
                    // Sort by modification time, newest first
                    log_files.sort_by(|a, b| {
                        let a_time = a.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        let b_time = b.metadata().and_then(|m| m.modified()).unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        b_time.cmp(&a_time)
                    });
                    
                    log_info.push_str(&format!("  Log files ({} total):\n", log_files.len()));
                    for (i, entry) in log_files.iter().take(5).enumerate() {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let datetime: chrono::DateTime<Local> = modified.into();
                                log_info.push_str(&format!(
                                    "    {}. {} ({})\n",
                                    i + 1,
                                    entry.file_name().to_string_lossy(),
                                    datetime.format("%Y-%m-%d %H:%M:%S")
                                ));
                            }
                        }
                    }
                    if log_files.len() > 5 {
                        log_info.push_str(&format!("    ... and {} more\n", log_files.len() - 5));
                    }
                }
                Err(e) => {
                    log_info.push_str(&format!("  Failed to read directory: {}\n", e));
                }
            }
        } else {
            log_info.push_str("  Directory does not exist yet.\n");
        }
        
        let log_path = log_dir.join("pailer.log");
        if log_path.exists() {
            log_info.push_str(&format!("  Expected location: {}\n", log_path.display()));
        }
    } else {
        log_info.push_str("  Could not determine log directory location.\n");
    }

    log_info.push_str("\nTo View Logs:\n");
    log_info.push_str("1. Development Mode:\n");
    log_info.push_str("   $ npm run tauri dev\n");
    log_info.push_str("   - Logs appear in terminal AND are written to disk\n");
    log_info.push_str("   - Look for messages: '=== COLD START TRACE ===', '=== DEBUG INFO ==='\n\n");

    log_info.push_str("2. Production Build:\n");
    log_info.push_str("   - Logs are automatically written to disk\n");
    log_info.push_str("   - Check the log files in %APPDATA%\\com.pailer.ks\\logs\\\n");
    log_info.push_str("   - Open in any text editor\n\n");

    log_info.push_str("3. Frontend Logs (Browser Console):\n");
    log_info.push_str("   - Press F12 to open Developer Tools\n");
    log_info.push_str("   - Check the Console tab for frontend errors and messages\n\n");

    log_info.push_str("Key Log Markers:\n");
    log_info.push_str("- Cold start: '=== COLD START TRACE ===' markers with [1/6] through [6/6]\n");
    log_info.push_str("- Debug info: '=== DEBUG INFO ===' markers\n");
    log_info.push_str("- Scoop operations: general backend operations\n");

    Ok(log_info)
}

/// Reads the current application log file
#[tauri::command]
pub fn read_app_log_file() -> Result<String, String> {
    // Determine log file path - use APPDATA\com.pailer.ks\logs\pailer.log on Windows
    let log_file = if let Some(data_dir) = dirs::data_dir() {
        data_dir.join("com.pailer.ks").join("logs").join("pailer.log")
    } else {
        PathBuf::from("./logs/pailer.log")
    };

    // Validate file exists and check size
    if !log_file.exists() {
        return Ok(format!(
            "Log file not found at: {}\n\nLogs will be created after the first run.",
            log_file.display()
        ));
    }

    match log_file.metadata() {
        Ok(metadata) => {
            const MAX_LOG_SIZE: u64 = 10 * 1024 * 1024; // 10 MB limit
            if metadata.len() > MAX_LOG_SIZE {
                return Ok(format!(
                    "Log file too large ({} MB). Showing last 1MB only.\n\n--- Last 1MB of log ---\n{}",
                    metadata.len() / (1024 * 1024),
                    read_last_n_bytes(&log_file, 1024 * 1024)?
                ));
            }
        }
        Err(e) => {
            return Err(format!("Failed to get log file metadata: {}", e));
        }
    }

    // Read the log file
    match fs::read_to_string(&log_file) {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read log file: {}", e)),
    }
}

fn read_last_n_bytes(file_path: &PathBuf, n: usize) -> Result<String, String> {
    use std::io::{Seek, SeekFrom, Read};
    
    let mut file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;
    
    let file_size = file.metadata()
        .map_err(|e| format!("Failed to get file metadata: {}", e))?
        .len() as usize;
    
    let start_pos = if file_size > n { file_size - n } else { 0 };
    
    file.seek(SeekFrom::Start(start_pos as u64))
        .map_err(|e| format!("Failed to seek in file: {}", e))?;
    
    let mut buffer = vec![0; if file_size > n { n } else { file_size }];
    file.read_exact(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    Ok(String::from_utf8_lossy(&buffer).into())
}

/// Checks if factory reset marker exists
#[tauri::command]
pub fn check_factory_reset_marker() -> Result<bool, String> {
    if let Some(app_data_dir) = dirs::data_dir() {
        let marker_file = app_data_dir.join(TAURI_APP_ID).join(FACTORY_RESET_MARKER);
        if marker_file.exists() {
            // Remove the marker after checking
            let _ = fs::remove_file(&marker_file);
            return Ok(true);
        }
    }
    Ok(false)
}

/// Clears Tauri store configuration data
#[tauri::command]
pub fn clear_store_data() -> Result<(), String> {
    log::info!("Starting store data cleanup");
    
    // Create list of files to clear using defined constants
    let store_files = vec![
        // New unified store files
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(FRONTEND_STORE_FILE)),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(BACKEND_STORE_FILE)),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(VERSION_FILE)),
        // Backup files in new directory
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(format!("{}{}", FRONTEND_STORE_FILE, BACKUP_EXT))),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(format!("{}{}", BACKEND_STORE_FILE, BACKUP_EXT))),
        // Legacy files for migration cleanup
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(LEGACY_SETTINGS_FILE)),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(LEGACY_SIGNALS_FILE)),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(LEGACY_STORE_FILE)),
        // Old directory - main files
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(LEGACY_SETTINGS_FILE)),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(LEGACY_SIGNALS_FILE)),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(VERSION_FILE)),
        // Backup files in old directory
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(format!("{}{}", LEGACY_SETTINGS_FILE, BACKUP_EXT))),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(format!("{}{}", LEGACY_SIGNALS_FILE, BACKUP_EXT))),
    ];
    
    let mut cleared_count = 0;
    let mut failed_files = Vec::new();
    
    for store_file_option in store_files {
        if let Some(store_file) = store_file_option {
            if store_file.exists() && store_file.is_file() {
                log::info!("Attempting to remove store file: {}", store_file.display());
                
                if safe_remove_file(&store_file) {
                    cleared_count += 1;
                } else {
                    failed_files.push(store_file);
                }
            }
        }
    }
    
    // Create a marker file to indicate factory reset
    let mut marker_created = false;
    if let Some(app_data_dir) = dirs::data_dir() {
        let marker_file = app_data_dir.join(TAURI_APP_ID).join(FACTORY_RESET_MARKER);
        if let Some(parent) = marker_file.parent() {
            match fs::create_dir_all(parent) {
                Ok(_) => {
                    match fs::write(&marker_file, "Factory reset requested") {
                        Ok(_) => {
                            marker_created = true;
                            log::info!("Created factory reset marker: {}", marker_file.display());
                        }
                        Err(e) => log::warn!("Failed to create factory reset marker: {}", e),
                    }
                }
                Err(e) => log::warn!("Failed to create directory for marker: {}", e),
            }
        }
    }
    
    log::info!("Store cleanup completed. Removed {} files, created marker: {}", cleared_count, marker_created);
    
    if !failed_files.is_empty() {
        log::warn!("Failed to clear {} store files (likely in use):", failed_files.len());
        for path in &failed_files {
            log::warn!("  - {}", path.display());
        }
        // Don't return error for locked files, they will be cleaned up on restart
    }
    
    Ok(())
}

/// Clears registry data on Windows
#[tauri::command]
#[cfg(windows)]
pub fn clear_registry_data() -> Result<(), String> {
    log::info!("Attempting to clear Windows registry entries");
    
    use std::process::Command;
    use crate::commands::startup::cleanup_startup_entries;
    
    // First, clean up startup registry entries
    match cleanup_startup_entries() {
        Ok(_) => log::info!("Successfully cleaned up startup registry entries"),
        Err(e) => log::warn!("Failed to cleanup startup registry entries: {}", e),
    }
    
    // Clear registry entries using reg command
    let registry_keys = vec![
        r"HKEY_CURRENT_USER\Software\com.pailer.ks",
        r"HKEY_CURRENT_USER\Software\Pailer",
        r"HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall\Pailer",
        r"HKEY_LOCAL_MACHINE\Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Pailer",
    ];
    
    for key in registry_keys {
        let output = Command::new("reg")
            .args(&["delete", key, "/f"])
            .output();
            
        match output {
            Ok(result) => {
                if result.status.success() {
                    log::info!("Successfully deleted registry key: {}", key);
                } else {
                    log::debug!("Registry key not found or could not be deleted: {}", key);
                }
            }
            Err(e) => {
                log::warn!("Failed to execute registry command for {}: {}", key, e);
            }
        }
    }
    
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn clear_registry_data() -> Result<(), String> {
    // Not applicable on non-Windows platforms
    Ok(())
}

/// Clears WebView cache data
#[tauri::command]
pub fn clear_webview_cache() -> Result<(), String> {
    log::info!("Attempting to clear WebView cache");
    
    // Try to clear cache from both new and old locations
    let cache_dirs = vec![
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID)),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR)),
    ];
    
    let mut cleared_dirs = 0;
    for cache_dir_option in cache_dirs {
        if let Some(cache_dir) = cache_dir_option {
            if cache_dir.exists() {
                for locked_dir_name in WEBVIEW_LOCKED_DIRS {
                    let locked_dir = cache_dir.join(locked_dir_name);
                    if locked_dir.exists() && locked_dir.is_dir() {
                        log::info!("Attempting to remove WebView cache dir: {}", locked_dir.display());
                        if safe_remove_dir(&locked_dir) {
                            cleared_dirs += 1;
                        }
                    }
                }
            }
        }
    }
    
    log::info!("WebView cache cleanup completed. Removed {} directories.", cleared_dirs);
    Ok(())
}

/// Schedules WebView cache cleanup for next startup
#[tauri::command]
pub fn schedule_webview_cleanup() -> Result<(), String> {
    if let Some(app_data_dir) = dirs::data_dir() {
        let marker_file = app_data_dir.join(TAURI_APP_ID).join(WEBVIEW_CLEANUP_MARKER);
        if let Some(parent) = marker_file.parent() {
            match fs::create_dir_all(parent) {
                Ok(_) => {
                    match fs::write(&marker_file, "Cleanup WebView cache on next startup") {
                        Ok(_) => {
                            log::info!("Scheduled WebView cache cleanup for next startup");
                        }
                        Err(e) => log::warn!("Failed to schedule WebView cache cleanup: {}", e),
                    }
                }
                Err(e) => log::warn!("Failed to create directory for WebView cleanup marker: {}", e),
            }
        }
    }
    Ok(())
}

/// Checks if WebView cleanup is scheduled
#[tauri::command]
pub fn is_webview_cleanup_scheduled() -> Result<bool, String> {
    if let Some(app_data_dir) = dirs::data_dir() {
        let marker_file = app_data_dir.join(TAURI_APP_ID).join(WEBVIEW_CLEANUP_MARKER);
        Ok(marker_file.exists())
    } else {
        Ok(false)
    }
}

/// Performs WebView cleanup if scheduled
#[tauri::command]
pub fn perform_scheduled_webview_cleanup() -> Result<(), String> {
    // Check if cleanup is scheduled
    if !is_webview_cleanup_scheduled()? {
        return Ok(());
    }
    
    log::info!("Performing scheduled WebView cache cleanup");
    
    // Perform the cleanup
    clear_webview_cache()?;
    
    // Remove the marker
    if let Some(app_data_dir) = dirs::data_dir() {
        let marker_file = app_data_dir.join(TAURI_APP_ID).join(WEBVIEW_CLEANUP_MARKER);
        if marker_file.exists() {
            let _ = fs::remove_file(&marker_file);
        }
    }
    
    log::info!("Completed scheduled WebView cache cleanup");
    Ok(())
}

/// Final cleanup to be called during application shutdown
#[tauri::command]
pub fn final_cleanup_on_exit() -> Result<(), String> {
    log::info!("Performing final cleanup before exit");
    
    // Give WebView processes a moment to release files
    std::thread::sleep(std::time::Duration::from_millis(1000));
    
    // Try to remove any remaining configuration files
    let final_cleanup_files = vec![
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(FRONTEND_STORE_FILE)),
        dirs::data_dir().map(|d| d.join(TAURI_APP_ID).join(BACKEND_STORE_FILE)),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(LEGACY_SETTINGS_FILE)),
        dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join(LEGACY_SIGNALS_FILE)),
    ];
    
    for file_option in final_cleanup_files {
        if let Some(file) = file_option {
            if file.exists() {
                if safe_remove_file(&file) {
                    log::info!("Final cleanup removed: {}", file.display());
                }
            }
        }
    }
    
    // Schedule WebView cache cleanup for next startup
    schedule_webview_cleanup()?;
    
    Ok(())
}

fn get_log_dir() -> Option<PathBuf> {
    // First try to get the Tauri app data directory
    if let Some(app_data_dir) = dirs::data_dir() {
        let app_data_dir = app_data_dir.join(TAURI_APP_ID);
        if app_data_dir.exists() {
            return Some(app_data_dir.join("logs"));
        }
    }
    
    // Fallback to the old pailer directory
    dirs::data_local_dir().map(|d| d.join(OLD_APP_DIR).join("logs"))
}
