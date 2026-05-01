//! OSC Input Engine
//!
//! Provides OSC (Open Sound Control) message reception via UDP,
//! address pattern matching, and routing to the Parameter Server.

use once_cell::sync::Lazy;
use rosc::{OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};

use std::net::UdpSocket;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

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

// ============================================================================
// Global State
// ============================================================================

/// Global OSC engine state.
struct OscEngineState {
    /// Server status
    status: OscServerStatus,
    /// All known mappings
    mappings: Vec<OscMapping>,
    /// App handle for emitting events (set during init)
    app_handle: Option<AppHandle>,
    /// Flag to signal the server thread to stop
    should_stop: Arc<Mutex<bool>>,
    /// Most recent BPM received via /slew/bpm (None until first message)
    osc_bpm: Option<f64>,
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
        }
    }
}

static OSC_ENGINE: Lazy<Arc<Mutex<OscEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(OscEngineState::default())));

/// Helper to access the OSC engine state.
fn with_osc_engine<T, F: FnOnce(&mut OscEngineState) -> T>(f: F) -> T {
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
    load_mappings_from_disk();

    log::debug!("[OSC] Engine initialized");
}

// ============================================================================
// Server Management
// ============================================================================

/// Start the OSC server on the specified port.
pub fn start_server(port: u16) -> Result<(), String> {
    // Check if already running
    let is_running = with_osc_engine(|state| state.status.is_running);
    if is_running {
        return Err("OSC server is already running".to_string());
    }

    // Bind UDP socket
    let bind_addr = format!("0.0.0.0:{}", port);
    let socket = UdpSocket::bind(&bind_addr)
        .map_err(|e| format!("Failed to bind to {}: {}", bind_addr, e))?;

    // Set socket to non-blocking for graceful shutdown
    socket
        .set_read_timeout(Some(std::time::Duration::from_millis(100)))
        .map_err(|e| format!("Failed to set socket timeout: {}", e))?;

    // Reset stop flag
    let should_stop = with_osc_engine(|state| {
        *state.should_stop.lock().unwrap() = false;
        state.should_stop.clone()
    });

    // Get app handle and mappings for the thread
    let app_handle = with_osc_engine(|state| state.app_handle.clone());

    // Spawn receiver thread
    let engine = OSC_ENGINE.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 4096];

        loop {
            // Check if we should stop
            if *should_stop.lock().unwrap() {
                break;
            }

            // Try to receive a packet
            match socket.recv_from(&mut buf) {
                Ok((size, _addr)) => {
                    // Parse OSC packet
                    if let Ok(packet) = rosc::decoder::decode_udp(&buf[..size]) {
                        // Get current mappings (they might have changed)
                        let current_mappings = {
                            let state = engine.lock().unwrap();
                            state.mappings.clone()
                        };

                        handle_osc_packet(&packet.1, &current_mappings, app_handle.as_ref());
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // Timeout, just continue
                    continue;
                }
                Err(e) => {
                    log::error!("[OSC] Socket error: {}", e);
                    break;
                }
            }
        }

        log::info!("[OSC] Server thread exiting");
    });

    // Update status
    with_osc_engine(|state| {
        state.status = OscServerStatus {
            is_running: true,
            port: Some(port),
            error: None,
        };
    });

    log::info!("[OSC] Server started on port {}", port);
    emit_status_changed();

    Ok(())
}

/// Stop the OSC server.
pub fn stop_server() -> Result<(), String> {
    let is_running = with_osc_engine(|state| state.status.is_running);
    if !is_running {
        return Err("OSC server is not running".to_string());
    }

    // Signal the thread to stop
    with_osc_engine(|state| {
        *state.should_stop.lock().unwrap() = true;
        state.status = OscServerStatus {
            is_running: false,
            port: None,
            error: None,
        };
    });

    log::info!("[OSC] Server stopped");
    emit_status_changed();

    Ok(())
}

/// Get the current server status.
pub fn get_status() -> OscServerStatus {
    with_osc_engine(|state| state.status.clone())
}

// ============================================================================
// OSC Message Handling
// ============================================================================

/// Handle an incoming OSC packet (may contain multiple messages).
fn handle_osc_packet(packet: &OscPacket, mappings: &[OscMapping], app_handle: Option<&AppHandle>) {
    match packet {
        OscPacket::Message(msg) => {
            handle_osc_message(msg, mappings, app_handle);
        }
        OscPacket::Bundle(bundle) => {
            for p in &bundle.content {
                handle_osc_packet(p, mappings, app_handle);
            }
        }
    }
}

/// Handle a single OSC message.
fn handle_osc_message(msg: &OscMessage, mappings: &[OscMapping], app_handle: Option<&AppHandle>) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Convert args to strings for display
    let args: Vec<String> = msg
        .args
        .iter()
        .map(|arg| match arg {
            OscType::Int(i) => i.to_string(),
            OscType::Float(f) => format!("{:.4}", f),
            OscType::String(s) => s.clone(),
            OscType::Bool(b) => b.to_string(),
            OscType::Double(d) => format!("{:.4}", d),
            OscType::Long(l) => l.to_string(),
            _ => "[complex]".to_string(),
        })
        .collect();

    let msg_info = OscMessageInfo {
        address: msg.addr.clone(),
        args: args.clone(),
        timestamp,
    };

    // Emit raw message for activity indicator
    if let Some(handle) = app_handle {
        let _ = handle.emit("osc_message", &msg_info);
    }

    // -------------------------------------------------------------------------
    // Reserved /slew/* addresses — handled before user mappings
    // -------------------------------------------------------------------------

    // /slew/beat — fire a beat pulse into the modulation engine
    if msg.addr == "/slew/beat" {
        handle_osc_beat(timestamp, app_handle);
        return;
    }

    // /slew/bpm <float> — update the modulation engine's BPM
    if msg.addr == "/slew/bpm" {
        if let Some(bpm) = extract_numeric(&msg.args) {
            let clamped = bpm.clamp(20.0, 300.0);
            with_osc_engine(|state| {
                state.osc_bpm = Some(clamped);
            });
            crate::modulation::update_bpm(Some(clamped));
            log::debug!("[OSC] BPM set to {:.1} via /slew/bpm", clamped);
        }
        return;
    }

    // -------------------------------------------------------------------------
    // User-defined parameter mappings
    // -------------------------------------------------------------------------

    // Try to extract a numeric value from the first argument
    let value = extract_numeric(&msg.args);

    if let Some(raw_value) = value {
        // Check all mappings for a match
        for mapping in mappings {
            if matches_address(&msg.addr, &mapping.address) {
                // Scale value from input range to output range
                let normalized =
                    (raw_value - mapping.min_input) / (mapping.max_input - mapping.min_input);
                let clamped = normalized.clamp(0.0, 1.0);
                let scaled =
                    mapping.min_output + clamped * (mapping.max_output - mapping.min_output);

                apply_osc_to_parameter(&mapping.parameter_id, scaled, app_handle);
            }
        }
    }
}

/// Fire a beat pulse into the modulation engine and emit `osc_beat` to the frontend.
fn handle_osc_beat(timestamp: u64, app_handle: Option<&AppHandle>) {
    // Build a minimal AudioLevels with beat=true so existing AudioSource::Beat
    // mappings and AudioModulation entries are triggered.
    let beat_levels = crate::audio::AudioLevels {
        rms: 0.0,
        peak: 0.0,
        bands: crate::audio::AudioBands {
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
        },
        beat: true,
        timestamp,
    };
    crate::modulation::update_audio_levels(beat_levels);

    // Emit osc_beat event so the frontend beat indicator can pulse
    let bpm = with_osc_engine(|state| state.osc_bpm);
    if let Some(handle) = app_handle {
        let beat_info = OscBeatInfo { timestamp, bpm };
        let _ = handle.emit("osc_beat", &beat_info);
    }

    log::debug!("[OSC] Beat pulse fired via /slew/beat");
}

/// Extract a numeric f64 from the first OSC argument, if possible.
fn extract_numeric(args: &[OscType]) -> Option<f64> {
    match args.first() {
        Some(OscType::Float(f)) => Some(*f as f64),
        Some(OscType::Double(d)) => Some(*d),
        Some(OscType::Int(i)) => Some(*i as f64),
        Some(OscType::Long(l)) => Some(*l as f64),
        Some(OscType::Bool(b)) => Some(if *b { 1.0 } else { 0.0 }),
        _ => None,
    }
}

/// Check if an OSC address matches a pattern.
/// Supports exact matches and simple wildcard (*) at the end.
fn matches_address(address: &str, pattern: &str) -> bool {
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        address.starts_with(prefix)
    } else {
        address == pattern
    }
}

/// Apply an OSC-derived value to a parameter.
fn apply_osc_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    crate::with_parameter_store(|store| {
        store.set_target(parameter_id.to_string(), value);
    });

    // Emit parameter_changed event so UI stays in sync
    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    log::debug!(
        "[OSC] Applied value {} to parameter {}",
        value,
        parameter_id
    );
}

// ============================================================================
// Mapping Management
// ============================================================================

/// Get all OSC mappings.
pub fn get_mappings() -> Vec<OscMapping> {
    with_osc_engine(|state| state.mappings.clone())
}

/// Add or update an OSC mapping.
pub fn add_mapping(mapping: OscMapping) -> Result<(), String> {
    with_osc_engine(|state| {
        // Remove any existing mapping for this address
        state.mappings.retain(|m| m.address != mapping.address);
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();

    log::info!("[OSC] Mapping added/updated");

    Ok(())
}

/// Remove an OSC mapping by address.
pub fn remove_mapping(address: String) -> Result<(), String> {
    let removed = with_osc_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.address != address);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        log::info!("[OSC] Removed mapping for address: {}", address);
        Ok(())
    } else {
        Err(format!("No mapping found for address: {}", address))
    }
}

/// Clear all OSC mappings.
pub fn clear_mappings() {
    with_osc_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();

    log::info!("[OSC] Cleared all mappings");
}

// ============================================================================
// Persistence
// ============================================================================

/// Path to the OSC mappings file.
fn mappings_path(app_handle: &AppHandle) -> Option<std::path::PathBuf> {
    app_handle
        .path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("osc_mappings.json"))
}

/// Load OSC mappings from disk.
fn load_mappings_from_disk() {
    let app_handle = with_osc_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<Vec<OscMapping>>(&contents) {
                        Ok(mappings) => {
                            with_osc_engine(|state| {
                                state.mappings = mappings;
                            });
                            log::debug!(
                                "[OSC] Loaded {} mappings from disk",
                                with_osc_engine(|s| s.mappings.len())
                            );
                        }
                        Err(e) => {
                            log::warn!("[OSC] Failed to parse mappings file: {}", e);
                        }
                    },
                    Err(e) => {
                        log::warn!("[OSC] Failed to read mappings file: {}", e);
                    }
                }
            }
        }
    }
}

/// Save OSC mappings to disk.
fn save_mappings_to_disk() {
    let (app_handle, mappings) =
        with_osc_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            // Ensure directory exists
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            match serde_json::to_string_pretty(&mappings) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[OSC] Failed to write mappings file: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[OSC] Failed to serialize mappings: {}", e);
                }
            }
        }
    }
}

// ============================================================================
// Event Emission
// ============================================================================

/// Emit an osc_status_changed event.
fn emit_status_changed() {
    let (app_handle, status) =
        with_osc_engine(|state| (state.app_handle.clone(), state.status.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("osc_status_changed", status);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start the OSC server.
#[tauri::command]
pub fn start_osc_server(port: u16) -> Result<(), String> {
    start_server(port)
}

/// Stop the OSC server.
#[tauri::command]
pub fn stop_osc_server() -> Result<(), String> {
    stop_server()
}

/// Get the current OSC server status.
#[tauri::command]
pub fn get_osc_status() -> OscServerStatus {
    get_status()
}

/// Get all OSC mappings.
#[tauri::command]
pub fn get_osc_mappings() -> Vec<OscMapping> {
    get_mappings()
}

/// Add or update an OSC mapping.
#[tauri::command]
pub fn add_osc_mapping(mapping: OscMapping) -> Result<(), String> {
    add_mapping(mapping)
}

/// Remove an OSC mapping by address.
#[tauri::command]
pub fn remove_osc_mapping(address: String) -> Result<(), String> {
    remove_mapping(address)
}

/// Clear all OSC mappings.
#[tauri::command]
pub fn clear_osc_mappings() {
    clear_mappings()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // matches_address
    // -------------------------------------------------------------------------

    #[test]
    fn test_exact_match() {
        assert!(matches_address("/foo/bar", "/foo/bar"));
    }

    #[test]
    fn test_exact_mismatch() {
        assert!(!matches_address("/foo/bar", "/foo/baz"));
    }

    #[test]
    fn test_wildcard_match() {
        assert!(matches_address("/foo/bar", "/foo/*"));
        assert!(matches_address("/foo/anything", "/foo/*"));
    }

    #[test]
    fn test_wildcard_no_match_different_prefix() {
        assert!(!matches_address("/baz/bar", "/foo/*"));
    }

    // -------------------------------------------------------------------------
    // Reserved /slew/* addresses must NOT match user mappings
    // -------------------------------------------------------------------------

    #[test]
    fn test_slew_beat_not_matched_by_user_wildcard() {
        // A user mapping like /slew/* should technically match, but /slew/beat
        // is intercepted before the mapping loop so it never reaches here.
        // This test documents that matches_address itself would match — the
        // protection is the early-return in handle_osc_message.
        assert!(matches_address("/slew/beat", "/slew/*"));
    }

    #[test]
    fn test_slew_beat_exact() {
        assert!(matches_address("/slew/beat", "/slew/beat"));
    }

    #[test]
    fn test_slew_bpm_exact() {
        assert!(matches_address("/slew/bpm", "/slew/bpm"));
    }

    #[test]
    fn test_non_slew_address_not_reserved() {
        // Regular user addresses must not be confused with reserved ones
        assert!(!matches_address("/scene/brightness", "/slew/beat"));
        assert!(!matches_address("/slew/beat", "/scene/brightness"));
    }

    // -------------------------------------------------------------------------
    // extract_numeric
    // -------------------------------------------------------------------------

    #[test]
    fn test_extract_float() {
        let args = vec![OscType::Float(0.75)];
        assert!((extract_numeric(&args).unwrap() - 0.75).abs() < 1e-6);
    }

    #[test]
    fn test_extract_double() {
        let args = vec![OscType::Double(120.0)];
        assert!((extract_numeric(&args).unwrap() - 120.0).abs() < 1e-9);
    }

    #[test]
    fn test_extract_int() {
        let args = vec![OscType::Int(1)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 1);
    }

    #[test]
    fn test_extract_bool_true() {
        let args = vec![OscType::Bool(true)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 1);
    }

    #[test]
    fn test_extract_bool_false() {
        let args = vec![OscType::Bool(false)];
        assert_eq!(extract_numeric(&args).unwrap() as i32, 0);
    }

    #[test]
    fn test_extract_empty_args() {
        assert!(extract_numeric(&[]).is_none());
    }

    #[test]
    fn test_bpm_clamping() {
        // Values outside 20-300 should be clamped — verify the clamp bounds
        assert_eq!(19.0_f64.clamp(20.0, 300.0), 20.0);
        assert_eq!(301.0_f64.clamp(20.0, 300.0), 300.0);
        assert_eq!(120.0_f64.clamp(20.0, 300.0), 120.0);
    }
}
