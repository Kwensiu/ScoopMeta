use crate::commands::auto_cleanup::trigger_auto_cleanup;
use crate::commands::scoop::{self, ScoopOp};
use crate::state::AppState;
use tauri::{AppHandle, State, Window};

/// Updates a specific Scoop package.
#[tauri::command]
pub async fn update_package(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
    package_name: String,
    force: Option<bool>,
) -> Result<(), String> {
    log::info!("Updating package '{}'", package_name);
    let op = if force.unwrap_or(false) {
        log::info!("Force updating package '{}'", package_name);
        ScoopOp::UpdateForce
    } else {
        ScoopOp::Update
    };
    
    scoop::execute_scoop(window, op, Some(&package_name), None).await?;

    // Trigger auto cleanup after update
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// Updates all Scoop packages.
#[tauri::command]
pub async fn update_all_packages(
    window: Window,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    log::info!("Updating all packages (manual)");
    
    // Execute the update through window streaming
    let result = scoop::execute_scoop(window.clone(), ScoopOp::UpdateAll, None, None).await;

    // Return the original result (success or error)
    result?;

    // Trigger auto cleanup after update all
    trigger_auto_cleanup(app, state).await;

    Ok(())
}

/// Headless variant used by background scheduler (no UI streaming). Returns update details.
pub async fn update_all_packages_headless(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    use crate::commands::powershell;
    use tokio::io::AsyncReadExt;

    log::info!("(Headless) Updating all packages");
    let mut cmd = powershell::create_powershell_command("scoop update *");
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn scoop update *: {}", e))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    
    // Capture stdout
    if let Some(mut out) = child.stdout.take() {
        let mut buf = [0u8; 8192];
        // Read a chunk to avoid huge memory usage; not streaming to UI
        if let Ok(n) = out.read(&mut buf).await {
            stdout.push_str(&String::from_utf8_lossy(&buf[..n]));
        }
    }
    
    // Capture stderr
    if let Some(mut err) = child.stderr.take() {
        let mut buf = [0u8; 8192];
        if let Ok(n) = err.read(&mut buf).await {
            stderr.push_str(&String::from_utf8_lossy(&buf[..n]));
        }
    }
    
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to execute scoop update *: {}", e))?;

    if !status.success() {
        log::warn!(
            "Headless update_all_packages exited with status: {}",
            status
        );
        if !stdout.is_empty() {
            log::debug!(
                "Partial stdout: {}",
                stdout.lines().take(20).collect::<Vec<_>>().join(" | ")
            );
        }

        if !stderr.is_empty() {
            log::debug!(
                "Headless update stderr: {}",
                stderr
            );
        }

        // Return error details from stderr or stdout
        let error_lines: Vec<String> = stderr
            .lines()
            .chain(stdout.lines())
            .filter(|line| !line.trim().is_empty())
            .take(10)
            .map(|line| line.to_string())
            .collect();

        return Err(format!("Headless package update failed: {}", error_lines.join("; ")));
    }

    // Parse output to extract update details
    let update_lines: Vec<String> = stdout
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && (
                trimmed.contains("Updating") || 
                trimmed.contains("Updated") || 
                trimmed.contains("up to date") ||
                trimmed.contains("Installing") ||
                trimmed.contains("Downloading") ||
                trimmed.contains("Extracting") ||
                trimmed.contains("Linking") ||
                trimmed.contains("WARN") ||
                trimmed.contains("ERROR")
            )
        })
        .map(|line| line.trim().to_string())
        .collect();

    // Log the update details
    for line in &update_lines {
        log::info!("{}", line);
    }

    // If no meaningful output, add a summary
    let result = if update_lines.is_empty() {
        vec!["All packages are up to date.".to_string()]
    } else {
        update_lines
    };

    // Trigger auto cleanup after successful headless update
    trigger_auto_cleanup(app, state).await;
    log::info!("Headless package update completed successfully");
    Ok(result)
}