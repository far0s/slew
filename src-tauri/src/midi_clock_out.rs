//! MIDI Clock output (master send mode).
//!
//! Sends 0xF8 timing pulses to a MIDI output device at the current internal
//! BPM from `bpm::get_active_bpm()`. Uses a background thread for timing.
//! 24 PPQN — one pulse every `60 / (bpm * 24)` seconds.

use midir::MidiOutput;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::AppHandle;

use crate::common::persistence;

// ============================================================================
// Types
// ============================================================================

/// Status reported to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiClockOutStatus {
    pub enabled: bool,
    pub device_id: Option<String>,
    pub device_name: Option<String>,
}

/// Persisted prefs.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MidiClockOutPrefs {
    device_id: String,
    #[serde(default)]
    device_name: Option<String>,
}

const PREFS_FILENAME: &str = "midi_clock_out_prefs.json";
const PULSE_BYTE: u8 = 0xF8;
const PULSES_PER_BEAT: u64 = 24;
const FALLBACK_BPM: f64 = 120.0;

// ============================================================================
// Global state
// ============================================================================

struct MidiClockOutState {
    enabled: bool,
    device_id: Option<String>,
    device_name: Option<String>,
    stop_tx: Option<Sender<()>>,
    _thread_handle: Option<JoinHandle<()>>,
}

impl MidiClockOutState {
    fn new() -> Self {
        Self {
            enabled: false,
            device_id: None,
            device_name: None,
            stop_tx: None,
            _thread_handle: None,
        }
    }
}

static MIDI_CLOCK_OUT_ENGINE: Lazy<Arc<Mutex<MidiClockOutState>>> =
    Lazy::new(|| Arc::new(Mutex::new(MidiClockOutState::new())));

fn with_engine<T, F: FnOnce(&mut MidiClockOutState) -> T>(f: F) -> T {
    let mut state = MIDI_CLOCK_OUT_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize and auto-reconnect from saved prefs.
pub fn init_midi_clock_out_engine(_app_handle: AppHandle) {
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        if let Some(prefs) = persistence::load_json::<MidiClockOutPrefs>(&path, "MidiClockOut") {
            log::debug!(
                "[MidiClockOut] Auto-enabling with saved device: {}",
                prefs.device_id
            );
            if let Err(e) = enable_midi_clock_out(prefs.device_id) {
                log::warn!("[MidiClockOut] Auto-enable failed: {}", e);
            }
        }
    }
    log::debug!("[MidiClockOut] Engine initialized");
}

// ============================================================================
// Enable / Disable
// ============================================================================

/// Start sending MIDI clock pulses to the given output device.
pub fn enable_midi_clock_out(device_id: String) -> Result<(), String> {
    // Stop any running thread first.
    stop_clock_thread();

    // Resolve device name from the port index.
    let port_idx: usize = device_id
        .parse()
        .map_err(|_| format!("Invalid MIDI output device ID: {}", device_id))?;

    let device_name = {
        let midi_out = MidiOutput::new("slew-clock-out-probe")
            .map_err(|e| format!("Failed to create MIDI output: {}", e))?;
        let ports = midi_out.ports();
        let port = ports
            .get(port_idx)
            .ok_or_else(|| format!("MIDI output port {} not found", device_id))?;
        midi_out
            .port_name(port)
            .unwrap_or_else(|_| format!("MIDI Port {}", port_idx))
    };

    let (stop_tx, stop_rx) = mpsc::channel::<()>();

    let device_id_clone = device_id.clone();
    let device_name_clone = device_name.clone();

    let handle = thread::spawn(move || {
        clock_thread(device_id_clone, device_name_clone, stop_rx);
    });

    with_engine(|state| {
        state.enabled = true;
        state.device_id = Some(device_id.clone());
        state.device_name = Some(device_name.clone());
        state.stop_tx = Some(stop_tx);
        state._thread_handle = Some(handle);
    });

    // Persist prefs.
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        let prefs = MidiClockOutPrefs {
            device_id: device_id.clone(),
            device_name: Some(device_name),
        };
        if let Err(e) = persistence::save_json(&path, &prefs, "MidiClockOut") {
            log::warn!("[MidiClockOut] Failed to save prefs: {}", e);
        }
    }

    log::info!("[MidiClockOut] Started sending to port {}", device_id);
    Ok(())
}

/// Stop sending MIDI clock pulses.
pub fn disable_midi_clock_out() -> Result<(), String> {
    stop_clock_thread();

    with_engine(|state| {
        state.enabled = false;
        state.device_id = None;
        state.device_name = None;
    });

    // Remove prefs so we don't auto-reconnect.
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        let _ = std::fs::remove_file(&path);
    }

    log::info!("[MidiClockOut] Stopped");
    Ok(())
}

/// Signal the background thread to stop and wait for it.
fn stop_clock_thread() {
    let (stop_tx, handle) =
        with_engine(|state| (state.stop_tx.take(), state._thread_handle.take()));

    if let Some(tx) = stop_tx {
        let _ = tx.send(());
    }
    if let Some(h) = handle {
        let _ = h.join();
    }
}

// ============================================================================
// Clock thread
// ============================================================================

fn clock_thread(device_id: String, device_name: String, stop_rx: mpsc::Receiver<()>) {
    let port_idx: usize = match device_id.parse() {
        Ok(i) => i,
        Err(_) => {
            log::error!("[MidiClockOut] Invalid port index in thread: {}", device_id);
            return;
        }
    };

    log::debug!(
        "[MidiClockOut] Thread started for port {} ({})",
        device_id,
        device_name
    );

    'outer: loop {
        // Open a fresh connection.
        let midi_out = match MidiOutput::new("slew-clock-out") {
            Ok(m) => m,
            Err(e) => {
                log::warn!("[MidiClockOut] Failed to create MidiOutput: {}", e);
                thread::sleep(Duration::from_millis(500));
                // Check stop signal.
                if stop_rx.try_recv().is_ok() {
                    break;
                }
                continue;
            }
        };

        let ports = midi_out.ports();
        let port = match ports.get(port_idx) {
            Some(p) => p,
            None => {
                log::warn!("[MidiClockOut] Port {} no longer available", device_id);
                thread::sleep(Duration::from_millis(1000));
                if stop_rx.try_recv().is_ok() {
                    break;
                }
                continue;
            }
        };

        let mut conn = match midi_out.connect(port, "slew-midi-clock-out") {
            Ok(c) => c,
            Err(e) => {
                log::warn!(
                    "[MidiClockOut] Failed to connect to port {}: {}",
                    device_id,
                    e
                );
                thread::sleep(Duration::from_millis(500));
                if stop_rx.try_recv().is_ok() {
                    break;
                }
                continue;
            }
        };

        log::debug!("[MidiClockOut] Connected and sending pulses");

        // Pulse loop — reconnects if send fails.
        loop {
            // Check stop signal without blocking.
            match stop_rx.try_recv() {
                Ok(_) | Err(mpsc::TryRecvError::Disconnected) => break 'outer,
                Err(mpsc::TryRecvError::Empty) => {}
            }

            // Get current BPM; use fallback if no source active.
            let bpm = crate::bpm::get_active_bpm().unwrap_or(FALLBACK_BPM);
            let interval_secs = 60.0 / (bpm * PULSES_PER_BEAT as f64);

            // Send the timing pulse.
            if let Err(e) = conn.send(&[PULSE_BYTE]) {
                log::warn!("[MidiClockOut] Send failed, reconnecting: {}", e);
                break; // Reconnect on next outer iteration.
            }

            thread::sleep(Duration::from_secs_f64(interval_secs));
        }
    }

    log::debug!("[MidiClockOut] Thread exited");
}

// ============================================================================
// Status
// ============================================================================

pub fn get_midi_clock_out_status() -> MidiClockOutStatus {
    with_engine(|state| MidiClockOutStatus {
        enabled: state.enabled,
        device_id: state.device_id.clone(),
        device_name: state.device_name.clone(),
    })
}

/// List available MIDI output ports for the frontend selector.
pub fn list_midi_output_ports_for_clock() -> Vec<crate::midi::types::MidiDeviceInfo> {
    let midi_out = match MidiOutput::new("slew-clock-out-list") {
        Ok(m) => m,
        Err(e) => {
            log::warn!("[MidiClockOut] Failed to list ports: {}", e);
            return vec![];
        }
    };

    let current_id = with_engine(|s| s.device_id.clone());

    midi_out
        .ports()
        .iter()
        .enumerate()
        .map(|(i, port)| {
            let name = midi_out
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI Port {}", i));
            let id = i.to_string();
            let is_connected = current_id.as_deref() == Some(&id);
            crate::midi::types::MidiDeviceInfo {
                id,
                name,
                is_connected,
            }
        })
        .collect()
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn enable_midi_clock_out_cmd(device_id: String) -> Result<(), String> {
    enable_midi_clock_out(device_id)
}

#[tauri::command]
pub fn disable_midi_clock_out_cmd() -> Result<(), String> {
    disable_midi_clock_out()
}

#[tauri::command]
pub fn get_midi_clock_out_status_cmd() -> MidiClockOutStatus {
    get_midi_clock_out_status()
}

#[tauri::command]
pub fn list_midi_clock_out_ports_cmd() -> Vec<crate::midi::types::MidiDeviceInfo> {
    list_midi_output_ports_for_clock()
}
