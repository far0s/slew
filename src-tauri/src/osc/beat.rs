//! Beat config accessors and persistence.

use tauri::Manager;

use super::engine::with_osc_engine;
use super::types::OscBeatConfig;

// ============================================================================
// Beat config accessors
// ============================================================================

/// Get the current OSC beat/bpm address config.
pub fn get_osc_beat_config() -> OscBeatConfig {
    with_osc_engine(|state| state.beat_config.clone())
}

/// Set and persist the OSC beat/bpm address config.
pub fn set_osc_beat_config(config: OscBeatConfig) -> Result<(), String> {
    with_osc_engine(|state| {
        state.beat_config = config.clone();
    });
    save_beat_config_to_disk();
    log::info!(
        "[OSC] Beat config updated: beat={} bpm={}",
        config.beat_address,
        config.bpm_address
    );
    Ok(())
}

fn beat_config_path(app_handle: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("osc_beat_config.json"))
}

pub(super) fn load_beat_config_from_disk() {
    let app_handle = with_osc_engine(|state| state.app_handle.clone());
    if let Some(handle) = app_handle {
        if let Some(path) = beat_config_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<OscBeatConfig>(&contents) {
                        Ok(config) => {
                            with_osc_engine(|state| state.beat_config = config);
                            log::debug!("[OSC] Loaded beat config from disk");
                        }
                        Err(e) => log::warn!("[OSC] Failed to parse beat config: {}", e),
                    },
                    Err(e) => log::warn!("[OSC] Failed to read beat config: {}", e),
                }
            }
        }
    }
}

fn save_beat_config_to_disk() {
    let (app_handle, config) =
        with_osc_engine(|state| (state.app_handle.clone(), state.beat_config.clone()));
    if let Some(handle) = app_handle {
        if let Some(path) = beat_config_path(&handle) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match serde_json::to_string_pretty(&config) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[OSC] Failed to write beat config: {}", e);
                    }
                }
                Err(e) => log::error!("[OSC] Failed to serialize beat config: {}", e),
            }
        }
    }
}
