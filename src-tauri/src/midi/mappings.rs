//! MIDI mapping CRUD operations and persistence.
//!
//! Manages the lifecycle of MIDI-to-parameter mappings and persists them to disk.

use crate::common::persistence;

use super::engine::with_midi_engine;
use super::events::emit_mappings_changed;
use super::types::MidiMapping;

// ============================================================================
// Mapping CRUD
// ============================================================================

/// Get all current MIDI mappings.
pub fn get_mappings() -> Vec<MidiMapping> {
    with_midi_engine(|state| state.mappings.clone())
}

/// Set (create or update) a MIDI mapping.
/// If a mapping for the same parameter already exists, it will be replaced.
pub fn set_mapping(mapping: MidiMapping) {
    with_midi_engine(|state| {
        // Remove existing mapping for this parameter
        state
            .mappings
            .retain(|m| m.parameter_id != mapping.parameter_id);
        // Add the new mapping
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();
    emit_mappings_changed();
}

/// Remove a MIDI mapping by parameter ID.
pub fn remove_mapping(parameter_id: &str) -> Result<(), String> {
    let removed = with_midi_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.parameter_id != parameter_id);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        emit_mappings_changed();
        Ok(())
    } else {
        Err(format!("No mapping found for parameter: {}", parameter_id))
    }
}

/// Clear all MIDI mappings.
pub fn clear_mappings() {
    with_midi_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();
    emit_mappings_changed();
}

// ============================================================================
// Persistence
// ============================================================================

const MAPPINGS_FILENAME: &str = "midi_mappings.json";

/// Load MIDI mappings from disk.
pub fn load_mappings_from_disk() {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[MIDI] Could not determine mappings file path");
        return;
    };

    if let Some(mappings) = persistence::load_json::<Vec<MidiMapping>>(&path, "MIDI") {
        let count = mappings.len();
        with_midi_engine(|state| {
            state.mappings = mappings;
        });
        log::debug!("[MIDI] Loaded {} mappings from disk", count);
    }
}

/// Save MIDI mappings to disk.
pub fn save_mappings_to_disk() {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[MIDI] Could not determine mappings file path");
        return;
    };

    let mappings = with_midi_engine(|state| state.mappings.clone());

    if let Err(e) = persistence::save_json(&path, &mappings, "MIDI") {
        log::warn!("[MIDI] Failed to save mappings: {}", e);
    }
}
