//! OSC mapping management and persistence.

use tauri::Manager;

use super::engine::with_osc_engine;
use super::types::OscMapping;

// ============================================================================
// Mapping Management
// ============================================================================

/// Get all OSC mappings.
pub fn get_mappings() -> Vec<OscMapping> {
    with_osc_engine(|state| state.mappings.clone())
}

/// Add or update an OSC mapping.
pub fn add_mapping(mapping: OscMapping) -> Result<(), String> {
    with_osc_engine(|state| {
        // Remove any existing mapping for this address
        state.mappings.retain(|m| m.address != mapping.address);
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();

    log::info!("[OSC] Mapping added/updated");

    Ok(())
}

/// Remove an OSC mapping by address.
pub fn remove_mapping(address: String) -> Result<(), String> {
    let removed = with_osc_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.address != address);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        log::info!("[OSC] Removed mapping for address: {}", address);
        Ok(())
    } else {
        Err(format!("No mapping found for address: {}", address))
    }
}

/// Clear all OSC mappings.
pub fn clear_mappings() {
    with_osc_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();

    log::info!("[OSC] Cleared all mappings");
}

/// Replace all mappings atomically. Used by project restore.
pub fn restore_bulk(mappings: Vec<OscMapping>) {
    with_osc_engine(|state| {
        state.mappings.clear();
        state.mappings.extend(mappings);
    });
    save_mappings_to_disk();
}

// ============================================================================
// Persistence
// ============================================================================

/// Path to the OSC mappings file.
fn mappings_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("osc_mappings.json"))
}

/// Load OSC mappings from disk.
pub(super) fn load_mappings_from_disk() {
    let app_handle = with_osc_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<Vec<OscMapping>>(&contents) {
                        Ok(mappings) => {
                            with_osc_engine(|state| {
                                state.mappings = mappings;
                            });
                            log::debug!(
                                "[OSC] Loaded {} mappings from disk",
                                with_osc_engine(|s| s.mappings.len())
                            );
                        }
                        Err(e) => {
                            log::warn!("[OSC] Failed to parse mappings file: {}", e);
                        }
                    },
                    Err(e) => {
                        log::warn!("[OSC] Failed to read mappings file: {}", e);
                    }
                }
            }
        }
    }
}

/// Save OSC mappings to disk.
pub(crate) fn save_mappings_to_disk() {
    let (app_handle, mappings) =
        with_osc_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            // Ensure directory exists
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            match serde_json::to_string_pretty(&mappings) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[OSC] Failed to write mappings file: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[OSC] Failed to serialize mappings: {}", e);
                }
            }
        }
    }
}
