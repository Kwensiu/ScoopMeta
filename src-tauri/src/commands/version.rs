use std::fs;
use tauri::AppHandle;

/// Checks if the currently running version differs from the persisted version file.
/// If different (or file missing), writes the new version and returns true.
#[tauri::command]
pub fn check_and_update_version(app: AppHandle) -> Result<bool, String> {
    let current_version = app.package_info().version.to_string();
    
    // Always try to use the new Roaming app data directory first
    let new_data_dir = dirs::data_dir()
        .ok_or_else(|| "Could not resolve roaming app data directory".to_string())?
        .join("com.pailer.ks");

    // Ensure the new directory exists
    if !new_data_dir.exists() {
        fs::create_dir_all(&new_data_dir).map_err(|e| format!("Failed to create new data dir: {}", e))?;
        log::info!("Created new data directory: {}", new_data_dir.display());
    }

    let version_path = new_data_dir.join("version.txt");
    let stored_version = fs::read_to_string(&version_path).unwrap_or_default();

    // If the version file exists in the new location and matches current version, we're done
    if !stored_version.trim().is_empty() && stored_version.trim() == current_version {
        log::trace!("Version {} unchanged from persisted file in new location.", current_version);
        return Ok(false);
    }

    // Check if there's an old version file in the legacy location and migrate it if needed
    let old_data_dir = dirs::data_local_dir()
        .ok_or_else(|| "Could not resolve local app data directory".to_string())?
        .join("pailer");
    
    let old_version_path = old_data_dir.join("version.txt");
    
    // If there's an old version file and no version in the new location (or they differ)
    if old_version_path.exists() {
        let old_version = fs::read_to_string(&old_version_path).unwrap_or_default();
        
        // If the old version matches the current version, just create the new file
        if old_version.trim() == current_version && stored_version.trim().is_empty() {
            fs::write(&version_path, &current_version)
                .map_err(|e| format!("Failed to write version file to new location: {}", e))?;
            log::info!("Migrated version {} from old location to new location.", current_version);
            
            // Try to remove the old file
            let _ = fs::remove_file(&old_version_path);
            log::info!("Removed old version file.");
            
            return Ok(false);
        }
    }

    // Write the current version to the new location
    fs::write(&version_path, &current_version)
        .map_err(|e| format!("Failed to write version file: {}", e))?;

    // Try to remove the old version file if it exists
    if old_version_path.exists() {
        let _ = fs::remove_file(&old_version_path);
        log::info!("Removed old version file after writing new one.");
    }

    log::info!("Detected new version {} (persisted to new location).", current_version);
    Ok(true)
}
