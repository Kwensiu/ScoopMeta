use serde::Serialize;
use std::process::Stdio;
use tauri::{Emitter, Listener, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

pub const EVENT_OUTPUT: &str = "operation-output";
pub const EVENT_FINISHED: &str = "operation-finished";
pub const EVENT_CANCEL: &str = "cancel-operation";

/// Represents a line of output from a command, specifying its source (stdout or stderr).
#[derive(Serialize, Clone)]
pub struct StreamOutput {
    pub line: String,
    pub source: String,
}

/// Represents the final result of a command, indicating success or failure and a corresponding message.
#[derive(Serialize, Clone)]
pub struct CommandResult {
    pub success: bool,
    pub message: String,
}

/// Creates a `tokio::process::Command` for running a PowerShell command without a visible window.
pub fn create_powershell_command(command_str: &str) -> Command {
    let mut cmd = Command::new("powershell");
    cmd.args(["-NoProfile", "-Command", command_str])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Prevents a console window from appearing on Windows.
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    cmd
}

/// Spawns a task to read lines from a stream (stdout or stderr) and sends them to the frontend.
///
/// It also sends any lines that indicate an error to the `error_tx` channel.
use tokio::io::AsyncRead;

fn spawn_output_stream_handler(
    stream: impl AsyncRead + Unpin + Send + 'static,
    source: &'static str,
    window: Window,
    output_event: String,
    error_tx: mpsc::Sender<String>,
) {
    let mut reader = BufReader::new(stream).lines();

    tokio::spawn(async move {
        while let Ok(Some(line)) = reader.next_line().await {
            // Enhanced error detection for scoop commands
            let is_error_line = source == "stderr" || 
                               line.to_lowercase().contains("error") ||
                               line.to_lowercase().contains("failed") ||
                               line.to_lowercase().contains("exception") ||
                               line.to_lowercase().contains("cannot") ||
                               line.to_lowercase().contains("could not") ||
                               line.to_lowercase().contains("not found") ||
                               line.to_lowercase().contains("access to the path") ||
                               line.to_lowercase().contains("denied") ||
                               line.contains("Remove-Item") ||
                               line.contains("Access to the path") ||
                               line.contains("is denied");
            
            // Send error lines to the error channel for final result display
            if is_error_line {
                if let Err(e) = error_tx.send(line.clone()).await {
                    log::error!("Failed to send error line to error channel: {}", e);
                }
            }

            // Always send all lines to the frontend for display
            if let Err(e) = window.emit(
                &output_event,
                StreamOutput {
                    line: line.clone(),
                    source: source.to_string(),
                },
            ) {
                log::error!("Failed to emit output event for line '{}': {}", line, e);
            }
        }
    });
}

/// Sets up a listener for a cancellation event from the frontend.
///
/// When the event is received, it sends a signal through the `cancel_tx` channel.
fn setup_cancellation_handler(window: &Window, cancel_event: &str, cancel_tx: oneshot::Sender<()>) {
    let op_name = cancel_event.to_string();
    let mut cancel_tx_opt = Some(cancel_tx);

    // Clone the name for the closure to avoid borrowing issues.
    let op_name_clone = op_name.clone();
    window.once(&op_name, move |_| {
        log::warn!("Received cancellation request for {}", op_name_clone);
        if let Some(tx) = cancel_tx_opt.take() {
            let _ = tx.send(());
        }
    });
}

/// Executes a long-running command and streams its output to the frontend.
///
/// - Emits `output_event` with `StreamOutput` for each line of output.
/// - Emits `finished_event` with `CommandResult` when the command completes.
/// - Listens for `cancel_event` to terminate the process.
pub async fn run_and_stream_command(
    window: Window,
    command_str: String,
    operation_name: String,
    output_event: &str,
    finished_event: &str,
    cancel_event: &str,
) -> Result<(), String> {
    log::info!("Executing streaming command: {}", &command_str);

    let mut child = create_powershell_command(&command_str)
        .spawn()
        .map_err(|e| format!("Failed to spawn command '{}': {}", command_str, e))?;

    let stdout = child
        .stdout
        .take()
        .expect("Child process did not have a handle to stdout");
    let stderr = child
        .stderr
        .take()
        .expect("Child process did not have a handle to stderr");

    let (error_tx, mut error_rx) = mpsc::channel::<String>(100);
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

    setup_cancellation_handler(&window, cancel_event, cancel_tx);

    spawn_output_stream_handler(
        stdout,
        "stdout",
        window.clone(),
        output_event.to_string(),
        error_tx.clone(),
    );
    spawn_output_stream_handler(
        stderr,
        "stderr",
        window.clone(),
        output_event.to_string(),
        error_tx,
    );

    tokio::select! {
        status_res = child.wait() => {
            handle_command_completion(status_res, &operation_name, &window, finished_event, &mut error_rx).await
        },
        _ = cancel_rx => {
            handle_cancellation(child, &operation_name, &window, finished_event).await
        }
    }
}

/// Handles the completion of the command, checking for errors and emitting the final result.
async fn handle_command_completion(
    status_res: Result<std::process::ExitStatus, std::io::Error>,
    operation_name: &str,
    window: &Window,
    finished_event: &str,
    error_rx: &mut mpsc::Receiver<String>,
) -> Result<(), String> {
    let status = status_res.map_err(|e| {
        format!(
            "Failed to wait on child process for {}: {}",
            operation_name, e
        )
    })?;
    log::info!("{} finished with status: {}", operation_name, status);

    // Collect all error messages
    let mut error_messages = Vec::new();
    while let Ok(error_line) = error_rx.try_recv() {
        error_messages.push(error_line);
    }
    
    let has_errors = !error_messages.is_empty();
    let was_successful = status.success() && !has_errors;

    let message = if was_successful {
        format!("{} completed successfully", operation_name)
    } else {
        if !error_messages.is_empty() {
            // Show the last few error messages for context
            let error_preview = if error_messages.len() <= 3 {
                error_messages.join("\n")
            } else {
                format!("{}\n... and {} more errors", 
                    error_messages[..3].join("\n"), 
                    error_messages.len() - 3)
            };
            
            format!(
                "{} failed with {} error(s):\n{}\nPlease check the output log for details.",
                operation_name,
                error_messages.len(),
                error_preview
            )
        } else if !status.success() {
            format!(
                "{} failed with exit code {:?}. Please check the output log for details.",
                operation_name,
                status.code()
            )
        } else {
            format!("{} completed with issues", operation_name)
        }
    };

    if let Err(e) = window.emit(
        finished_event,
        CommandResult {
            success: was_successful,
            message: message.clone(),
        },
    ) {
        log::error!("Failed to emit finished event: {}", e);
    }

    if was_successful {
        Ok(())
    } else {
        Err(message)
    }
}

/// Handles the cancellation of the command, killing the process and emitting a cancellation message.
async fn handle_cancellation(
    mut child: Child,
    operation_name: &str,
    window: &Window,
    finished_event: &str,
) -> Result<(), String> {
    log::warn!("Cancelling operation: {}", operation_name);
    
    // Try to kill the process
    if let Err(e) = child.kill().await {
        log::error!("Failed to kill child process: {}", e);
    }
    
    let message = format!("{} was cancelled by user", operation_name);
    if let Err(e) = window.emit(
        finished_event,
        CommandResult {
            success: false,
            message: message.clone(),
        },
    ) {
        log::error!("Failed to emit cancellation event: {}", e);
    }
    
    Err(message)
}