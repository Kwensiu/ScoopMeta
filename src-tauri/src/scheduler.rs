use tauri::{AppHandle, Emitter, Manager};

pub fn start_background_tasks(app: AppHandle) {
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tokio::time::sleep;

    tauri::async_runtime::spawn(async move {
        log::info!("Background tasks started");

        loop {
            // Parse auto-update interval from settings with better error handling
            let interval_raw = crate::commands::settings::get_config_value(
                app.clone(),
                "buckets.autoUpdateInterval".to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "off".to_string());

            let interval_secs = parse_update_interval(&interval_raw);

            if interval_secs.is_none() {
                // Auto-update is disabled, check again later
                sleep(Duration::from_secs(300)).await; // 5 minutes when auto-update is disabled
                continue;
            }
            let interval_secs = interval_secs.unwrap();

            // Check if an update is needed
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let last_ts = crate::commands::settings::get_config_value(
                app.clone(),
                "buckets.lastAutoUpdateTs".to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

            let elapsed = if last_ts == 0 {
                interval_secs
            } else {
                now.saturating_sub(last_ts)
            };

            if elapsed >= interval_secs {
                log::debug!(
                    "Auto-update interval elapsed ({}s), starting update check",
                    elapsed
                );
                run_auto_update(&app, now).await;
                continue;
            }

            // Calculate sleep duration (check at most every 60 seconds)
            let remaining = interval_secs - elapsed;
            let sleep_duration =
                Duration::from_secs(remaining.min(60)); // Check every minute at most

            log::debug!(
                "Next auto-update check in {} seconds",
                sleep_duration.as_secs()
            );
            sleep(sleep_duration).await;
        }
    });
}

async fn run_auto_update(app_handle: &tauri::AppHandle, run_started_at: u64) {
    log::info!("Starting auto bucket update task");

    // Check if silent update is enabled
    let silent_update_enabled = crate::commands::settings::get_config_value(
        app_handle.clone(),
        "buckets.silentUpdateEnabled".to_string(),
    )
    .ok()
    .flatten()
    .and_then(|v| v.as_bool())
    .unwrap_or(false);

    // Notify UI that the update process is starting only if not silent update
    if !silent_update_enabled {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("auto-operation-start", "Updating buckets...");
            let _ = window.emit(
                "operation-output",
                serde_json::json!({
                    "line": "Starting automatic bucket update...",
                    "source": "stdout"
                }),
            );
        }
    }

    // Update Buckets
    match crate::commands::bucket_install::update_all_buckets().await {
        Ok(results) => {
            let successes = results.iter().filter(|r| r.success).count();
            log::info!(
                "Auto bucket update completed: {}/{} succeeded",
                successes,
                results.len()
            );

            // Send result to UI, also fix emit.
            if let Some(window) = app_handle.get_webview_window("main") {
                for result in &results {
                    let line = if result.success {
                        format!("✓ Updated bucket: {}", result.bucket_name)
                    } else {
                        format!(
                            "✗ Failed to update {}: {}",
                            result.bucket_name, result.message
                        )
                    };

                    let _ = window.emit(
                        "operation-output",
                        serde_json::json!({
                            "line": line.clone(),
                            "source": if result.success { "stdout" } else { "stderr" }
                        }),
                    );
                }

                let _ = window.emit("operation-finished", serde_json::json!({
                    "success": successes == results.len(),
                    "message": format!("Bucket update completed: {} of {} succeeded", successes, results.len())
                }));
            }

            // Save the last update time
            let _ = crate::commands::settings::set_config_value(
                app_handle.clone(),
                "buckets.lastAutoUpdateTs".to_string(),
                serde_json::json!(run_started_at),
            );

            // Check if packages need update
            let auto_update_packages = crate::commands::settings::get_config_value(
                app_handle.clone(),
                "buckets.autoUpdatePackagesEnabled".to_string(),
            )
            .ok()
            .flatten()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

            if auto_update_packages {
                update_packages_after_buckets(app_handle, silent_update_enabled).await;
            }
        }
        Err(e) => {
            log::warn!("Auto bucket update failed: {}", e);

            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.emit(
                    "operation-output",
                    serde_json::json!({
                        "line": format!("Error: {}", e),
                        "source": "stderr"
                    }),
                );

                let _ = window.emit(
                    "operation-finished",
                    serde_json::json!({
                        "success": false,
                        "message": format!("Bucket update failed: {}", e)
                    }),
                );
            }

            // keep the timestamp to avoid frequent retries even if it fails
            let _ = crate::commands::settings::set_config_value(
                app_handle.clone(),
                "buckets.lastAutoUpdateTs".to_string(),
                serde_json::json!(run_started_at),
            );
        }
    }
}

async fn update_packages_after_buckets(app_handle: &tauri::AppHandle, silent_update_enabled: bool) {
    log::info!("Starting auto package update after bucket refresh");

    // Notify UI that package update is starting only if not silent update
    if !silent_update_enabled {
        if let Some(window) = app_handle.get_webview_window("main") {
            let _ = window.emit("auto-operation-start", "Updating packages...");
            let _ = window.emit(
                "operation-output",
                serde_json::json!({
                    "line": "Starting automatic package update...",
                    "source": "stdout"
                }),
            );
        }
    }

    let state = app_handle.state::<crate::state::AppState>();
    match crate::commands::update::update_all_packages_headless(app_handle.clone(), state).await {
        Ok(update_details) => {
            // Notify UI of success only if not silent update
            if !silent_update_enabled {
                if let Some(window) = app_handle.get_webview_window("main") {
                    for line in &update_details {
                        let _ = window.emit(
                            "operation-output",
                            serde_json::json!({
                                "line": line,
                                "source": "stdout"
                            }),
                        );
                    }

                    let _ = window.emit(
                        "operation-finished",
                        serde_json::json!({
                            "success": true,
                            "message": "Automatic package update completed successfully"
                        }),
                    );
                }
            }
        }
        Err(e) => {
            log::warn!("Auto package headless update failed: {}", e);
            let error_line = format!("Error: {}", e);

            // Notify UI of error only if not silent update
            if !silent_update_enabled {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.emit(
                        "operation-output",
                        serde_json::json!({
                            "line": error_line,
                            "source": "stderr"
                        }),
                    );

                    let _ = window.emit(
                        "operation-finished",
                        serde_json::json!({
                            "success": false,
                            "message": format!("Automatic package update failed: {}", e)
                        }),
                    );
                }
            }
        }
    }
}

fn parse_update_interval(interval_raw: &str) -> Option<u64> {
    match interval_raw {
        "24h" | "1d" => Some(86400), // 24 hours
        "7d" | "1w" => Some(604800), // 7 days
        "1h" => Some(3600),          // 1 hour
        "6h" => Some(21600),         // 6 hours
        "off" => None,               // Disabled
        custom if custom.starts_with("custom:") => custom[7..].parse::<u64>().ok(),
        numeric => numeric.parse::<u64>().ok(),
    }
}
