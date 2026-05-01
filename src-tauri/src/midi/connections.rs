//! MIDI connection management.
//!
//! Handles opening and closing MIDI input and output connections.

use midir::{Ignore, MidiInput, MidiOutput};
use std::collections::HashMap;

use super::devices::find_paired_output_device;
use super::engine::{find_controller, is_midimix_device, with_midi_engine, MIDI_ENGINE};
use super::events::{emit_devices_changed, emit_output_devices_changed};
use super::message_handler::handle_midi_message;
use super::midimix::{reset_all_pickup, send_midimix_shutdown_animation_sync, send_midimix_startup_animation};
use super::types::{ActiveInputConnection, ActiveOutputConnection};

// ============================================================================
// Input Connection Management
// ============================================================================

/// Open a MIDI device for input.
pub fn open_device(device_id: String) -> Result<(), String> {
    // Check if already connected
    let already_connected = with_midi_engine(|state| state.connections.contains_key(&device_id));

    if already_connected {
        return Err(format!("Device {} is already connected", device_id));
    }

    // Parse device ID as port index
    let port_idx: usize = device_id
        .parse()
        .map_err(|_| format!("Invalid device ID: {}", device_id))?;

    // Create MIDI input
    let midi_in =
        MidiInput::new("slew-input").map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();
    let port = ports
        .get(port_idx)
        .ok_or_else(|| format!("Device {} not found", device_id))?;

    let port_name = midi_in
        .port_name(port)
        .unwrap_or_else(|_| format!("Device {}", port_idx));

    // Clone values for the callback closure
    let device_id_for_callback = device_id.clone();
    let engine = MIDI_ENGINE.clone();

    // Set up the callback for incoming MIDI messages
    let mut midi_in_ignored = MidiInput::new("slew-input-conn")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;
    midi_in_ignored.ignore(Ignore::None);

    let ports2 = midi_in_ignored.ports();
    let port2 = ports2
        .get(port_idx)
        .ok_or_else(|| format!("Device {} not found on second probe", device_id))?;

    let connection = midi_in_ignored
        .connect(
            port2,
            "slew-midi",
            move |timestamp, message, _| {
                handle_midi_message(&engine, &device_id_for_callback, timestamp, message);
            },
            (),
        )
        .map_err(|e| format!("Failed to connect to device: {}", e))?;

    // Store the connection and mark for auto-reconnect
    let is_midimix = is_midimix_device(&port_name);
    with_midi_engine(|state| {
        state.connections.insert(
            device_id.clone(),
            ActiveInputConnection {
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
        // Remember this device for auto-reconnect
        state.auto_reconnect_devices.insert(port_name.clone());
    });

    log::debug!("[MIDI] Opened input device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_devices_changed();

    // For Midimix: handle pickup reset (registry handles setup + LEDs)
    if is_midimix {
        reset_all_pickup(&MIDI_ENGINE);
    }

    // Dispatch to the matching controller profile for output pairing, LEDs, and mappings
    if let Some(profile) = find_controller(&port_name) {
        if profile.has_output {
            if let Some(output) = find_paired_output_device(&port_name) {
                if !output.is_connected {
                    if let Err(e) = open_output_device(output.id.clone()) {
                        log::warn!("[MIDI] Failed to auto-connect {} output: {}", profile.label, e);
                    } else {
                        log::debug!("[MIDI] Auto-connected {} output: {}", profile.label, output.name);
                        if let Some(leds_fn) = profile.startup_leds {
                            // Midimix startup animation is handled separately (includes pickup reset)
                            if !is_midimix {
                                leds_fn(&output.id);
                            } else {
                                send_midimix_startup_animation(&output.id);
                            }
                        }
                    }
                }
            }
        }
        (profile.setup)();
    }

    Ok(())
}

/// Enable or disable auto-reconnect for MIDI devices.
pub fn set_auto_reconnect(enabled: bool) {
    with_midi_engine(|state| {
        state.auto_reconnect_enabled = enabled;
    });
    log::debug!("[MIDI] Auto-reconnect set to: {}", enabled);
}

/// Check if auto-reconnect is enabled.
pub fn is_auto_reconnect_enabled() -> bool {
    with_midi_engine(|state| state.auto_reconnect_enabled)
}

/// Clear the auto-reconnect list (forgets which devices to reconnect to).
pub fn clear_auto_reconnect_devices() {
    with_midi_engine(|state| {
        state.auto_reconnect_devices.clear();
        state.auto_reconnect_output_devices.clear();
    });
    log::debug!("[MIDI] Cleared auto-reconnect device list");
}

/// Close a MIDI input device.
pub fn close_device(device_id: String) -> Result<(), String> {
    let connection = with_midi_engine(|state| state.connections.remove(&device_id));

    match connection {
        Some(mut conn) => {
            // Dropping the connection closes it
            if let Some(c) = conn.connection.take() {
                c.close();
            }
            log::debug!("[MIDI] Closed input device: {}", device_id);
            emit_devices_changed();
            Ok(())
        }
        None => Err(format!("Device {} is not connected", device_id)),
    }
}

/// Close all MIDI input devices.
pub fn close_all_devices() {
    let device_ids: Vec<String> =
        with_midi_engine(|state| state.connections.keys().cloned().collect());

    for device_id in device_ids {
        let _ = close_device(device_id);
    }
}

// ============================================================================
// Output Connection Management
// ============================================================================

/// Open a MIDI device for output.
pub fn open_output_device(device_id: String) -> Result<(), String> {
    // Check if already connected
    let already_connected =
        with_midi_engine(|state| state.output_connections.contains_key(&device_id));

    if already_connected {
        return Err(format!("Output device {} is already connected", device_id));
    }

    // Parse device ID (format: "out_N" where N is the port index)
    let port_idx: usize = device_id
        .strip_prefix("out_")
        .ok_or_else(|| format!("Invalid output device ID format: {}", device_id))?
        .parse()
        .map_err(|_| format!("Invalid output device ID: {}", device_id))?;

    // Create MIDI output
    let midi_out = MidiOutput::new("slew-output")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

    let ports = midi_out.ports();
    let port = ports
        .get(port_idx)
        .ok_or_else(|| format!("Output device {} not found", device_id))?;

    let port_name = midi_out
        .port_name(&port)
        .unwrap_or_else(|_| format!("Output Device {}", port_idx));

    let connection = midi_out
        .connect(&port, "slew-midi-out")
        .map_err(|e| format!("Failed to connect to output device: {}", e))?;

    // Store the connection and mark for auto-reconnect
    let is_midimix = is_midimix_device(&port_name);
    with_midi_engine(|state| {
        state.output_connections.insert(
            device_id.clone(),
            ActiveOutputConnection {
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
        // Remember this device for auto-reconnect
        state
            .auto_reconnect_output_devices
            .insert(port_name.clone());
        // Initialize CC cache for this device
        state.last_sent_cc.insert(device_id.clone(), HashMap::new());
    });

    log::debug!("[MIDI] Opened output device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_output_devices_changed();

    // For Midimix: auto-connect paired input if not already connected
    if is_midimix {
        log::debug!("[MIDI] Midimix output detected, checking for paired input");

        // Try to connect the paired input device
        if let Some(input) = super::devices::find_paired_input_device(&port_name) {
            if !input.is_connected {
                if let Err(e) = open_device(input.id.clone()) {
                    log::warn!("[MIDI] Failed to auto-connect Midimix input: {}", e);
                }
                // Note: open_device will handle the startup animation and mappings
            } else {
                // Input already connected, just send startup animation
                send_midimix_startup_animation(&device_id);
            }
        } else {
            // No paired input found, still send startup animation
            send_midimix_startup_animation(&device_id);
        }
    }

    Ok(())
}

/// Close a MIDI output device.
pub fn close_output_device(device_id: String) -> Result<(), String> {
    // Check if this is a Midimix and send shutdown animation BEFORE removing the connection
    let is_midimix = with_midi_engine(|state| {
        state
            .output_connections
            .get(&device_id)
            .map(|conn| is_midimix_device(&conn.device_name))
            .unwrap_or(false)
    });

    if is_midimix {
        send_midimix_shutdown_animation_sync(&device_id);
    }

    let connection = with_midi_engine(|state| {
        // Clear cached CC values for this device
        state.last_sent_cc.remove(&device_id);
        state.output_connections.remove(&device_id)
    });

    match connection {
        Some(mut conn) => {
            // Dropping the connection closes it
            if let Some(c) = conn.connection.take() {
                drop(c);
            }
            log::debug!("[MIDI] Closed output device: {}", device_id);
            emit_output_devices_changed();
            Ok(())
        }
        None => Err(format!("Output device {} is not connected", device_id)),
    }
}

/// Close all MIDI output devices.
pub fn close_all_output_devices() {
    let device_ids: Vec<String> =
        with_midi_engine(|state| state.output_connections.keys().cloned().collect());

    for device_id in device_ids {
        let _ = close_output_device(device_id);
    }
}
