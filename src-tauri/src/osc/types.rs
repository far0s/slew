//! OSC type definitions.

use serde::{Deserialize, Serialize};

// ============================================================================
// Types
// ============================================================================

/// Status of the OSC server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscServerStatus {
    /// Whether the server is currently running
    pub is_running: bool,
    /// The port the server is listening on (if running)
    pub port: Option<u16>,
    /// Error message if the server failed to start
    pub error: Option<String>,
}

/// An OSC mapping that routes an address pattern to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscMapping {
    /// The OSC address pattern (e.g., "/scene/a/brightness")
    pub address: String,
    /// The parameter ID this mapping controls
    pub parameter_id: String,
    /// Minimum input value (maps to min_output)
    pub min_input: f64,
    /// Maximum input value (maps to max_output)
    pub max_input: f64,
    /// Minimum output value
    pub min_output: f64,
    /// Maximum output value
    pub max_output: f64,
}

impl Default for OscMapping {
    fn default() -> Self {
        Self {
            address: String::new(),
            parameter_id: String::new(),
            min_input: 0.0,
            max_input: 1.0,
            min_output: 0.0,
            max_output: 1.0,
        }
    }
}

/// Beat event emitted to the frontend when /slew/beat is received.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscBeatInfo {
    /// Timestamp in milliseconds
    pub timestamp: u64,
    /// Optional BPM if set via /slew/bpm (None if not yet received)
    pub bpm: Option<f64>,
}

/// A raw OSC message for UI display / activity indicators.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscMessageInfo {
    /// The OSC address
    pub address: String,
    /// String representation of the arguments
    pub args: Vec<String>,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}

/// Configuration for which OSC addresses trigger beat/BPM input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscBeatConfig {
    /// OSC address that fires a beat pulse (default "/slew/beat")
    pub beat_address: String,
    /// OSC address that sets the BPM (default "/slew/bpm")
    pub bpm_address: String,
}

impl Default for OscBeatConfig {
    fn default() -> Self {
        Self {
            beat_address: "/slew/beat".to_string(),
            bpm_address: "/slew/bpm".to_string(),
        }
    }
}

/// Configuration for the OSC output client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscOutputConfig {
    /// Whether the output client is enabled
    pub enabled: bool,
    /// Target hostname or IP address
    pub host: String,
    /// Target port
    pub port: u16,
    /// Forward a /slew/beat message on every detected beat
    pub forward_beat: bool,
    /// Forward a /slew/bpm message when BPM changes
    pub forward_bpm: bool,
    /// Forward a /slew/slot/{n}/color/{template_id} message when a color param changes
    pub forward_colors: bool,
}

impl Default for OscOutputConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            host: "127.0.0.1".to_string(),
            port: 9001,
            forward_beat: true,
            forward_bpm: true,
            forward_colors: false,
        }
    }
}
