use std::path::PathBuf;
use tauri::Manager;

/// Load tray locale strings for the given language
pub fn load_tray_locale_strings(app: &tauri::AppHandle<tauri::Wry>, language: &str) -> tauri::Result<serde_json::Value> {
    let locale_file = match language {
        "zh" => "zh.json",
        _ => "en.json",
    };

    let paths = get_locale_file_paths(app, locale_file);

    for path in paths {
        if let Ok(content) = std::fs::read_to_string(&path) {
            return parse_locale_content(&content, &path);
        }
    }

    // Final fallback to default strings
    log::warn!("All locale loading attempts failed, using default strings");
    Ok(get_default_tray_strings())
}

/// Get possible locale file paths for the given locale file
fn get_locale_file_paths(app: &tauri::AppHandle<tauri::Wry>, locale_file: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // 1. Try development path - from exe location up to project root
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Path structure: project_root/src-tauri/target/debug/
            // We need to go up 3 levels: debug -> target -> src-tauri -> project_root
            let project_root = exe_dir
                .parent() // target
                .and_then(|p| p.parent()) // src-tauri
                .and_then(|p| p.parent()); // project_root

            if let Some(project_root) = project_root {
                let dev_path = project_root
                    .join("src-tauri")
                    .join("resources")
                    .join("locales")
                    .join(locale_file);
                paths.push(dev_path);
            }
        }
    }

    // 2. Try resource directory (production)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let resource_path = resource_dir.join("locales").join(locale_file);
        paths.push(resource_path);

        // Special handling for NSIS installer: also try resources/ subdirectory
        // Some Tauri installations may put resources in a subdirectory
        let alt_resource_path = resource_dir.join("resources").join("locales").join(locale_file);
        paths.push(alt_resource_path);
    }

    paths
}

/// Parse locale file content and extract tray section
fn parse_locale_content(content: &str, path: &std::path::Path) -> tauri::Result<serde_json::Value> {
    log::info!("Successfully loaded locale file from {}, size: {} bytes", path.display(), content.len());
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(json) => {
            // Extract the tray section - it's nested under settings
            if let Some(settings) = json.get("settings") {
                if let Some(tray_section) = settings.get("tray") {
                    log::info!("Found tray section in locale file");
                    return Ok(tray_section.clone());
                }
            }
            log::warn!("No 'settings.tray' section found in locale file: {}", path.display());
            Ok(get_default_tray_strings())
        }
        Err(e) => {
            log::warn!("Failed to parse locale file {}: {}", path.display(), e);
            Ok(get_default_tray_strings())
        }
    }
}

/// Get default tray strings as fallback
fn get_default_tray_strings() -> serde_json::Value {
    serde_json::json!({
        "show": "Show Pailer",
        "hide": "Hide Pailer",
        "refreshApps": "Refresh Apps",
        "scoopApps": "Scoop Apps",
        "quit": "Quit",
        "notificationTitle": "Pailer - Minimized to Tray",
        "notificationMessage": "Pailer has been minimized to the system tray and will continue running in the background.\n\nYou can:\n• Click the tray icon to restore the window\n• Right-click the tray icon to access the context menu\n• Change this behavior in Settings > Window Behavior\n\nWhat would you like to do?",
        "closeAndDisable": "Close and Disable Tray",
        "keepInTray": "Keep in Tray"
    })
}

/// Load full locale strings for the given language (for frontend use)
pub fn load_full_locale_strings(app: &tauri::AppHandle<tauri::Wry>, lang: &str) -> Result<serde_json::Value, String> {
    let locale_file = match lang {
        "zh" => "zh.json",
        _ => "en.json",
    };

    let paths = get_locale_file_paths(app, locale_file);

    for path in paths {
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                log::info!("Successfully read full locale file, size: {} bytes", content.len());
                return serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse locale file {}: {}", path.display(), e));
            }
            Err(e) => {
                log::debug!("Failed to read locale file from {}: {}", path.display(), e);
            }
        }
    }

    Err(format!("Failed to load locale file for language: {}", lang))
}
