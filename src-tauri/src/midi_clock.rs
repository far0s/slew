//! MIDI Clock input engine.
//!
//! Listens on a user-selected MIDI input port for 0xF8 timing bytes (24 PPQN).
//! Computes BPM from the interval between pulses and reports beats to the BPM
//! source arbitration layer via `crate::bpm::report_beat`.

use midir::{Ignore, MidiInput, MidiInputConnection};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tauri::{AppHandle, Emitter};

use crate::bpm::BpmSourceKind;
use crate::common::persistence;
use crate::midi::types::MidiDeviceInfo;

// ============================================================================
// Types
// ============================================================================

/// Status reported to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiClockStatus {
    pub device_id: Option<String>,
    pub is_connected: bool,
    pub bpm: Option<f64>,
    pub phase_offset: f64,
}

/// Persisted preference: which port to auto-connect on start.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MidiClockPrefs {
    device_id: String,
    #[serde(default)]
    phase_offset: f64,
}

const PREFS_FILENAME: &str = "midi_clock_prefs.json";
const RING_BUF_SIZE: usize = 8;
const PULSES_PER_BEAT: u32 = 24;
const BPM_MIN: f64 = 20.0;
const BPM_MAX: f64 = 300.0;

// ============================================================================
// Global state
// ============================================================================

struct MidiClockState {
    device_id: Option<String>,
    connection: Option<MidiInputConnection<()>>,
    app_handle: Option<AppHandle>,
    /// Ring buffer of the last RING_BUF_SIZE pulse timestamps.
    pulse_times: VecDeque<Instant>,
    /// How many pulses seen since the last beat report.
    pulse_count: u32,
    /// Last computed BPM (for status queries).
    current_bpm: Option<f64>,
    /// Phase offset in beats (-0.5..0.5), shifts which pulse fires the beat.
    phase_offset: f64,
}

impl MidiClockState {
    fn new() -> Self {
        Self {
            device_id: None,
            connection: None,
            app_handle: None,
            pulse_times: VecDeque::with_capacity(RING_BUF_SIZE),
            pulse_count: 0,
            current_bpm: None,
            phase_offset: 0.0,
        }
    }
}

static MIDI_CLOCK_ENGINE: Lazy<Arc<Mutex<MidiClockState>>> =
    Lazy::new(|| Arc::new(Mutex::new(MidiClockState::new())));

fn with_midi_clock_engine<T, F: FnOnce(&mut MidiClockState) -> T>(f: F) -> T {
    let mut state = MIDI_CLOCK_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize the MIDI clock engine and auto-reconnect if a preference is saved.
pub fn init_midi_clock_engine(app_handle: AppHandle) {
    with_midi_clock_engine(|state| {
        state.app_handle = Some(app_handle.clone());
    });

    // Auto-reconnect from saved prefs.
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        if let Some(prefs) = persistence::load_json::<MidiClockPrefs>(&path, "MidiClock") {
            // Restore phase offset before reconnecting.
            with_midi_clock_engine(|state| {
                state.phase_offset = prefs.phase_offset;
            });
            log::debug!(
                "[MidiClock] Auto-reconnecting to saved device: {}",
                prefs.device_id
            );
            if let Err(e) = connect_midi_clock(prefs.device_id, Some(app_handle)) {
                log::warn!("[MidiClock] Auto-reconnect failed: {}", e);
            }
        }
    }

    log::debug!("[MidiClock] Engine initialized");
}

// ============================================================================
// Port listing
// ============================================================================

/// Return all available MIDI input ports (same list as regular MIDI input).
pub fn list_midi_clock_ports() -> Vec<MidiDeviceInfo> {
    let midi_in = match MidiInput::new("slew-clock-probe") {
        Ok(m) => m,
        Err(e) => {
            log::warn!("[MidiClock] Failed to create MIDI input for listing: {}", e);
            return vec![];
        }
    };

    midi_in
        .ports()
        .iter()
        .enumerate()
        .map(|(i, port)| {
            let name = midi_in
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI Port {}", i));
            let connected =
                with_midi_clock_engine(|state| state.device_id.as_deref() == Some(&i.to_string()));
            MidiDeviceInfo {
                id: i.to_string(),
                name,
                is_connected: connected,
            }
        })
        .collect()
}

// ============================================================================
// Connect / Disconnect
// ============================================================================

/// Open the named MIDI port and start listening for 0xF8 timing bytes.
pub fn connect_midi_clock(device_id: String, app_handle: Option<AppHandle>) -> Result<(), String> {
    // Disconnect any existing connection first.
    let _ = disconnect_midi_clock();

    let port_idx: usize = device_id
        .parse()
        .map_err(|_| format!("Invalid MIDI clock device ID: {}", device_id))?;

    let mut midi_in = MidiInput::new("slew-clock-input")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    // IMPORTANT: do NOT ignore timing messages.
    midi_in.ignore(Ignore::None);

    let ports = midi_in.ports();
    let port = ports
        .get(port_idx)
        .ok_or_else(|| format!("MIDI clock port {} not found", device_id))?;

    let port_name = midi_in
        .port_name(port)
        .unwrap_or_else(|_| format!("MIDI Port {}", port_idx));

    let engine = MIDI_CLOCK_ENGINE.clone();

    let connection = midi_in
        .connect(
            port,
            "slew-midi-clock",
            move |_timestamp_us, message, _| {
                handle_clock_message(&engine, message);
            },
            (),
        )
        .map_err(|e| format!("Failed to connect to MIDI clock port: {}", e))?;

    with_midi_clock_engine(|state| {
        state.device_id = Some(device_id.clone());
        state.connection = Some(connection);
        state.pulse_times.clear();
        state.pulse_count = 0;
        state.current_bpm = None;
        if let Some(h) = app_handle {
            state.app_handle = Some(h);
        }
    });

    log::debug!(
        "[MidiClock] Connected to port {} ({})",
        device_id,
        port_name
    );
    emit_status_changed();

    // Persist preference.
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        let current_phase = with_midi_clock_engine(|s| s.phase_offset);
        let prefs = MidiClockPrefs {
            device_id,
            phase_offset: current_phase,
        };
        if let Err(e) = persistence::save_json(&path, &prefs, "MidiClock") {
            log::warn!("[MidiClock] Failed to save prefs: {}", e);
        }
    }

    Ok(())
}

/// Close the current MIDI clock connection.
pub fn disconnect_midi_clock() -> Result<(), String> {
    let had_connection = with_midi_clock_engine(|state| {
        let had = state.connection.is_some();
        if let Some(conn) = state.connection.take() {
            conn.close();
        }
        state.device_id = None;
        state.pulse_times.clear();
        state.pulse_count = 0;
        state.current_bpm = None;
        had
    });

    if had_connection {
        log::debug!("[MidiClock] Disconnected");
        emit_status_changed();
    }

    Ok(())
}

// ============================================================================
// BPM computation
// ============================================================================

/// Handle a raw MIDI message byte array from the clock port.
fn handle_clock_message(engine: &Arc<Mutex<MidiClockState>>, message: &[u8]) {
    // 0xF8 = MIDI timing clock pulse
    if message.first() != Some(&0xF8) {
        return;
    }

    let now = Instant::now();
    let app_handle;
    let maybe_bpm;
    let pulse_count_for_beat;

    {
        let mut state = engine.lock().unwrap();

        // Push timestamp into ring buffer (keep last RING_BUF_SIZE entries).
        if state.pulse_times.len() >= RING_BUF_SIZE {
            state.pulse_times.pop_front();
        }
        state.pulse_times.push_back(now);

        // Compute BPM from median interval if we have at least 2 timestamps.
        maybe_bpm = compute_bpm(&state.pulse_times);
        if let Some(bpm) = maybe_bpm {
            state.current_bpm = Some(bpm);
        }

        state.pulse_count += 1;
        pulse_count_for_beat = state.pulse_count;
        if state.pulse_count >= PULSES_PER_BEAT {
            state.pulse_count = 0;
        }

        app_handle = state.app_handle.clone();
    }

    // Determine which pulse index (0-based) within the 24-pulse cycle fires the beat.
    // phase_offset is in beats: 0.0=first pulse, 0.5=mid-cycle, etc.
    let offset_pulses = {
        let phase = with_midi_clock_engine(|s| s.phase_offset);
        ((phase * PULSES_PER_BEAT as f64).round() as i32).rem_euclid(PULSES_PER_BEAT as i32) as u32
    };

    // Fire beat when pulse_count_for_beat (1-based, pre-reset) equals offset_pulses+1.
    // Special case: offset_pulses=0 fires at the natural boundary (count >= PULSES_PER_BEAT).
    let fire_beat = if offset_pulses == 0 {
        pulse_count_for_beat >= PULSES_PER_BEAT
    } else {
        pulse_count_for_beat == offset_pulses
    };
    if fire_beat {
        crate::bpm::report_beat(BpmSourceKind::MidiClock, maybe_bpm, app_handle.as_ref());
        log::debug!("[MidiClock] Beat @ {:?} BPM", maybe_bpm);
        // Also emit status so frontend can see live BPM.
        emit_status_changed_with_handle(app_handle.as_ref());
    }
}

/// Compute BPM from a slice of pulse timestamps using median interval.
fn compute_bpm(times: &VecDeque<Instant>) -> Option<f64> {
    if times.len() < 2 {
        return None;
    }

    let mut intervals: Vec<f64> = times
        .iter()
        .collect::<Vec<_>>()
        .windows(2)
        .map(|w| w[1].duration_since(*w[0]).as_secs_f64())
        .filter(|&d| d > 0.0)
        .collect();

    if intervals.is_empty() {
        return None;
    }

    // Median
    intervals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = if intervals.len() % 2 == 0 {
        (intervals[intervals.len() / 2 - 1] + intervals[intervals.len() / 2]) / 2.0
    } else {
        intervals[intervals.len() / 2]
    };

    if median <= 0.0 {
        return None;
    }

    let bpm = 60.0 / (median * PULSES_PER_BEAT as f64);
    Some(bpm.clamp(BPM_MIN, BPM_MAX))
}

// ============================================================================
// Status
// ============================================================================

/// Return the current MIDI clock status.
pub fn get_midi_clock_status() -> MidiClockStatus {
    with_midi_clock_engine(|state| MidiClockStatus {
        device_id: state.device_id.clone(),
        is_connected: state.connection.is_some(),
        bpm: state.current_bpm,
        phase_offset: state.phase_offset,
    })
}

/// Set the phase offset (in beats, -0.5..0.5) and persist it.
pub fn set_midi_clock_phase_offset(offset: f64) {
    let clamped = offset.clamp(-0.5, 0.5);
    with_midi_clock_engine(|state| {
        state.phase_offset = clamped;
    });

    // Persist with existing device_id (if any).
    if let Some(path) = persistence::local_data_path(PREFS_FILENAME) {
        let existing = persistence::load_json::<MidiClockPrefs>(&path, "MidiClock");
        if let Some(mut prefs) = existing {
            prefs.phase_offset = clamped;
            if let Err(e) = persistence::save_json(&path, &prefs, "MidiClock") {
                log::warn!("[MidiClock] Failed to save phase_offset prefs: {}", e);
            }
        }
    }

    emit_status_changed();
}

fn emit_status_changed() {
    let app_handle = with_midi_clock_engine(|state| state.app_handle.clone());
    emit_status_changed_with_handle(app_handle.as_ref());
}

fn emit_status_changed_with_handle(handle: Option<&AppHandle>) {
    if let Some(h) = handle {
        let status = with_midi_clock_engine(|state| MidiClockStatus {
            device_id: state.device_id.clone(),
            is_connected: state.connection.is_some(),
            bpm: state.current_bpm,
            phase_offset: state.phase_offset,
        });
        let _ = h.emit("midi_clock_status_changed", status);
    }
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub fn list_midi_clock_ports_cmd() -> Vec<MidiDeviceInfo> {
    list_midi_clock_ports()
}

#[tauri::command]
pub fn connect_midi_clock_cmd(device_id: String) -> Result<(), String> {
    connect_midi_clock(device_id, None)
}

#[tauri::command]
pub fn disconnect_midi_clock_cmd() -> Result<(), String> {
    disconnect_midi_clock()
}

#[tauri::command]
pub fn get_midi_clock_status_cmd() -> MidiClockStatus {
    get_midi_clock_status()
}

#[tauri::command]
pub fn set_midi_clock_phase_offset_cmd(offset: f64) {
    set_midi_clock_phase_offset(offset);
}
