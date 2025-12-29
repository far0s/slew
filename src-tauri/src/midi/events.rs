//! MIDI event emission helpers.
//!
//! Provides functions for emitting MIDI-related events to the frontend.

use tauri::Emitter;

use super::devices::{list_devices, list_output_devices};
use super::engine::with_midi_engine;

// ============================================================================
// Event Emission
// ============================================================================

/// Emit a devices changed event to the frontend.
pub fn emit_devices_changed() {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Ok(devices) = list_devices() {
            if let Err(e) = handle.emit("midi_devices_changed", &devices) {
                log::warn!("[MIDI] Failed to emit devices changed: {}", e);
            }
        }
    }
}

/// Emit an output devices changed event to the frontend.
pub fn emit_output_devices_changed() {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Ok(devices) = list_output_devices() {
            if let Err(e) = handle.emit("midi_output_devices_changed", &devices) {
                log::warn!("[MIDI] Failed to emit output devices changed: {}", e);
            }
        }
    }
}

/// Emit a learn state changed event to the frontend.
pub fn emit_learn_state_changed() {
    let (app_handle, learn_state) =
        with_midi_engine(|state| (state.app_handle.clone(), state.learn_state.clone()));

    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit("midi_learn_state_changed", &learn_state) {
            log::warn!("[MIDI] Failed to emit learn state changed: {}", e);
        }
    }
}

/// Emit a mappings changed event to the frontend.
pub fn emit_mappings_changed() {
    let (app_handle, mappings) =
        with_midi_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit("midi_mappings_changed", &mappings) {
            log::warn!("[MIDI] Failed to emit mappings changed: {}", e);
        }
    }
}

/// Emit a MIDI Learn complete event with the captured mapping.
pub fn emit_learn_complete(mapping: &super::types::MidiMapping) {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        let event = super::types::MidiLearnComplete {
            mapping: mapping.clone(),
        };
        if let Err(e) = handle.emit("midi_learn_complete", &event) {
            log::warn!("[MIDI] Failed to emit learn complete: {}", e);
        }
    }
}

/// Emit a MIDI message event for activity display.
pub fn emit_midi_message(message: &super::types::MidiMessage) {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Err(e) = handle.emit("midi_message", message) {
            log::trace!("[MIDI] Failed to emit midi message: {}", e);
        }
    }
}
