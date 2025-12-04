// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod cold_start;
mod commands;
mod models;
mod state;
mod tray;
pub mod utils;

use std::path::PathBuf;
use crate::commands::settings::detect_scoop_path;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_log::{Target, TargetKind};

// Use a constant group to organize related configuration key
mod config_keys {
    pub const BUCKET_AUTO_UPDATE_INTERVAL: &str = "buckets.autoUpdateInterval";
    pub const BUCKET_LAST_AUTO_UPDATE_TS: &str = "buckets.lastAutoUpdateTs";
    pub const BUCKET_AUTO_UPDATE_PACKAGES_ENABLED: &str = "buckets.autoUpdatePackagesEnabled";
    pub const WINDOW_CLOSE_TO_TRAY: &str = "window.closeToTray";
    pub const WINDOW_FIRST_TRAY_NOTIFICATION_SHOWN: &str = "window.firstTrayNotificationShown";
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init());

    // Add single instance plugin only on Windows
    #[cfg(windows)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // When a second instance is attempted, show and focus the existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.unminimize();
            }
        }));
    }

    // Determine log directory path
    let log_dir = dirs::data_local_dir()
        .map(|dir| dir.join("rscoop").join("logs"))
        .unwrap_or_else(|| PathBuf::from("./logs"));

    cleanup_old_logs(&log_dir);


    // Create log directory if it does not exist
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("Failed to create log directory {:?}: {}", log_dir, e);
    }

    // Configure logging plugin with multiple targets
    let log_plugin = tauri_plugin_log::Builder::new()
        .targets([
            Target::new(TargetKind::Stdout),
            Target::new(TargetKind::Folder {
                path: log_dir,
                file_name: None,
            }),
        ])
        .level(log::LevelFilter::Trace)
        .level_for("lnk", log::LevelFilter::Warn)
        .level_for("reqwest", log::LevelFilter::Warn)
        .level_for("tauri_plugin_updater", log::LevelFilter::Debug)
        .build();

    builder
        .plugin(log_plugin)
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Windows-specific setup
            #[cfg(windows)]
            setup_windows_specific(app)?;

            // Resolve Scoop path
            let scoop_path = resolve_scoop_path(app.handle().clone())?;
            app.manage(state::AppState::new(scoop_path));

            // Show the main application window
            show_main_window(app)?;

            // Setup system tray
            if let Err(e) = tray::setup_system_tray(&app.handle()) {
                log::error!("Failed to setup system tray: {}", e);
            }

            // Start background tasks
            start_background_tasks(app.handle().clone());

            Ok(())
        })
        .on_window_event(handle_window_event)
        .on_page_load(|window, _| {
            cold_start::run_cold_start(window.app_handle().clone());
        })
        .invoke_handler(tauri::generate_handler![
            commands::search::search_scoop,
            commands::installed::get_installed_packages_full,
            commands::installed::refresh_installed_packages,
            commands::installed::get_package_path,
            commands::info::get_package_info,
            commands::install::install_package,
            commands::manifest::get_package_manifest,
            commands::updates::check_for_updates,
            commands::update::update_package,
            commands::update::update_all_packages,
            commands::uninstall::uninstall_package,
            commands::uninstall::clear_package_cache,
            commands::status::check_scoop_status,
            commands::settings::get_config_value,
            commands::settings::set_config_value,
            commands::settings::get_scoop_path,
            commands::settings::set_scoop_path,
            commands::settings::get_virustotal_api_key,
            commands::settings::set_virustotal_api_key,
            commands::settings::get_scoop_proxy,
            commands::settings::set_scoop_proxy,
            commands::settings::detect_scoop_path,
            commands::settings::validate_scoop_directory,
            commands::settings::run_scoop_command,
            commands::settings::run_powershell_command,
            commands::settings::get_scoop_config,
            commands::settings::update_scoop_config,
            commands::virustotal::scan_package,
            commands::auto_cleanup::run_auto_cleanup,
            commands::doctor::checkup::run_scoop_checkup,
            commands::doctor::cleanup::cleanup_all_apps,
            commands::doctor::cleanup::cleanup_all_apps_force,
            commands::doctor::cleanup::cleanup_outdated_cache,
            commands::doctor::cache::list_cache_contents,
            commands::doctor::cache::clear_cache,
            commands::doctor::shim::list_shims,
            commands::doctor::shim::remove_shim,
            commands::doctor::shim::alter_shim,
            commands::doctor::shim::add_shim,
            commands::hold::list_held_packages,
            commands::hold::hold_package,
            commands::hold::unhold_package,
            commands::bucket::get_buckets,
            commands::bucket::get_bucket_info,
            commands::bucket::get_bucket_manifests,
            commands::bucket_install::install_bucket,
            commands::bucket_install::validate_bucket_install,
            commands::bucket_install::update_bucket,
            commands::bucket_install::remove_bucket,
            commands::bucket_search::search_buckets,
            // commands::bucket_search::get_expanded_search_info,
            commands::bucket_search::get_default_buckets,
            commands::bucket_search::clear_bucket_cache,
            commands::bucket_search::check_bucket_cache_exists,
            commands::app_info::is_scoop_installation,
            commands::app_info::is_cwd_mismatch,
            commands::app_info::close_app,
            commands::linker::get_package_versions,
            commands::linker::switch_package_version,
            commands::linker::get_versioned_packages,
            commands::linker::debug_package_structure,
            commands::linker::change_package_bucket,
            commands::debug::get_debug_info,
            commands::debug::get_app_logs,
            commands::debug::read_app_log_file,
            commands::version::check_and_update_version,
            commands::startup::is_auto_start_enabled,
            commands::startup::set_auto_start_enabled,
            cold_start::is_cold_start_ready,
            tray::refresh_tray_apps_menu,
            commands::update_config::reload_update_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Helper function: Clean up old log files in the specified directory
fn cleanup_old_logs(log_dir: &PathBuf) {
    if !log_dir.exists() {
        return;
    }

    if let Ok(entries) = std::fs::read_dir(log_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }
}

// Windows-specific setup
#[cfg(windows)]
fn setup_windows_specific(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_updater::Builder;

    if !utils::is_scoop_installation() {
        app.handle()
            .plugin(Builder::new().build())
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
    }
    Ok(())
}

// Resolve Scoop installation pat
fn resolve_scoop_path(app_handle: tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    match utils::resolve_scoop_root(app_handle.clone()) {
        Ok(path) => Ok(path),
        Err(e) => {
            log::warn!("Could not resolve scoop root path: {}", e);
            detect_scoop_path()
                .map(PathBuf::from)
                .or_else(|_| {
                    #[cfg(windows)]
                    { Ok(PathBuf::from("C:\\scoop")) }
                    #[cfg(not(windows))]
                    { Ok(PathBuf::from("/usr/local/scoop")) }
                })
        }
    }
}

// Show the main application windows
fn show_main_window(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(window) = app.get_webview_window("main") {
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

// Handle window events such as close requests
fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app_handle = window.app_handle().clone();
        
        // Check if "close to tray" is enabled in settings
        let close_to_tray = commands::settings::get_config_value(
            app_handle.clone(),
            config_keys::WINDOW_CLOSE_TO_TRAY.to_string(),
        )
        .ok()
        .flatten()
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

        if close_to_tray {
            // Hide the window instead of closing the app
            if let Err(e) = window.hide() {
                log::warn!("Failed to hide window: {}", e);
            }
            api.prevent_close();

            // Check if the first tray notification has been shown
            let first_notification_shown = commands::settings::get_config_value(
                app_handle.clone(),
                config_keys::WINDOW_FIRST_TRAY_NOTIFICATION_SHOWN.to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

            if !first_notification_shown {
                // Mark the notification as shown
                let _ = commands::settings::set_config_value(
                    app_handle.clone(),
                    config_keys::WINDOW_FIRST_TRAY_NOTIFICATION_SHOWN.to_string(),
                    serde_json::json!(true),
                );

                // Show system notification in a separate thread
                std::thread::spawn(move || {
                    tray::show_system_notification_blocking(&app_handle);
                });
            }
        }
    }
}

// Start background tasks such as auto-update checks
fn start_background_tasks(app_handle: tauri::AppHandle) {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tokio::time::sleep;

    tauri::async_runtime::spawn(async move {
        loop {
            // Parse auto-update interval from settings
            let interval_raw = commands::settings::get_config_value(
                app_handle.clone(),
                config_keys::BUCKET_AUTO_UPDATE_INTERVAL.to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "off".to_string());

            let interval_secs = match interval_raw.as_str() {
                "24h" | "1d" => Some(86400),
                "7d" | "1w" => Some(604800),
                "1h" => Some(3600),
                "6h" => Some(21600),
                "off" => None,
                custom if custom.starts_with("custom:") => custom[7..].parse::<u64>().ok(),
                numeric => numeric.parse::<u64>().ok(),
            };

            if interval_secs.is_none() {
                sleep(Duration::from_secs(30)).await;
                continue;
            }
            let interval_secs = interval_secs.unwrap();

            // Check if an update is needed
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
            let last_ts = commands::settings::get_config_value(
                app_handle.clone(),
                config_keys::BUCKET_LAST_AUTO_UPDATE_TS.to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

            let elapsed = if last_ts == 0 { interval_secs } else { now.saturating_sub(last_ts) };

            if elapsed >= interval_secs {
                run_auto_update(&app_handle, now).await;
                continue;
            }

            // Waiting for next checkup
            let remaining = interval_secs - elapsed;
            let chunk = remaining.min(60);
            sleep(Duration::from_secs(chunk)).await;
        }
    });
}

// Run auto update
async fn run_auto_update(app_handle: &tauri::AppHandle, run_started_at: u64) {
    log::info!("Starting auto bucket update task");
    
    // Notify UI that the update process is startin
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("auto-operation-start", "Updating buckets...");
        let _ = window.emit("operation-output", serde_json::json!({
            "line": "Starting automatic bucket update...",
            "source": "stdout"
        }));
    }

    // Update Buckets
    match commands::bucket_install::update_all_buckets().await {
        Ok(results) => {
            let successes = results.iter().filter(|r| r.success).count();
            log::info!("Auto bucket update completed: {}/{} succeeded", successes, results.len());

            // Sent result to UI, also fix emit.
            if let Some(window) = app_handle.get_webview_window("main") {
                for result in &results {
                    let line = if result.success {
                        format!("✓ Updated bucket: {}", result.bucket_name)
                    } else {
                        format!("✗ Failed to update {}: {}", result.bucket_name, result.message)
                    };
                    
                    let _ = window.emit("operation-output", serde_json::json!({
                        "line": line,
                        "source": if result.success { "stdout" } else { "stderr" }
                    }));
                }

                let _ = window.emit("operation-finished", serde_json::json!({
                    "success": successes == results.len(),
                    "message": format!("Bucket update completed: {} of {} succeeded", successes, results.len())
                }));
            }

            // Save the last update time
            let _ = commands::settings::set_config_value(
                app_handle.clone(),
                config_keys::BUCKET_LAST_AUTO_UPDATE_TS.to_string(),
                serde_json::json!(run_started_at),
            );

            // Check if packages need update
            let auto_update_packages = commands::settings::get_config_value(
                app_handle.clone(),
                config_keys::BUCKET_AUTO_UPDATE_PACKAGES_ENABLED.to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

            if auto_update_packages {
                update_packages_after_buckets(app_handle).await;
            }
        }
        Err(e) => {
            log::warn!("Auto bucket update failed: {}", e);
            
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("operation-output", serde_json::json!({
                    "line": format!("Error: {}", e),
                    "source": "stderr"
                }));
                
                let _ = window.emit("operation-finished", serde_json::json!({
                    "success": false,
                    "message": format!("Bucket update failed: {}", e)
                }));
            }

            // keep the timestamp to avoid frequent retries even if it fails
            let _ = commands::settings::set_config_value(
                app_handle.clone(),
                config_keys::BUCKET_LAST_AUTO_UPDATE_TS.to_string(),
                serde_json::json!(run_started_at),
            );
        }
    }
}

// Update packages after updating buckets
async fn update_packages_after_buckets(app_handle: &tauri::AppHandle) {
    log::info!("Starting auto package update after bucket refresh");
    
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("auto-operation-start", "Updating packages...");
        let _ = window.emit("operation-output", serde_json::json!({
            "line": "Starting automatic package update...",
            "source": "stdout"
        }));
    }

    let state = app_handle.state::<state::AppState>();
    match commands::update::update_all_packages_headless(app_handle.clone(), state).await {
        Ok(_) => {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("operation-output", serde_json::json!({
                    "line": "Package update completed successfully.",
                    "source": "stdout"
                }));
                
                let _ = window.emit("operation-finished", serde_json::json!({
                    "success": true,
                    "message": "Automatic package update completed successfully"
                }));
            }
        }
        Err(e) => {
            log::warn!("Auto package headless update failed: {}", e);
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit("operation-output", serde_json::json!({
                    "line": format!("Error: {}", e),
                    "source": "stderr"
                }));
                
                let _ = window.emit("operation-finished", serde_json::json!({
                    "success": false,
                    "message": format!("Automatic package update failed: {}", e)
                }));
            }
        }
    }
}