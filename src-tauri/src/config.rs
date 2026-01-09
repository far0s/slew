//! Centralized configuration constants for the Slew backend.
//! Audio-specific constants remain in `audio/constants.rs`.

// Window Management
pub const HEARTBEAT_INTERVAL_MS: u64 = 5000;
pub const HEARTBEAT_TIMEOUT_MS: u64 = 15000;

// Parameter Server
pub const PARAMETER_TICK_RATE_HZ: f64 = 60.0;
pub const PARAMETER_TICK_INTERVAL_MS: u64 = (1000.0 / PARAMETER_TICK_RATE_HZ) as u64;

// Preview Streaming
pub const DEFAULT_PREVIEW_RESOLUTION_SCALE: f32 = 0.5;
pub const DEFAULT_PREVIEW_FPS: u32 = 30;
pub const MAX_FRAME_BUFFER_SIZE: usize = 3;

// Video Output
pub const DEFAULT_VIDEO_OUTPUT_WIDTH: u32 = 1920;
pub const DEFAULT_VIDEO_OUTPUT_HEIGHT: u32 = 1080;
pub const VIDEO_OUTPUT_FPS: u32 = 60;

// OSC
pub const OSC_DEFAULT_PORT: u16 = 9000;

// Persistence filenames
pub const PARAMETERS_FILENAME: &str = "parameters.json";
pub const MIDI_MAPPINGS_FILENAME: &str = "midi_mappings.json";
pub const AUDIO_MAPPINGS_FILENAME: &str = "audio_mappings.json";
pub const MODULATION_FILENAME: &str = "modulation.json";
pub const SLOTS_FILENAME: &str = "slots.json";
