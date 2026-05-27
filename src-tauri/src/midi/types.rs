//! MIDI type definitions.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::time::Instant;

use midir::{MidiInputConnection, MidiOutputConnection};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiOutputDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_connected: bool,
}

/// Whether a note mapping uses velocity as continuous value, or triggers on/off.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum NoteMappingMode {
    /// Velocity (0–127) maps linearly to min_value..max_value
    Velocity,
    /// Note-on fires max_value; note-off fires min_value
    Trigger,
}

/// Binds a MIDI CC or Note message to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMapping {
    pub parameter_id: String,
    /// MIDI channel (0-15, or None for any channel)
    pub channel: Option<u8>,
    /// CC number — present for CC mappings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cc_number: Option<u8>,
    /// Note number — present for note mappings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_number: Option<u8>,
    /// Note mapping mode — present for note mappings
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note_mode: Option<NoteMappingMode>,
    pub min_value: f64,
    pub max_value: f64,
    /// Device ID this mapping is specific to (None = any device)
    pub device_id: Option<String>,
}

impl MidiMapping {
    pub fn is_cc(&self) -> bool {
        self.cc_number.is_some()
    }
    pub fn is_note(&self) -> bool {
        self.note_number.is_some()
    }
}

/// Raw MIDI message for UI display / activity indicators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMessage {
    pub device_id: String,
    pub channel: u8,
    /// "cc", "note_on", "note_off", "pitch_bend", "other"
    pub message_type: String,
    pub control: u8,
    /// 0-127 for CC/notes, 0-16383 for pitch bend
    pub value: u16,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiLearnState {
    pub is_learning: bool,
    pub parameter_id: Option<String>,
    pub pending_min_value: f64,
    pub pending_max_value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiLearnComplete {
    pub mapping: MidiMapping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiOutputConfig {
    pub send_cc_feedback: bool,
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

// Internal types (not serializable)

pub(crate) struct ActiveInputConnection {
    pub device_name: String,
    pub connection: Option<MidiInputConnection<()>>,
}

pub(crate) struct ActiveOutputConnection {
    pub device_name: String,
    pub connection: Option<MidiOutputConnection>,
}

#[derive(Debug, Clone)]
pub(crate) struct MidiSlotSnapshot {
    pub index: usize,
    pub exists: bool,
    pub sketch_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct PickupState {
    pub picked_up: bool,
    pub last_cc: Option<u8>,
    pub ignore_next: bool,
}

/// Pickup state update sent to frontend for soft takeover indicator.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiPickupStateUpdate {
    /// The parameter ID this pickup state is for
    pub parameter_id: String,
    /// Whether the control has picked up the parameter value
    pub picked_up: bool,
    /// MIDI value normalized to parameter range (min_value to max_value)
    pub midi_value: f64,
    /// Direction to move to pick up: "left", "right", or null if picked up
    pub direction: Option<String>,
}

/// Tracks last pickup event emission time for throttling
#[derive(Debug, Clone, Default)]
pub(crate) struct PickupEventThrottle {
    pub last_event_time: Option<Instant>,
}

pub(crate) struct MidiEngineState {
    pub connections: HashMap<String, ActiveInputConnection>,
    pub output_connections: HashMap<String, ActiveOutputConnection>,
    pub mappings: Vec<MidiMapping>,
    pub learn_state: MidiLearnState,
    pub app_handle: Option<AppHandle>,
    pub known_device_names: HashSet<String>,
    pub known_output_device_names: HashSet<String>,
    pub auto_reconnect_devices: HashSet<String>,
    pub auto_reconnect_output_devices: HashSet<String>,
    pub auto_reconnect_enabled: bool,
    pub output_config: MidiOutputConfig,
    pub last_sent_cc: HashMap<String, HashMap<(u8, u8), u8>>,
    pub active_slots: Vec<MidiSlotSnapshot>,
    pub last_master_value: Option<f64>,
    pub pickup_state: HashMap<(u8, u8), PickupState>,
    /// Throttle state for pickup events per parameter
    pub pickup_event_throttle: HashMap<String, PickupEventThrottle>,
    pub slot_muted: [bool; 8],
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
            pickup_event_throttle: HashMap::new(),
            slot_muted: [false; 8],
            solo_held: false,
        }
    }
}
