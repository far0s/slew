//! Tauri command wrappers for MIDI functionality.
//!
//! These commands are exposed to the frontend via Tauri's IPC mechanism.

use super::connections;
use super::devices;
use super::learn;
use super::mappings;
use super::output;
use super::types::{
    MidiDeviceInfo, MidiLearnState, MidiMapping, MidiOutputConfig, MidiOutputDeviceInfo,
};

// ============================================================================
// Device Commands
// ============================================================================

/// List available MIDI input devices.
#[tauri::command]
pub fn list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    devices::list_devices()
}

/// List available MIDI output devices.
#[tauri::command]
pub fn list_midi_output_devices() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    devices::list_output_devices()
}

// ============================================================================
// Connection Commands
// ============================================================================

/// Open a MIDI device for input.
#[tauri::command]
pub fn open_midi_device(device_id: String) -> Result<(), String> {
    connections::open_device(device_id)
}

/// Open a MIDI device for output.
#[tauri::command]
pub fn open_midi_output_device(device_id: String) -> Result<(), String> {
    connections::open_output_device(device_id)
}

/// Close a MIDI input device.
#[tauri::command]
pub fn close_midi_device(device_id: String) -> Result<(), String> {
    connections::close_device(device_id)
}

/// Close a MIDI output device.
#[tauri::command]
pub fn close_midi_output_device(device_id: String) -> Result<(), String> {
    connections::close_output_device(device_id)
}

/// Set auto-reconnect enabled state.
#[tauri::command]
pub fn set_midi_auto_reconnect(enabled: bool) {
    connections::set_auto_reconnect(enabled)
}

/// Get auto-reconnect enabled state.
#[tauri::command]
pub fn get_midi_auto_reconnect() -> bool {
    connections::is_auto_reconnect_enabled()
}

/// Clear the list of devices to auto-reconnect.
#[tauri::command]
pub fn clear_midi_auto_reconnect_devices() {
    connections::clear_auto_reconnect_devices()
}

// ============================================================================
// Learn Commands
// ============================================================================

/// Start MIDI Learn mode for a parameter.
#[tauri::command]
pub fn start_midi_learn(
    parameter_id: String,
    min_value: f64,
    max_value: f64,
) -> Result<(), String> {
    learn::start_learn(parameter_id, min_value, max_value)
}

/// Cancel MIDI Learn mode.
#[tauri::command]
pub fn cancel_midi_learn() -> Result<(), String> {
    learn::cancel_learn()
}

/// Get the current MIDI Learn state.
#[tauri::command]
pub fn get_midi_learn_state() -> MidiLearnState {
    learn::get_learn_state()
}

// ============================================================================
// Mapping Commands
// ============================================================================

/// Get all MIDI mappings.
#[tauri::command]
pub fn get_midi_mappings() -> Vec<MidiMapping> {
    mappings::get_mappings()
}

/// Set (create or update) a MIDI mapping.
#[tauri::command]
pub fn set_midi_mapping(mapping: MidiMapping) {
    mappings::set_mapping(mapping)
}

/// Remove a MIDI mapping by parameter ID.
#[tauri::command]
pub fn remove_midi_mapping(parameter_id: String) -> Result<(), String> {
    mappings::remove_mapping(&parameter_id)
}

/// Clear all MIDI mappings.
#[tauri::command]
pub fn clear_midi_mappings() {
    mappings::clear_mappings()
}

// ============================================================================
// Output Commands
// ============================================================================

/// Send a MIDI CC message to an output device.
#[tauri::command]
pub fn send_midi_cc(
    device_id: Option<String>,
    channel: u8,
    cc_number: u8,
    value: u8,
) -> Result<(), String> {
    output::send_cc(device_id.as_deref(), channel, cc_number, value)
}

/// Send a MIDI Note On message to an output device.
#[tauri::command]
pub fn send_midi_note_on(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    output::send_note_on(device_id.as_deref(), channel, note, velocity)
}

/// Send a MIDI Note Off message to an output device.
#[tauri::command]
pub fn send_midi_note_off(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    output::send_note_off(device_id.as_deref(), channel, note, velocity)
}

/// Set MIDI output configuration.
#[tauri::command]
pub fn set_midi_output_config(config: MidiOutputConfig) {
    output::set_output_config(config)
}

/// Get MIDI output configuration.
#[tauri::command]
pub fn get_midi_output_config() -> MidiOutputConfig {
    output::get_output_config()
}

/// Trigger MIDI feedback for a parameter.
#[tauri::command]
pub fn trigger_midi_feedback(parameter_id: String, value: f64) {
    output::send_parameter_feedback(&parameter_id, value)
}
