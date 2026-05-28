//! Tauri commands for MIDI functionality.

use super::connections;
use super::devices;
use super::import_export::{self, ImportMode, ImportResult};
use super::learn;
use super::mappings;
use super::midimix;
use super::output;
use super::templates;
use super::types::{
    MidiDeviceInfo, MidiLearnState, MidiMapping, MidiOutputConfig, MidiOutputDeviceInfo,
    MidiPickupStateUpdate,
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

#[tauri::command]
pub fn get_midi_pickup_states() -> Vec<MidiPickupStateUpdate> {
    midimix::get_all_pickup_states()
}

#[tauri::command]
pub fn export_midi_mappings(device_filter: Option<String>) -> String {
    let export = import_export::export_mappings(device_filter);
    serde_json::to_string_pretty(&export).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}

#[tauri::command]
pub fn import_midi_mappings(json: String, mode: ImportMode) -> Result<ImportResult, String> {
    let export: super::import_export::MidiMappingExport =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    Ok(import_export::import_mappings(export, mode))
}

#[tauri::command]
pub fn list_controller_templates() -> Vec<templates::ControllerTemplateMeta> {
    templates::list_template_meta()
}

#[tauri::command]
pub fn import_controller_template(json: String) -> Result<(), String> {
    let mut template: templates::ControllerTemplate =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    // Clear any source_file that might have been serialized in — we'll set it on save.
    template.source_file = None;
    templates::save_template_to_disk(&template)
}

#[tauri::command]
pub fn delete_controller_template(label: String) -> Result<(), String> {
    templates::delete_template(&label)
}

#[tauri::command]
pub fn reload_controller_templates() -> Result<(), String> {
    templates::load_templates_from_disk();
    Ok(())
}
