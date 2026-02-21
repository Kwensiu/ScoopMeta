use tauri::{command, AppHandle, Emitter};
use std::path::PathBuf;
use tauri_plugin_store::StoreExt;

/// Get the current update channel from settings
#[command]
pub async fn get_update_channel(app_handle: AppHandle) -> Result<String, String> {
    // Use the same store that the frontend uses (settings.json)
    let store = app_handle.store(PathBuf::from("settings.json"))
        .map_err(|e| format!("Failed to load store: {}", e))?;
    
    // Try to get the channel from frontend settings
    if let Some(settings) = store.get("settings") {
        if let Some(update) = settings.get("update") {
            if let Some(channel) = update.get("channel") {
                if let Some(channel_str) = channel.as_str() {
                    return Ok(channel_str.to_string());
                }
            }
        }
    }
    
    // Default to stable if not found
    Ok("stable".to_string())
}

/// Configure updater based on the current channel setting
/// This function needs to be called before checking for updates
#[cfg(windows)]
pub async fn configure_updater_for_channel(app_handle: &AppHandle) -> Result<(), String> {
    // Get the current channel from settings
    let channel = get_update_channel(app_handle.clone()).await?;
    
    // Log the current channel for debugging
    log::info!("Configuring updater for channel: {}", channel);
    
    // Note: Tauri updater plugin doesn't support runtime reconfiguration of endpoints
    // The plugin is already initialized with the default configuration in lib.rs
    // We'll rely on the frontend to use the correct endpoint when checking for updates
    
    // This function is mainly for logging and future expansion
    // when the Tauri updater plugin supports dynamic reconfiguration
    
    Ok(())
}

/// Stub implementation for non-Windows platforms
#[cfg(not(windows))]
pub async fn configure_updater_for_channel(_app_handle: &AppHandle) -> Result<(), String> {
    log::info!("Update configuration called on non-Windows platform - updater not available");
    Ok(())
}

/// Get update information based on the current channel setting
#[command]
pub async fn get_update_info_for_channel(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let channel = get_update_channel(app_handle.clone()).await?;
    
    let endpoint = if channel == "test" {
        "https://raw.githubusercontent.com/Kwensiu/Pailer/refs/heads/test/docs/test-update.json"
    } else {
        "https://github.com/Kwensiu/Pailer/releases/latest/download/update.json"
    };
    
    // Create a custom response with the appropriate endpoint
    // This will be used by the frontend to override the standard updater check
    let response = serde_json::json!({
        "channel": channel,
        "endpoint": endpoint
    });
    
    Ok(response)
}

/// Reload the updater configuration based on the current update channel setting
#[command]
pub async fn reload_update_config(app_handle: AppHandle) -> Result<(), String> {
    // Configure the updater based on current channel
    configure_updater_for_channel(&app_handle).await?;
    
    // Emit an event to notify the frontend
    app_handle
        .emit("update-config-reloaded", Some(true))
        .map_err(|e| format!("Failed to emit update-config-reloaded event: {}", e))?;

    Ok(())
}