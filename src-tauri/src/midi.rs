//! MIDI Input/Output Engine
//!
//! Provides MIDI device enumeration, connection management, message parsing,
//! MIDI Learn functionality, and MIDI output for controller feedback.
//!
//! Features hot-plug detection via background polling and optional auto-reconnect.

use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Constants
// ============================================================================

/// Interval for polling device list changes (in milliseconds)
const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

/// Known device profiles for automatic setup
const MIDIMIX_NAME_PATTERN: &str = "MIDI Mix";

/// Midimix fader CC numbers (channel 0): faders 1-8
const MIDIMIX_FADER_CCS: [u8; 8] = [19, 23, 27, 31, 49, 53, 57, 61];

/// Midimix knob CC numbers (channel 0): 3 knobs per column, 8 columns
/// Each inner array is [top, middle, bottom] knob for that column
const MIDIMIX_KNOB_CCS: [[u8; 3]; 8] = [
    [16, 17, 18], // Column 1
    [20, 21, 22], // Column 2
    [24, 25, 26], // Column 3
    [28, 29, 30], // Column 4
    [46, 47, 48], // Column 5
    [50, 51, 52], // Column 6
    [54, 55, 56], // Column 7
    [58, 59, 60], // Column 8
];

/// Midimix master fader CC number (channel 0)
const MIDIMIX_MASTER_FADER_CC: u8 = 62;

/// Midimix LED note numbers for Mute row (channel 0)
const MIDIMIX_MUTE_NOTES: [u8; 8] = [1, 4, 7, 10, 13, 16, 19, 22];
/// Midimix LED note numbers for Solo row (channel 0)
const MIDIMIX_SOLO_NOTES: [u8; 8] = [2, 5, 8, 11, 14, 17, 20, 23];
/// Midimix LED note numbers for Rec Arm row (channel 0)
const MIDIMIX_REC_ARM_NOTES: [u8; 8] = [3, 6, 9, 12, 15, 18, 21, 24];

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

/// Information about an available MIDI output device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiOutputDeviceInfo {
    /// Unique identifier for the output device (port index as string)
    pub id: String,
    /// Human-readable device name
    pub name: String,
    /// Whether this device is currently connected/opened for output
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
    /// Pending min value for the mapping (from parameter template)
    pub pending_min_value: f64,
    /// Pending max value for the mapping (from parameter template)
    pub pending_max_value: f64,
}

/// Event emitted when MIDI Learn captures a mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiLearnComplete {
    /// The captured mapping
    pub mapping: MidiMapping,
}

/// Configuration for MIDI output feedback.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiOutputConfig {
    /// Whether to send CC feedback when parameters change
    pub send_cc_feedback: bool,
    /// Output device ID to send feedback to (None = all connected outputs)
    pub output_device_id: Option<String>,
}

impl Default for MidiOutputConfig {
    fn default() -> Self {
        Self {
            send_cc_feedback: true,
            output_device_id: None,
        }
    }
}

// ============================================================================
// Global State
// ============================================================================

/// Holds an active MIDI input connection along with its device info.
struct ActiveInputConnection {
    #[allow(dead_code)]
    device_id: String,
    device_name: String,
    // The connection must be kept alive; dropping it closes the port.
    // We use Option to allow taking ownership when closing.
    connection: Option<MidiInputConnection<()>>,
}

/// Holds an active MIDI output connection along with its device info.
struct ActiveOutputConnection {
    #[allow(dead_code)]
    device_id: String,
    device_name: String,
    // The connection must be kept alive; dropping it closes the port.
    connection: Option<MidiOutputConnection>,
}

/// Global MIDI engine state.
/// Information about an active slot (for LED feedback and knob mappings)
#[derive(Debug, Clone)]
struct SlotState {
    /// Slot index (0-5)
    index: usize,
    /// Whether this slot exists (is in the slots array)
    exists: bool,
    /// The sketch ID loaded in this slot (empty string if none)
    sketch_id: String,
}

struct MidiEngineState {
    /// Currently open input connections, keyed by device ID
    connections: HashMap<String, ActiveInputConnection>,
    /// Currently open output connections, keyed by device ID
    output_connections: HashMap<String, ActiveOutputConnection>,
    /// All known mappings
    mappings: Vec<MidiMapping>,
    /// MIDI Learn state
    learn_state: MidiLearnState,
    /// App handle for emitting events (set during init)
    app_handle: Option<AppHandle>,
    /// Previously known device names (for hot-plug detection)
    known_device_names: HashSet<String>,
    /// Previously known output device names (for hot-plug detection)
    known_output_device_names: HashSet<String>,
    /// Device names that were intentionally connected (for auto-reconnect)
    auto_reconnect_devices: HashSet<String>,
    /// Output device names that were intentionally connected (for auto-reconnect)
    auto_reconnect_output_devices: HashSet<String>,
    /// Whether auto-reconnect is enabled
    auto_reconnect_enabled: bool,
    /// MIDI output configuration
    output_config: MidiOutputConfig,
    /// Track last sent CC values to avoid redundant sends (device_id -> (channel, cc) -> value)
    last_sent_cc: HashMap<String, HashMap<(u8, u8), u8>>,
    /// Current slot states for LED feedback
    active_slots: Vec<SlotState>,
    /// Last known master fader value (for direction detection)
    last_master_value: Option<u8>,
}

impl Default for MidiEngineState {
    fn default() -> Self {
        Self {
            connections: HashMap::new(),
            output_connections: HashMap::new(),
            mappings: Vec::new(),
            learn_state: MidiLearnState {
                is_learning: false,
                parameter_id: None,
                pending_min_value: 0.0,
                pending_max_value: 1.0,
            },
            app_handle: None,
            known_device_names: HashSet::new(),
            known_output_device_names: HashSet::new(),
            auto_reconnect_devices: HashSet::new(),
            auto_reconnect_output_devices: HashSet::new(),
            auto_reconnect_enabled: true,
            output_config: MidiOutputConfig::default(),
            last_sent_cc: HashMap::new(),
            active_slots: Vec::new(),
            last_master_value: None,
        }
    }
}

/// Check if a device name matches the Midimix pattern
fn is_midimix_device(name: &str) -> bool {
    name.contains(MIDIMIX_NAME_PATTERN)
}

/// Find the paired output device for an input device (by name matching)
fn find_paired_output_device(input_name: &str) -> Option<MidiOutputDeviceInfo> {
    // For Midimix and similar devices, input and output share the same base name
    if let Ok(outputs) = list_output_devices() {
        // First try exact match
        if let Some(output) = outputs.iter().find(|o| o.name == input_name) {
            return Some(output.clone());
        }
        // Then try partial match (e.g., "MIDI Mix" in both names)
        if is_midimix_device(input_name) {
            if let Some(output) = outputs.iter().find(|o| is_midimix_device(&o.name)) {
                return Some(output.clone());
            }
        }
    }
    None
}

/// Find the paired input device for an output device (by name matching)
fn find_paired_input_device(output_name: &str) -> Option<MidiDeviceInfo> {
    if let Ok(inputs) = list_devices() {
        // First try exact match
        if let Some(input) = inputs.iter().find(|i| i.name == output_name) {
            return Some(input.clone());
        }
        // Then try partial match for Midimix
        if is_midimix_device(output_name) {
            if let Some(input) = inputs.iter().find(|i| is_midimix_device(&i.name)) {
                return Some(input.clone());
            }
        }
    }
    None
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

    // Initialize known devices list and auto-connect Midimix if present
    let mut midimix_input: Option<MidiDeviceInfo> = None;
    if let Ok(devices) = list_devices() {
        with_midi_engine(|state| {
            state.known_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });

        // Check for Midimix
        midimix_input = devices.into_iter().find(|d| is_midimix_device(&d.name));
    }

    // Initialize known output devices list
    if let Ok(devices) = list_output_devices() {
        with_midi_engine(|state| {
            state.known_output_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
    }

    // Start device watcher thread
    start_device_watcher_thread();

    // Auto-connect Midimix if found at startup
    if let Some(midimix) = midimix_input {
        log::info!(
            "[MIDI] Midimix found at startup, auto-connecting: {}",
            midimix.name
        );
        // Delay slightly to let the engine fully initialize
        let device_id = midimix.id;
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(500));
            if let Err(e) = open_device(device_id) {
                log::warn!("[MIDI] Failed to auto-connect Midimix at startup: {}", e);
            }
        });
    }

    log::debug!("[MIDI] Engine initialized with hot-plug detection and output support");
}

/// Start the background thread that polls for device changes.
fn start_device_watcher_thread() {
    let engine = MIDI_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[MIDI] Device watcher thread started");

        loop {
            thread::sleep(Duration::from_millis(DEVICE_POLL_INTERVAL_MS));

            // Get current input device list
            let current_devices = match list_devices_internal() {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[MIDI] Device enumeration error: {}", e);
                    continue;
                }
            };

            // Get current output device list
            let current_output_devices = match list_output_devices_internal() {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[MIDI] Output device enumeration error: {}", e);
                    Vec::new()
                }
            };

            let current_names: HashSet<String> =
                current_devices.iter().map(|d| d.name.clone()).collect();
            let current_output_names: HashSet<String> = current_output_devices
                .iter()
                .map(|d| d.name.clone())
                .collect();

            // Get previous state
            let (
                previous_names,
                previous_output_names,
                connected_device_names,
                connected_output_device_names,
                auto_reconnect_devices,
                auto_reconnect_output_devices,
                auto_reconnect_enabled,
                app_handle,
            ) = {
                let state = engine.lock().unwrap();
                let connected_names: HashSet<String> = state
                    .connections
                    .values()
                    .map(|c| c.device_name.clone())
                    .collect();
                let connected_output_names: HashSet<String> = state
                    .output_connections
                    .values()
                    .map(|c| c.device_name.clone())
                    .collect();
                (
                    state.known_device_names.clone(),
                    state.known_output_device_names.clone(),
                    connected_names,
                    connected_output_names,
                    state.auto_reconnect_devices.clone(),
                    state.auto_reconnect_output_devices.clone(),
                    state.auto_reconnect_enabled,
                    state.app_handle.clone(),
                )
            };

            // Detect input changes
            let added: Vec<String> = current_names.difference(&previous_names).cloned().collect();
            let removed: Vec<String> = previous_names.difference(&current_names).cloned().collect();

            // Detect output changes
            let output_added: Vec<String> = current_output_names
                .difference(&previous_output_names)
                .cloned()
                .collect();
            let output_removed: Vec<String> = previous_output_names
                .difference(&current_output_names)
                .cloned()
                .collect();

            let has_changes = !added.is_empty()
                || !removed.is_empty()
                || !output_added.is_empty()
                || !output_removed.is_empty();

            // Log changes
            for name in &added {
                log::debug!("[MIDI] Input device connected: {}", name);
            }
            for name in &removed {
                log::debug!("[MIDI] Input device disconnected: {}", name);
            }
            for name in &output_added {
                log::debug!("[MIDI] Output device connected: {}", name);
            }
            for name in &output_removed {
                log::debug!("[MIDI] Output device disconnected: {}", name);
            }

            // Handle disconnected input devices that were open
            let mut disconnected_open_devices = Vec::new();
            for name in &removed {
                if connected_device_names.contains(name) {
                    disconnected_open_devices.push(name.clone());
                }
            }

            // Handle disconnected output devices that were open
            let mut disconnected_open_output_devices = Vec::new();
            for name in &output_removed {
                if connected_output_device_names.contains(name) {
                    disconnected_open_output_devices.push(name.clone());
                }
            }

            // Close connections to disconnected input devices
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
                            "[MIDI] Closed input connection to disconnected device: {}",
                            conn.device_name
                        );
                    }
                }
            }

            // Close connections to disconnected output devices
            if !disconnected_open_output_devices.is_empty() {
                let mut state = engine.lock().unwrap();
                let device_ids_to_remove: Vec<String> = state
                    .output_connections
                    .iter()
                    .filter(|(_, conn)| {
                        disconnected_open_output_devices.contains(&conn.device_name)
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                for device_id in device_ids_to_remove {
                    if let Some(mut conn) = state.output_connections.remove(&device_id) {
                        if let Some(c) = conn.connection.take() {
                            // Close the connection (ignore errors, device is already gone)
                            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                                drop(c);
                            }));
                        }
                        // Clear cached CC values for this device
                        state.last_sent_cc.remove(&device_id);
                        log::debug!(
                            "[MIDI] Closed output connection to disconnected device: {}",
                            conn.device_name
                        );
                    }
                }
            }

            // Update known devices
            {
                let mut state = engine.lock().unwrap();
                state.known_device_names = current_names.clone();
                state.known_output_device_names = current_output_names.clone();
            }

            // Emit event if devices changed
            if has_changes {
                if let Some(handle) = &app_handle {
                    // Re-fetch with connection status
                    if let Ok(devices) = list_devices() {
                        let _ = handle.emit("midi_devices_changed", &devices);
                    }
                    if let Ok(devices) = list_output_devices() {
                        let _ = handle.emit("midi_output_devices_changed", &devices);
                    }
                }
            }

            // Auto-reconnect logic for input devices
            if auto_reconnect_enabled && !added.is_empty() {
                for name in &added {
                    // Auto-reconnect known devices OR Midimix (always auto-connect Midimix)
                    let should_connect =
                        auto_reconnect_devices.contains(name) || is_midimix_device(name);

                    if should_connect {
                        // Find the device ID for this name
                        if let Ok(devices) = list_devices() {
                            if let Some(device) = devices.iter().find(|d| &d.name == name) {
                                log::debug!("[MIDI] Auto-reconnecting input: {}", name);
                                if let Err(e) = open_device(device.id.clone()) {
                                    log::warn!(
                                        "[MIDI] Auto-reconnect failed for input {}: {}",
                                        name,
                                        e
                                    );
                                }
                                // Note: open_device handles paired output connection for Midimix
                            }
                        }
                    }
                }
            }

            // Auto-reconnect logic for output devices (only for non-Midimix, since Midimix is handled by input)
            if auto_reconnect_enabled && !output_added.is_empty() {
                for name in &output_added {
                    // Skip Midimix outputs - they're handled when input connects
                    if is_midimix_device(name) {
                        continue;
                    }

                    if auto_reconnect_output_devices.contains(name) {
                        // Find the device ID for this name
                        if let Ok(devices) = list_output_devices() {
                            if let Some(device) = devices.iter().find(|d| &d.name == name) {
                                log::debug!("[MIDI] Auto-reconnecting output: {}", name);
                                if let Err(e) = open_output_device(device.id.clone()) {
                                    log::warn!(
                                        "[MIDI] Auto-reconnect failed for output {}: {}",
                                        name,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

/// Internal input device listing that doesn't require the mutex.
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

/// Internal output device listing that doesn't require the mutex.
fn list_output_devices_internal() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    let midi_out = MidiOutput::new("sebcat-vj-probe-out")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

    let ports = midi_out.ports();

    let mut devices = Vec::new();
    for (idx, port) in ports.iter().enumerate() {
        let name = midi_out
            .port_name(&port)
            .unwrap_or_else(|_| format!("Unknown Output Device {}", idx));
        let id = format!("out_{}", idx);

        devices.push(MidiOutputDeviceInfo {
            id,
            name,
            is_connected: false, // Will be updated by caller if needed
        });
    }

    Ok(devices)
}

/// List available MIDI input devices (with connection status).
pub fn list_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    let mut devices = list_devices_internal()?;

    // Update connection status from global state
    let connected_names: HashSet<String> = with_midi_engine(|state| {
        state
            .connections
            .values()
            .map(|c| c.device_name.clone())
            .collect()
    });

    for device in &mut devices {
        device.is_connected = connected_names.contains(&device.name);
    }

    Ok(devices)
}

/// List available MIDI output devices (with connection status).
pub fn list_output_devices() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    let mut devices = list_output_devices_internal()?;

    // Update connection status from global state
    let connected_names: HashSet<String> = with_midi_engine(|state| {
        state
            .output_connections
            .values()
            .map(|c| c.device_name.clone())
            .collect()
    });

    for device in &mut devices {
        device.is_connected = connected_names.contains(&device.name);
    }

    Ok(devices)
}

// ============================================================================
// Input Connection Management
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
    let is_midimix = is_midimix_device(&port_name);
    with_midi_engine(|state| {
        state.connections.insert(
            device_id.clone(),
            ActiveInputConnection {
                device_id: device_id.clone(),
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
        // Remember this device for auto-reconnect
        state.auto_reconnect_devices.insert(port_name.clone());
    });

    log::debug!("[MIDI] Opened input device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_devices_changed();

    // For Midimix: auto-connect paired output and setup default mappings
    if is_midimix {
        log::debug!("[MIDI] Midimix detected, setting up paired output and default mappings");

        // Try to connect the paired output device
        if let Some(output) = find_paired_output_device(&port_name) {
            if !output.is_connected {
                if let Err(e) = open_output_device(output.id.clone()) {
                    log::warn!("[MIDI] Failed to auto-connect Midimix output: {}", e);
                } else {
                    log::debug!("[MIDI] Auto-connected Midimix output: {}", output.name);
                    // Send LED startup animation
                    send_midimix_startup_animation(&output.id);
                }
            }
        }

        // Setup default alpha mappings for slots 0-5
        setup_midimix_default_mappings();
    }

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
        state.auto_reconnect_output_devices.clear();
    });
    log::debug!("[MIDI] Cleared auto-reconnect device list");
}

/// Close a MIDI input device.
pub fn close_device(device_id: String) -> Result<(), String> {
    let connection = with_midi_engine(|state| state.connections.remove(&device_id));

    match connection {
        Some(mut conn) => {
            // Dropping the connection closes it
            if let Some(c) = conn.connection.take() {
                c.close();
            }
            log::debug!("[MIDI] Closed input device: {}", device_id);
            emit_devices_changed();
            Ok(())
        }
        None => Err(format!("Device {} is not connected", device_id)),
    }
}

/// Close all MIDI input devices.
pub fn close_all_devices() {
    let device_ids: Vec<String> =
        with_midi_engine(|state| state.connections.keys().cloned().collect());

    for device_id in device_ids {
        let _ = close_device(device_id);
    }
}

// ============================================================================
// Output Connection Management
// ============================================================================

/// Open a MIDI device for output.
pub fn open_output_device(device_id: String) -> Result<(), String> {
    // Check if already connected
    let already_connected =
        with_midi_engine(|state| state.output_connections.contains_key(&device_id));

    if already_connected {
        return Err(format!("Output device {} is already connected", device_id));
    }

    // Parse device ID (format: "out_N" where N is the port index)
    let port_idx: usize = device_id
        .strip_prefix("out_")
        .ok_or_else(|| format!("Invalid output device ID format: {}", device_id))?
        .parse()
        .map_err(|_| format!("Invalid output device ID: {}", device_id))?;

    // Create MIDI output
    let midi_out = MidiOutput::new("sebcat-vj-output")
        .map_err(|e| format!("Failed to create MIDI output: {}", e))?;

    let ports = midi_out.ports();
    let port = ports
        .get(port_idx)
        .ok_or_else(|| format!("Output device {} not found", device_id))?;

    let port_name = midi_out
        .port_name(&port)
        .unwrap_or_else(|_| format!("Output Device {}", port_idx));

    let connection = midi_out
        .connect(&port, "sebcat-vj-midi-out")
        .map_err(|e| format!("Failed to connect to output device: {}", e))?;

    // Store the connection and mark for auto-reconnect
    let is_midimix = is_midimix_device(&port_name);
    with_midi_engine(|state| {
        state.output_connections.insert(
            device_id.clone(),
            ActiveOutputConnection {
                device_id: device_id.clone(),
                device_name: port_name.clone(),
                connection: Some(connection),
            },
        );
        // Remember this device for auto-reconnect
        state
            .auto_reconnect_output_devices
            .insert(port_name.clone());
        // Initialize CC cache for this device
        state.last_sent_cc.insert(device_id.clone(), HashMap::new());
    });

    log::debug!("[MIDI] Opened output device: {} ({})", device_id, port_name);

    // Emit device change event
    emit_output_devices_changed();

    // For Midimix: auto-connect paired input if not already connected
    if is_midimix {
        log::debug!("[MIDI] Midimix output detected, checking for paired input");

        // Try to connect the paired input device
        if let Some(input) = find_paired_input_device(&port_name) {
            if !input.is_connected {
                if let Err(e) = open_device(input.id.clone()) {
                    log::warn!("[MIDI] Failed to auto-connect Midimix input: {}", e);
                }
                // Note: open_device will handle the startup animation and mappings
            } else {
                // Input already connected, just send startup animation
                send_midimix_startup_animation(&device_id);
            }
        } else {
            // No paired input found, still send startup animation
            send_midimix_startup_animation(&device_id);
        }
    }

    Ok(())
}

/// Send a startup animation to Midimix LEDs
fn send_midimix_startup_animation(output_device_id: &str) {
    log::debug!("[MIDI] Sending Midimix startup animation");

    // Staggered cascade animation with final state based on active slots
    std::thread::spawn({
        let device_id = output_device_id.to_string();
        move || {
            // First, turn off all LEDs
            for i in 0..8 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
            }

            std::thread::sleep(Duration::from_millis(100));

            // Staggered cascade: each LED turns on then off with overlap
            // Creates a wave effect across columns and rows
            let stagger_delay = Duration::from_millis(25);
            let hold_time = Duration::from_millis(80);

            // Wave 1: Mute row left to right
            for i in 0..6 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            std::thread::sleep(hold_time);
            for i in 0..6 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }

            // Wave 2: Solo row left to right
            for i in 0..6 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            std::thread::sleep(hold_time);
            for i in 0..6 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }

            // Wave 3: Rec Arm row left to right
            for i in 0..6 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            std::thread::sleep(hold_time);
            for i in 0..6 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }

            std::thread::sleep(Duration::from_millis(150));

            // Final state: light up Mute + Rec Arm ONLY for slots that exist
            // At startup, active_slots may be empty - that's fine, no LEDs will light up
            // The frontend will call set_all_slots shortly after, which will update LEDs
            let active_slots = with_midi_engine(|state| state.active_slots.clone());

            for i in 0..6 {
                // Only light up if the slot exists (is in the slots array)
                let slot_exists = active_slots
                    .iter()
                    .find(|s| s.index == i)
                    .map(|s| s.exists)
                    .unwrap_or(false); // Default to false (LED off) if no slot info

                if slot_exists {
                    let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
                    let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
                }
                // Explicitly ensure LEDs are off if slot doesn't exist
                else {
                    let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                    let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
                }
            }

            log::debug!("[MIDI] Midimix startup animation complete");
        }
    });
}

/// Send a shutdown animation to Midimix LEDs (synchronous - blocks until complete)
fn send_midimix_shutdown_animation_sync(device_id: &str) {
    log::debug!("[MIDI] Sending Midimix shutdown animation");

    let stagger_delay = Duration::from_millis(20);

    // Turn off LEDs in reverse order: Rec Arm, Solo, Mute (right to left)
    // Wave 1: Rec Arm row right to left
    for i in (0..6).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }

    // Wave 2: Solo row right to left
    for i in (0..6).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }

    // Wave 3: Mute row right to left
    for i in (0..6).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }

    // Also turn off columns 7-8 just in case
    for i in 6..8 {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
    }

    std::thread::sleep(Duration::from_millis(50));

    log::debug!("[MIDI] Midimix shutdown animation complete");
}

/// Update Midimix LEDs based on current slot states
pub fn update_midimix_leds() {
    let (active_slots, output_device_ids) = with_midi_engine(|state| {
        let slots = state.active_slots.clone();
        // Find all connected Midimix output devices
        let midimix_outputs: Vec<String> = state
            .output_connections
            .iter()
            .filter(|(_, conn)| is_midimix_device(&conn.device_name))
            .map(|(id, _)| id.clone())
            .collect();
        (slots, midimix_outputs)
    });

    if output_device_ids.is_empty() {
        return;
    }

    for device_id in output_device_ids {
        // Update Mute + Rec Arm LEDs for first 6 columns (indicates slot existence)
        for i in 0..6 {
            let slot_exists = active_slots
                .iter()
                .find(|s| s.index == i)
                .map(|s| s.exists)
                .unwrap_or(false);

            if slot_exists {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
            } else {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
            }
            // Solo row stays off (could be used for other feedback later)
            let _ = send_note_off(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
        }
    }

    log::debug!(
        "[MIDI] Updated Midimix LEDs for {} slots",
        active_slots.len()
    );
}

/// Update the active slots state (called from lib.rs when slots change)
/// Accepts (index, exists, sketch_id) tuples for LED and knob mapping support.
pub fn set_active_slots(slots: Vec<(usize, bool, String)>) {
    with_midi_engine(|state| {
        state.active_slots = slots
            .into_iter()
            .map(|(index, exists, sketch_id)| SlotState {
                index,
                exists,
                sketch_id,
            })
            .collect();
    });

    // Update LEDs to reflect new state
    update_midimix_leds();

    // Update knob mappings based on loaded sketches
    update_midimix_knob_mappings();
}

/// Update Midimix knob mappings based on currently loaded sketches.
/// Maps the top 3 knobs of each column to the first 3 parameters of that slot's sketch.
fn update_midimix_knob_mappings() {
    let active_slots = with_midi_engine(|state| state.active_slots.clone());

    // Check if we have any Midimix connected
    let has_midimix = with_midi_engine(|state| {
        state
            .connections
            .values()
            .any(|conn| is_midimix_device(&conn.device_name))
    });

    if !has_midimix {
        return;
    }

    log::debug!(
        "[MIDI] Updating Midimix knob mappings for {} slots",
        active_slots.len()
    );

    // Get existing mappings to check for user overrides
    let existing_mappings = with_midi_engine(|state| state.mappings.clone());

    for slot_state in &active_slots {
        if slot_state.index >= 6 || !slot_state.exists || slot_state.sketch_id.is_empty() {
            continue;
        }

        // Get the first 3 parameter template IDs for this sketch
        let param_ids = get_sketch_first_params(&slot_state.sketch_id, slot_state.index);

        for (knob_idx, param_id) in param_ids.into_iter().enumerate() {
            if knob_idx >= 3 {
                break;
            }

            let cc_number = MIDIMIX_KNOB_CCS[slot_state.index][knob_idx];

            // Skip if there's already a user mapping for this parameter
            if existing_mappings.iter().any(|m| m.parameter_id == param_id) {
                log::debug!("[MIDI] Skipping {} - already has a mapping", param_id);
                continue;
            }

            // Also check if this CC is already mapped to something else by the user
            // We only auto-map if the CC is unmapped
            let cc_in_use = existing_mappings
                .iter()
                .any(|m| m.cc_number == cc_number && m.channel == Some(0));
            if cc_in_use {
                log::debug!(
                    "[MIDI] Skipping CC {} - already mapped to another parameter",
                    cc_number
                );
                continue;
            }

            // Get the parameter range from the sketch
            let (min_val, max_val) = get_sketch_param_range(&slot_state.sketch_id, &param_id);

            let mapping = MidiMapping {
                parameter_id: param_id.clone(),
                channel: Some(0),
                cc_number,
                min_value: min_val,
                max_value: max_val,
                device_id: None,
            };

            with_midi_engine(|state| {
                // Remove any existing auto-mapping for this CC (from previous sketch loads)
                state.mappings.retain(|m| {
                    !(m.cc_number == cc_number && m.channel == Some(0) && m.device_id.is_none())
                });
                state.mappings.push(mapping);
            });

            log::debug!(
                "[MIDI] Auto-mapped knob {} (CC {}) -> {} (range {}-{})",
                knob_idx + 1,
                cc_number,
                param_id,
                min_val,
                max_val
            );
        }
    }

    save_mappings_to_disk();
}

/// Get the first 3 parameter IDs for a sketch (excluding alpha which is slot-level).
fn get_sketch_first_params(sketch_id: &str, slot_index: usize) -> Vec<String> {
    // Map sketch IDs to their parameter template IDs
    // This is a simplified version - in a real implementation, you'd query the sketch registry
    let params: Vec<&str> = match sketch_id {
        "blueCube" => vec!["rotation_speed", "scale", "color_shift"],
        "orangeCube" => vec!["rotation_speed", "scale", "color_shift"],
        "greenPulse" => vec!["pulse_speed", "intensity", "color_hue"],
        "tslText3D" => vec!["rotation_speed", "text_scale", "color_mix"],
        "tslNoiseBlob" => vec!["noise_scale", "noise_speed", "color_mix"],
        _ => vec![],
    };

    params
        .into_iter()
        .take(3)
        .map(|p| format!("slot_{}_{}", slot_index, p))
        .collect()
}

/// Get the parameter range for a sketch parameter.
fn get_sketch_param_range(sketch_id: &str, param_id: &str) -> (f64, f64) {
    // Extract template ID from param_id (format: slot_N_templateId)
    let template_id = param_id.split('_').skip(2).collect::<Vec<_>>().join("_");

    // Default ranges for known parameters
    match (sketch_id, template_id.as_str()) {
        // TslNoiseBlob
        ("tslNoiseBlob", "noise_scale") => (0.1, 5.0),
        ("tslNoiseBlob", "noise_speed") => (0.0, 3.0),
        ("tslNoiseBlob", "color_mix") => (0.0, 1.0),
        // BlueCube / OrangeCube
        (_, "rotation_speed") => (0.0, 5.0),
        (_, "scale") => (0.1, 3.0),
        (_, "color_shift") => (0.0, 1.0),
        // GreenPulse
        ("greenPulse", "pulse_speed") => (0.0, 5.0),
        ("greenPulse", "intensity") => (0.0, 2.0),
        ("greenPulse", "color_hue") => (0.0, 1.0),
        // TslText3D
        ("tslText3D", "text_scale") => (0.1, 3.0),
        // Default
        _ => (0.0, 1.0),
    }
}

/// Setup default Midimix mappings (faders 1-6 to slot 0-5 alpha)
fn setup_midimix_default_mappings() {
    log::debug!("[MIDI] Setting up Midimix default mappings for slot alphas");

    // Check if we already have mappings for these parameters (don't override user mappings)
    let existing_mappings = with_midi_engine(|state| state.mappings.clone());

    for slot in 0..6 {
        let param_id = format!("slot_{}_alpha", slot);

        // Skip if there's already a mapping for this parameter
        if existing_mappings.iter().any(|m| m.parameter_id == param_id) {
            log::debug!("[MIDI] Skipping {} - already has a mapping", param_id);
            continue;
        }

        let mapping = MidiMapping {
            parameter_id: param_id.clone(),
            channel: Some(0),
            cc_number: MIDIMIX_FADER_CCS[slot],
            min_value: 0.0,
            max_value: 1.0,
            device_id: None, // Accept from any device
        };

        with_midi_engine(|state| {
            state.mappings.push(mapping);
        });

        log::debug!(
            "[MIDI] Added default mapping: fader {} (CC {}) -> {}",
            slot + 1,
            MIDIMIX_FADER_CCS[slot],
            param_id
        );
    }

    save_mappings_to_disk();
}

/// Close a MIDI output device.
pub fn close_output_device(device_id: String) -> Result<(), String> {
    // Check if this is a Midimix and send shutdown animation BEFORE removing the connection
    let is_midimix = with_midi_engine(|state| {
        state
            .output_connections
            .get(&device_id)
            .map(|conn| is_midimix_device(&conn.device_name))
            .unwrap_or(false)
    });

    if is_midimix {
        // Send shutdown animation synchronously (blocking)
        send_midimix_shutdown_animation_sync(&device_id);
    }

    let connection = with_midi_engine(|state| {
        state.last_sent_cc.remove(&device_id);
        state.output_connections.remove(&device_id)
    });

    match connection {
        Some(mut conn) => {
            // Dropping the connection closes it
            if let Some(c) = conn.connection.take() {
                drop(c);
            }
            log::debug!("[MIDI] Closed output device: {}", device_id);
            emit_output_devices_changed();
            Ok(())
        }
        None => Err(format!("Output device {} is not connected", device_id)),
    }
}

/// Close all MIDI output devices.
pub fn close_all_output_devices() {
    let device_ids: Vec<String> =
        with_midi_engine(|state| state.output_connections.keys().cloned().collect());

    for device_id in device_ids {
        let _ = close_output_device(device_id);
    }
}

// ============================================================================
// MIDI Output Functions
// ============================================================================

/// Send a MIDI Control Change message.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `cc_number` - CC number (0-127)
/// * `value` - CC value (0-127)
pub fn send_cc(
    device_id: Option<&str>,
    channel: u8,
    cc_number: u8,
    value: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if cc_number > 127 {
        return Err("CC number must be 0-127".to_string());
    }
    if value > 127 {
        return Err("CC value must be 0-127".to_string());
    }

    // Build the CC message: status byte (0xB0 + channel), CC number, value
    let message = [0xB0 | channel, cc_number, value];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            // Check if value has changed to avoid redundant sends
            if let Some(cache) = state.last_sent_cc.get(&id) {
                if cache.get(&(channel, cc_number)) == Some(&value) {
                    continue; // Skip if value hasn't changed
                }
            }

            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send CC to {}: {}", id, e);
                    } else {
                        // Update cache
                        state
                            .last_sent_cc
                            .entry(id.clone())
                            .or_insert_with(HashMap::new)
                            .insert((channel, cc_number), value);
                        log::trace!(
                            "[MIDI] Sent CC {} = {} on channel {} to {}",
                            cc_number,
                            value,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send a MIDI Note On message.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `note` - Note number (0-127)
/// * `velocity` - Note velocity (0-127, 0 is often treated as Note Off)
pub fn send_note_on(
    device_id: Option<&str>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if note > 127 {
        return Err("Note number must be 0-127".to_string());
    }
    if velocity > 127 {
        return Err("Velocity must be 0-127".to_string());
    }

    // Build the Note On message: status byte (0x90 + channel), note, velocity
    let message = [0x90 | channel, note, velocity];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send Note On to {}: {}", id, e);
                    } else {
                        log::trace!(
                            "[MIDI] Sent Note On {} vel {} on channel {} to {}",
                            note,
                            velocity,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send a MIDI Note Off message.
///
/// Note: This sends Note On with velocity 0, which is the more universally
/// compatible way to turn off notes/LEDs. Many devices (including AKAI Midimix)
/// don't respond to actual Note Off (0x80) messages for LED control.
///
/// # Arguments
/// * `device_id` - The output device ID to send to, or None to send to all connected outputs
/// * `channel` - MIDI channel (0-15)
/// * `note` - Note number (0-127)
/// * `_velocity` - Release velocity (ignored, always sends velocity 0)
pub fn send_note_off(
    device_id: Option<&str>,
    channel: u8,
    note: u8,
    _velocity: u8,
) -> Result<(), String> {
    if channel > 15 {
        return Err("MIDI channel must be 0-15".to_string());
    }
    if note > 127 {
        return Err("Note number must be 0-127".to_string());
    }

    // Send Note On with velocity 0 (more compatible than Note Off 0x80)
    // This is the standard way to turn off LEDs on controllers like Midimix
    let message = [0x90 | channel, note, 0];

    with_midi_engine(|state| {
        let device_ids: Vec<String> = if let Some(id) = device_id {
            if state.output_connections.contains_key(id) {
                vec![id.to_string()]
            } else {
                return Err(format!("Output device {} is not connected", id));
            }
        } else {
            state.output_connections.keys().cloned().collect()
        };

        for id in device_ids {
            if let Some(conn) = state.output_connections.get_mut(&id) {
                if let Some(ref mut connection) = conn.connection {
                    if let Err(e) = connection.send(&message) {
                        log::warn!("[MIDI] Failed to send Note Off to {}: {}", id, e);
                    } else {
                        log::trace!(
                            "[MIDI] Sent Note Off {} (vel 0) on channel {} to {}",
                            note,
                            channel,
                            id
                        );
                    }
                }
            }
        }
        Ok(())
    })
}

/// Send MIDI feedback for a parameter value change.
/// This looks up the MIDI mapping for the parameter and sends the appropriate CC.
///
/// # Arguments
/// * `parameter_id` - The parameter ID to send feedback for
/// * `value` - The current parameter value
pub fn send_parameter_feedback(parameter_id: &str, value: f64) {
    // Get the mapping and output config
    let (mapping, config) = with_midi_engine(|state| {
        let mapping = state
            .mappings
            .iter()
            .find(|m| m.parameter_id == parameter_id)
            .cloned();
        (mapping, state.output_config.clone())
    });

    // If feedback is disabled or no mapping, skip
    if !config.send_cc_feedback {
        return;
    }

    let Some(mapping) = mapping else {
        return;
    };

    // Convert parameter value back to CC value (0-127)
    let range = mapping.max_value - mapping.min_value;
    if range.abs() < f64::EPSILON {
        return;
    }

    let normalized = (value - mapping.min_value) / range;
    let cc_value = (normalized.clamp(0.0, 1.0) * 127.0).round() as u8;

    // Get channel (default to 0 if not specified)
    let channel = mapping.channel.unwrap_or(0);

    // Note: mapping.device_id is for INPUT filtering, not output selection.
    // For output, we use config.output_device_id (or send to all connected outputs if None).
    let device_id = config.output_device_id.as_deref();

    if let Err(e) = send_cc(device_id, channel, mapping.cc_number, cc_value) {
        log::debug!("[MIDI] Failed to send feedback for {}: {}", parameter_id, e);
    } else {
        log::debug!(
            "[MIDI] Sent feedback for {} = {} (CC {} = {} on channel {})",
            parameter_id,
            value,
            mapping.cc_number,
            cc_value,
            channel
        );
    }
}

/// Set the MIDI output configuration.
pub fn set_output_config(config: MidiOutputConfig) {
    with_midi_engine(|state| {
        state.output_config = config;
    });
    log::debug!("[MIDI] Output config updated");
}

/// Get the current MIDI output configuration.
pub fn get_output_config() -> MidiOutputConfig {
    with_midi_engine(|state| state.output_config.clone())
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
                min_value: learn_state.pending_min_value,
                max_value: learn_state.pending_max_value,
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

    // Handle Midimix master fader (CC 62) for global fade control
    if type_str == "cc" && control == MIDIMIX_MASTER_FADER_CC && channel == 0 {
        handle_master_fader(engine, value as u8, app_handle.as_ref());
        // Don't return - still process regular mappings if any exist for CC 62
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
                // Note: We pass skip_feedback=true to avoid feedback loops
                apply_midi_to_parameter(
                    &mapping.parameter_id,
                    mapped_value,
                    app_handle.as_ref(),
                    true,
                );
            }
        }
    }
}

/// Handle the Midimix master fader (CC 62).
/// When fading down: only affects slots with alpha > new value (clamp down).
/// When fading up: sets all slot alphas to the master value (bring up together).
fn handle_master_fader(
    engine: &Arc<Mutex<MidiEngineState>>,
    cc_value: u8,
    app_handle: Option<&AppHandle>,
) {
    let normalized = (cc_value as f64) / 127.0;

    // Get last master value and current slot states
    let (last_master, active_slots) = {
        let state = engine.lock().unwrap();
        (state.last_master_value, state.active_slots.clone())
    };

    // Determine direction
    let is_fading_down = last_master.map_or(false, |last| cc_value < last);

    // Update stored master value
    {
        let mut state = engine.lock().unwrap();
        state.last_master_value = Some(cc_value);
    }

    log::debug!(
        "[MIDI] Master fader: {} (normalized: {:.2}, direction: {})",
        cc_value,
        normalized,
        if is_fading_down { "down" } else { "up" }
    );

    // Apply to all slot alphas
    for slot_state in &active_slots {
        if !slot_state.exists {
            continue;
        }

        let param_id = format!("slot_{}_alpha", slot_state.index);

        // Get current alpha value
        let current_alpha = crate::with_parameter_store(|store| {
            store.get(&param_id).map(|p| p.target).unwrap_or(1.0)
        });

        let new_alpha = if is_fading_down {
            // Fading down: only clamp slots that are above the master value
            if current_alpha > normalized {
                normalized
            } else {
                // Don't change slots that are already below master
                continue;
            }
        } else {
            // Fading up: bring all slots up to the master value
            normalized
        };

        // Apply the new alpha
        crate::with_parameter_store(|store| {
            store.set_target(param_id.clone(), new_alpha);
        });

        // Emit parameter_changed event
        if let Some(handle) = app_handle {
            if let Some(param) = crate::with_parameter_store(|store| store.get(&param_id)) {
                let _ = handle.emit("parameter_changed", &param);
            }
        }

        log::debug!(
            "[MIDI] Master fader set slot {} alpha: {:.2} -> {:.2}",
            slot_state.index,
            current_alpha,
            new_alpha
        );
    }
}

/// Apply a MIDI-derived value to a parameter.
fn apply_midi_to_parameter(
    parameter_id: &str,
    value: f64,
    app_handle: Option<&AppHandle>,
    skip_feedback: bool,
) {
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

    // Send MIDI feedback if not skipped (to avoid feedback loops when value comes from MIDI)
    if !skip_feedback {
        send_parameter_feedback(parameter_id, value);
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

/// Start MIDI Learn mode for a parameter with specified value range.
pub fn start_learn(parameter_id: String, min_value: f64, max_value: f64) -> Result<(), String> {
    with_midi_engine(|state| {
        if state.learn_state.is_learning {
            return Err("Already in learn mode".to_string());
        }
        state.learn_state.is_learning = true;
        state.learn_state.parameter_id = Some(parameter_id.clone());
        state.learn_state.pending_min_value = min_value;
        state.learn_state.pending_max_value = max_value;
        Ok(())
    })?;

    log::debug!(
        "[MIDI] Started learn mode for parameter: {} (range: {} - {})",
        parameter_id,
        min_value,
        max_value
    );

    // Emit learn state change
    emit_learn_state_changed();

    Ok(())
}

/// Cancel MIDI Learn mode.
pub fn cancel_learn() -> Result<(), String> {
    with_midi_engine(|state| {
        state.learn_state.is_learning = false;
        state.learn_state.parameter_id = None;
        state.learn_state.pending_min_value = 0.0;
        state.learn_state.pending_max_value = 1.0;
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
fn mappings_path() -> Option<std::path::PathBuf> {
    dirs::data_local_dir().map(|mut path| {
        path.push("sebcat-vj");
        path.push("midi_mappings.json");
        path
    })
}

/// Load MIDI mappings from disk.
fn load_mappings_from_disk() {
    let Some(path) = mappings_path() else {
        log::warn!("[MIDI] Could not determine mappings file path");
        return;
    };

    if !path.exists() {
        log::debug!("[MIDI] No mappings file found at {:?}", path);
        return;
    }

    match std::fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<Vec<MidiMapping>>(&contents) {
            Ok(mappings) => {
                with_midi_engine(|state| {
                    state.mappings = mappings;
                });
                log::debug!("[MIDI] Loaded mappings from {:?}", path);
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

/// Save MIDI mappings to disk.
fn save_mappings_to_disk() {
    let Some(path) = mappings_path() else {
        log::warn!("[MIDI] Could not determine mappings file path");
        return;
    };

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("[MIDI] Failed to create mappings directory: {}", e);
            return;
        }
    }

    let mappings = with_midi_engine(|state| state.mappings.clone());

    match serde_json::to_string_pretty(&mappings) {
        Ok(json) => {
            if let Err(e) = std::fs::write(&path, json) {
                log::warn!("[MIDI] Failed to write mappings file: {}", e);
            } else {
                log::debug!("[MIDI] Saved mappings to {:?}", path);
            }
        }
        Err(e) => {
            log::warn!("[MIDI] Failed to serialize mappings: {}", e);
        }
    }
}

// ============================================================================
// Event Emission
// ============================================================================

/// Emit a devices_changed event.
fn emit_devices_changed() {
    if let Some(handle) = with_midi_engine(|state| state.app_handle.clone()) {
        if let Ok(devices) = list_devices() {
            let _ = handle.emit("midi_devices_changed", &devices);
        }
    }
}

/// Emit an output_devices_changed event.
fn emit_output_devices_changed() {
    if let Some(handle) = with_midi_engine(|state| state.app_handle.clone()) {
        if let Ok(devices) = list_output_devices() {
            let _ = handle.emit("midi_output_devices_changed", &devices);
        }
    }
}

/// Emit a learn_state_changed event.
fn emit_learn_state_changed() {
    if let Some(handle) = with_midi_engine(|state| state.app_handle.clone()) {
        let learn_state = get_learn_state();
        let _ = handle.emit("midi_learn_state_changed", &learn_state);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List available MIDI input devices.
#[tauri::command]
pub fn list_midi_devices() -> Result<Vec<MidiDeviceInfo>, String> {
    list_devices()
}

/// List available MIDI output devices.
#[tauri::command]
pub fn list_midi_output_devices() -> Result<Vec<MidiOutputDeviceInfo>, String> {
    list_output_devices()
}

/// Open a MIDI device for input.
#[tauri::command]
pub fn open_midi_device(device_id: String) -> Result<(), String> {
    open_device(device_id)
}

/// Open a MIDI device for output.
#[tauri::command]
pub fn open_midi_output_device(device_id: String) -> Result<(), String> {
    open_output_device(device_id)
}

/// Close a MIDI input device.
#[tauri::command]
pub fn close_midi_device(device_id: String) -> Result<(), String> {
    close_device(device_id)
}

/// Close a MIDI output device.
#[tauri::command]
pub fn close_midi_output_device(device_id: String) -> Result<(), String> {
    close_output_device(device_id)
}

/// Start MIDI Learn mode for a parameter.
#[tauri::command]
pub fn start_midi_learn(
    parameter_id: String,
    min_value: f64,
    max_value: f64,
) -> Result<(), String> {
    start_learn(parameter_id, min_value, max_value)
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

/// Send a MIDI CC message to an output device.
#[tauri::command]
pub fn send_midi_cc(
    device_id: Option<String>,
    channel: u8,
    cc_number: u8,
    value: u8,
) -> Result<(), String> {
    send_cc(device_id.as_deref(), channel, cc_number, value)
}

/// Send a MIDI Note On message to an output device.
#[tauri::command]
pub fn send_midi_note_on(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    send_note_on(device_id.as_deref(), channel, note, velocity)
}

/// Send a MIDI Note Off message to an output device.
#[tauri::command]
pub fn send_midi_note_off(
    device_id: Option<String>,
    channel: u8,
    note: u8,
    velocity: u8,
) -> Result<(), String> {
    send_note_off(device_id.as_deref(), channel, note, velocity)
}

/// Set MIDI output configuration.
#[tauri::command]
pub fn set_midi_output_config(config: MidiOutputConfig) {
    set_output_config(config)
}

/// Get MIDI output configuration.
#[tauri::command]
pub fn get_midi_output_config() -> MidiOutputConfig {
    get_output_config()
}

/// Trigger MIDI feedback for a parameter.
#[tauri::command]
pub fn trigger_midi_feedback(parameter_id: String, value: f64) {
    send_parameter_feedback(&parameter_id, value)
}
