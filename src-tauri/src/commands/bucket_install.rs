use std::fs;
use std::path::{Path, PathBuf};
use git2::{Repository, RemoteCallbacks, Cred, FetchOptions};
use log;
use crate::state::AppState;
use tauri::State;
use serde::{Deserialize, Serialize};
// Import the invalidate_manifest_cache function from search module
use crate::commands::search::invalidate_manifest_cache;
use crate::commands::regex_utils::{BUCKET_NAME_REGEX, URL_EXTRACT_REGEX};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallOptions {
    pub name: String,
    pub url: String,
    pub force: bool, // Force reinstall if bucket already exists
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketInstallResult {
    pub success: bool,
    pub message: String,
    pub bucket_name: String,
    pub bucket_path: Option<String>,
    pub manifest_count: Option<u32>,
}

// Get the buckets directory path
fn get_buckets_dir(scoop_path: &Path) -> Result<PathBuf, String> {
    Ok(scoop_path.join("buckets"))
}

/// Check if a bucket exists in the buckets directory
fn bucket_exists(name: &str, scoop_path: &Path) -> Result<bool, String> {
    let bucket_path = get_bucket_path(name, scoop_path)?;
    Ok(bucket_path.exists())
}

/// Get the path for a specific bucket
fn get_bucket_path(name: &str, scoop_path: &Path) -> Result<PathBuf, String> {
    let buckets_dir = get_buckets_dir(scoop_path)?;
    Ok(buckets_dir.join(name))
}

// Count manifests in bucket
fn count_bucket_manifests(bucket_path: &Path) -> Result<u32, String> {
    let mut count = 0;

    // Check main directory for .json files
    if let Ok(entries) = fs::read_dir(bucket_path) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "json" {
                    count += 1;
                }
            }
        }
    }

    // Check bucket subdirectory if it exists
    let bucket_subdir = bucket_path.join("bucket");
    if bucket_subdir.exists() {
        if let Ok(entries) = fs::read_dir(&bucket_subdir) {
            for entry in entries.flatten() {
                if let Some(ext) = entry.path().extension() {
                    if ext == "json" {
                        count += 1;
                    }
                }
            }
        }
    }

    Ok(count)
}

// Validate and normalize Git URLs
fn validate_and_normalize_url(url: &str) -> Result<String, String> {
    // Handle GitHub shorthand like "user/repo"
    if url.contains('/') && !url.contains("://") {
        let parts: Vec<&str> = url.split('/').collect();
        if parts.len() == 2 {
            return Ok(format!("https://github.com/{}/{}.git", parts[0], parts[1]));
        }
    }

    // Already a full URL
    if url.starts_with("http://") || url.starts_with("https://") {
        // Ensure it ends with .git for Git repositories
        if url.ends_with(".git") {
            Ok(url.to_string())
        } else {
            Ok(format!("{}.git", url))
        }
    } else {
        // Assume it's a GitHub URL
        Ok(format!("https://github.com/{}.git", url))
    }
}

// Extract bucket name from URL
fn extract_bucket_name_from_url(url: &str, provided_name: Option<&str>) -> Result<String, String> {
    // If name is provided, use it
    if let Some(name) = provided_name {
        // Basic validation - bucket names should be lowercase alphanumeric and dashes
        if BUCKET_NAME_REGEX.is_match(name) {
            Ok(name.to_string())
        } else {
            Err("Invalid bucket name: must be lowercase alphanumeric with dashes or underscores".to_string())
        }
    } else {
        // Extract from URL
        // Handle GitHub shorthand "user/repo"
        if url.contains('/') && !url.contains("://") {
            let parts: Vec<&str> = url.split('/').collect();
            if parts.len() == 2 {
                let repo_name = parts[1];
                // Remove "scoop-" prefix if present
                let bucket_name = if repo_name.to_lowercase().starts_with("scoop-") {
                    repo_name[6..].to_string()
                } else {
                    repo_name.to_string()
                };
                
                return Ok(bucket_name.to_lowercase());
            }
        }
        
        // Handle full URLs
        if let Some(captures) = URL_EXTRACT_REGEX.captures(url) {
            let repo_name = &captures[1];
            // Remove "scoop-" prefix if present
            let bucket_name = if repo_name.to_lowercase().starts_with("scoop-") {
                repo_name[6..].to_string()
            } else {
                repo_name.to_string()
            };
            
            Ok(bucket_name.to_lowercase())
        } else {
            Err("Could not extract bucket name from URL".to_string())
        }
    }
}

// Clone repository with progress callback
// Fix: Correctly pass FetchOptions ownership instead of reference
fn clone_repository(url: &str, target_path: &Path) -> Result<Repository, String> {
    log::info!("Cloning repository {} to {:?}", url, target_path);

    // Create parent directory if it doesn't exist
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    // Set up remote callbacks for authentication and progress
    let mut remote_callbacks = RemoteCallbacks::new();

    // Handle authentication (for private repos)
    remote_callbacks.credentials(|_url, username_from_url, allowed_types| {
        if allowed_types.contains(git2::CredentialType::USERNAME) {
            Cred::username("git")
        } else if allowed_types.contains(git2::CredentialType::SSH_KEY) {
            let username = username_from_url.unwrap_or("git");
            Cred::ssh_key_from_agent(username)
        } else if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            // This would require username/password which isn't typically used for public repos
            Err(git2::Error::from_str("No suitable authentication method available"))
        } else {
            Err(git2::Error::from_str("No supported authentication method"))
        }
    });

    // Perform the clone operation
    let mut builder = git2::build::RepoBuilder::new();
    // Fix: Properly create and pass FetchOptions ownership
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks);
    builder.fetch_options(fetch_options);
    
    match builder.clone(url, target_path) {
        Ok(repo) => {
            log::info!("Successfully cloned repository to {:?}", target_path);
            Ok(repo)
        }
        Err(e) => {
            log::error!("Failed to clone repository: {}", e);
            Err(format!("Failed to clone repository '{}': {}", url, e))
        }
    }
}

// Remove bucket directory (cleanup on failure)
fn remove_bucket_directory(bucket_path: &Path) -> Result<(), String> {
    if bucket_path.exists() {
        fs::remove_dir_all(bucket_path)
            .map_err(|e| format!("Failed to remove bucket directory: {}", e))?;
    }
    Ok(())
}

// Main function to install a bucket
async fn install_bucket_internal(
    options: BucketInstallOptions,
    scoop_path: &Path,
) -> Result<BucketInstallResult, String> {
    let BucketInstallOptions { name, url, force } = options;

    // Validate and normalize URL
    let normalized_url = validate_and_normalize_url(&url)?;

    // Extract or validate bucket name
    let bucket_name = if name.is_empty() {
        extract_bucket_name_from_url(&normalized_url, None)?
    } else {
        extract_bucket_name_from_url(&normalized_url, Some(&name))?
    };

    // Check if bucket already exists
    if bucket_exists(&bucket_name, scoop_path)? && !force {
        return Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Bucket '{}' already exists. Use force=true to reinstall.",
                bucket_name
            ),
            bucket_name: bucket_name.clone(),
            bucket_path: Some(get_bucket_path(&bucket_name, scoop_path)?.to_string_lossy().to_string()),
            manifest_count: None,
        });
    }

    let bucket_path = get_bucket_path(&bucket_name, scoop_path)?;

    // If force is true and bucket exists, remove it first
    if force && bucket_path.exists() {
        log::info!(
            "Force reinstall: removing existing bucket '{}'",
            bucket_name
        );
        remove_bucket_directory(&bucket_path)?;
    }

    // Clone the repository
    match clone_repository(&normalized_url, &bucket_path) {
        Ok(_repo) => {
            // Count manifests
            let manifest_count = count_bucket_manifests(&bucket_path)?;

            // Invalidate search cache so new bucket's packages are searchable
            invalidate_manifest_cache().await;

            log::info!(
                "Successfully installed bucket '{}' with {} manifests",
                bucket_name, manifest_count
            );
            
            Ok(BucketInstallResult {
                success: true,
                message: format!(
                    "Successfully installed bucket '{}' with {} manifests",
                    bucket_name, manifest_count
                ),
                bucket_name: bucket_name.clone(),
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: Some(manifest_count),
            })
        }
        Err(e) => {
            // Clean up on failure
            let _ = remove_bucket_directory(&bucket_path);

            Err(format!("Failed to install bucket '{}': {}", bucket_name, e))
        }
    }
}

// Tauri command to install a bucket
#[tauri::command]
pub async fn install_bucket(
    options: BucketInstallOptions,
    state: State<'_, AppState>,
) -> Result<BucketInstallResult, String> {
    log::info!("Installing bucket - Name: {}, URL: {}", options.name, options.url);
    install_bucket_internal(options, &state.scoop_path()).await
}

// Command to validate bucket installation parameters
#[tauri::command]
pub async fn validate_bucket_install(
    name: String,
    url: String,
    state: State<'_, AppState>,
) -> Result<BucketInstallResult, String> {
    log::info!("Validating bucket install - Name: {}, URL: {}", name, url);

    // Validate and normalize URL
    let normalized_url = match validate_and_normalize_url(&url) {
        Ok(url) => url,
        Err(e) => {
            return Ok(BucketInstallResult {
                success: false,
                message: format!("Invalid URL: {}", e),
                bucket_name: name,
                bucket_path: None,
                manifest_count: None,
            })
        }
    };

    // Extract or validate bucket name
    let bucket_name = if name.is_empty() {
        match extract_bucket_name_from_url(&normalized_url, None) {
            Ok(name) => name,
            Err(e) => {
                return Ok(BucketInstallResult {
                    success: false,
                    message: format!("Invalid bucket name: {}", e),
                    bucket_name: name,
                    bucket_path: None,
                    manifest_count: None,
                })
            }
        }
    } else {
        match extract_bucket_name_from_url(&normalized_url, Some(&name)) {
            Ok(name) => name,
            Err(e) => {
                return Ok(BucketInstallResult {
                    success: false,
                    message: format!("Invalid bucket name: {}", e),
                    bucket_name: name,
                    bucket_path: None,
                    manifest_count: None,
                })
            }
        }
    };

    // Check if bucket already exists
    let already_exists = match bucket_exists(&bucket_name, &state.scoop_path()) {
        Ok(exists) => exists,
        Err(e) => {
            log::warn!("Failed to check if bucket exists: {}", e);
            false // Treat as non-existent if we can't check
        }
    };

    let bucket_path = if already_exists {
        Some(
            get_bucket_path(&bucket_name, &state.scoop_path())?
                .to_string_lossy()
                .to_string(),
        )
    } else {
        None
    };

    Ok(BucketInstallResult {
        success: !already_exists,
        message: if already_exists {
            format!("Bucket '{}' already exists", bucket_name)
        } else {
            format!(
                "Bucket '{}' can be installed from {}",
                bucket_name, normalized_url
            )
        },
        bucket_name,
        bucket_path,
        manifest_count: None,
    })
}

// Command to update a bucket (git pull)
#[tauri::command]
pub fn update_bucket(bucket_name: String, state: State<'_, AppState>) -> Result<BucketInstallResult, String> {
    log::info!("Updating bucket: {}", bucket_name);

    let bucket_path = get_bucket_path(&bucket_name, &state.scoop_path())?;

    if !bucket_path.exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' does not exist", bucket_name),
            bucket_name,
            bucket_path: None,
            manifest_count: None,
        });
    }

    // Check if it's a git repository
    if !bucket_path.join(".git").exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!(
                "Bucket '{}' is not a git repository and cannot be updated",
                bucket_name
            ),
            bucket_name,
            bucket_path: Some(bucket_path.to_string_lossy().to_string()),
            manifest_count: None,
        });
    }

    // Try to update the repository using git2
    match Repository::open(&bucket_path) {
        Ok(repo) => {
            // Fetch from origin
            let mut remote = match repo.find_remote("origin") {
                Ok(remote) => remote,
                Err(_) => {
                    return Ok(BucketInstallResult {
                        success: false,
                        message: format!(
                            "Could not find remote 'origin' for bucket '{}'",
                            bucket_name
                        ),
                        bucket_name,
                        bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                        manifest_count: None,
                    });
                }
            };

            // Configure callbacks for authentication
            let mut callbacks = RemoteCallbacks::new();
            callbacks.credentials(|_url, username_from_url, allowed_types| {
                if allowed_types.contains(git2::CredentialType::USERNAME) {
                    Cred::username("git")
                } else if allowed_types.contains(git2::CredentialType::SSH_KEY) {
                    let username = username_from_url.unwrap_or("git");
                    Cred::ssh_key_from_agent(username)
                } else if allowed_types.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
                    Err(git2::Error::from_str("No suitable authentication method available"))
                } else {
                    Err(git2::Error::from_str("No supported authentication method"))
                }
            });

            // Create fetch options
            let mut fetch_options = FetchOptions::new();
            fetch_options.remote_callbacks(callbacks);

            // Perform fetch
            if let Err(_e) = remote.fetch(&["main"], Some(&mut fetch_options), None) {
                // Try fetching master branch if main fails
                if let Err(e) = remote.fetch(&["master"], Some(&mut fetch_options), None) {
                    return Ok(BucketInstallResult {
                        success: false,
                        message: format!("Failed to fetch updates for bucket '{}': {}", bucket_name, e),
                        bucket_name,
                        bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                        manifest_count: None,
                    });
                }
            }

            // Attempt to merge fetched changes
            if let Err(e) = merge_remote_changes(&repo) {
                log::warn!("Fetched updates but failed to merge for bucket '{}': {}", bucket_name, e);
            }

            // Update manifest count
            let manifest_count = count_bucket_manifests(&bucket_path).unwrap_or(0);

            log::info!("Successfully updated bucket '{}'", bucket_name);
            Ok(BucketInstallResult {
                success: true,
                message: format!("Successfully updated bucket '{}'", bucket_name),
                bucket_name,
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: Some(manifest_count),
            })
        }
        Err(e) => {
            log::error!("Failed to open repository for bucket '{}': {}", bucket_name, e);
            Ok(BucketInstallResult {
                success: false,
                message: format!(
                    "Failed to open repository for bucket '{}': {}",
                    bucket_name, e
                ),
                bucket_name,
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: None,
            })
        }
    }
}

// Helper function to merge remote changes after fetch
fn merge_remote_changes(repo: &Repository) -> Result<(), git2::Error> {
    let head_ref = repo.head()?;
    let head_commit = head_ref.peel_to_commit()?;
    
    // Get remote branch reference (try both main and master)
    let remote_branch = if let Ok(main_ref) = repo.resolve_reference_from_short_name("origin/main") {
        main_ref.peel_to_commit()?
    } else if let Ok(master_ref) = repo.resolve_reference_from_short_name("origin/master") {
        master_ref.peel_to_commit()?
    } else {
        return Err(git2::Error::from_str("Could not find remote tracking branch"));
    };
    
    // Check if we're already up-to-date
    if head_commit.id() == remote_branch.id() {
        return Ok(());
    }
    
    // Perform a fast-forward merge if possible
    let _head_ref_name = head_ref.name().ok_or_else(|| git2::Error::from_str("Invalid HEAD reference"))?;
    repo.reset(remote_branch.as_object(), git2::ResetType::Hard, None)?;
    log::info!("Fast-forwarded to {}", remote_branch.id());
    
    Ok(())
}

// Command to update all buckets
#[tauri::command]
pub async fn update_all_buckets(state: State<'_, AppState>) -> Result<Vec<BucketInstallResult>, String> {
    log::info!("Updating all buckets");

    // Get buckets directory
    let buckets_dir = get_buckets_dir(&state.scoop_path())?;
    
    // Read directory entries
    let entries = fs::read_dir(&buckets_dir)
        .map_err(|e| format!("Failed to read buckets directory: {}", e))?;

    let mut results = Vec::new();
    
    // Update each bucket sequentially
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path.is_dir() {
                if let Some(bucket_name) = path.file_name().and_then(|n| n.to_str()) {
                    // Skip non-git directories
                    if !path.join(".git").exists() {
                        continue;
                    }
                    
                    match update_bucket(bucket_name.to_string(), state.clone()) {
                        Ok(result) => results.push(result),
                        Err(e) => {
                            results.push(BucketInstallResult {
                                success: false,
                                message: format!("Failed to update bucket '{}': {}", bucket_name, e),
                                bucket_name: bucket_name.to_string(),
                                bucket_path: Some(path.to_string_lossy().to_string()),
                                manifest_count: None,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(results)
}

// Command to remove a bucket
#[tauri::command]
pub async fn remove_bucket(bucket_name: String, state: State<'_, AppState>) -> Result<BucketInstallResult, String> {
    log::info!("Removing bucket: {}", bucket_name);

    let bucket_path = get_bucket_path(&bucket_name, &state.scoop_path())?;

    if !bucket_path.exists() {
        return Ok(BucketInstallResult {
            success: false,
            message: format!("Bucket '{}' does not exist", bucket_name),
            bucket_name,
            bucket_path: None,
            manifest_count: None,
        });
    }

    match remove_bucket_directory(&bucket_path) {
        Ok(_) => {
            // Invalidate search cache so removed bucket's packages are no longer searchable
            invalidate_manifest_cache().await;

            log::info!("Successfully removed bucket '{}'", bucket_name);
            Ok(BucketInstallResult {
                success: true,
                message: format!("Successfully removed bucket '{}'", bucket_name),
                bucket_name,
                bucket_path: None,
                manifest_count: None,
            })
        }
        Err(e) => {
            log::error!("Failed to remove bucket '{}': {}", bucket_name, e);
            Ok(BucketInstallResult {
                success: false,
                message: format!("Failed to remove bucket '{}': {}", bucket_name, e),
                bucket_name,
                bucket_path: Some(bucket_path.to_string_lossy().to_string()),
                manifest_count: None,
            })
        }
    }
}