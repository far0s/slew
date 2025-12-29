//! Tauri commands for MIDI functionality.

use super::connections;
use super::devices;
use super::learn;
use super::mappings;
use super::output;
use super::types::{
    MidiDeviceInfo, MidiLearnState, MidiMapping, MidiOutputConfig, MidiOutputDeviceInfo,
};

#[tauri::command]
pub fn list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    devices::list_devices()
}

#[tauri::command]
pub fn list_midi_output_devices() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    devices::list_output_devices()
}

#[tauri::command]
pub fn open_midi_device(device_id: String) -> Result<(), String> {
    connections::open_device(device_id)
}

#[tauri::command]
pub fn open_midi_output_device(device_id: String) -> Result<(), String> {
    connections::open_output_device(device_id)
}

#[tauri::command]
pub fn close_midi_device(device_id: String) -> Result<(), String> {
    connections::close_device(device_id)
}

#[tauri::command]
pub fn close_midi_output_device(device_id: String) -> Result<(), String> {
    connections::close_output_device(device_id)
}

#[tauri::command]
pub fn set_midi_auto_reconnect(enabled: bool) {
    connections::set_auto_reconnect(enabled)
}

#[tauri::command]
pub fn get_midi_auto_reconnect() -> bool {
    connections::is_auto_reconnect_enabled()
}

#[tauri::command]
pub fn clear_midi_auto_reconnect_devices() {
    connections::clear_auto_reconnect_devices()
}

#[tauri::command]
pub fn start_midi_learn(
    parameter_id: String,
    min_value: f64,
    max_value: f64,
) -> Result<(), String> {
    learn::start_learn(parameter_id, min_value, max_value)
}

#[tauri::command]
pub fn cancel_midi_learn() -> Result<(), String> {
    learn::cancel_learn()
}

#[tauri::command]
pub fn get_midi_learn_state() -> MidiLearnState {
    learn::get_learn_state()
}

#[tauri::command]
pub fn get_midi_mappings() -> Vec<MidiMapping> {
    mappings::get_mappings()
}

#[tauri::command]
pub fn set_midi_mapping(mapping: MidiMapping) {
    mappings::set_mapping(mapping)
}

#[tauri::command]
pub fn remove_midi_mapping(parameter_id: String) -> Result<(), String> {
    mappings::remove_mapping(&parameter_id)
}

#[tauri::command]
pub fn clear_midi_mappings() {
    mappings::clear_mappings()
}

#[tauri::command]
pub fn send_midi_cc(
    device_id: Option<String>,
    channel: u8,
    cc_number: u8,
    value: u8,
) -> Result<(), String> {
    output::send_cc(device_id.as_deref(), channel, cc_number, value)
}

#[tauri::command]
pub fn send_midi_note_on(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    output::send_note_on(device_id.as_deref(), channel, note, velocity)
}

#[tauri::command]
pub fn send_midi_note_off(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    output::send_note_off(device_id.as_deref(), channel, note, velocity)
}

#[tauri::command]
pub fn set_midi_output_config(config: MidiOutputConfig) {
    output::set_output_config(config)
}

#[tauri::command]
pub fn get_midi_output_config() -> MidiOutputConfig {
    output::get_output_config()
}

#[tauri::command]
pub fn trigger_midi_feedback(parameter_id: String, value: f64) {
    output::send_parameter_feedback(&parameter_id, value)
}
