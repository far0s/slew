//! LFO source management

use super::engine::with_modulation_engine;
use super::persistence::{emit_audio_modulations_changed, emit_lfos_changed, emit_targets_changed, generate_id, save_state_to_disk};
use super::types::LfoSource;

// ============================================================================
// LFO Management
// ============================================================================

/// Get all LFO sources
pub fn get_lfos() -> Vec<LfoSource> {
    with_modulation_engine(|state| state.lfos.values().cloned().collect())
}

/// Get an LFO by ID
pub fn get_lfo(id: &str) -> Option<LfoSource> {
    with_modulation_engine(|state| state.lfos.get(id).cloned())
}

/// Add or update an LFO
pub fn add_lfo(mut lfo: LfoSource) -> LfoSource {
    if lfo.id.is_empty() {
        lfo.id = generate_id("lfo");
    }

    let result = lfo.clone();
    let (app_handle, lfos) = with_modulation_engine(|state| {
        state.lfos.insert(lfo.id.clone(), lfo);
        let lfos = state.lfos.values().cloned().collect();
        (state.app_handle.clone(), lfos)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle, lfos);
    }

    result
}

/// Update an existing LFO
pub fn update_lfo(lfo: LfoSource) -> Option<LfoSource> {
    let (result, app_handle, lfos) = with_modulation_engine(|state| {
        if state.lfos.contains_key(&lfo.id) {
            state.lfos.insert(lfo.id.clone(), lfo.clone());
            let lfos = state.lfos.values().cloned().collect();
            (Some(lfo), state.app_handle.clone(), lfos)
        } else {
            (None, None, Vec::new())
        }
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle, lfos);
    }

    result
}

/// Remove an LFO by ID
pub fn remove_lfo(id: &str) -> bool {
    let (removed, app_handle, lfos, targets, audio_mods) = with_modulation_engine(|state| {
        let existed = state.lfos.remove(id).is_some();
        // Also remove any targets and audio modulations that reference this LFO
        state.targets.retain(|t| t.source_id != id);
        state.audio_modulations.retain(|m| m.lfo_id != id);
        let lfos = state.lfos.values().cloned().collect();
        let targets = state.targets.clone();
        let audio_mods = state.audio_modulations.clone();
        (existed, state.app_handle.clone(), lfos, targets, audio_mods)
    });

    if removed {
        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_lfos_changed(&handle, lfos);
            emit_targets_changed(&handle, targets);
            emit_audio_modulations_changed(&handle, audio_mods);
        }
    }

    removed
}

/// Clear all LFOs
pub fn clear_lfos() {
    let (app_handle, lfos, targets, audio_mods) = with_modulation_engine(|state| {
        state.lfos.retain(|_, lfo| lfo.pinned);
        let remaining_ids: std::collections::HashSet<String> =
            state.lfos.keys().cloned().collect();
        state.targets.retain(|t| remaining_ids.contains(&t.source_id));
        state.audio_modulations.clear();
        state.base_values.clear();
        let lfos = state.lfos.values().cloned().collect();
        let targets = state.targets.clone();
        let audio_mods = state.audio_modulations.clone();
        (state.app_handle.clone(), lfos, targets, audio_mods)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle, lfos);
        emit_targets_changed(&handle, targets);
        emit_audio_modulations_changed(&handle, audio_mods);
    }
}
