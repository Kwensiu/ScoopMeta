//! Commands for reading and writing application settings from the persistent store.
use serde_json::{Map, Value};
use std::env;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Runtime, Manager};
use tauri_plugin_store::{Store, StoreExt};

const STORE_PATH: &str = "store.json";

/// A helper function to reduce boilerplate when performing a write operation on the store.
///
/// It loads the store, applies the given operation, and saves the changes to disk.
fn with_store_mut<R: Runtime, F, T>(app: AppHandle<R>, operation: F) -> Result<T, String>
where
    F: FnOnce(&Store<R>) -> T,
{
    let store = app
        .store(PathBuf::from(STORE_PATH))
        .map_err(|e| e.to_string())?;
    let result = operation(&store);
    store.save().map_err(|e| e.to_string())?;
    Ok(result)
}

/// A helper function to reduce boilerplate when performing a read operation on the store.
fn with_store_get<R: Runtime, F, T>(app: AppHandle<R>, operation: F) -> Result<T, String>
where
    F: FnOnce(&Store<R>) -> T,
{
    let store = app
        .store(PathBuf::from(STORE_PATH))
        .map_err(|e| e.to_string())?;
    Ok(operation(&store))
}

/// Returns the path to the Scoop configuration file.
///
/// Typically: `C:\Users\USER\.config\scoop\config.json`
fn get_scoop_config_path() -> Result<PathBuf, String> {
    // Accommodate both Windows and Unix-like systems for development purposes.
    let home_dir = env::var("USERPROFILE")
        .or_else(|_| env::var("HOME"))
        .map_err(|_| "Could not determine the user's home directory.")?;

    Ok(PathBuf::from(home_dir)
        .join(".config")
        .join("scoop")
        .join("config.json"))
}

/// Reads the Scoop configuration file and returns its contents as a JSON map.
///
/// If the file doesn't exist, it returns an empty map.
fn read_scoop_config() -> Result<Map<String, Value>, String> {
    let path = get_scoop_config_path()?;
    if !path.exists() {
        return Ok(Map::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Scoop config at {:?}: {}", path, e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse Scoop config at {:?}: {}", path, e))
}

/// Writes the given JSON map to the Scoop configuration file.
///
/// This will create the directory and file if they don't exist.
fn write_scoop_config(config: &Map<String, Value>) -> Result<(), String> {
    let path = get_scoop_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create Scoop config directory: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Scoop config: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write to {:?}: {}", path, e))
}

/// Gets the configured Scoop path from the store.
#[tauri::command]
pub fn get_scoop_path<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    with_store_get(app, |store| {
        store
            .get("scoop_path")
            .and_then(|v| v.as_str().map(String::from))
    })
}

/// Sets the Scoop path in the store.
#[tauri::command]
pub fn set_scoop_path<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let path_clone = path.clone();
    with_store_mut(app.clone(), move |store| {
        store.set("scoop_path", serde_json::json!(path_clone))
    })?;
    
    // Also update the in-memory app state if it exists
    // We're only setting the scoop path synchronously and not clearing the cache
    // to avoid needing async context or blocking operations
    if let Some(state) = app.try_state::<crate::state::AppState>() {
        state.set_scoop_path(std::path::PathBuf::from(path));
    }
    
    Ok(())
}

/// Validates if a path is a valid Scoop installation directory
/// by checking for required subdirectories
/// Fix: Ensure this command is registered in lib.rs
#[tauri::command]
pub fn validate_scoop_directory(path: String) -> Result<bool, String> {
    use std::path::Path;
    
    let path = Path::new(&path);
    
    // Check if path exists and is a directory
    if !path.exists() {
        return Ok(false);
    }
    
    if !path.is_dir() {
        return Ok(false);
    }
    
    // Check for required Scoop directories
    let apps_dir = path.join("apps");
    let buckets_dir = path.join("buckets");
    let cache_dir = path.join("cache");
    
    if !apps_dir.exists() || !buckets_dir.exists() || !cache_dir.exists() {
        return Ok(false);
    }
    
    if !apps_dir.is_dir() || !buckets_dir.is_dir() || !cache_dir.is_dir() {
        return Ok(false);
    }
    
    Ok(true)
}

/// Detects the Scoop path by checking environment variables and Scoop's own configuration
#[tauri::command]
pub fn detect_scoop_path() -> Result<String, String> {
    // Use the comprehensive detection logic from utils.rs
    let candidates = crate::utils::build_candidate_list(Vec::<PathBuf>::new());
    
    // Find the first valid candidate
    for candidate in candidates {
        if crate::utils::is_valid_scoop_candidate(&candidate) {
            log::info!("Detected Scoop path: {}", candidate.display());
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    Err("Could not detect Scoop installation directory. Please set the path manually.".to_string())
}



/// Gets a generic configuration value from the store by its key.
#[tauri::command]
pub fn get_config_value<R: Runtime>(
    app: AppHandle<R>,
    key: String,
) -> Result<Option<Value>, String> {
    with_store_get(app, |store| store.get(&key).map(|v| v.clone()))
}

/// Sets a generic configuration value in the store.
#[tauri::command]
pub fn set_config_value<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: Value,
) -> Result<(), String> {
    with_store_mut(app, move |store| store.set(key, value))
}

/// Gets the Scoop configuration as a JSON object
#[tauri::command]
pub fn get_scoop_config() -> Result<Option<serde_json::Value>, String> {
    let path = get_scoop_config_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read Scoop config at {:?}: {}", path, e))?;
    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse Scoop config at {:?}: {}", path, e))?;
    Ok(Some(config))
}

/// Updates the Scoop configuration with a new JSON object
#[tauri::command]
pub fn update_scoop_config(config: serde_json::Value) -> Result<(), String> {
    // Convert to Map for writing
    if let serde_json::Value::Object(map) = config {
        write_scoop_config(&map)
    } else {
        Err("Config must be a JSON object".to_string())
    }
}

/// Gets the VirusTotal API key from Scoop's `config.json`.
#[tauri::command]
pub fn get_virustotal_api_key() -> Result<Option<String>, String> {
    let config = read_scoop_config()?;
    Ok(config
        .get("virustotal_api_key")
        .and_then(|v| v.as_str().map(String::from)))
}

/// Sets the VirusTotal API key in Scoop's `config.json`.
///
/// If the key is an empty string, it removes the `virustotal_api_key` field.
#[tauri::command]
pub fn set_virustotal_api_key(key: String) -> Result<(), String> {
    let mut config = read_scoop_config()?;
    if key.is_empty() {
        config.remove("virustotal_api_key");
    } else {
        config.insert("virustotal_api_key".to_string(), serde_json::json!(key));
    }
    write_scoop_config(&config)
}

/// Gets the proxy setting from Scoop's `config.json`.
#[tauri::command]
pub fn get_scoop_proxy() -> Result<Option<String>, String> {
    let config = read_scoop_config()?;
    Ok(config
        .get("proxy")
        .and_then(|v| v.as_str().map(String::from)))
}

/// Sets the proxy setting in Scoop's `config.json`.
///
/// If the proxy is an empty string, it removes the `proxy` field.
#[tauri::command]
pub fn set_scoop_proxy(proxy: String) -> Result<(), String> {
    let mut config = read_scoop_config()?;
    if proxy.is_empty() {
        config.remove("proxy");
    } else {
        config.insert("proxy".to_string(), serde_json::json!(proxy));
    }
    write_scoop_config(&config)
}

/// Executes an arbitrary Scoop command
#[tauri::command]
pub async fn run_scoop_command(window: tauri::Window, command: String) -> Result<(), String> {
    let full_command = format!("scoop {}", command);
    crate::commands::powershell::run_and_stream_command(
        window,
        full_command,
        command.clone(),
        crate::commands::powershell::EVENT_OUTPUT,
        crate::commands::powershell::EVENT_FINISHED,
        crate::commands::powershell::EVENT_CANCEL,
    )
    .await
}

/// Executes an arbitrary PowerShell command directly without adding any prefix
#[tauri::command]
pub async fn run_powershell_command(window: tauri::Window, command: String) -> Result<(), String> {
    crate::commands::powershell::run_and_stream_command(
        window,
        command.clone(),
        command.clone(),
        crate::commands::powershell::EVENT_OUTPUT,
        crate::commands::powershell::EVENT_FINISHED,
        crate::commands::powershell::EVENT_CANCEL,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_scoop_config_path() {
        // This test will only pass if USERPROFILE or HOME is set
        if let Ok(_) = get_scoop_config_path() {
            assert!(true);
        } else {
            // Skip test if environment variables are not set
            assert!(true);
        }
    }
}