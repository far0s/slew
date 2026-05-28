//! Community device layouts loaded from ~/.slew/device-layouts/*.json

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityControl {
    pub kind: String,
    pub col: u32,
    pub row: u32,
    pub col_span: Option<u32>,
    pub row_span: Option<u32>,
    pub cc: Option<u32>,
    pub note: Option<u32>,
    pub channel: Option<i32>,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityLayout {
    pub name: String,
    pub match_pattern: String,
    pub grid_cols: u32,
    pub grid_rows: u32,
    pub controls: Vec<CommunityControl>,
}

// ============================================================================
// Loader
// ============================================================================

/// Reads all `*.json` files from `~/.slew/device-layouts/` and returns the
/// successfully parsed ones. Failures are logged as warnings.
pub fn load_community_layouts() -> Vec<CommunityLayout> {
    let dir = match community_layouts_dir() {
        Some(d) => d,
        None => {
            log::warn!("[DeviceLayouts] Could not determine home directory");
            return Vec::new();
        }
    };

    if !dir.exists() {
        return Vec::new();
    }

    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(err) => {
            log::warn!("[DeviceLayouts] Failed to read {:?}: {}", dir, err);
            return Vec::new();
        }
    };

    let mut layouts = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(err) => {
                log::warn!("[DeviceLayouts] Failed to read {:?}: {}", path, err);
                continue;
            }
        };

        match serde_json::from_str::<CommunityLayout>(&content) {
            Ok(layout) => {
                log::info!(
                    "[DeviceLayouts] Loaded community layout: {} ({:?})",
                    layout.name,
                    path
                );
                layouts.push(layout);
            }
            Err(err) => {
                log::warn!("[DeviceLayouts] Failed to parse {:?}: {}", path, err);
            }
        }
    }

    layouts
}

fn community_layouts_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".slew").join("device-layouts"))
}

// ============================================================================
// Tauri command
// ============================================================================

#[tauri::command]
pub fn load_community_layouts_cmd() -> Vec<CommunityLayout> {
    load_community_layouts()
}
