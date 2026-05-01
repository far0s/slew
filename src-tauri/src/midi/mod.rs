//! MIDI I/O engine with hot-plug detection and MIDI Learn.

pub(crate) mod apc_mini;
pub mod commands;
pub mod connections;
pub(crate) mod constants;
pub mod devices;
pub mod engine;
pub(crate) mod events;
pub mod learn;
pub mod mappings;
pub(crate) mod message_handler;
pub mod midimix;
pub(crate) mod mpd218;
pub mod output;
pub mod types;

pub use connections::{
    clear_auto_reconnect_devices, close_all_devices, close_all_output_devices, close_device,
    close_output_device, is_auto_reconnect_enabled, open_device, open_output_device,
    set_auto_reconnect,
};
pub use devices::{list_devices, list_output_devices};
pub use engine::{cleanup_midi, init_midi_engine};
pub use learn::{cancel_learn, get_learn_state, start_learn};
pub use mappings::{clear_mappings, get_mappings, install_default_cc_mappings, remove_mapping, set_mapping};
// Midimix-specific operations kept at midi:: level for existing call sites
pub use midimix::{pulse_beat_led, set_active_slots, update_midimix_leds};
pub use output::{
    get_output_config, send_cc, send_note_off, send_note_on, send_parameter_feedback,
    set_output_config,
};
pub use types::{
    MidiDeviceInfo, MidiLearnComplete, MidiLearnState, MidiMapping, MidiMessage, MidiOutputConfig,
    MidiOutputDeviceInfo, MidiPickupStateUpdate,
};
