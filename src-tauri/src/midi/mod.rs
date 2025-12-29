//! MIDI Input/Output Engine
//!
//! Provides MIDI device enumeration, connection management, message parsing,
//! MIDI Learn functionality, and MIDI output for controller feedback.
//!
//! Features hot-plug detection via background polling and optional auto-reconnect.
//!
//! # Module Structure
//!
//! - `commands` - Tauri command wrappers for frontend IPC
//! - `connections` - Input/output connection management
//! - `constants` - MIDI constants (MIDImix CC/note numbers, etc.)
//! - `devices` - Device enumeration and discovery
//! - `engine` - Core engine state and initialization
//! - `events` - Event emission helpers
//! - `learn` - MIDI Learn functionality
//! - `mappings` - Mapping CRUD and persistence
//! - `message_handler` - MIDI message parsing and routing
//! - `midimix` - AKAI MIDImix specific functionality
//! - `output` - MIDI output functions
//! - `types` - Type definitions

pub mod commands;
pub mod connections;
pub mod constants;
pub mod devices;
pub mod engine;
pub mod events;
pub mod learn;
pub mod mappings;
pub mod message_handler;
pub mod midimix;
pub mod output;
pub mod types;

// ============================================================================
// Public Re-exports
// ============================================================================

// Engine initialization and cleanup
pub use engine::{cleanup_midi, init_midi_engine};

// Types used by external code
pub use types::{
    MidiDeviceInfo, MidiLearnComplete, MidiLearnState, MidiMapping, MidiMessage, MidiOutputConfig,
    MidiOutputDeviceInfo,
};

// Device listing
pub use devices::{list_devices, list_output_devices};

// Connection management
pub use connections::{
    clear_auto_reconnect_devices, close_all_devices, close_all_output_devices, close_device,
    close_output_device, is_auto_reconnect_enabled, open_device, open_output_device,
    set_auto_reconnect,
};

// Learn mode
pub use learn::{cancel_learn, get_learn_state, start_learn};

// Mappings
pub use mappings::{clear_mappings, get_mappings, remove_mapping, set_mapping};

// Output
pub use output::{
    get_output_config, send_cc, send_note_off, send_note_on, send_parameter_feedback,
    set_output_config,
};

// MIDImix specific (exposed for audio engine beat LED)
pub use midimix::{pulse_beat_led, set_active_slots, update_midimix_leds};
