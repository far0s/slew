//! Tauri command wrappers for HID functionality.

use super::connections::{connect_device, connect_megalodon, disconnect_device, get_status};
use super::devices::{list_devices, list_supported_devices};
use super::engine::{is_auto_connect_enabled, set_auto_connect};
use super::mappings::{
    add_mapping, clear_mappings, get_mappings, remove_mapping, setup_default_mappings,
};
use super::types::{HidDeviceInfo, HidMapping, HidStatus};

#[tauri::command]
pub fn list_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    list_devices()
}

#[tauri::command]
pub fn list_supported_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    list_supported_devices()
}

#[tauri::command]
pub fn connect_hid_device(path: String) -> Result<(), String> {
    connect_device(&path)
}

#[tauri::command]
pub fn connect_hid_megalodon() -> Result<(), String> {
    connect_megalodon()
}

#[tauri::command]
pub fn disconnect_hid_device() -> Result<(), String> {
    disconnect_device()
}

#[tauri::command]
pub fn get_hid_status() -> HidStatus {
    get_status()
}

#[tauri::command]
pub fn get_hid_mappings() -> Vec<HidMapping> {
    get_mappings()
}

#[tauri::command]
pub fn add_hid_mapping(mapping: HidMapping) -> Result<(), String> {
    add_mapping(mapping)
}

#[tauri::command]
pub fn remove_hid_mapping(encoder_index: u8) -> Result<(), String> {
    remove_mapping(encoder_index)
}

#[tauri::command]
pub fn clear_hid_mappings() -> Result<(), String> {
    clear_mappings()
}

#[tauri::command]
pub fn setup_default_hid_mappings() -> Result<(), String> {
    setup_default_mappings()
}

#[tauri::command]
pub fn set_hid_auto_connect(enabled: bool) {
    set_auto_connect(enabled);
}

#[tauri::command]
pub fn get_hid_auto_connect() -> bool {
    is_auto_connect_enabled()
}
