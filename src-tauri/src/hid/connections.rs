//! HID device connection management.

use hidapi::HidApi;

use super::constants::{
    USAGE_CONSUMER_CONTROL, USAGE_KEYBOARD, USAGE_PAGE_CONSUMER, USAGE_PAGE_GENERIC_DESKTOP,
};
use super::devices::{list_devices, list_supported_devices};
use super::engine::with_hid_engine;
use super::events::emit_status_changed;
use super::reading::start_reading_thread;
use super::types::{HidDeviceInfo, HidStatus};

/// Connect to an HID device by path (disconnects existing first).
pub fn connect_device(path: &str) -> Result<(), String> {
    let is_connected = with_hid_engine(|state| state.status.is_connected);
    if is_connected {
        let _ = disconnect_device();
    }

    connect_device_internal(path, true)
}

/// Connect to the first available Megalodon device.
/// Connects to BOTH keyboard and consumer control interfaces for full encoder support.
pub fn connect_megalodon() -> Result<(), String> {
    let supported = list_supported_devices()?;

    if supported.is_empty() {
        return Err("No Megalodon device found. Make sure it's connected.".to_string());
    }

    // For DOIO/Megalodon, we need multiple interfaces:
    // - Consumer Control (0x0C:0x01) for left and middle knobs
    // - Keyboard (0x01:0x06) for right knob AND key presses
    let consumer_control = supported
        .iter()
        .find(|d| d.usage_page == USAGE_PAGE_CONSUMER && d.usage == USAGE_CONSUMER_CONTROL);

    let keyboard = supported
        .iter()
        .find(|d| d.usage_page == USAGE_PAGE_GENERIC_DESKTOP && d.usage == USAGE_KEYBOARD);

    let mut connected_any = false;
    let mut first_device_info: Option<HidDeviceInfo> = None;

    if let Some(dev) = consumer_control {
        log::debug!("[HID] Connecting to Consumer Control: {}", dev.path);
        if let Err(e) = connect_device_internal(&dev.path, false) {
            log::debug!("[HID] Failed to connect to Consumer Control: {}", e);
        } else {
            connected_any = true;
            first_device_info = Some(dev.clone());
        }
    }

    if let Some(dev) = keyboard {
        log::debug!("[HID] Connecting to Keyboard: {}", dev.path);
        if let Err(e) = connect_device_internal(&dev.path, false) {
            log::debug!("[HID] Failed to connect to Keyboard: {}", e);
        } else {
            connected_any = true;
            if first_device_info.is_none() {
                first_device_info = Some(dev.clone());
            }
        }
    }

    if !connected_any {
        return Err("Failed to connect to any DOIO interface".to_string());
    }

    with_hid_engine(|state| {
        state.status = HidStatus {
            is_connected: true,
            device: first_device_info,
            error: None,
            is_searching: false,
        };
    });

    emit_status_changed();
    Ok(())
}

pub fn disconnect_device() -> Result<(), String> {
    let was_connected = with_hid_engine(|state| {
        let was = state.status.is_connected;
        *state.should_stop.lock().unwrap() = true;
        *state.active_readers.lock().unwrap() = 0;
        state.status = HidStatus {
            is_connected: false,
            device: None,
            error: None,
            is_searching: *state.auto_connect_enabled.lock().unwrap(),
        };
        state.pressed_keys.clear();
        was
    });

    if was_connected {
        log::debug!("[HID] Disconnected from all devices");
        emit_status_changed();
    }

    std::thread::sleep(std::time::Duration::from_millis(50));
    Ok(())
}

pub fn get_status() -> HidStatus {
    with_hid_engine(|state| state.status.clone())
}

pub(crate) fn connect_device_internal(path: &str, update_status: bool) -> Result<(), String> {
    let devices = list_devices()?;
    let device_info = devices
        .into_iter()
        .find(|d| d.path == path)
        .ok_or_else(|| "Device not found".to_string())?;

    let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

    let device = api
        .open_path(std::ffi::CString::new(path).unwrap().as_c_str())
        .map_err(|e| format!("Failed to open device: {}", e))?;

    device
        .set_blocking_mode(false)
        .map_err(|e| format!("Failed to set non-blocking mode: {}", e))?;

    with_hid_engine(|state| {
        *state.should_stop.lock().unwrap() = false;
        *state.active_readers.lock().unwrap() += 1;
    });

    if update_status {
        with_hid_engine(|state| {
            state.status = HidStatus {
                is_connected: true,
                device: Some(device_info.clone()),
                error: None,
                is_searching: false,
            };
        });
        emit_status_changed();
    }

    start_reading_thread(device);

    log::debug!(
        "[HID] Connected to device: {} ({})",
        device_info.interface_description,
        path
    );

    Ok(())
}
