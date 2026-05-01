//! HID engine state and initialization.

use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use super::connections::connect_supported_device;
use super::constants::AUTO_CONNECT_INTERVAL_MS;
use super::devices::list_supported_devices;
use super::mappings::load_mappings_from_disk;
use super::types::{HidMapping, HidStatus};

pub struct HidEngineState {
    pub status: HidStatus,
    pub mappings: Vec<HidMapping>,
    pub app_handle: Option<AppHandle>,
    pub should_stop: Arc<Mutex<bool>>,
    pub active_readers: Arc<Mutex<u32>>,
    pub auto_connect_enabled: Arc<Mutex<bool>>,
    pub pressed_keys: Vec<u8>,
}

impl Default for HidEngineState {
    fn default() -> Self {
        Self {
            status: HidStatus {
                is_connected: false,
                device: None,
                error: None,
                is_searching: false,
            },
            mappings: Vec::new(),
            app_handle: None,
            should_stop: Arc::new(Mutex::new(false)),
            active_readers: Arc::new(Mutex::new(0)),
            auto_connect_enabled: Arc::new(Mutex::new(true)),
            pressed_keys: Vec::new(),
        }
    }
}

pub static HID_ENGINE: Lazy<Arc<Mutex<HidEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(HidEngineState::default())));

pub fn with_hid_engine<F, R>(f: F) -> R
where
    F: FnOnce(&mut HidEngineState) -> R,
{
    let mut state = HID_ENGINE.lock().unwrap();
    f(&mut state)
}

pub fn init_hid_engine(app: &AppHandle) {
    with_hid_engine(|state| {
        state.app_handle = Some(app.clone());
    });

    load_mappings_from_disk();

    let mapping_count = with_hid_engine(|state| state.mappings.len());
    log::debug!("[HID] Engine initialized with {} mappings", mapping_count);

    start_auto_connect_thread();
}

fn start_auto_connect_thread() {
    let engine = HID_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[HID] Auto-connect thread started");

        loop {
            let (enabled, is_connected) = {
                let state = engine.lock().unwrap();
                let enabled = *state.auto_connect_enabled.lock().unwrap();
                let is_connected = state.status.is_connected;
                (enabled, is_connected)
            };

            if !enabled {
                thread::sleep(Duration::from_millis(AUTO_CONNECT_INTERVAL_MS));
                continue;
            }

            if !is_connected {
                // Update status to searching
                {
                    let mut state = engine.lock().unwrap();
                    if !state.status.is_searching {
                        state.status.is_searching = true;
                        let status = state.status.clone();
                        let handle = state.app_handle.clone();
                        drop(state);
                        if let Some(h) = handle {
                            let _ = h.emit("hid_status_changed", &status);
                        }
                    }
                }

                match list_supported_devices() {
                    Ok(devices) if !devices.is_empty() => {
                        log::debug!(
                            "[HID] Auto-connect: Found {} supported device interface(s)",
                            devices.len()
                        );

                        if let Err(e) = connect_supported_device() {
                            log::debug!("[HID] Auto-connect failed: {}", e);
                        } else {
                            log::debug!("[HID] Auto-connect successful");
                        }
                    }
                    Ok(_) => {}
                    Err(e) => {
                        log::debug!("[HID] Auto-connect device scan error: {}", e);
                    }
                }
            } else {
                let mut state = engine.lock().unwrap();
                if state.status.is_searching {
                    state.status.is_searching = false;
                    let status = state.status.clone();
                    let handle = state.app_handle.clone();
                    drop(state);
                    if let Some(h) = handle {
                        let _ = h.emit("hid_status_changed", &status);
                    }
                }
            }

            thread::sleep(Duration::from_millis(AUTO_CONNECT_INTERVAL_MS));
        }
    });
}

pub fn set_auto_connect(enabled: bool) {
    with_hid_engine(|state| {
        *state.auto_connect_enabled.lock().unwrap() = enabled;
    });
    log::debug!(
        "[HID] Auto-connect {}",
        if enabled { "enabled" } else { "disabled" }
    );
}

pub fn is_auto_connect_enabled() -> bool {
    with_hid_engine(|state| *state.auto_connect_enabled.lock().unwrap())
}
