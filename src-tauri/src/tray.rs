use crate::commands::settings;
use crate::state::AppState;
use crate::utils::{get_scoop_app_shortcuts_with_path, launch_scoop_app, ScoopAppShortcut};
use crate::i18n;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

pub fn setup_system_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    // Create a shared map to store app shortcuts for menu events
    let shortcuts_map: Arc<Mutex<HashMap<String, ScoopAppShortcut>>> =
        Arc::new(Mutex::new(HashMap::new()));
    app.manage(shortcuts_map.clone());

    // Create a debouncer for tray refreshes to prevent race conditions
    let refresh_in_progress: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    app.manage(refresh_in_progress.clone());

    // Build the dynamic menu
    let menu = build_tray_menu(app, shortcuts_map.clone())?;

    let _tray = TrayIconBuilder::with_id("main")
        .tooltip("Rscoop - Scoop Package Manager")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    // Ensure window is shown and restored from minimized state
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
        })
        .on_menu_event(move |app, event| {
            let event_id = event.id().as_ref();
            match event_id {
                "quit" => {
                    app.exit(0);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "refreshApps" => {
                    // Refresh the tray menu
                    let app_handle = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = refresh_tray_menu(&app_handle).await {
                            log::error!("Failed to refresh tray menu: {}", e);
                        }
                    });
                }
                id if id.starts_with("app_") => {
                    // Handle Scoop app launches
                    let shortcuts_map =
                        app.state::<Arc<Mutex<HashMap<String, ScoopAppShortcut>>>>();
                    if let Ok(shortcuts) = shortcuts_map.inner().lock() {
                        if let Some(shortcut) = shortcuts.get(id) {
                            if let Err(e) =
                                launch_scoop_app(&shortcut.target_path, &shortcut.working_directory)
                            {
                                log::error!(
                                    "Failed to launch app {}: {}",
                                    shortcut.display_name,
                                    e
                                );
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

fn build_tray_menu(
    app: &tauri::AppHandle<tauri::Wry>,
    shortcuts_map: Arc<Mutex<HashMap<String, ScoopAppShortcut>>>,
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    // Get the current language setting
    let language = settings::get_config_value(
        app.clone(),
        "settings.language".to_string(),
    )
    .ok()
    .flatten()
    .and_then(|v| v.as_str().map(|s| s.to_string()))
    .unwrap_or_else(|| "en".to_string());

    // Get localized menu strings
    let menu_strings = i18n::load_tray_locale_strings(app, &language)?;

    // Extract strings with defaults
    let show_text = menu_strings.get("show")
        .and_then(|v| v.as_str())
        .unwrap_or("Show Rscoop");
    let hide_text = menu_strings.get("hide")
        .and_then(|v| v.as_str())
        .unwrap_or("Hide Rscoop");
    let refresh_apps_text = menu_strings.get("refreshApps")
        .and_then(|v| v.as_str())
        .unwrap_or("Refresh Apps");
    let scoop_apps_text = menu_strings.get("scoopApps")
        .and_then(|v| v.as_str())
        .unwrap_or("Scoop Apps");
    let quit_text = menu_strings.get("quit")
        .and_then(|v| v.as_str())
        .unwrap_or("Quit");

    // Basic menu items
    let show = tauri::menu::MenuItemBuilder::with_id("show", show_text).build(app)?;
    let hide = tauri::menu::MenuItemBuilder::with_id("hide", hide_text).build(app)?;
    let refresh_apps =
        tauri::menu::MenuItemBuilder::with_id("refreshApps", refresh_apps_text).build(app)?;

    let mut menu_items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = Vec::new();
    menu_items.push(Box::new(show));
    menu_items.push(Box::new(hide));
    let shortcuts_result = if let Some(app_state) = app.try_state::<AppState>() {
        let scoop_path = app_state.scoop_path();
        get_scoop_app_shortcuts_with_path(scoop_path.as_path())
    } else {
        // Fallback to automatic detection if state is not available
        crate::utils::get_scoop_app_shortcuts()
    };

    if let Ok(shortcuts) = shortcuts_result {
        if !shortcuts.is_empty() {
            // Check if tray apps functionality is enabled
            let tray_apps_enabled = crate::commands::settings::get_config_value(
                app.clone(),
                "settings.window.trayAppsEnabled".to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_bool())
            .unwrap_or(true); // Default to true for backward compatibility

            if tray_apps_enabled {
                // Get configured tray apps list
                let configured_apps = crate::commands::settings::get_config_value(
                    app.clone(),
                    crate::config_keys::TRAY_APPS_LIST.to_string(),
                )
                .ok()
                .flatten()
                .and_then(|v| v.as_array().cloned())
                .unwrap_or_default();

                // Convert configured apps to a HashSet for fast lookup
                let configured_app_names: std::collections::HashSet<String> = configured_apps
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();

                // Filter shortcuts based on configuration
                // If no apps configured, show none (user can add them in settings)
                let filtered_shortcuts: Vec<_> = if configured_app_names.is_empty() {
                    Vec::new()  // Show no apps by default
                } else {
                    shortcuts
                        .into_iter()
                        .filter(|shortcut| configured_app_names.contains(&shortcut.name))
                        .collect()
                };

                if !filtered_shortcuts.is_empty() {
                    // Add separator before apps
                    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
                    menu_items.push(Box::new(separator));

                    // Add "Scoop Apps" label
                    let apps_label = tauri::menu::MenuItemBuilder::with_id("apps_label", scoop_apps_text)
                        .enabled(false)
                        .build(app)?;
                    menu_items.push(Box::new(apps_label));

                    // Build new shortcuts map first, then replace atomically
                    let mut new_shortcuts_map = HashMap::new();
                    for shortcut in filtered_shortcuts {
                        let menu_id = format!("app_{}", shortcut.name);
                        new_shortcuts_map.insert(menu_id.clone(), shortcut.clone());

                        let menu_item =
                            tauri::menu::MenuItemBuilder::with_id(&menu_id, &shortcut.display_name)
                                .build(app)?;
                        menu_items.push(Box::new(menu_item));
                    }

                    // Replace the old map atomically with error handling
                    if let Ok(mut map) = shortcuts_map.lock() {
                        *map = new_shortcuts_map;
                    } else {
                        log::error!("Failed to acquire shortcuts_map lock for atomic replacement - continuing with empty map");
                        // Continue with the menu build even if we can't update the shortcuts map
                        // This maintains backward compatibility with the original behavior
                    }
                }
            }
        }
    } else if let Err(e) = shortcuts_result {
        log::warn!("Failed to get Scoop app shortcuts: {}", e);
    }

    // Add separator and refresh option
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    menu_items.push(Box::new(separator));
    menu_items.push(Box::new(refresh_apps));

    // Add quit option
    let separator2 = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit = tauri::menu::MenuItemBuilder::with_id("quit", quit_text).build(app)?;
    menu_items.push(Box::new(separator2));
    menu_items.push(Box::new(quit));

    // Build the menu
    let mut menu_builder = tauri::menu::MenuBuilder::new(app);
    for item in menu_items {
        menu_builder = menu_builder.item(&*item);
    }

    menu_builder.build()
}

/// Refresh the tray menu with updated Scoop apps
pub async fn refresh_tray_menu(app: &tauri::AppHandle<tauri::Wry>) -> Result<(), String> {
    log::info!("Refreshing tray menu...");

    let refresh_in_progress = app.state::<Arc<Mutex<bool>>>();

    // Check if a refresh is already in progress
    {
        let mut in_progress = refresh_in_progress.inner().lock().map_err(|e| format!("Failed to lock refresh flag: {}", e))?;
        if *in_progress {
            log::info!("Tray refresh already in progress, skipping...");
            return Ok(());
        }
        *in_progress = true;
    }

    // Get shortcuts map
    let shortcuts_map = app.state::<Arc<Mutex<HashMap<String, ScoopAppShortcut>>>>();

    // Clone the app handle for the async task
    let app_clone = app.clone();
    let shortcuts_map_clone = shortcuts_map.inner().clone();
    let refresh_flag_clone = refresh_in_progress.inner().clone();

    // Start the refresh task with proper error handling and flag reset
    tauri::async_runtime::spawn(async move {
        let result = perform_tray_refresh(&app_clone, shortcuts_map_clone).await;

        // ALWAYS reset the flag, regardless of success or failure
        if let Ok(mut flag) = refresh_flag_clone.lock() {
            *flag = false;
        } else {
            log::error!("Failed to reset refresh_in_progress flag after tray refresh attempt");
        }

        // Log the result
        match result {
            Ok(_) => log::info!("Tray menu refreshed successfully"),
            Err(e) => log::error!("Failed to perform tray refresh: {}", e),
        }
    });

    Ok(())
}

/// Internal function to perform the actual tray refresh
async fn perform_tray_refresh(
    app: &tauri::AppHandle<tauri::Wry>,
    shortcuts_map: Arc<Mutex<HashMap<String, ScoopAppShortcut>>>,
) -> Result<(), String> {
    // Rebuild the menu
    let new_menu = build_tray_menu(app, shortcuts_map)
        .map_err(|e| format!("Failed to build new menu: {}", e))?;

    // Update the tray icon menu
    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(new_menu))
            .map_err(|e| format!("Failed to set new menu: {}", e))?;
        log::info!("Tray menu refreshed successfully");
    } else {
        return Err("Tray icon not found".to_string());
    }

    Ok(())
}

/// Blocking version for use in threads
pub fn show_system_notification_blocking(app: &tauri::AppHandle) {
    log::info!("Displaying blocking native dialog for tray notification");

    // Get notification strings from locale files
    let language = settings::get_config_value(
        app.clone(),
        "settings.language".to_string(),
    )
    .ok()
    .flatten()
    .and_then(|v| v.as_str().map(|s| s.to_string()))
    .unwrap_or_else(|| "en".to_string());

    let strings = match i18n::load_tray_locale_strings(app, &language) {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to get notification strings: {}", e);
            return;
        }
    };

    // Extract strings with fallbacks
    let title = strings
        .get("notificationTitle")
        .and_then(|v| v.as_str())
        .unwrap_or("Rscoop - Minimized to Tray");
    let message = strings
        .get("notificationMessage")
        .and_then(|v| v.as_str())
        .unwrap_or("Rscoop has been minimized to the system tray and will continue running in the background.\n\nYou can:\n• Click the tray icon to restore the window\n• Right-click the tray icon to access the context menu\n• Change this behavior in Settings > Window Behavior\n\nWhat would you like to do?");
    let close_button = strings
        .get("closeAndDisable")
        .and_then(|v| v.as_str())
        .unwrap_or("Close and Disable Tray");
    let keep_button = strings
        .get("keepInTray")
        .and_then(|v| v.as_str())
        .unwrap_or("Keep in Tray");

    // Show a nice native dialog with information about tray behavior
    let result = app
        .dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(close_button.to_string(), keep_button.to_string()))
        .blocking_show();

    // If user chose to close and disable tray, disable the setting and exit
    if result {
        // Disable close to tray setting
        let _ = settings::set_config_value(
            app.clone(),
            "window.closeToTray".to_string(),
            serde_json::json!(false),
        );

        log::info!("User chose to disable tray functionality. Exiting application.");
        app.exit(0);
    }
}

#[tauri::command]
pub async fn refresh_tray_apps_menu(app: tauri::AppHandle<tauri::Wry>) -> Result<(), String> {
    refresh_tray_menu(&app).await
}

#[tauri::command]
pub fn get_current_language(app: tauri::AppHandle<tauri::Wry>) -> Result<String, String> {
    let language = settings::get_config_value(
        app.clone(),
        "settings.language".to_string(),
    )
    .ok()
    .flatten()
    .and_then(|v| v.as_str().map(|s| s.to_string()))
    .unwrap_or_else(|| "en".to_string());
    
    Ok(language)
}

#[tauri::command]
pub fn set_language_setting(app: tauri::AppHandle<tauri::Wry>, language: String) -> Result<(), String> {
    settings::set_config_value(app, "settings.language".to_string(), serde_json::json!(language))
}

#[tauri::command]
pub fn get_scoop_app_shortcuts() -> Result<Vec<serde_json::Value>, String> {
    match crate::utils::get_scoop_app_shortcuts() {
        Ok(shortcuts) => {
            let result: Vec<serde_json::Value> = shortcuts
                .into_iter()
                .map(|shortcut| {
                    serde_json::json!({
                        "name": shortcut.name,
                        "display_name": shortcut.display_name
                    })
                })
                .collect();
            Ok(result)
        }
        Err(e) => Err(format!("Failed to get Scoop app shortcuts: {}", e)),
    }
}

#[tauri::command]
pub fn get_locale_strings(app: tauri::AppHandle<tauri::Wry>, lang: String) -> Result<serde_json::Value, String> {
    i18n::load_full_locale_strings(&app, &lang)
}
