//! Tauri command handlers for the OSC module.

use rosc::OscType;

use super::beat::{get_osc_beat_config, set_osc_beat_config};
use super::mappings::{add_mapping, clear_mappings, get_mappings, remove_mapping};
use super::send::{get_output_config, send_osc_message, set_output_config};
use super::server::{get_status, start_server, stop_server};
use super::types::{OscBeatConfig, OscMapping, OscOutputConfig, OscServerStatus};

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start the OSC server.
#[tauri::command]
pub fn start_osc_server(port: u16) -> Result<(), String> {
    start_server(port)
}

/// Stop the OSC server.
#[tauri::command]
pub fn stop_osc_server() -> Result<(), String> {
    stop_server()
}

/// Get the current OSC server status.
#[tauri::command]
pub fn get_osc_status() -> OscServerStatus {
    get_status()
}

/// Get all OSC mappings.
#[tauri::command]
pub fn get_osc_mappings() -> Vec<OscMapping> {
    get_mappings()
}

/// Add or update an OSC mapping.
#[tauri::command]
pub fn add_osc_mapping(mapping: OscMapping) -> Result<(), String> {
    add_mapping(mapping)
}

/// Remove an OSC mapping by address.
#[tauri::command]
pub fn remove_osc_mapping(address: String) -> Result<(), String> {
    remove_mapping(address)
}

/// Clear all OSC mappings.
#[tauri::command]
pub fn clear_osc_mappings() {
    clear_mappings()
}

/// Get the current OSC output config.
#[tauri::command]
pub fn get_osc_output_config() -> OscOutputConfig {
    get_output_config()
}

/// Set the OSC output config.
#[tauri::command]
pub fn set_osc_output_config(config: OscOutputConfig) -> Result<(), String> {
    set_output_config(config)
}

/// Get the current OSC beat/bpm address config.
#[tauri::command]
pub fn get_osc_beat_config_cmd() -> OscBeatConfig {
    get_osc_beat_config()
}

/// Set the OSC beat/bpm address config.
#[tauri::command]
pub fn set_osc_beat_config_cmd(config: OscBeatConfig) -> Result<(), String> {
    set_osc_beat_config(config)
}

/// Send a one-off OSC message with float arguments.
#[tauri::command]
pub fn send_osc_message_cmd(address: String, args: Vec<f64>) -> Result<(), String> {
    let osc_args: Vec<OscType> = args.iter().map(|&v| OscType::Float(v as f32)).collect();
    send_osc_message(&address, osc_args);
    Ok(())
}
