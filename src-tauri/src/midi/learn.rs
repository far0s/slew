//! MIDI Learn functionality.
//!
//! Allows users to map MIDI controls to parameters by moving a physical control.

use super::engine::with_midi_engine;
use super::events::emit_learn_state_changed;
use super::types::MidiLearnState;

// ============================================================================
// MIDI Learn
// ============================================================================

/// Start MIDI Learn mode for a parameter with specified value range.
pub fn start_learn(parameter_id: String, min_value: f64, max_value: f64) -> Result<(), String> {
    with_midi_engine(|state| {
        if state.learn_state.is_learning {
            return Err("Already in learn mode".to_string());
        }
        state.learn_state.is_learning = true;
        state.learn_state.parameter_id = Some(parameter_id.clone());
        state.learn_state.pending_min_value = min_value;
        state.learn_state.pending_max_value = max_value;
        Ok(())
    })?;

    log::debug!(
        "[MIDI] Started learn mode for parameter: {} (range: {} - {})",
        parameter_id,
        min_value,
        max_value
    );

    // Emit learn state change
    emit_learn_state_changed();

    Ok(())
}

/// Cancel MIDI Learn mode.
pub fn cancel_learn() -> Result<(), String> {
    with_midi_engine(|state| {
        state.learn_state.is_learning = false;
        state.learn_state.parameter_id = None;
        state.learn_state.pending_min_value = 0.0;
        state.learn_state.pending_max_value = 1.0;
    });

    log::debug!("[MIDI] Cancelled learn mode");

    emit_learn_state_changed();

    Ok(())
}

/// Get current MIDI Learn state.
pub fn get_learn_state() -> MidiLearnState {
    with_midi_engine(|state| state.learn_state.clone())
}
