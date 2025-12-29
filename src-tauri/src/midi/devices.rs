//! MIDI device enumeration and discovery.

use midir::{MidiInput, MidiOutput};
use std::collections::HashSet;

use super::engine::with_midi_engine;
use super::types::{MidiDeviceInfo, MidiOutputDeviceInfo};

// ============================================================================
// Device Listing
// ============================================================================

/// Internal input device listing that doesn't require the mutex.
pub(crate) fn list_devices_internal() -> Result<Vec<MidiDeviceInfo>, String> {
    let midi_in = MidiInput::new("sebcat-vj-probe")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();

    let mut devices = Vec::new();
    for (idx, port) in ports.iter().enumerate() {
        let name = midi_in
            .port_name(port)
            .unwrap_or_else(|_| format!("Unknown Device {}", idx));
        let id = format!("{}", idx);

        devices.push(MidiDeviceInfo {
            id,
            name,
            is_connected: false, // Will be updated by caller if needed
        });
    }

    Ok(devices)
}

/// Internal output device listing that doesn't require the mutex.
pub(crate) fn list_output_devices_internal() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    let midi_out = MidiOutput::new("sebcat-vj-probe-out")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

    let ports = midi_out.ports();

    let mut devices = Vec::new();
    for (idx, port) in ports.iter().enumerate() {
        let name = midi_out
            .port_name(&port)
            .unwrap_or_else(|_| format!("Unknown Output Device {}", idx));
        let id = format!("out_{}", idx);

        devices.push(MidiOutputDeviceInfo {
            id,
            name,
            is_connected: false, // Will be updated by caller if needed
        });
    }

    Ok(devices)
}

/// List available MIDI input devices (with connection status).
pub fn list_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    let mut devices = list_devices_internal()?;

    // Update connection status from global state
    let connected_names: HashSet<String> = with_midi_engine(|state| {
        state
            .connections
            .values()
            .map(|c| c.device_name.clone())
            .collect()
    });

    for device in &mut devices {
        device.is_connected = connected_names.contains(&device.name);
    }

    Ok(devices)
}

/// List available MIDI output devices (with connection status).
pub fn list_output_devices() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    let mut devices = list_output_devices_internal()?;

    // Update connection status from global state
    let connected_names: HashSet<String> = with_midi_engine(|state| {
        state
            .output_connections
            .values()
            .map(|c| c.device_name.clone())
            .collect()
    });

    for device in &mut devices {
        device.is_connected = connected_names.contains(&device.name);
    }

    Ok(devices)
}

/// Find the paired output device for an input device (by name matching).
pub fn find_paired_output_device(input_name: &str) -> Option<MidiOutputDeviceInfo> {
    use super::engine::is_midimix_device;

    // For Midimix and similar devices, input and output share the same base name
    if let Ok(outputs) = list_output_devices() {
        // First try exact match
        if let Some(output) = outputs.iter().find(|o| o.name == input_name) {
            return Some(output.clone());
        }
        // Then try partial match (e.g., "MIDI Mix" in both names)
        if is_midimix_device(input_name) {
            if let Some(output) = outputs.iter().find(|o| is_midimix_device(&o.name)) {
                return Some(output.clone());
            }
        }
    }
    None
}

/// Find the paired input device for an output device (by name matching).
pub fn find_paired_input_device(output_name: &str) -> Option<MidiDeviceInfo> {
    use super::engine::is_midimix_device;

    if let Ok(inputs) = list_devices() {
        // First try exact match
        if let Some(input) = inputs.iter().find(|i| i.name == output_name) {
            return Some(input.clone());
        }
        // Then try partial match for Midimix
        if is_midimix_device(output_name) {
            if let Some(input) = inputs.iter().find(|i| is_midimix_device(&i.name)) {
                return Some(input.clone());
            }
        }
    }
    None
}
