//! MIDI type definitions.
//!
//! Contains all public structs and enums used by the MIDI module.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use midir::{MidiInputConnection, MidiOutputConnection};
use tauri::AppHandle;

// ============================================================================
// Public Types (serializable, exposed to frontend)
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
// Internal Types (not serializable, used within the engine)
// ============================================================================

/// Holds an active MIDI input connection along with its device info.
pub(crate) struct ActiveInputConnection {
    #[allow(dead_code)]
    pub device_id: String,
    pub device_name: String,
    /// The connection must be kept alive; dropping it closes the port.
    /// We use Option to allow taking ownership when closing.
    pub connection: Option<MidiInputConnection<()>>,
}

/// Holds an active MIDI output connection along with its device info.
pub(crate) struct ActiveOutputConnection {
    #[allow(dead_code)]
    pub device_id: String,
    pub device_name: String,
    pub connection: Option<MidiOutputConnection>,
}

/// Tracks which slots are active for LED updates.
#[derive(Debug, Clone)]
pub(crate) struct SlotState {
    pub index: usize,
    #[allow(dead_code)]
    pub exists: bool,
    pub sketch_id: Option<String>,
}

/// State for soft-takeover (pickup) mode on faders/knobs.
#[derive(Debug, Clone, Default)]
pub(crate) struct PickupState {
    /// Whether the control has "picked up" the current parameter value
    pub picked_up: bool,
    /// Last CC value received from the controller
    pub last_cc: Option<u8>,
    /// Whether to ignore the next CC value (for initial pickup)
    pub ignore_next: bool,
}

/// The complete state of the MIDI engine.
pub(crate) struct MidiEngineState {
    /// Active input connections, keyed by device ID
    pub connections: HashMap<String, ActiveInputConnection>,
    /// Active output connections, keyed by device ID
    pub output_connections: HashMap<String, ActiveOutputConnection>,
    /// Current MIDI mappings
    pub mappings: Vec<MidiMapping>,
    /// State for MIDI Learn mode
    pub learn_state: MidiLearnState,
    /// App handle for event emission
    pub app_handle: Option<AppHandle>,
    /// Known input device names for change detection
    pub known_device_names: HashSet<String>,
    /// Known output device names for change detection
    pub known_output_device_names: HashSet<String>,
    /// Device names that should auto-reconnect
    pub auto_reconnect_devices: HashSet<String>,
    /// Output device names that should auto-reconnect
    pub auto_reconnect_output_devices: HashSet<String>,
    /// Whether auto-reconnect is enabled globally
    pub auto_reconnect_enabled: bool,
    /// Output configuration
    pub output_config: MidiOutputConfig,
    /// Last sent CC values for output deduplication, keyed by device ID then (channel, cc_number)
    pub last_sent_cc: HashMap<String, HashMap<(u8, u8), u8>>,
    /// Currently active slots for LED updates
    pub active_slots: Vec<SlotState>,
    /// Last master fader value (for crossfade)
    pub last_master_value: Option<f64>,
    /// Pickup state for soft takeover, keyed by (channel, cc_number)
    pub pickup_state: HashMap<(u8, u8), PickupState>,
    /// Mute state per slot (true = audio muted for that slot)
    pub slot_muted: [bool; 8],
    /// Whether the SOLO button is currently held
    pub solo_held: bool,
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
            pickup_state: HashMap::new(),
            slot_muted: [false; 8],
            solo_held: false,
        }
    }
}
