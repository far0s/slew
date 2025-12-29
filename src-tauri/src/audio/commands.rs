//! Tauri commands for audio functionality.

use super::capture::{
    get_status, is_auto_reconnect_enabled, set_auto_reconnect, start_capture, stop_capture,
};
use super::devices::list_devices;
use super::mappings::{
    add_mapping, clear_mappings, get_mappings, remove_mapping, set_mapping_enabled,
};
use super::types::{AudioDeviceInfo, AudioMapping, AudioStatus};

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    list_devices()
}

#[tauri::command]
pub fn start_audio_capture(device_name: Option<String>) -> Result<(), String> {
    start_capture(device_name)
}

#[tauri::command]
pub fn stop_audio_capture() -> Result<(), String> {
    stop_capture()
}

#[tauri::command]
pub fn get_audio_status() -> AudioStatus {
    get_status()
}

#[tauri::command]
pub fn get_audio_mappings() -> Vec<AudioMapping> {
    get_mappings()
}

#[tauri::command]
pub fn add_audio_mapping(mapping: AudioMapping) -> AudioMapping {
    add_mapping(mapping)
}

#[tauri::command]
pub fn remove_audio_mapping(id: String) -> bool {
    remove_mapping(&id)
}

#[tauri::command]
pub fn clear_audio_mappings() {
    clear_mappings()
}

#[tauri::command]
pub fn set_audio_mapping_enabled(id: String, enabled: bool) -> bool {
    set_mapping_enabled(&id, enabled)
}

#[tauri::command]
pub fn set_audio_auto_reconnect(enabled: bool) {
    set_auto_reconnect(enabled)
}

#[tauri::command]
pub fn get_audio_auto_reconnect() -> bool {
    is_auto_reconnect_enabled()
}
