//! MIDI output functions.
//!
//! Provides functions for sending MIDI messages to connected output devices.

use std::collections::HashMap;

use super::engine::with_midi_engine;
use super::types::MidiOutputConfig;

// ============================================================================
// MIDI Output Functions
// ============================================================================

/// Send a MIDI Control Change message.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `cc_number` - CC number (0-127)
/// * `value` - CC value (0-127)
pub fn send_cc(
    device_id: Option<&str>,
    channel: u8,
    cc_number: u8,
    value: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if cc_number > 127 {
        return Err("CC number must be 0-127".to_string());
    }
    if value > 127 {
        return Err("CC value must be 0-127".to_string());
    }

    // Build the CC message: status byte (0xB0 + channel), CC number, value
    let message = [0xB0 | channel, cc_number, value];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            // Check if value has changed to avoid redundant sends
            if let Some(cache) = state.last_sent_cc.get(&id) {
                if cache.get(&(channel, cc_number)) == Some(&value) {
                    continue; // Skip if value hasn't changed
                }
            }

            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send CC to {}: {}", id, e);
                    } else {
                        // Update cache
                        state
                            .last_sent_cc
                            .entry(id.clone())
                            .or_insert_with(HashMap::new)
                            .insert((channel, cc_number), value);
                        log::trace!(
                            "[MIDI] Sent CC {} = {} on channel {} to {}",
                            cc_number,
                            value,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send a MIDI Note On message.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `note` - Note number (0-127)
/// * `velocity` - Note velocity (0-127, 0 is often treated as Note Off)
pub fn send_note_on(
    device_id: Option<&str>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if note > 127 {
        return Err("Note number must be 0-127".to_string());
    }
    if velocity > 127 {
        return Err("Velocity must be 0-127".to_string());
    }

    // Build the Note On message: status byte (0x90 + channel), note, velocity
    let message = [0x90 | channel, note, velocity];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send Note On to {}: {}", id, e);
                    } else {
                        log::trace!(
                            "[MIDI] Sent Note On {} vel {} on channel {} to {}",
                            note,
                            velocity,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send a MIDI Note Off message.
///
/// Note: This sends Note On with velocity 0, which is the more universally
/// compatible way to turn off notes/LEDs. Many devices (including AKAI Midimix)
/// don't respond to actual Note Off (0x80) messages for LED control.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `note` - Note number (0-127)
/// * `_velocity` - Release velocity (ignored, always sends velocity 0)
pub fn send_note_off(
    device_id: Option<&str>,
    channel: u8,
    note: u8,
    _velocity: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if note > 127 {
        return Err("Note number must be 0-127".to_string());
    }

    // Send Note On with velocity 0 (more compatible than Note Off 0x80)
    // This is the standard way to turn off LEDs on controllers like Midimix
    let message = [0x90 | channel, note, 0];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send Note Off to {}: {}", id, e);
                    } else {
                        log::trace!(
                            "[MIDI] Sent Note Off {} (vel 0) on channel {} to {}",
                            note,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send MIDI feedback for a parameter value change.
/// This looks up the MIDI mapping for the parameter and sends the appropriate CC.
///
/// # Arguments
/// * `parameter_id` - The parameter ID to send feedback for
/// * `value` - The current parameter value
pub fn send_parameter_feedback(parameter_id: &str, value: f64) {
    // Get the mapping and output config
    let (mapping, config) = with_midi_engine(|state| {
        let mapping = state
            .mappings
            .iter()
            .find(|m| m.parameter_id == parameter_id)
            .cloned();
        (mapping, state.output_config.clone())
    });

    // If feedback is disabled or no mapping, skip
    if !config.send_cc_feedback {
        return;
    }

    let Some(mapping) = mapping else {
        return;
    };

    // Convert parameter value back to CC value (0-127)
    let range = mapping.max_value - mapping.min_value;
    if range.abs() < f64::EPSILON {
        return;
    }

    let normalized = (value - mapping.min_value) / range;
    let cc_value = (normalized.clamp(0.0, 1.0) * 127.0).round() as u8;

    // Get channel (default to 0 if not specified)
    let channel = mapping.channel.unwrap_or(0);

    // Note: mapping.device_id is for INPUT filtering, not output selection.
    // For output, we use config.output_device_id (or send to all connected outputs if None).
    let device_id = config.output_device_id.as_deref();

    if let Err(e) = send_cc(device_id, channel, mapping.cc_number, cc_value) {
        log::debug!("[MIDI] Failed to send feedback for {}: {}", parameter_id, e);
    } else {
        log::debug!(
            "[MIDI] Sent feedback for {} = {} (CC {} = {} on channel {})",
            parameter_id,
            value,
            mapping.cc_number,
            cc_value,
            channel
        );
    }
}

/// Set the MIDI output configuration.
pub fn set_output_config(config: MidiOutputConfig) {
    with_midi_engine(|state| {
        state.output_config = config;
    });
    log::debug!("[MIDI] Output config updated");
}

/// Get the current MIDI output configuration.
pub fn get_output_config() -> MidiOutputConfig {
    with_midi_engine(|state| state.output_config.clone())
}
