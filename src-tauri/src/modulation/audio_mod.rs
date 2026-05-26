//! Audio modulation management

use super::engine::with_modulation_engine;
use super::persistence::{emit_audio_modulations_changed, generate_id, save_state_to_disk};
use super::types::AudioModulation;

// ============================================================================
// Audio Modulation Management
// ============================================================================

/// Get all audio modulations
pub fn get_audio_modulations() -> Vec<AudioModulation> {
    with_modulation_engine(|state| state.audio_modulations.clone())
}

/// Add or update an audio modulation
pub fn add_audio_modulation(mut audio_mod: AudioModulation) -> AudioModulation {
    if audio_mod.id.is_empty() {
        audio_mod.id = generate_id("audiomod");
    }

    let result = audio_mod.clone();
    let (app_handle, mods) = with_modulation_engine(|state| {
        // Update existing or add new
        if let Some(existing) = state
            .audio_modulations
            .iter_mut()
            .find(|m| m.id == audio_mod.id)
        {
            *existing = audio_mod;
        } else {
            state.audio_modulations.push(audio_mod);
        }
        let mods = state.audio_modulations.clone();
        (state.app_handle.clone(), mods)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_audio_modulations_changed(&handle, mods);
    }

    result
}

/// Remove an audio modulation by ID
pub fn remove_audio_modulation(id: &str) -> bool {
    let (removed, app_handle, mods) = with_modulation_engine(|state| {
        if let Some(pos) = state.audio_modulations.iter().position(|m| m.id == id) {
            state.audio_modulations.remove(pos);
            let mods = state.audio_modulations.clone();
            (true, state.app_handle.clone(), mods)
        } else {
            (false, None, Vec::new())
        }
    });

    if removed {
        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_audio_modulations_changed(&handle, mods);
        }
    }

    removed
}

/// Clear all audio modulations
pub fn clear_audio_modulations() {
    let (app_handle, mods) = with_modulation_engine(|state| {
        state.audio_modulations.clear();
        let mods = state.audio_modulations.clone();
        (state.app_handle.clone(), mods)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_audio_modulations_changed(&handle, mods);
    }
}
