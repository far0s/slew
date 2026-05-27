//! MIDI message parsing and handling.
//!
//! Handles incoming MIDI messages, routing them to the appropriate handlers
//! for learn mode, button presses, and parameter mapping.

// Utility functions (normalize_cc_value, map_to_range, calculate_pitch_bend)
// are referenced by future features (MIDI Learn display, pickup HUD).
#![allow(dead_code)]

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
use super::types::{MidiEngineState, MidiLearnComplete, MidiMapping, MidiMessage, NoteMappingMode};

// ============================================================================
// MIDI Parsing (Pure Functions)
// ============================================================================

/// Parsed MIDI message data extracted from raw bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedMidiMessage {
    /// MIDI channel (0-15)
    pub channel: u8,
    /// Message type as string: "cc", "note_on", "note_off", "pitch_bend", "other"
    pub message_type: &'static str,
    /// Control number (CC number or note number)
    pub control: u8,
    /// Value (0-127 for CC/notes, 0-16383 for pitch bend)
    pub value: u16,
}

/// Parse raw MIDI bytes into a structured message.
///
/// Returns None if the message is empty.
pub fn parse_midi_bytes(message: &[u8]) -> Option<ParsedMidiMessage> {
    if message.is_empty() {
        return None;
    }

    let status = message[0];
    let channel = status & 0x0F;
    let message_type = status & 0xF0;

    let (type_str, control, value): (&'static str, u8, u16) = match message_type {
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

    Some(ParsedMidiMessage {
        channel,
        message_type: type_str,
        control,
        value,
    })
}

/// Calculate pitch bend value from 14-bit MIDI data.
/// Returns a value from 0 to 16383, with 8192 being center.
pub fn calculate_pitch_bend(lsb: u8, msb: u8) -> u16 {
    ((msb as u16) << 7) | (lsb as u16)
}

/// Normalize a 7-bit MIDI CC value (0-127) to a 0.0-1.0 range.
pub fn normalize_cc_value(value: u8) -> f64 {
    (value as f64) / 127.0
}

/// Map a normalized value (0.0-1.0) to a parameter range.
pub fn map_to_range(normalized: f64, min: f64, max: f64) -> f64 {
    min + normalized * (max - min)
}

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
    // Parse the raw MIDI bytes
    let parsed = match parse_midi_bytes(message) {
        Some(p) => p,
        None => return,
    };

    let channel = parsed.channel;
    let type_str = parsed.message_type;
    let control = parsed.control;
    let value = parsed.value;

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

    // Handle MIDI Learn if active and this is a CC or note_on message
    if learn_state.is_learning && (type_str == "cc" || (type_str == "note_on" && value > 0)) {
        if let Some(param_id) = learn_state.parameter_id {
            let mapping = if type_str == "cc" {
                MidiMapping {
                    parameter_id: param_id,
                    channel: Some(channel),
                    cc_number: Some(control),
                    note_number: None,
                    note_mode: None,
                    min_value: learn_state.pending_min_value,
                    max_value: learn_state.pending_max_value,
                    device_id: Some(device_id.to_string()),
                }
            } else {
                // note_on
                MidiMapping {
                    parameter_id: param_id,
                    channel: Some(channel),
                    cc_number: None,
                    note_number: Some(control),
                    note_mode: Some(NoteMappingMode::Velocity),
                    min_value: learn_state.pending_min_value,
                    max_value: learn_state.pending_max_value,
                    device_id: Some(device_id.to_string()),
                }
            };

            {
                let mut state = engine.lock().unwrap();
                state
                    .mappings
                    .retain(|m| m.parameter_id != mapping.parameter_id);
                state.mappings.push(mapping.clone());
                state.learn_state.is_learning = false;
                state.learn_state.parameter_id = None;

                // For CC mappings: ensure the first CC after learn requires a proper crossing
                if type_str == "cc" {
                    let key = (channel, control);
                    let pickup = state
                        .pickup_state
                        .entry(key)
                        .or_insert_with(super::types::PickupState::default);
                    pickup.picked_up = false;
                    pickup.last_cc = Some(value as u8);
                    pickup.ignore_next = false;
                }
            }

            save_mappings_to_disk();
            emit_learn_state_changed();

            if let Some(ref handle) = app_handle {
                let _ = handle.emit("midi_learn_complete", MidiLearnComplete { mapping });
            }

            log::debug!(
                "[MIDI] Learn complete: {} {} @ channel {} -> parameter",
                type_str,
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
            if !mapping.is_cc() {
                continue;
            }
            // Check if this CC matches the mapping
            let channel_match = mapping.channel.map_or(true, |ch| ch == channel);
            let cc_match = mapping.cc_number == Some(control);
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

    // Apply mappings for note messages
    if type_str == "note_on" || type_str == "note_off" {
        for mapping in &mappings {
            if !mapping.is_note() {
                continue;
            }
            let note_number = match mapping.note_number {
                Some(n) => n,
                None => continue,
            };
            let mode = match &mapping.note_mode {
                Some(m) => m,
                None => continue,
            };

            let channel_match = mapping.channel.map_or(true, |ch| ch == channel);
            let note_match = note_number == control;
            let device_match = mapping.device_id.as_ref().map_or(true, |d| d == device_id);

            if !channel_match || !note_match || !device_match {
                continue;
            }

            let mapped_value = match mode {
                NoteMappingMode::Velocity => {
                    if type_str == "note_off" {
                        continue;
                    } // only fires on note_on
                    let normalized = (value as f64) / 127.0;
                    mapping.min_value + normalized * (mapping.max_value - mapping.min_value)
                }
                NoteMappingMode::Trigger => {
                    if type_str == "note_on" && value > 0 {
                        mapping.max_value
                    } else {
                        // note_off or note_on with velocity 0
                        mapping.min_value
                    }
                }
            };

            apply_midi_to_parameter(
                &mapping.parameter_id,
                mapped_value,
                app_handle.as_ref(),
                true,
            );
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

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // parse_midi_bytes tests
    // =========================================================================

    #[test]
    fn test_parse_empty_message() {
        assert_eq!(parse_midi_bytes(&[]), None);
    }

    #[test]
    fn test_parse_cc_message() {
        // CC on channel 0, CC #7 (volume), value 100
        let message = [0xB0, 7, 100];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.channel, 0);
        assert_eq!(parsed.message_type, "cc");
        assert_eq!(parsed.control, 7);
        assert_eq!(parsed.value, 100);
    }

    #[test]
    fn test_parse_cc_channel_15() {
        // CC on channel 15, CC #1 (mod wheel), value 64
        let message = [0xBF, 1, 64];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.channel, 15);
        assert_eq!(parsed.message_type, "cc");
        assert_eq!(parsed.control, 1);
        assert_eq!(parsed.value, 64);
    }

    #[test]
    fn test_parse_note_on() {
        // Note On channel 0, note 60 (middle C), velocity 127
        let message = [0x90, 60, 127];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.channel, 0);
        assert_eq!(parsed.message_type, "note_on");
        assert_eq!(parsed.control, 60);
        assert_eq!(parsed.value, 127);
    }

    #[test]
    fn test_parse_note_on_zero_velocity() {
        // Note On with velocity 0 is often used as Note Off
        let message = [0x90, 60, 0];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.message_type, "note_on");
        assert_eq!(parsed.value, 0);
    }

    #[test]
    fn test_parse_note_off() {
        // Note Off channel 0, note 60, velocity 64
        let message = [0x80, 60, 64];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.channel, 0);
        assert_eq!(parsed.message_type, "note_off");
        assert_eq!(parsed.control, 60);
        assert_eq!(parsed.value, 64);
    }

    #[test]
    fn test_parse_pitch_bend_center() {
        // Pitch bend at center position (8192)
        // LSB = 0, MSB = 64 -> (64 << 7) | 0 = 8192
        let message = [0xE0, 0, 64];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.channel, 0);
        assert_eq!(parsed.message_type, "pitch_bend");
        assert_eq!(parsed.control, 0);
        assert_eq!(parsed.value, 8192);
    }

    #[test]
    fn test_parse_pitch_bend_max() {
        // Pitch bend at max position (16383)
        // LSB = 127, MSB = 127 -> (127 << 7) | 127 = 16383
        let message = [0xE0, 127, 127];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.value, 16383);
    }

    #[test]
    fn test_parse_pitch_bend_min() {
        // Pitch bend at min position (0)
        let message = [0xE0, 0, 0];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.value, 0);
    }

    #[test]
    fn test_parse_unknown_message_type() {
        // System exclusive or other message types
        let message = [0xF0, 0x7E, 0x00];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.message_type, "other");
        assert_eq!(parsed.control, 0);
        assert_eq!(parsed.value, 0);
    }

    #[test]
    fn test_parse_short_cc_message() {
        // CC message with missing data bytes (should use 0 defaults)
        let message = [0xB0];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.message_type, "cc");
        assert_eq!(parsed.control, 0);
        assert_eq!(parsed.value, 0);
    }

    #[test]
    fn test_parse_partial_cc_message() {
        // CC message with only one data byte
        let message = [0xB0, 7];
        let parsed = parse_midi_bytes(&message).unwrap();

        assert_eq!(parsed.message_type, "cc");
        assert_eq!(parsed.control, 7);
        assert_eq!(parsed.value, 0);
    }

    // =========================================================================
    // calculate_pitch_bend tests
    // =========================================================================

    #[test]
    fn test_pitch_bend_center() {
        assert_eq!(calculate_pitch_bend(0, 64), 8192);
    }

    #[test]
    fn test_pitch_bend_max() {
        assert_eq!(calculate_pitch_bend(127, 127), 16383);
    }

    #[test]
    fn test_pitch_bend_min() {
        assert_eq!(calculate_pitch_bend(0, 0), 0);
    }

    #[test]
    fn test_pitch_bend_arbitrary() {
        // LSB = 50, MSB = 100 -> (100 << 7) | 50 = 12850
        assert_eq!(calculate_pitch_bend(50, 100), 12850);
    }

    // =========================================================================
    // normalize_cc_value tests
    // =========================================================================

    #[test]
    fn test_normalize_cc_zero() {
        assert!((normalize_cc_value(0) - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_normalize_cc_max() {
        assert!((normalize_cc_value(127) - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_normalize_cc_mid() {
        // 64 / 127 ≈ 0.504
        let normalized = normalize_cc_value(64);
        assert!(normalized > 0.5 && normalized < 0.51);
    }

    // =========================================================================
    // map_to_range tests
    // =========================================================================

    #[test]
    fn test_map_to_range_zero() {
        assert!((map_to_range(0.0, 0.0, 100.0) - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_map_to_range_one() {
        assert!((map_to_range(1.0, 0.0, 100.0) - 100.0).abs() < 0.001);
    }

    #[test]
    fn test_map_to_range_mid() {
        assert!((map_to_range(0.5, 0.0, 100.0) - 50.0).abs() < 0.001);
    }

    #[test]
    fn test_map_to_range_custom() {
        // Map 0.5 to range 10-20 should give 15
        assert!((map_to_range(0.5, 10.0, 20.0) - 15.0).abs() < 0.001);
    }

    #[test]
    fn test_map_to_range_negative() {
        // Map 0.5 to range -1 to 1 should give 0
        assert!((map_to_range(0.5, -1.0, 1.0) - 0.0).abs() < 0.001);
    }

    // =========================================================================
    // Integration: CC to parameter mapping
    // =========================================================================

    #[test]
    fn test_cc_to_parameter_full_range() {
        // CC value 127 mapped to 0.0-1.0 range
        let cc_value = 127u8;
        let normalized = normalize_cc_value(cc_value);
        let mapped = map_to_range(normalized, 0.0, 1.0);
        assert!((mapped - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_cc_to_parameter_custom_range() {
        // CC value 64 (mid) mapped to 0.5-1.5 range should give ~1.0
        let cc_value = 64u8;
        let normalized = normalize_cc_value(cc_value);
        let mapped = map_to_range(normalized, 0.5, 1.5);
        // 64/127 ≈ 0.504, so 0.5 + 0.504 * 1.0 ≈ 1.004
        assert!(mapped > 0.99 && mapped < 1.01);
    }
}
