//! MIDI type definitions.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

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

/// Binds a MIDI CC message to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiMapping {
    pub parameter_id: String,
    /// MIDI channel (0-15, or None for any channel)
    pub channel: Option<u8>,
    pub cc_number: u8,
    pub min_value: f64,
    pub max_value: f64,
    /// Device ID this mapping is specific to (None = any device)
    pub device_id: Option<String>,
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
    #[allow(dead_code)]
    pub device_id: String,
    pub device_name: String,
    pub connection: Option<MidiInputConnection<()>>,
}

pub(crate) struct ActiveOutputConnection {
    #[allow(dead_code)]
    pub device_id: String,
    pub device_name: String,
    pub connection: Option<MidiOutputConnection>,
}

#[derive(Debug, Clone)]
pub(crate) struct SlotState {
    pub index: usize,
    #[allow(dead_code)]
    pub exists: bool,
    pub sketch_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct PickupState {
    pub picked_up: bool,
    pub last_cc: Option<u8>,
    pub ignore_next: bool,
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
    pub active_slots: Vec<SlotState>,
    pub last_master_value: Option<f64>,
    pub pickup_state: HashMap<(u8, u8), PickupState>,
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
            slot_muted: [false; 8],
            solo_held: false,
        }
    }
}
