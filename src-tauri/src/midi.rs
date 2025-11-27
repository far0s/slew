//! MIDI Input Engine
//!
//! Provides MIDI device enumeration, connection management, message parsing,
//! and MIDI Learn functionality for binding controllers to parameters.
//!
//! Features hot-plug detection via background polling and optional auto-reconnect.

use midir::{Ignore, MidiInput, MidiInputConnection};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Constants
// ============================================================================

/// Interval for polling device list changes (in milliseconds)
const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

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
    /// Previously known device names (for hot-plug detection)
    known_device_names: HashSet<String>,
    /// Device names that were intentionally connected (for auto-reconnect)
    auto_reconnect_devices: HashSet<String>,
    /// Whether auto-reconnect is enabled
    auto_reconnect_enabled: bool,
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
            known_device_names: HashSet::new(),
            auto_reconnect_devices: HashSet::new(),
            auto_reconnect_enabled: true,
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

    // Initialize known devices list
    if let Ok(devices) = list_devices() {
        with_midi_engine(|state| {
            state.known_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
    }

    // Start device watcher thread
    start_device_watcher_thread();

    log::debug!("[MIDI] Engine initialized with hot-plug detection");
}

/// Start the background thread that polls for device changes.
fn start_device_watcher_thread() {
    let engine = MIDI_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[MIDI] Device watcher thread started");

        loop {
            thread::sleep(Duration::from_millis(DEVICE_POLL_INTERVAL_MS));

            // Get current device list
            let current_devices = match list_devices_internal() {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[MIDI] Device enumeration error: {}", e);
                    continue;
                }
            };

            let current_names: HashSet<String> =
                current_devices.iter().map(|d| d.name.clone()).collect();

            // Get previous state
            let (
                previous_names,
                connected_device_names,
                auto_reconnect_devices,
                auto_reconnect_enabled,
                app_handle,
            ) = {
                let state = engine.lock().unwrap();
                let connected_names: HashSet<String> = state
                    .connections
                    .values()
                    .map(|c| c.device_name.clone())
                    .collect();
                (
                    state.known_device_names.clone(),
                    connected_names,
                    state.auto_reconnect_devices.clone(),
                    state.auto_reconnect_enabled,
                    state.app_handle.clone(),
                )
            };

            // Detect changes
            let added: Vec<String> = current_names.difference(&previous_names).cloned().collect();
            let removed: Vec<String> = previous_names.difference(&current_names).cloned().collect();

            let has_changes = !added.is_empty() || !removed.is_empty();

            // Log changes
            for name in &added {
                log::debug!("[MIDI] Device connected: {}", name);
            }
            for name in &removed {
                log::debug!("[MIDI] Device disconnected: {}", name);
            }

            // Handle disconnected devices that were open
            let mut disconnected_open_devices = Vec::new();
            for name in &removed {
                if connected_device_names.contains(name) {
                    disconnected_open_devices.push(name.clone());
                }
            }

            // Close connections to disconnected devices
            if !disconnected_open_devices.is_empty() {
                let mut state = engine.lock().unwrap();
                let device_ids_to_remove: Vec<String> = state
                    .connections
                    .iter()
                    .filter(|(_, conn)| disconnected_open_devices.contains(&conn.device_name))
                    .map(|(id, _)| id.clone())
                    .collect();

                for device_id in device_ids_to_remove {
                    if let Some(mut conn) = state.connections.remove(&device_id) {
                        if let Some(c) = conn.connection.take() {
                            // Close the connection (ignore errors, device is already gone)
                            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                c.close();
                            }));
                        }
                        log::debug!(
                            "[MIDI] Closed connection to disconnected device: {}",
                            conn.device_name
                        );
                    }
                }
            }

            // Update known devices
            {
                let mut state = engine.lock().unwrap();
                state.known_device_names = current_names.clone();
            }

            // Emit event if devices changed
            if has_changes {
                if let Some(handle) = &app_handle {
                    // Re-fetch with connection status
                    if let Ok(devices) = list_devices() {
                        let _ = handle.emit("midi_devices_changed", &devices);
                    }
                }
            }

            // Auto-reconnect logic
            if auto_reconnect_enabled && !added.is_empty() {
                for name in &added {
                    if auto_reconnect_devices.contains(name) {
                        // Find the device ID for this name
                        if let Ok(devices) = list_devices() {
                            if let Some(device) = devices.iter().find(|d| &d.name == name) {
                                log::debug!("[MIDI] Auto-reconnecting to: {}", name);
                                if let Err(e) = open_device(device.id.clone()) {
                                    log::warn!("[MIDI] Auto-reconnect failed for {}: {}", name, e);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

/// Internal device listing that doesn't require the mutex.
fn list_devices_internal() -> Result<Vec<MidiDeviceInfo>, String> {
    let midi_in = MidiInput::new("sebcat-vj-probe")
        .map_err(|e| format!("Failed to create MIDI input: {}", e))?;

    let ports = midi_in.ports();

    let mut devices = Vec::new();
    for (idx, port) in ports.iter().enumerate() {
        let name = midi_in
            .port_name(port)
            .unwrap_or_else(|_| format!("Unknown Device {}", idx));
        let id = format!("{}", idx);

        devices.push(MidiDeviceInfo {
            id,
            name,
            is_connected: false, // Will be updated by caller if needed
        });
    }

    Ok(devices)
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

    // Store the connection and mark for auto-reconnect
    with_midi_engine(|state| {
        state.connections.insert(
            device_id.clone(),
            ActiveConnection {
                device_id: device_id.clone(),
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
        // Remember this device for auto-reconnect
        state.auto_reconnect_devices.insert(port_name.clone());
    });

    log::debug!("[MIDI] Opened device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_devices_changed();

    Ok(())
}

/// Enable or disable auto-reconnect for MIDI devices.
pub fn set_auto_reconnect(enabled: bool) {
    with_midi_engine(|state| {
        state.auto_reconnect_enabled = enabled;
    });
    log::debug!("[MIDI] Auto-reconnect set to: {}", enabled);
}

/// Check if auto-reconnect is enabled.
pub fn is_auto_reconnect_enabled() -> bool {
    with_midi_engine(|state| state.auto_reconnect_enabled)
}

/// Clear the auto-reconnect list (forgets which devices to reconnect to).
pub fn clear_auto_reconnect_devices() {
    with_midi_engine(|state| {
        state.auto_reconnect_devices.clear();
    });
    log::debug!("[MIDI] Cleared auto-reconnect device list");
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
            log::debug!("[MIDI] Closed device: {}", device_id);
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

            log::debug!(
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

    log::debug!("[MIDI] Started learn mode for parameter: {}", parameter_id);

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

    log::debug!("[MIDI] Cancelled learn mode");

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

    log::debug!("[MIDI] Mapping updated");

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
        log::debug!("[MIDI] Removed mapping for parameter: {}", parameter_id);
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

    log::debug!("[MIDI] Cleared all mappings");
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
                            log::debug!(
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

/// Set auto-reconnect enabled state.
#[tauri::command]
pub fn set_midi_auto_reconnect(enabled: bool) {
    set_auto_reconnect(enabled)
}

/// Get auto-reconnect enabled state.
#[tauri::command]
pub fn get_midi_auto_reconnect() -> bool {
    is_auto_reconnect_enabled()
}

/// Clear the auto-reconnect device list.
#[tauri::command]
pub fn clear_midi_auto_reconnect_devices() {
    clear_auto_reconnect_devices()
}
