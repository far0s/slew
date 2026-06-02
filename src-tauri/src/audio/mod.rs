//! Audio capture, FFT analysis, and audio-reactive parameter mapping.

pub mod analysis;
pub mod buffer;
pub mod capture;
pub mod commands;
pub mod constants;
pub mod devices;
pub mod engine;
pub mod events;
pub mod mappings;
pub mod types;

pub use engine::init_audio_engine;

pub use types::{
    AudioBands, AudioDeviceInfo, AudioLevels, AudioMapping, AudioMappingMode, AudioSource,
    AudioStatus,
};

pub use devices::list_devices;

pub use capture::{
    get_status, is_auto_reconnect_enabled, set_auto_reconnect, start_capture, stop_capture,
};

pub use mappings::{
    add_mapping, clear_mappings, get_mappings, remove_mapping, restore_bulk, set_mapping_enabled,
};
