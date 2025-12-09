use tauri::{command, AppHandle, Emitter};

/// Reload the updater configuration based on the current update channel setting
#[command]
pub async fn reload_update_config(app_handle: AppHandle) -> Result<(), String> {
    // Just emit an event to notify the frontend
    app_handle
        .emit("update-config-reloaded", Some(true))
        .map_err(|e| format!("Failed to emit update-config-reloaded event: {}", e))?;

    Ok(())
}
