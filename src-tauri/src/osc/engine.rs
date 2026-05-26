//! Global OSC engine state and initialization.

use once_cell::sync::Lazy;
use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

use super::types::{OscBeatConfig, OscMapping, OscOutputConfig, OscServerStatus};

// ============================================================================
// Global State
// ============================================================================

/// Global OSC engine state.
pub(super) struct OscEngineState {
    /// Server status
    pub(super) status: OscServerStatus,
    /// All known mappings
    pub(super) mappings: Vec<OscMapping>,
    /// App handle for emitting events (set during init)
    pub(super) app_handle: Option<AppHandle>,
    /// Flag to signal the server thread to stop
    pub(super) should_stop: Arc<Mutex<bool>>,
    /// Most recent BPM received via /slew/bpm (None until first message)
    pub(super) osc_bpm: Option<f64>,
    /// Output config
    pub(super) output_config: OscOutputConfig,
    /// Beat/BPM address config
    pub(super) beat_config: OscBeatConfig,
    /// UDP socket for sending OSC output (None if not yet bound or disabled)
    pub(super) output_socket: Option<UdpSocket>,
}

impl Default for OscEngineState {
    fn default() -> Self {
        Self {
            status: OscServerStatus {
                is_running: false,
                port: None,
                error: None,
            },
            mappings: Vec::new(),
            app_handle: None,
            should_stop: Arc::new(Mutex::new(false)),
            osc_bpm: None,
            output_config: OscOutputConfig::default(),
            output_socket: None,
            beat_config: OscBeatConfig::default(),
        }
    }
}

pub(super) static OSC_ENGINE: Lazy<Arc<Mutex<OscEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(OscEngineState::default())));

/// Helper to access the OSC engine state.
pub(super) fn with_osc_engine<T, F: FnOnce(&mut OscEngineState) -> T>(f: F) -> T {
    let mut state = OSC_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize the OSC engine with an app handle for event emission.
/// Call this during Tauri setup.
pub fn init_osc_engine(app_handle: AppHandle) {
    with_osc_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    // Load mappings from disk
    super::mappings::load_mappings_from_disk();
    super::send::load_output_config_from_disk();
    super::beat::load_beat_config_from_disk();

    log::debug!("[OSC] Engine initialized");
}
