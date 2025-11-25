//! MIDI Input Engine
//!
//! Provides MIDI device enumeration, connection management, message parsing,
//! and MIDI Learn functionality for binding controllers to parameters.

use midir::{Ignore, MidiInput, MidiInputConnection};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Types
// ============================================================================

/// Information about an available MIDI input device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiDeviceInfo {
    /// Unique identifier for the device (port index as string for now)
    pub id: String,
    /// Human-readable device name
    pub name: String,
    /// Whether this device is currently connected/opened
    pub is_connected: bool,
}

/// A MIDI mapping that binds a CC message to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMapping {
    /// The parameter ID this mapping controls
    pub parameter_id: String,
    /// MIDI channel (0-15, or None for any channel)
    pub channel: Option<u8>,
    /// CC number (0-127)
    pub cc_number: u8,
    /// Minimum output value (maps from CC 0)
    pub min_value: f64,
    /// Maximum output value (maps from CC 127)
    pub max_value: f64,
    /// Optional: device ID this mapping is specific to (None = any device)
    pub device_id: Option<String>,
}

/// A raw MIDI message for UI display / activity indicators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMessage {
    /// Device ID that sent the message
    pub device_id: String,
    /// MIDI channel (0-15)
    pub channel: u8,
    /// Message type: "cc", "note_on", "note_off", "pitch_bend", "other"
    pub message_type: String,
    /// Control number (CC) or note number
    pub control: u8,
    /// Value (0-127 for CC/notes, 0-16383 for pitch bend)
    pub value: u16,
    /// Timestamp in milliseconds since some epoch
    pub timestamp: u64,
}

/// State for MIDI Learn mode.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiLearnState {
    /// Whether learn mode is active
    pub is_learning: bool,
    /// The parameter ID we're learning a mapping for
    pub parameter_id: Option<String>,
}

/// Event emitted when MIDI Learn captures a mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiLearnComplete {
    /// The captured mapping
    pub mapping: MidiMapping,
}

// ============================================================================
// Global State
// ============================================================================

/// Holds an active MIDI connection along with its device info.
struct ActiveConnection {
    #[allow(dead_code)]
    device_id: String,
    #[allow(dead_code)]
    device_name: String,
    // The connection must be kept alive; dropping it closes the port.
    // We use Option to allow taking ownership when closing.
    connection: Option<MidiInputConnection<()>>,
}

/// Global MIDI engine state.
struct MidiEngineState {
    /// Currently open connections, keyed by device ID
    connections: HashMap<String, ActiveConnection>,
    /// All known mappings
    mappings: Vec<MidiMapping>,
    /// MIDI Learn state
    learn_state: MidiLearnState,
    /// App handle for emitting events (set during init)
    app_handle: Option<AppHandle>,
}

impl Default for MidiEngineState {
    fn default() -> Self {
        Self {
            connections: HashMap::new(),
            mappings: Vec::new(),
            learn_state: MidiLearnState {
                is_learning: false,
                parameter_id: None,
            },
            app_handle: None,
        }
    }
}

static MIDI_ENGINE: Lazy<Arc<Mutex<MidiEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(MidiEngineState::default())));

/// Helper to access the MIDI engine state.
fn with_midi_engine<T, F: FnOnce(&mut MidiEngineState) -> T>(f: F) -> T {
    let mut state = MIDI_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize the MIDI engine with an app handle for event emission.
/// Call this during Tauri setup.
pub fn init_midi_engine(app_handle: AppHandle) {
    with_midi_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    // Load mappings from disk
    load_mappings_from_disk();

    log::info!("[MIDI] Engine initialized");
}

// ============================================================================
// Device Enumeration
// ============================================================================

/// List all available MIDI input devices.
pub fn list_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    let midi_in = MidiInput::new("sebcat-vj-probe")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();
    let connected_ids: Vec<String> =
        with_midi_engine(|state| state.connections.keys().cloned().collect());

    let mut devices = Vec::new();
    for (idx, port) in ports.iter().enumerate() {
        let name = midi_in
            .port_name(port)
            .unwrap_or_else(|_| format!("Unknown Device {}", idx));
        let id = format!("{}", idx);
        let is_connected = connected_ids.contains(&id);

        devices.push(MidiDeviceInfo {
            id,
            name,
            is_connected,
        });
    }

    Ok(devices)
}

// ============================================================================
// Connection Management
// ============================================================================

/// Open a MIDI device for input.
pub fn open_device(device_id: String) -> Result<(), String> {
    // Check if already connected
    let already_connected = with_midi_engine(|state| state.connections.contains_key(&device_id));

    if already_connected {
        return Err(format!("Device {} is already connected", device_id));
    }

    // Parse device ID as port index
    let port_idx: usize = device_id
        .parse()
        .map_err(|_| format!("Invalid device ID: {}", device_id))?;

    // Create MIDI input
    let midi_in = MidiInput::new("sebcat-vj-input")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();
    let port = ports
        .get(port_idx)
        .ok_or_else(|| format!("Device {} not found", device_id))?;

    let port_name = midi_in
        .port_name(port)
        .unwrap_or_else(|_| format!("Device {}", port_idx));

    // Clone values for the callback closure
    let device_id_for_callback = device_id.clone();
    let engine = MIDI_ENGINE.clone();

    // Set up the callback for incoming MIDI messages
    let mut midi_in_ignored = MidiInput::new("sebcat-vj-input-conn")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;
    midi_in_ignored.ignore(Ignore::None);

    let ports2 = midi_in_ignored.ports();
    let port2 = ports2
        .get(port_idx)
        .ok_or_else(|| format!("Device {} not found on second probe", device_id))?;

    let connection = midi_in_ignored
        .connect(
            port2,
            "sebcat-vj-midi",
            move |timestamp, message, _| {
                handle_midi_message(&engine, &device_id_for_callback, timestamp, message);
            },
            (),
        )
        .map_err(|e| format!("Failed to connect to device: {}", e))?;

    // Store the connection
    with_midi_engine(|state| {
        state.connections.insert(
            device_id.clone(),
            ActiveConnection {
                device_id: device_id.clone(),
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
    });

    log::info!("[MIDI] Opened device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_devices_changed();

    Ok(())
}

/// Close a MIDI device.
pub fn close_device(device_id: String) -> Result<(), String> {
    let connection = with_midi_engine(|state| state.connections.remove(&device_id));

    match connection {
        Some(mut conn) => {
            // Dropping the connection closes it
            if let Some(c) = conn.connection.take() {
                c.close();
            }
            log::info!("[MIDI] Closed device: {}", device_id);
            emit_devices_changed();
            Ok(())
        }
        None => Err(format!("Device {} is not connected", device_id)),
    }
}

/// Close all MIDI devices.
pub fn close_all_devices() {
    let device_ids: Vec<String> =
        with_midi_engine(|state| state.connections.keys().cloned().collect());

    for device_id in device_ids {
        let _ = close_device(device_id);
    }
}

// ============================================================================
// MIDI Message Handling
// ============================================================================

/// Handle an incoming MIDI message.
fn handle_midi_message(
    engine: &Arc<Mutex<MidiEngineState>>,
    device_id: &str,
    timestamp: u64,
    message: &[u8],
) {
    if message.is_empty() {
        return;
    }

    let status = message[0];
    let channel = status & 0x0F;
    let message_type = status & 0xF0;

    let (type_str, control, value): (&str, u8, u16) = match message_type {
        0xB0 => {
            // Control Change
            let cc = message.get(1).copied().unwrap_or(0);
            let val = message.get(2).copied().unwrap_or(0);
            ("cc", cc, val as u16)
        }
        0x90 => {
            // Note On
            let note = message.get(1).copied().unwrap_or(0);
            let velocity = message.get(2).copied().unwrap_or(0);
            ("note_on", note, velocity as u16)
        }
        0x80 => {
            // Note Off
            let note = message.get(1).copied().unwrap_or(0);
            let velocity = message.get(2).copied().unwrap_or(0);
            ("note_off", note, velocity as u16)
        }
        0xE0 => {
            // Pitch Bend
            let lsb = message.get(1).copied().unwrap_or(0) as u16;
            let msb = message.get(2).copied().unwrap_or(0) as u16;
            let bend = (msb << 7) | lsb;
            ("pitch_bend", 0, bend)
        }
        _ => ("other", 0, 0),
    };

    let midi_msg = MidiMessage {
        device_id: device_id.to_string(),
        channel,
        message_type: type_str.to_string(),
        control,
        value,
        timestamp,
    };

    // Get app handle and check learn state
    let (app_handle, learn_state, mappings) = {
        let state = engine.lock().unwrap();
        (
            state.app_handle.clone(),
            state.learn_state.clone(),
            state.mappings.clone(),
        )
    };

    // Emit the raw MIDI message for activity indicators
    if let Some(ref handle) = app_handle {
        let _ = handle.emit("midi_message", &midi_msg);
    }

    // Handle MIDI Learn if active and this is a CC message
    if learn_state.is_learning && type_str == "cc" {
        if let Some(param_id) = learn_state.parameter_id {
            let mapping = MidiMapping {
                parameter_id: param_id,
                channel: Some(channel),
                cc_number: control,
                min_value: 0.0,
                max_value: 1.0,
                device_id: Some(device_id.to_string()),
            };

            // Add the mapping and exit learn mode
            {
                let mut state = engine.lock().unwrap();
                // Remove any existing mapping for this parameter
                state
                    .mappings
                    .retain(|m| m.parameter_id != mapping.parameter_id);
                state.mappings.push(mapping.clone());
                state.learn_state.is_learning = false;
                state.learn_state.parameter_id = None;
            }

            // Persist mappings
            save_mappings_to_disk();

            // Emit learn complete event
            if let Some(ref handle) = app_handle {
                let _ = handle.emit("midi_learn_complete", MidiLearnComplete { mapping });
            }

            log::info!(
                "[MIDI] Learn complete: CC {} @ channel {} -> parameter",
                control,
                channel
            );
            return;
        }
    }

    // Apply mappings for CC messages
    if type_str == "cc" {
        for mapping in &mappings {
            // Check if this CC matches the mapping
            let channel_match = mapping.channel.map_or(true, |ch| ch == channel);
            let cc_match = mapping.cc_number == control;
            let device_match = mapping.device_id.as_ref().map_or(true, |d| d == device_id);

            if channel_match && cc_match && device_match {
                // Normalize CC value (0-127) to mapping range
                let normalized = (value as f64) / 127.0;
                let mapped_value =
                    mapping.min_value + normalized * (mapping.max_value - mapping.min_value);

                // Apply to parameter via the parameter server
                apply_midi_to_parameter(&mapping.parameter_id, mapped_value, app_handle.as_ref());
            }
        }
    }
}

/// Apply a MIDI-derived value to a parameter.
fn apply_midi_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    // We need to call the parameter server's set_parameter logic.
    // Since we can't directly call Tauri commands from here, we'll emit an event
    // that the frontend can catch and forward, OR we can directly manipulate
    // the parameter store.
    //
    // For now, let's directly update the parameter store for lower latency.
    crate::with_parameter_store(|store| {
        store.set_target(parameter_id.to_string(), value);
    });

    // Emit parameter_changed event so UI stays in sync
    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    log::debug!(
        "[MIDI] Applied value {} to parameter {}",
        value,
        parameter_id
    );
}

// ============================================================================
// MIDI Learn
// ============================================================================

/// Start MIDI Learn mode for a parameter.
pub fn start_learn(parameter_id: String) -> Result<(), String> {
    with_midi_engine(|state| {
        if state.learn_state.is_learning {
            return Err("Already in learn mode".to_string());
        }
        state.learn_state.is_learning = true;
        state.learn_state.parameter_id = Some(parameter_id.clone());
        Ok(())
    })?;

    log::info!("[MIDI] Started learn mode for parameter: {}", parameter_id);

    // Emit learn state change
    emit_learn_state_changed();

    Ok(())
}

/// Cancel MIDI Learn mode.
pub fn cancel_learn() -> Result<(), String> {
    with_midi_engine(|state| {
        state.learn_state.is_learning = false;
        state.learn_state.parameter_id = None;
    });

    log::info!("[MIDI] Cancelled learn mode");

    emit_learn_state_changed();

    Ok(())
}

/// Get current MIDI Learn state.
pub fn get_learn_state() -> MidiLearnState {
    with_midi_engine(|state| state.learn_state.clone())
}

// ============================================================================
// Mapping Management
// ============================================================================

/// Get all MIDI mappings.
pub fn get_mappings() -> Vec<MidiMapping> {
    with_midi_engine(|state| state.mappings.clone())
}

/// Set a MIDI mapping (add or update).
pub fn set_mapping(mapping: MidiMapping) -> Result<(), String> {
    with_midi_engine(|state| {
        // Remove any existing mapping for this parameter
        state
            .mappings
            .retain(|m| m.parameter_id != mapping.parameter_id);
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();

    log::info!("[MIDI] Mapping updated");

    Ok(())
}

/// Remove a MIDI mapping by parameter ID.
pub fn remove_mapping(parameter_id: String) -> Result<(), String> {
    let removed = with_midi_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.parameter_id != parameter_id);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        log::info!("[MIDI] Removed mapping for parameter: {}", parameter_id);
        Ok(())
    } else {
        Err(format!("No mapping found for parameter: {}", parameter_id))
    }
}

/// Clear all MIDI mappings.
pub fn clear_mappings() {
    with_midi_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();

    log::info!("[MIDI] Cleared all mappings");
}

// ============================================================================
// Persistence
// ============================================================================

/// Path to the MIDI mappings file.
fn mappings_path(app_handle: &AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("midi_mappings.json"))
}

/// Load MIDI mappings from disk.
fn load_mappings_from_disk() {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<Vec<MidiMapping>>(&contents) {
                        Ok(mappings) => {
                            with_midi_engine(|state| {
                                state.mappings = mappings;
                            });
                            log::info!(
                                "[MIDI] Loaded {} mappings from disk",
                                with_midi_engine(|s| s.mappings.len())
                            );
                        }
                        Err(e) => {
                            log::warn!("[MIDI] Failed to parse mappings file: {}", e);
                        }
                    },
                    Err(e) => {
                        log::warn!("[MIDI] Failed to read mappings file: {}", e);
                    }
                }
            }
        }
    }
}

/// Save MIDI mappings to disk.
fn save_mappings_to_disk() {
    let (app_handle, mappings) =
        with_midi_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            // Ensure directory exists
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            match serde_json::to_string_pretty(&mappings) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[MIDI] Failed to write mappings file: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[MIDI] Failed to serialize mappings: {}", e);
                }
            }
        }
    }
}

// ============================================================================
// Event Emission
// ============================================================================

/// Emit a midi_devices_changed event.
fn emit_devices_changed() {
    let app_handle = with_midi_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Ok(devices) = list_devices() {
            let _ = handle.emit("midi_devices_changed", devices);
        }
    }
}

/// Emit a midi_learn_state_changed event.
fn emit_learn_state_changed() {
    let (app_handle, learn_state) =
        with_midi_engine(|state| (state.app_handle.clone(), state.learn_state.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("midi_learn_state_changed", learn_state);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List available MIDI devices.
#[tauri::command]
pub fn list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    list_devices()
}

/// Open a MIDI device for input.
#[tauri::command]
pub fn open_midi_device(device_id: String) -> Result<(), String> {
    open_device(device_id)
}

/// Close a MIDI device.
#[tauri::command]
pub fn close_midi_device(device_id: String) -> Result<(), String> {
    close_device(device_id)
}

/// Start MIDI Learn mode for a parameter.
#[tauri::command]
pub fn start_midi_learn(parameter_id: String) -> Result<(), String> {
    start_learn(parameter_id)
}

/// Cancel MIDI Learn mode.
#[tauri::command]
pub fn cancel_midi_learn() -> Result<(), String> {
    cancel_learn()
}

/// Get current MIDI Learn state.
#[tauri::command]
pub fn get_midi_learn_state() -> MidiLearnState {
    get_learn_state()
}

/// Get all MIDI mappings.
#[tauri::command]
pub fn get_midi_mappings() -> Vec<MidiMapping> {
    get_mappings()
}

/// Set a MIDI mapping.
#[tauri::command]
pub fn set_midi_mapping(mapping: MidiMapping) -> Result<(), String> {
    set_mapping(mapping)
}

/// Remove a MIDI mapping by parameter ID.
#[tauri::command]
pub fn remove_midi_mapping(parameter_id: String) -> Result<(), String> {
    remove_mapping(parameter_id)
}

/// Clear all MIDI mappings.
#[tauri::command]
pub fn clear_midi_mappings() {
    clear_mappings()
}
