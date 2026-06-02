//! Persistence, events, and helper utilities for the modulation engine

use std::fs;
use std::path::PathBuf;

use rand::Rng;
use tauri::{AppHandle, Emitter, Manager};

use super::engine::{get_modulation_state, with_modulation_engine};
use super::types::{AudioModulation, LfoSource, ModulationState, ModulationTarget};

// ============================================================================
// Persistence
// ============================================================================

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("modulation_state.json");
        dir
    })
}

pub(super) fn load_state_from_disk(app: &AppHandle) {
    let path = match state_path(app) {
        Some(p) => p,
        None => return,
    };

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(state) = serde_json::from_slice::<ModulationState>(&bytes) {
            with_modulation_engine(|engine| {
                engine.lfos.clear();
                for lfo in state.lfos {
                    engine.lfos.insert(lfo.id.clone(), lfo);
                }
                engine.targets = state.targets;
                engine.audio_modulations = state.audio_modulations;
            });
            log::debug!("[Modulation] Loaded state from disk");
        }
    }
}

pub fn save_state_to_disk(app: &AppHandle) {
    let state = get_modulation_state();

    if let Some(path) = state_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&state) {
            let _ = fs::write(path, json);
        }
    }
}

// ============================================================================
// Events
// ============================================================================

pub(super) fn emit_lfos_changed(handle: &AppHandle, lfos: Vec<LfoSource>) {
    let _ = handle.emit("modulation_lfos_changed", &lfos);
}

pub(super) fn emit_targets_changed(handle: &AppHandle, targets: Vec<ModulationTarget>) {
    let _ = handle.emit("modulation_targets_changed", &targets);
}

pub(super) fn emit_audio_modulations_changed(handle: &AppHandle, mods: Vec<AudioModulation>) {
    let _ = handle.emit("modulation_audio_changed", &mods);
}

// ============================================================================
// Helpers
// ============================================================================

pub(super) fn generate_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        rand::thread_rng().gen::<u32>() % 10000
    )
}
