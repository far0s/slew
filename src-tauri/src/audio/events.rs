//! Event emission helpers for the audio engine.

use tauri::Emitter;

use super::engine::with_audio_engine;

pub fn emit_status_changed() {
    let (app_handle, status) =
        with_audio_engine(|state| (state.app_handle.clone(), state.status.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("audio_status_changed", status);
    }
}

pub fn emit_mappings_changed() {
    let (app_handle, mappings) =
        with_audio_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("audio_mappings_changed", mappings);
    }
}
