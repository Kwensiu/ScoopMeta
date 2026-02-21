// Many thanks to Kwensiu for the original code on the forked repo: https://github.com/Kwensiu/Rscoop by AmarBego
//! Commands for managing application startup settings on Windows.

use std::env;
use tauri;
#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};

const REG_KEY_PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const REG_KEY_NAME: &str = "Pailer";
const SILENT_STARTUP_KEY: &str = "ScoopMetaSilentStartup";

/// Checks if the application is configured to start automatically on Windows boot.
#[tauri::command]
pub fn is_auto_start_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu.open_subkey(REG_KEY_PATH).map_err(|e| e.to_string())?;

        // Check if our registry key exists
        match startup_key.get_value::<String, _>(REG_KEY_NAME) {
            Ok(current_value) => {
                // Check if current executable path matches registered one
                let current_exe = env::current_exe().map_err(|e| format!("Failed to get current exe: {}", e))?;
                let current_exe_canonical = current_exe.canonicalize().map_err(|e| format!("Failed to canonicalize current exe: {}", e))?;
                
                // Parse registry value as path, remove quotes if present
                let registry_path_str = current_value.trim_matches('"');
                let registry_path = std::path::Path::new(registry_path_str);
                
                // Try to canonicalize registry path, if fails, compare directly as fallback
                match registry_path.canonicalize() {
                    Ok(registry_canonical) => Ok(current_exe_canonical == registry_canonical),
                    Err(_) => {
                        // Fallback to string comparison if canonicalize fails
                        let current_exe_str = current_exe.to_string_lossy();
                        let normalize_path = |path: &str| path.replace('/', "\\").to_lowercase();
                        Ok(normalize_path(&current_value) == normalize_path(&current_exe_str))
                    }
                }
            }
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Sets whether the application should start automatically on Windows boot.
#[tauri::command]
pub fn set_auto_start_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu
            .open_subkey_with_flags(REG_KEY_PATH, KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;

        if enabled {
            // Enable auto-start by adding registry key
            let current_exe = env::current_exe().map_err(|e| e.to_string())?;
            startup_key
                .set_value(REG_KEY_NAME, &current_exe.to_string_lossy().to_string())
                .map_err(|e| e.to_string())?;
        } else {
            // Disable auto-start by removing both registry keys
            // Remove main auto-start entry
            match startup_key.delete_value(REG_KEY_NAME) {
                Ok(_) => log::info!("Removed auto-start registry entry: {}", REG_KEY_NAME),
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        log::warn!("Failed to remove auto-start registry entry {}: {}", REG_KEY_NAME, e);
                        return Err(e.to_string());
                    } else {
                        log::info!("Auto-start registry entry {} was not found (already removed)", REG_KEY_NAME);
                    }
                }
            }
            
            // Also remove silent startup entry for complete cleanup
            match startup_key.delete_value(SILENT_STARTUP_KEY) {
                Ok(_) => log::info!("Removed silent startup registry entry: {}", SILENT_STARTUP_KEY),
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        log::warn!("Failed to remove silent startup registry entry {}: {}", SILENT_STARTUP_KEY, e);
                    } else {
                        log::info!("Silent startup registry entry {} was not found (already removed)", SILENT_STARTUP_KEY);
                    }
                }
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Auto-start is only supported on Windows".to_string())
    }
}

/// Cleans up all startup registry entries created by the application.
/// This should be called during uninstallation to ensure complete cleanup.
#[tauri::command]
pub fn cleanup_startup_entries() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu
            .open_subkey_with_flags(REG_KEY_PATH, KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;

        // Remove auto-start registry entry
        match startup_key.delete_value(REG_KEY_NAME) {
            Ok(_) => log::info!("Removed auto-start registry entry: {}", REG_KEY_NAME),
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    log::warn!("Failed to remove auto-start registry entry {}: {}", REG_KEY_NAME, e);
                    return Err(e.to_string());
                } else {
                    log::info!("Auto-start registry entry {} was not found (already cleaned)", REG_KEY_NAME);
                }
            }
        }

        // Remove silent startup registry entry
        match startup_key.delete_value(SILENT_STARTUP_KEY) {
            Ok(_) => log::info!("Removed silent startup registry entry: {}", SILENT_STARTUP_KEY),
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    log::warn!("Failed to remove silent startup registry entry {}: {}", SILENT_STARTUP_KEY, e);
                    return Err(e.to_string());
                } else {
                    log::info!("Silent startup registry entry {} was not found (already cleaned)", SILENT_STARTUP_KEY);
                }
            }
        }

        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        log::info!("Startup cleanup is not applicable on non-Windows platforms");
        Ok(())
    }
}

/// Checks if silent startup is enabled.
#[tauri::command]
pub fn is_silent_startup_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu.open_subkey(REG_KEY_PATH).map_err(|e| e.to_string())?;

        match startup_key.get_value::<u32, _>(SILENT_STARTUP_KEY) {
            Ok(value) => Ok(value == 1),
            Err(_) => Ok(false),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Sets whether the application should start silently (minimized to tray).
#[tauri::command]
pub fn set_silent_startup_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let startup_key = hkcu
            .open_subkey_with_flags(REG_KEY_PATH, KEY_SET_VALUE)
            .map_err(|e| e.to_string())?;

        if enabled {
            startup_key
                .set_value(SILENT_STARTUP_KEY, &1u32)
                .map_err(|e| e.to_string())?;
        } else {
            match startup_key.delete_value(SILENT_STARTUP_KEY) {
                Ok(_) => (),
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        return Err(e.to_string());
                    }
                }
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Silent startup is only supported on Windows".to_string())
    }
}
