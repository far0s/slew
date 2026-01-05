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
        path.push("slew");
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

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde::{Deserialize, Serialize};
    use tempfile::TempDir;

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestConfig {
        name: String,
        value: i32,
        enabled: bool,
    }

    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct NestedConfig {
        items: Vec<String>,
        settings: TestConfig,
    }

    // =========================================================================
    // save_json / load_json round-trip tests
    // =========================================================================

    #[test]
    fn test_save_and_load_json_simple() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("test_config.json");

        let config = TestConfig {
            name: "test".to_string(),
            value: 42,
            enabled: true,
        };

        // Save
        let result = save_json(&path, &config, "TEST");
        assert!(result.is_ok());

        // Load
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap(), config);
    }

    #[test]
    fn test_save_and_load_json_nested() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("nested_config.json");

        let config = NestedConfig {
            items: vec!["one".to_string(), "two".to_string(), "three".to_string()],
            settings: TestConfig {
                name: "nested".to_string(),
                value: 100,
                enabled: false,
            },
        };

        // Save
        let result = save_json(&path, &config, "TEST");
        assert!(result.is_ok());

        // Load
        let loaded: Option<NestedConfig> = load_json(&path, "TEST");
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap(), config);
    }

    #[test]
    fn test_save_and_load_json_vector() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("vector_config.json");

        let configs = vec![
            TestConfig {
                name: "first".to_string(),
                value: 1,
                enabled: true,
            },
            TestConfig {
                name: "second".to_string(),
                value: 2,
                enabled: false,
            },
            TestConfig {
                name: "third".to_string(),
                value: 3,
                enabled: true,
            },
        ];

        // Save
        let result = save_json(&path, &configs, "TEST");
        assert!(result.is_ok());

        // Load
        let loaded: Option<Vec<TestConfig>> = load_json(&path, "TEST");
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap(), configs);
    }

    // =========================================================================
    // load_json error handling tests
    // =========================================================================

    #[test]
    fn test_load_json_missing_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("nonexistent.json");

        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert!(loaded.is_none());
    }

    #[test]
    fn test_load_json_invalid_json() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("invalid.json");

        // Write invalid JSON
        fs::write(&path, "{ not valid json }").unwrap();

        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert!(loaded.is_none());
    }

    #[test]
    fn test_load_json_wrong_type() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("wrong_type.json");

        // Write valid JSON but wrong structure
        fs::write(&path, r#"{"different": "structure"}"#).unwrap();

        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert!(loaded.is_none());
    }

    #[test]
    fn test_load_json_empty_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("empty.json");

        // Write empty file
        fs::write(&path, "").unwrap();

        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert!(loaded.is_none());
    }

    // =========================================================================
    // save_json directory creation tests
    // =========================================================================

    #[test]
    fn test_save_json_creates_directories() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir
            .path()
            .join("nested")
            .join("deep")
            .join("config.json");

        let config = TestConfig {
            name: "nested_dir_test".to_string(),
            value: 99,
            enabled: true,
        };

        // Parent directories don't exist yet
        assert!(!path.parent().unwrap().exists());

        // Save should create directories
        let result = save_json(&path, &config, "TEST");
        assert!(result.is_ok());

        // Verify file was created
        assert!(path.exists());

        // Verify content
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert_eq!(loaded.unwrap(), config);
    }

    // =========================================================================
    // save_json formatting tests
    // =========================================================================

    #[test]
    fn test_save_json_pretty_printed() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("pretty.json");

        let config = TestConfig {
            name: "pretty".to_string(),
            value: 1,
            enabled: true,
        };

        save_json(&path, &config, "TEST").unwrap();

        // Read raw content
        let content = fs::read_to_string(&path).unwrap();

        // Should be pretty-printed (contains newlines and indentation)
        assert!(content.contains('\n'));
        assert!(content.contains("  ")); // Indentation
    }

    // =========================================================================
    // local_data_path tests
    // =========================================================================

    #[test]
    fn test_local_data_path_returns_path() {
        let path = local_data_path("test_file.json");

        // Should return a path (may be None on some systems, but usually not)
        if let Some(p) = path {
            assert!(p.ends_with("slew/test_file.json"));
        }
    }

    #[test]
    fn test_local_data_path_different_filenames() {
        let path1 = local_data_path("file1.json");
        let path2 = local_data_path("file2.json");

        if let (Some(p1), Some(p2)) = (path1, path2) {
            assert_ne!(p1, p2);
            assert!(p1.ends_with("file1.json"));
            assert!(p2.ends_with("file2.json"));
        }
    }

    // =========================================================================
    // Edge case tests
    // =========================================================================

    #[test]
    fn test_save_and_load_empty_string() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("empty_string.json");

        let config = TestConfig {
            name: "".to_string(),
            value: 0,
            enabled: false,
        };

        save_json(&path, &config, "TEST").unwrap();
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert_eq!(loaded.unwrap(), config);
    }

    #[test]
    fn test_save_and_load_special_characters() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("special_chars.json");

        let config = TestConfig {
            name: "Test with \"quotes\" and \\backslashes\\ and 日本語".to_string(),
            value: -42,
            enabled: true,
        };

        save_json(&path, &config, "TEST").unwrap();
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert_eq!(loaded.unwrap(), config);
    }

    #[test]
    fn test_save_and_load_large_values() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("large.json");

        let config = TestConfig {
            name: "x".repeat(10000), // Large string
            value: i32::MAX,
            enabled: true,
        };

        save_json(&path, &config, "TEST").unwrap();
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert_eq!(loaded.unwrap(), config);
    }

    #[test]
    fn test_overwrite_existing_file() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().join("overwrite.json");

        let config1 = TestConfig {
            name: "original".to_string(),
            value: 1,
            enabled: true,
        };

        let config2 = TestConfig {
            name: "updated".to_string(),
            value: 2,
            enabled: false,
        };

        // Save first config
        save_json(&path, &config1, "TEST").unwrap();

        // Overwrite with second config
        save_json(&path, &config2, "TEST").unwrap();

        // Should load the second config
        let loaded: Option<TestConfig> = load_json(&path, "TEST");
        assert_eq!(loaded.unwrap(), config2);
    }
}
