use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::AppHandle;
use crate::commands::update_config::get_update_channel;

/// Represents update information from GitHub API
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CustomUpdateInfo {
    pub version: String,
    pub pub_date: String,
    pub download_url: String,
    pub signature: String,
    pub notes: String,
    pub body: Option<String>,
    pub channel: String,
}

/// Represents a GitHub release
#[derive(Deserialize, Debug)]
struct GitHubRelease {
    tag_name: String,
    published_at: String,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
    prerelease: bool,
}

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

/// Check for updates using GitHub API directly
/// This is used as a fallback when Tauri updater fails or doesn't find updates
#[tauri::command]
pub async fn check_for_custom_update(app_handle: AppHandle) -> Result<CustomUpdateInfo, String> {
    log::info!("Starting custom update check using GitHub API");
    
    // Get the current channel
    let channel = get_update_channel(app_handle.clone()).await?;
    log::info!("Checking for updates on channel: {}", channel);
    
    // Determine the repository based on channel
    let (repo_owner, repo_name) = if channel == "test" {
        ("Kwensiu", "Pailer")
    } else {
        ("Kwensiu", "Pailer")
    };
    
    // Get the latest release from GitHub API
    let api_url = if channel == "test" {
        // For test channel, we'll look for a pre-release or specific tag
        format!("https://api.github.com/repos/{}/{}/releases", repo_owner, repo_name)
    } else {
        // For stable channel, get the latest stable release
        format!("https://api.github.com/repos/{}/{}/releases/latest", repo_owner, repo_name)
    };
    
    log::debug!("Fetching release info from: {}", api_url);
    
    // Make HTTP request to GitHub API
    let client = reqwest::Client::new();
    let response = client
        .get(&api_url)
        .header("User-Agent", "Pailer-Updater")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release info: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("GitHub API returned status: {}", response.status()));
    }
    
    // Parse the response
    let releases: Vec<GitHubRelease> = if channel == "test" {
        // For test channel, we get all releases and find the latest pre-release or test release
        response.json::<Vec<GitHubRelease>>()
            .await
            .map_err(|e| format!("Failed to parse releases: {}", e))?
    } else {
        // For stable channel, we get the single latest release
        let release = response.json::<GitHubRelease>()
            .await
            .map_err(|e| format!("Failed to parse release: {}", e))?;
        vec![release]
    };
    
    // Find the appropriate release
    let release = if channel == "test" {
        // Find the latest pre-release or release with "test" in the tag
        releases.into_iter()
            .filter(|r| r.prerelease || r.tag_name.to_lowercase().contains("test"))
            .next()
            .ok_or("No test release found")?
    } else {
        releases.into_iter().next()
            .ok_or("No stable release found")?
    };
    
    // Extract version from tag (remove 'v' prefix if present)
    let version = release.tag_name.strip_prefix('v').unwrap_or(&release.tag_name).to_string();
    
    // Find the Windows installer asset
    let windows_asset = release.assets.into_iter()
        .find(|asset| asset.name.contains("x64-setup.exe") || asset.name.contains("windows"))
        .ok_or("Windows installer not found in release assets")?;
    
    log::info!("Found update: {} from {}", version, release.published_at);
    
    // For the signature, we'll need to get it from the update.json file
    // This is a limitation of using GitHub API directly
    let signature = get_signature_for_version(&version, &channel).await?;
    
    // Create update info
    let update_info = CustomUpdateInfo {
        version: version.clone(),
        pub_date: release.published_at,
        download_url: windows_asset.browser_download_url,
        signature,
        notes: format!("Update available for {} channel", channel),
        body: release.body,
        channel,
    };
    
    Ok(update_info)
}

/// Get signature for a specific version from the update.json file
async fn get_signature_for_version(_version: &str, channel: &str) -> Result<String, String> {
    let update_json_url = if channel == "test" {
        format!("https://raw.githubusercontent.com/Kwensiu/Pailer/refs/heads/test/docs/test-update.json")
    } else {
        format!("https://github.com/Kwensiu/Pailer/releases/latest/download/update.json")
    };
    
    log::debug!("Fetching signature from: {}", update_json_url);
    
    let client = reqwest::Client::new();
    let response = client
        .get(&update_json_url)
        .header("User-Agent", "Pailer-Updater")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch update.json: {}", e))?;
    
    if !response.status().is_success() {
        // If we can't get the signature, return a placeholder
        log::warn!("Could not fetch signature, using placeholder");
        return Ok("signature-unavailable".to_string());
    }
    
    let update_data: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse update.json: {}", e))?;
    
    // Extract signature for Windows x64 platform
    if let Some(platforms) = update_data.get("platforms") {
        if let Some(windows_platform) = platforms.get("windows-x86_64") {
            if let Some(signature) = windows_platform.get("signature") {
                if let Some(sig_str) = signature.as_str() {
                    return Ok(sig_str.to_string());
                }
            }
        }
    }
    
    log::warn!("Signature not found in update.json");
    Ok("signature-not-found".to_string())
}

/// Download and install the custom update
#[tauri::command]
pub async fn download_and_install_custom_update(
    app_handle: AppHandle,
    update_info: CustomUpdateInfo,
) -> Result<(), String> {
    log::info!("Starting custom update download and installation");
    
    // Create a temporary directory for the download
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join(format!("scoopmeta_update_{}.exe", update_info.version));
    
    // Download the installer
    log::info!("Downloading installer from: {}", update_info.download_url);
    let client = reqwest::Client::new();
    let response = client
        .get(&update_info.download_url)
        .header("User-Agent", "Pailer-Updater")
        .send()
        .await
        .map_err(|e| format!("Failed to download installer: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }
    
    let installer_bytes = response.bytes()
        .await
        .map_err(|e| format!("Failed to read installer bytes: {}", e))?;
    
    // Write installer to disk
    std::fs::write(&installer_path, &installer_bytes)
        .map_err(|e| format!("Failed to write installer: {}", e))?;
    
    log::info!("Installer downloaded to: {}", installer_path.display());
    
    // Execute the installer with the same arguments as in tauri.conf.json
    let args = if cfg!(windows) {
        vec!["/CURRENTUSER", "/MERGETASKS=!desktopicon,!quicklaunchicon"]
    } else {
        vec![]
    };
    
    log::info!("Starting installer with args: {:?}", args);
    
    let mut cmd = Command::new(installer_path);
    cmd.args(args);
    
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Create the installer process detached from parent
        cmd.creation_flags(0x08000000); // DETACHED_PROCESS
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start installer: {}", e))?;
    
    log::info!("Installer started with PID: {}", child.id());
    
    // Exit the current application
    std::thread::sleep(std::time::Duration::from_secs(1));
    app_handle.exit(0);
    
    Ok(())
}

/// Get current app version
#[tauri::command]
pub async fn get_current_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}