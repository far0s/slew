//! MIDI message parsing and handling.
//!
//! Handles incoming MIDI messages, routing them to the appropriate handlers
//! for learn mode, button presses, and parameter mapping.

use std::sync::{Arc, Mutex};
use tauri::Emitter;

use super::constants::*;
use super::events::emit_learn_state_changed;
use super::mappings::save_mappings_to_disk;
use super::midimix::{
    check_and_update_pickup, check_master_fader_pickup, handle_master_fader,
    handle_master_solo_button_press, handle_mute_button_press, handle_solo_button_press_for_slot,
};
use super::output::send_parameter_feedback;
use super::types::{MidiEngineState, MidiLearnComplete, MidiMapping, MidiMessage};

// ============================================================================
// Message Handling
// ============================================================================

/// Handle an incoming MIDI message.
pub(crate) fn handle_midi_message(
    engine: &Arc<Mutex<MidiEngineState>>,
    device_id: &str,
    timestamp: u64,
    message: &[u8],
) {
    if message.is_empty() {
        return;
    }

    let status = message[0];
    let channel = status & 0x0F;
    let message_type = status & 0xF0;

    let (type_str, control, value): (&str, u8, u16) = match message_type {
        0xB0 => {
            // Control Change
            let cc = message.get(1).copied().unwrap_or(0);
            let val = message.get(2).copied().unwrap_or(0);
            ("cc", cc, val as u16)
        }
        0x90 => {
            // Note On
            let note = message.get(1).copied().unwrap_or(0);
            let velocity = message.get(2).copied().unwrap_or(0);
            ("note_on", note, velocity as u16)
        }
        0x80 => {
            // Note Off
            let note = message.get(1).copied().unwrap_or(0);
            let velocity = message.get(2).copied().unwrap_or(0);
            ("note_off", note, velocity as u16)
        }
        0xE0 => {
            // Pitch Bend
            let lsb = message.get(1).copied().unwrap_or(0) as u16;
            let msb = message.get(2).copied().unwrap_or(0) as u16;
            let bend = (msb << 7) | lsb;
            ("pitch_bend", 0, bend)
        }
        _ => ("other", 0, 0),
    };

    let midi_msg = MidiMessage {
        device_id: device_id.to_string(),
        channel,
        message_type: type_str.to_string(),
        control,
        value,
        timestamp,
    };

    // Get app handle and check learn state
    let (app_handle, learn_state, mappings) = {
        let state = engine.lock().unwrap();
        (
            state.app_handle.clone(),
            state.learn_state.clone(),
            state.mappings.clone(),
        )
    };

    // Emit the raw MIDI message for activity indicators
    if let Some(ref handle) = app_handle {
        let _ = handle.emit("midi_message", &midi_msg);
    }

    // Handle Midimix button presses (Note On with velocity > 0)
    if type_str == "note_on" && value > 0 && channel == 0 {
        log::debug!(
            "[MIDI] Note On received: note={}, velocity={}, checking for button handlers",
            control,
            value
        );

        // Check if this is a mute button (top row - columns 1-8)
        if let Some(slot_index) = MIDIMIX_MUTE_NOTES.iter().position(|&n| n == control) {
            log::debug!("[MIDI] Mute button press detected for slot {}", slot_index);
            handle_mute_button_press(engine, slot_index, app_handle.as_ref());
            return;
        }

        // Check if this is a per-column solo button (middle row - columns 1-8)
        if let Some(slot_index) = MIDIMIX_SOLO_NOTES.iter().position(|&n| n == control) {
            log::debug!("[MIDI] Solo button press detected for slot {}", slot_index);
            handle_solo_button_press_for_slot(engine, slot_index, app_handle.as_ref());
            return;
        }

        // Check master solo button (modifier tracking)
        if control == MIDIMIX_MASTER_SOLO_NOTE {
            log::debug!("[MIDI] Master Solo button press detected");
            handle_master_solo_button_press(engine, true);
            return;
        }
    }

    // Handle button release (Note Off or Note On with velocity 0)
    if (type_str == "note_off" || (type_str == "note_on" && value == 0)) && channel == 0 {
        if control == MIDIMIX_MASTER_SOLO_NOTE {
            handle_master_solo_button_press(engine, false);
            return;
        }
    }

    // Handle MIDI Learn if active and this is a CC message
    if learn_state.is_learning && type_str == "cc" {
        if let Some(param_id) = learn_state.parameter_id {
            let mapping = MidiMapping {
                parameter_id: param_id,
                channel: Some(channel),
                cc_number: control,
                min_value: learn_state.pending_min_value,
                max_value: learn_state.pending_max_value,
                device_id: Some(device_id.to_string()),
            };

            {
                let mut state = engine.lock().unwrap();
                state
                    .mappings
                    .retain(|m| m.parameter_id != mapping.parameter_id);
                state.mappings.push(mapping.clone());
                state.learn_state.is_learning = false;
                state.learn_state.parameter_id = None;
            }

            save_mappings_to_disk();
            emit_learn_state_changed();

            if let Some(ref handle) = app_handle {
                let _ = handle.emit("midi_learn_complete", MidiLearnComplete { mapping });
            }

            log::debug!(
                "[MIDI] Learn complete: CC {} @ channel {} -> parameter",
                control,
                channel
            );
            return;
        }
    }

    // Handle Midimix master fader (CC 62) for global fade control
    if type_str == "cc" && control == MIDIMIX_MASTER_FADER_CC && channel == 0 {
        // Check pickup for master fader
        if check_master_fader_pickup(engine, value as u8) {
            handle_master_fader(engine, value as u8, app_handle.as_ref());
        }
        // Don't return - still process regular mappings if any exist for CC 62
    }

    // Apply mappings for CC messages
    if type_str == "cc" {
        for mapping in &mappings {
            // Check if this CC matches the mapping
            let channel_match = mapping.channel.map_or(true, |ch| ch == channel);
            let cc_match = mapping.cc_number == control;
            let device_match = mapping.device_id.as_ref().map_or(true, |d| d == device_id);

            if channel_match && cc_match && device_match {
                // Check soft takeover (pickup) before applying
                if !check_and_update_pickup(engine, channel, control, value as u8, mapping) {
                    // CC hasn't picked up yet, skip applying
                    continue;
                }

                // Normalize CC value (0-127) to mapping range
                let normalized = (value as f64) / 127.0;
                let mapped_value =
                    mapping.min_value + normalized * (mapping.max_value - mapping.min_value);

                // Apply to parameter via the parameter server
                // Note: We pass skip_feedback=true to avoid feedback loops
                apply_midi_to_parameter(
                    &mapping.parameter_id,
                    mapped_value,
                    app_handle.as_ref(),
                    true,
                );
            }
        }
    }
}

/// Apply a MIDI-derived value to a parameter.
fn apply_midi_to_parameter(
    parameter_id: &str,
    value: f64,
    app_handle: Option<&tauri::AppHandle>,
    skip_feedback: bool,
) {
    crate::with_parameter_store(|store| {
        store.set_target(parameter_id.to_string(), value);
    });

    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    if !skip_feedback {
        send_parameter_feedback(parameter_id, value);
    }
}
