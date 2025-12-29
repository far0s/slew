//! JSON file persistence helpers.
//!
//! Provides common utilities for loading and saving JSON configuration files
//! to the application's config directory.

use serde::{de::DeserializeOwned, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Get the path to a configuration file in the app's config directory.
///
/// Returns `None` if the app config directory cannot be determined.
pub fn config_path(app: &AppHandle, filename: &str) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push(filename);
        dir
    })
}

/// Get the path to a configuration file using the system's local data directory.
///
/// This uses `dirs::data_local_dir()` which doesn't require an AppHandle.
/// Returns `None` if the data directory cannot be determined.
pub fn local_data_path(filename: &str) -> Option<PathBuf> {
    dirs::data_local_dir().map(|mut path| {
        path.push("sebcat-vj");
        path.push(filename);
        path
    })
}

/// Load JSON data from a configuration file.
///
/// Returns `None` if the file doesn't exist or cannot be parsed.
/// Logs warnings on parse errors.
pub fn load_json<T: DeserializeOwned>(path: &PathBuf, module_name: &str) -> Option<T> {
    if !path.exists() {
        log::debug!("[{}] No config file found at {:?}", module_name, path);
        return None;
    }

    match fs::read_to_string(path) {
        Ok(contents) => match serde_json::from_str::<T>(&contents) {
            Ok(data) => {
                log::debug!("[{}] Loaded config from {:?}", module_name, path);
                Some(data)
            }
            Err(e) => {
                log::warn!("[{}] Failed to parse config file: {}", module_name, e);
                None
            }
        },
        Err(e) => {
            log::warn!("[{}] Failed to read config file: {}", module_name, e);
            None
        }
    }
}

/// Save JSON data to a configuration file.
///
/// Creates parent directories if they don't exist.
/// Returns `Ok(())` on success, `Err(message)` on failure.
pub fn save_json<T: Serialize>(path: &PathBuf, data: &T, module_name: &str) -> Result<(), String> {
    // Ensure directory exists
    if let Some(parent) = path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            let msg = format!("Failed to create config directory: {}", e);
            log::warn!("[{}] {}", module_name, msg);
            return Err(msg);
        }
    }

    match serde_json::to_string_pretty(data) {
        Ok(json) => match fs::write(path, json) {
            Ok(()) => {
                log::debug!("[{}] Saved config to {:?}", module_name, path);
                Ok(())
            }
            Err(e) => {
                let msg = format!("Failed to write config file: {}", e);
                log::warn!("[{}] {}", module_name, msg);
                Err(msg)
            }
        },
        Err(e) => {
            let msg = format!("Failed to serialize config: {}", e);
            log::warn!("[{}] {}", module_name, msg);
            Err(msg)
        }
    }
}

// Tests require tempfile dev dependency - to be added in Phase 4 (Testing Infrastructure)
// See docs/working/CLEANUP.md for the testing plan
