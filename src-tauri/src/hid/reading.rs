//! HID device reading thread.

use hidapi::HidDevice;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::Emitter;

use super::constants::POLL_INTERVAL_MS;
use super::engine::{with_hid_engine, HidEngineState, HID_ENGINE};
use super::parsing::{parse_and_emit_key_events, parse_encoder_event};
use super::types::{HidEncoderEvent, HidRawReport, HidStatus};

/// Apply an encoder delta to the mapped parameter, if any mapping exists.
fn apply_encoder_to_parameter(event: &HidEncoderEvent, engine: &Arc<Mutex<HidEngineState>>) {
    // Grab the mapping and app handle in one lock, then release immediately
    let (mapping, app_handle) = {
        let state = engine.lock().unwrap_or_else(|p| p.into_inner());
        let m = state
            .mappings
            .iter()
            .find(|m| m.encoder_index == event.encoder_index)
            .cloned();
        (m, state.app_handle.clone())
    };

    let Some(mapping) = mapping else { return };
    if mapping.parameter_id.is_empty() {
        return;
    }

    // Determine the range for this parameter
    let param_max = if mapping.parameter_id.contains("_color_")
        && (mapping.parameter_id.ends_with("_r")
            || mapping.parameter_id.ends_with("_g")
            || mapping.parameter_id.ends_with("_b"))
    {
        255.0_f64
    } else {
        1.0_f64
    };

    let delta = if mapping.inverted {
        -event.delta as f64
    } else {
        event.delta as f64
    };
    let step = mapping.sensitivity * delta * param_max;

    // Read current value, apply delta, clamp, write back
    let current =
        crate::with_parameter_store(|store| store.get(&mapping.parameter_id).map(|p| p.target));
    let current = current.unwrap_or(0.0);
    let next = (current + step).clamp(0.0, param_max);

    crate::with_parameter_store(|store| {
        store.set_target(mapping.parameter_id.clone(), next);
    });

    // Emit parameter_changed so the UI updates live
    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(&mapping.parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    log::debug!(
        "[HID] Encoder {} → {} = {:.4} (delta {})",
        event.encoder_index,
        mapping.parameter_id,
        next,
        event.delta
    );
}

/// Start a background thread to read HID reports from a device.
pub fn start_reading_thread(device: HidDevice) {
    let should_stop = with_hid_engine(|state| state.should_stop.clone());
    let active_readers = with_hid_engine(|state| state.active_readers.clone());
    let engine = HID_ENGINE.clone();

    thread::spawn(move || {
        let mut buf = [0u8; 64];

        loop {
            if *should_stop.lock().unwrap_or_else(|p| p.into_inner()) {
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
                        let mut count = active_readers.lock().unwrap_or_else(|p| p.into_inner());
                        if *count > 0 {
                            *count -= 1;
                        }
                        *count
                    };

                    if remaining == 0 {
                        let mut state = engine.lock().unwrap_or_else(|p| p.into_inner());
                        let is_searching = *state
                            .auto_connect_enabled
                            .lock()
                            .unwrap_or_else(|p| p.into_inner());
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
            let mut count = active_readers.lock().unwrap_or_else(|p| p.into_inner());
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
        let state = engine.lock().unwrap_or_else(|p| p.into_inner());
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
        // Apply mapping to parameter store if one exists
        apply_encoder_to_parameter(&event, engine);

        let state = engine.lock().unwrap_or_else(|p| p.into_inner());
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
