//! HID device reading thread.

use hidapi::HidDevice;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;

use super::constants::POLL_INTERVAL_MS;
use super::engine::{with_hid_engine, HidEngineState, HID_ENGINE};
use super::parsing::{parse_and_emit_key_events, parse_encoder_event};
use super::types::{HidRawReport, HidStatus};

/// Start a background thread to read HID reports from a device.
pub fn start_reading_thread(device: HidDevice) {
    let should_stop = with_hid_engine(|state| state.should_stop.clone());
    let active_readers = with_hid_engine(|state| state.active_readers.clone());
    let engine = HID_ENGINE.clone();

    thread::spawn(move || {
        let mut buf = [0u8; 64];

        loop {
            if *should_stop.lock().unwrap() {
                break;
            }

            match device.read_timeout(&mut buf, POLL_INTERVAL_MS as i32) {
                Ok(0) => continue,
                Ok(size) => {
                    handle_hid_report(&buf[..size], &engine);
                }
                Err(e) => {
                    log::error!("[HID] Read error: {}", e);
                    let remaining = {
                        let mut count = active_readers.lock().unwrap();
                        if *count > 0 {
                            *count -= 1;
                        }
                        *count
                    };

                    if remaining == 0 {
                        let mut state = engine.lock().unwrap();
                        let is_searching = *state.auto_connect_enabled.lock().unwrap();
                        state.status = HidStatus {
                            is_connected: false,
                            device: None,
                            error: Some(format!("Device read error: {}", e)),
                            is_searching,
                        };
                        state.pressed_keys.clear();
                        let status = state.status.clone();
                        let handle = state.app_handle.clone();
                        drop(state);
                        if let Some(h) = handle {
                            let _ = h.emit("hid_status_changed", &status);
                        }
                    }
                    break;
                }
            }
        }

        {
            let mut count = active_readers.lock().unwrap();
            if *count > 0 {
                *count -= 1;
            }
        }

        log::debug!("[HID] Reading thread exiting");
    });
}

fn handle_hid_report(data: &[u8], engine: &Arc<Mutex<HidEngineState>>) {
    log::trace!("[HID] Raw report ({} bytes): {:?}", data.len(), data);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Emit raw report for debugging
    {
        let state = engine.lock().unwrap();
        if let Some(handle) = &state.app_handle {
            let hex = data
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            let raw_report = HidRawReport {
                hex,
                bytes: data.to_vec(),
                size: data.len(),
                timestamp,
            };
            let _ = handle.emit("hid_raw_report", &raw_report);
        }
    }

    // Try encoder events first
    if let Some(event) = parse_encoder_event(data, timestamp) {
        let state = engine.lock().unwrap();
        if let Some(handle) = &state.app_handle {
            let _ = handle.emit("hid_encoder", &event);
        }
        log::debug!(
            "[HID] Encoder event: index={}, delta={}",
            event.encoder_index,
            event.delta
        );
        return;
    }

    // Try key events (keyboard NKRO report)
    parse_and_emit_key_events(data, timestamp, engine);
}
