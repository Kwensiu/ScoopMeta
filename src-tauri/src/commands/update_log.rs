use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use chrono::{DateTime, Utc};

/// Represents a single update log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateLogEntry {
    pub timestamp: DateTime<Utc>,
    pub operation_type: String, // "bucket" or "package"
    pub operation_result: String, // "success", "partial", "failed"
    pub success_count: u32,
    pub total_count: u32,
    pub details: Vec<String>, // Success/failure messages
}

/// Update log store
pub struct UpdateLogStore {
    logs: Vec<UpdateLogEntry>,
    max_entries: usize,
    file_path: PathBuf,
}

impl UpdateLogStore {
    /// Creates a new update log store with the specified path and max entries
    pub fn new(file_path: PathBuf, max_entries: usize) -> Self {
        let mut store = Self {
            logs: Vec::with_capacity(max_entries),
            max_entries,
            file_path,
        };
        
        // Try to load existing logs
        if let Err(e) = store.load() {
            log::warn!("Failed to load update logs: {}", e);
        }
        
        store
    }

    /// Loads logs from file
    fn load(&mut self) -> Result<(), String> {
        if !self.file_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.file_path)
            .map_err(|e| format!("Failed to read update log file: {}", e))?;

        if content.trim().is_empty() {
            return Ok(());
        }

        self.logs = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse update log file: {}", e))?;

        Ok(())
    }

    /// Saves logs to file
    fn save(&self) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = self.file_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create log directory: {}", e))?;
        }

        let content = serde_json::to_string_pretty(&self.logs)
            .map_err(|e| format!("Failed to serialize update logs: {}", e))?;

        fs::write(&self.file_path, content)
            .map_err(|e| format!("Failed to write update log file: {}", e))?;

        Ok(())
    }

    /// Adds a new log entry
    pub fn add_log_entry(&mut self, entry: UpdateLogEntry) -> Result<(), String> {
        // Insert at the beginning (most recent first)
        self.logs.insert(0, entry);

        // Trim if we exceed max entries
        if self.logs.len() > self.max_entries {
            self.logs.truncate(self.max_entries);
        }

        self.save()?;
        Ok(())
    }

    /// Clears all logs
    pub fn clear_all_logs(&mut self) -> Result<(), String> {
        self.logs.clear();
        self.save()
    }
    
    /// Removes a specific log entry by timestamp
    pub fn remove_log_entry(&mut self, timestamp: &str) -> Result<(), String> {
        self.logs.retain(|log| log.timestamp.to_rfc3339() != timestamp);
        self.save()
    }
    
    /// Gets recent logs, limited to the specified count
    pub fn get_recent_logs(&self, count: usize) -> Vec<UpdateLogEntry> {
        let limit = count.min(self.logs.len());
        self.logs[0..limit].to_vec()
    }

    /// Gets all logs
    pub fn get_all_logs(&self) -> Vec<UpdateLogEntry> {
        self.logs.clone()
    }

    /// Gets logs filtered by operation type
    pub fn get_logs_by_type(&self, operation_type: &str) -> Vec<UpdateLogEntry> {
        self.logs
            .iter()
            .filter(|log| log.operation_type == operation_type)
            .cloned()
            .collect()
    }
}

// Global instance for use across commands
static mut UPDATE_LOG_STORE: Option<UpdateLogStore> = None;

/// Initialize the update log store with the app's data directory
pub fn initialize_update_log_store(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let log_file_path = app_data_dir.join("update_logs.json");
    
    // Ensure parent directory exists
    if let Some(parent) = log_file_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create log directory: {}", e))?;
    }
    
    unsafe {
        UPDATE_LOG_STORE = Some(UpdateLogStore::new(log_file_path, 100)); // Keep last 100 entries
    }
    
    Ok(())
}

/// Gets a reference to the global update log store
/// Panics if not initialized
#[allow(static_mut_refs)]
pub fn get_log_store() -> &'static mut UpdateLogStore {
    unsafe {
        UPDATE_LOG_STORE
            .as_mut()
            .expect("Update log store not initialized")
    }
}

/// Checks if update history logging is enabled
pub async fn is_update_history_enabled(app: &AppHandle) -> bool {
    use crate::commands::settings;
    
    match settings::get_config_value(app.clone(), "buckets.updateHistoryEnabled".to_string()) {
        Ok(Some(value)) => {
            if let Some(enabled) = value.as_bool() {
                enabled
            } else {
                true // Default to enabled if value is not a boolean
            }
        }
        _ => true // Default to enabled if setting doesn't exist or error occurs
    }
}

/// Conditionally adds a log entry if update history is enabled
pub async fn add_log_entry_if_enabled(app: &AppHandle, entry: UpdateLogEntry) -> Result<(), String> {
    if is_update_history_enabled(app).await {
        get_log_store().add_log_entry(entry)?;
    }
    Ok(())
}

/// Command to get recent update logs
#[tauri::command]
pub fn get_update_logs(limit: Option<usize>) -> Result<Vec<UpdateLogEntry>, String> {
    let limit = limit.unwrap_or(50); // Default to 50 recent entries
    Ok(get_log_store().get_recent_logs(limit))
}

/// Command to get all update logs
#[tauri::command]
pub fn get_all_update_logs() -> Result<Vec<UpdateLogEntry>, String> {
    Ok(get_log_store().get_all_logs())
}

/// Command to clear all update logs
#[tauri::command]
pub fn clear_all_update_logs() -> Result<(), String> {
    get_log_store().clear_all_logs()
}

/// Command to remove a specific log entry by timestamp
#[tauri::command]
pub fn remove_update_log_entry(timestamp: String) -> Result<(), String> {
    get_log_store().remove_log_entry(&timestamp)
}

/// Command to add a new log entry (for testing purposes)
#[tauri::command]
pub fn add_update_log_entry(
    operation_type: String,
    operation_result: String,
    success_count: u32,
    total_count: u32,
    details: Vec<String>,
) -> Result<(), String> {
    let entry = UpdateLogEntry {
        timestamp: Utc::now(),
        operation_type,
        operation_result,
        success_count,
        total_count,
        details,
    };
    
    get_log_store().add_log_entry(entry)
}

/// Command to get logs filtered by operation type
#[tauri::command]
pub fn get_logs_by_type(operation_type: String) -> Result<Vec<UpdateLogEntry>, String> {
    Ok(get_log_store().get_logs_by_type(&operation_type))
}