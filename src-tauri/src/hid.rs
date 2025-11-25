//! HID Input Module
//!
//! Provides direct HID device access for hardware like the Megalodon Triple Knob Macropad.
//! Reads raw encoder events and maps them to parameter changes.

use hidapi::{HidApi, HidDevice};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Constants
// ============================================================================

/// Megalodon Triple Knob Macropad identifiers
pub const MEGALODON_VENDOR_ID: u16 = 0xD010; // 53264
pub const MEGALODON_PRODUCT_ID: u16 = 0x1601; // 5633

/// How often to poll the device (in milliseconds)
const POLL_INTERVAL_MS: u64 = 10;

/// Sensitivity multiplier for encoder turns
const DEFAULT_SENSITIVITY: f64 = 0.02;

// ============================================================================
// Types
// ============================================================================

/// Information about an HID device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidDeviceInfo {
    /// Vendor ID
    pub vendor_id: u16,
    /// Product ID
    pub product_id: u16,
    /// Device path (unique identifier for opening)
    pub path: String,
    /// Manufacturer name (if available)
    pub manufacturer: Option<String>,
    /// Product name (if available)
    pub product: Option<String>,
    /// Serial number (if available)
    pub serial: Option<String>,
    /// Whether this is a known/supported device
    pub is_supported: bool,
    /// Usage page (helps identify interface type)
    pub usage_page: u16,
    /// Usage (helps identify interface type)
    pub usage: u16,
    /// Interface number
    pub interface_number: i32,
    /// Human-readable interface description
    pub interface_description: String,
}

/// Status of the HID connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidStatus {
    /// Whether a device is currently connected
    pub is_connected: bool,
    /// Info about the connected device (if any)
    pub device: Option<HidDeviceInfo>,
    /// Error message if connection failed
    pub error: Option<String>,
}

/// A mapping from an encoder knob to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidMapping {
    /// Which encoder (0, 1, 2 for the Megalodon)
    pub encoder_index: u8,
    /// The parameter ID to control
    pub parameter_id: String,
    /// Sensitivity multiplier (how much each tick changes the value)
    pub sensitivity: f64,
    /// Whether to invert the direction
    pub inverted: bool,
}

impl Default for HidMapping {
    fn default() -> Self {
        Self {
            encoder_index: 0,
            parameter_id: String::new(),
            sensitivity: DEFAULT_SENSITIVITY,
            inverted: false,
        }
    }
}

/// An encoder event for UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidEncoderEvent {
    /// Which encoder (0, 1, 2)
    pub encoder_index: u8,
    /// Direction: positive = clockwise, negative = counter-clockwise
    pub delta: i8,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}

/// A raw HID report for debugging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidRawReport {
    /// Raw bytes as hex string
    pub hex: String,
    /// Raw bytes as decimal array
    pub bytes: Vec<u8>,
    /// Report size
    pub size: usize,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}

// ============================================================================
// Engine State
// ============================================================================

struct HidEngineState {
    status: HidStatus,
    mappings: Vec<HidMapping>,
    app_handle: Option<AppHandle>,
    should_stop: Arc<Mutex<bool>>,
    /// Number of active reading threads
    active_readers: Arc<Mutex<u32>>,
}

impl Default for HidEngineState {
    fn default() -> Self {
        Self {
            status: HidStatus {
                is_connected: false,
                device: None,
                error: None,
            },
            mappings: Vec::new(),
            app_handle: None,
            should_stop: Arc::new(Mutex::new(false)),
            active_readers: Arc::new(Mutex::new(0)),
        }
    }
}

static HID_ENGINE: Lazy<Arc<Mutex<HidEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(HidEngineState::default())));

fn with_hid_engine<F, R>(f: F) -> R
where
    F: FnOnce(&mut HidEngineState) -> R,
{
    let mut state = HID_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize the HID engine with the Tauri app handle.
pub fn init_hid_engine(app: &AppHandle) {
    with_hid_engine(|state| {
        state.app_handle = Some(app.clone());
    });

    // Load mappings from disk
    load_mappings_from_disk();

    let mapping_count = with_hid_engine(|state| state.mappings.len());
    log::info!("[HID] Engine initialized with {} mappings", mapping_count);
}

// ============================================================================
// Device Enumeration
// ============================================================================

/// Get a human-readable description for a HID usage page/usage combo.
fn describe_usage(usage_page: u16, usage: u16) -> String {
    match (usage_page, usage) {
        (0x01, 0x01) => "Pointer".to_string(),
        (0x01, 0x02) => "Mouse".to_string(),
        (0x01, 0x04) => "Joystick".to_string(),
        (0x01, 0x05) => "Game Pad".to_string(),
        (0x01, 0x06) => "Keyboard".to_string(),
        (0x01, 0x07) => "Keypad".to_string(),
        (0x01, 0x08) => "Multi-axis Controller".to_string(),
        (0x01, 0x80) => "System Control".to_string(),
        (0x0C, 0x01) => "Consumer Control".to_string(),
        (0x0C, _) => format!("Consumer (0x{:02X})", usage),
        (0x01, u) => format!("Generic Desktop (0x{:02X})", u),
        (0xFF00..=0xFFFF, _) => format!("Vendor Specific (0x{:04X})", usage_page),
        _ => format!("Page 0x{:04X}, Usage 0x{:04X}", usage_page, usage),
    }
}

/// List all HID devices.
pub fn list_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

    let devices: Vec<HidDeviceInfo> = api
        .device_list()
        .map(|dev| {
            let is_supported =
                dev.vendor_id() == MEGALODON_VENDOR_ID && dev.product_id() == MEGALODON_PRODUCT_ID;

            let usage_page = dev.usage_page();
            let usage = dev.usage();
            let interface_description = describe_usage(usage_page, usage);

            HidDeviceInfo {
                vendor_id: dev.vendor_id(),
                product_id: dev.product_id(),
                path: dev.path().to_string_lossy().to_string(),
                manufacturer: dev.manufacturer_string().map(|s| s.to_string()),
                product: dev.product_string().map(|s| s.to_string()),
                serial: dev.serial_number().map(|s| s.to_string()),
                is_supported,
                usage_page,
                usage,
                interface_number: dev.interface_number(),
                interface_description,
            }
        })
        .collect();

    Ok(devices)
}

/// List only supported devices (e.g., Megalodon).
/// Returns ALL interfaces for supported devices so user can pick the right one.
pub fn list_supported_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let all = list_devices()?;
    let supported: Vec<HidDeviceInfo> = all.into_iter().filter(|d| d.is_supported).collect();

    // Log what we found for debugging
    for dev in &supported {
        log::info!(
            "[HID] Found interface: {} - {} (page=0x{:04X}, usage=0x{:04X}, iface={})",
            dev.product.as_deref().unwrap_or("Unknown"),
            dev.interface_description,
            dev.usage_page,
            dev.usage,
            dev.interface_number
        );
    }

    Ok(supported)
}

// ============================================================================
// Connection Management
// ============================================================================

/// Connect to an HID device by path (public API - disconnects existing first).
pub fn connect_device(path: &str) -> Result<(), String> {
    // Check if already connected
    let is_connected = with_hid_engine(|state| state.status.is_connected);
    if is_connected {
        // Disconnect existing connections first
        let _ = disconnect_device();
    }

    connect_device_internal(path, true)
}

/// Internal function to connect to a device without disconnecting existing.
fn connect_device_internal(path: &str, update_status: bool) -> Result<(), String> {
    // Find device info
    let devices = list_devices()?;
    let device_info = devices
        .into_iter()
        .find(|d| d.path == path)
        .ok_or_else(|| "Device not found".to_string())?;

    // Open the device
    let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

    let device = api
        .open_path(std::ffi::CString::new(path).unwrap().as_c_str())
        .map_err(|e| format!("Failed to open device: {}", e))?;

    // Set non-blocking mode
    device
        .set_blocking_mode(false)
        .map_err(|e| format!("Failed to set non-blocking mode: {}", e))?;

    // Reset stop flag and increment reader count
    with_hid_engine(|state| {
        *state.should_stop.lock().unwrap() = false;
        *state.active_readers.lock().unwrap() += 1;
    });

    // Update status if requested
    if update_status {
        with_hid_engine(|state| {
            state.status = HidStatus {
                is_connected: true,
                device: Some(device_info.clone()),
                error: None,
            };
        });
        emit_status_changed();
    }

    // Start reading thread
    start_reading_thread(device);

    log::info!(
        "[HID] Connected to device: {} ({})",
        device_info.interface_description,
        path
    );

    Ok(())
}

/// Connect to the first available Megalodon device.
/// Connects to BOTH keyboard and consumer control interfaces for full encoder support.
pub fn connect_megalodon() -> Result<(), String> {
    let supported = list_supported_devices()?;

    if supported.is_empty() {
        return Err("No Megalodon device found. Make sure it's connected.".to_string());
    }

    // For DOIO/Megalodon, we need multiple interfaces:
    // - Consumer Control (0x0C:0x01) for left and middle knobs
    // - Keyboard (0x01:0x06) for right knob
    //
    // Connect to all relevant interfaces
    let consumer_control = supported
        .iter()
        .find(|d| d.usage_page == 0x0C && d.usage == 0x01);

    let keyboard = supported
        .iter()
        .find(|d| d.usage_page == 0x01 && d.usage == 0x06);

    let mut connected_any = false;
    let mut first_device_info: Option<HidDeviceInfo> = None;

    // Connect to consumer control for left/middle knobs
    if let Some(dev) = consumer_control {
        log::info!("[HID] Connecting to Consumer Control: {}", dev.path);
        if let Err(e) = connect_device_internal(&dev.path, false) {
            log::warn!("[HID] Failed to connect to Consumer Control: {}", e);
        } else {
            connected_any = true;
            first_device_info = Some(dev.clone());
        }
    }

    // Connect to keyboard for right knob
    if let Some(dev) = keyboard {
        log::info!("[HID] Connecting to Keyboard: {}", dev.path);
        if let Err(e) = connect_device_internal(&dev.path, false) {
            log::warn!("[HID] Failed to connect to Keyboard: {}", e);
        } else {
            connected_any = true;
            if first_device_info.is_none() {
                first_device_info = Some(dev.clone());
            }
        }
    }

    if !connected_any {
        return Err("Failed to connect to any DOIO interface".to_string());
    }

    // Update status with the first connected device info
    with_hid_engine(|state| {
        state.status = HidStatus {
            is_connected: true,
            device: first_device_info,
            error: None,
        };
    });

    emit_status_changed();
    Ok(())
}

/// Disconnect from all connected devices.
pub fn disconnect_device() -> Result<(), String> {
    let was_connected = with_hid_engine(|state| {
        let was = state.status.is_connected;
        *state.should_stop.lock().unwrap() = true;
        *state.active_readers.lock().unwrap() = 0;
        state.status = HidStatus {
            is_connected: false,
            device: None,
            error: None,
        };
        was
    });

    if was_connected {
        log::info!("[HID] Disconnected from all devices");
        emit_status_changed();
    }

    // Give threads time to stop
    std::thread::sleep(std::time::Duration::from_millis(50));

    Ok(())
}

/// Get current connection status.
pub fn get_status() -> HidStatus {
    with_hid_engine(|state| state.status.clone())
}

// ============================================================================
// Reading Thread
// ============================================================================

fn start_reading_thread(device: HidDevice) {
    let should_stop = with_hid_engine(|state| state.should_stop.clone());
    let active_readers = with_hid_engine(|state| state.active_readers.clone());
    let engine = HID_ENGINE.clone();

    thread::spawn(move || {
        let mut buf = [0u8; 64];

        loop {
            // Check if we should stop
            if *should_stop.lock().unwrap() {
                break;
            }

            // Try to read from the device
            match device.read_timeout(&mut buf, POLL_INTERVAL_MS as i32) {
                Ok(0) => {
                    // No data available, continue
                    continue;
                }
                Ok(size) => {
                    // Parse and handle the data
                    let data = &buf[..size];
                    handle_hid_report(data, &engine);
                }
                Err(e) => {
                    log::error!("[HID] Read error: {}", e);
                    // Decrement reader count
                    let remaining = {
                        let mut count = active_readers.lock().unwrap();
                        if *count > 0 {
                            *count -= 1;
                        }
                        *count
                    };

                    // Only update status to disconnected if no readers remain
                    if remaining == 0 {
                        let mut state = engine.lock().unwrap();
                        state.status = HidStatus {
                            is_connected: false,
                            device: None,
                            error: Some(format!("Device read error: {}", e)),
                        };
                        if let Some(handle) = &state.app_handle {
                            let _ = handle.emit("hid_status_changed", &state.status);
                        }
                    }
                    break;
                }
            }
        }

        // Decrement reader count on normal exit
        {
            let mut count = active_readers.lock().unwrap();
            if *count > 0 {
                *count -= 1;
            }
        }

        log::info!("[HID] Reading thread exiting");
    });
}

/// Parse an HID report from the Megalodon.
/// The Megalodon sends keyboard HID reports. We need to detect encoder turns.
fn handle_hid_report(data: &[u8], engine: &Arc<Mutex<HidEngineState>>) {
    // Debug: log raw data
    log::debug!("[HID] Raw report ({} bytes): {:?}", data.len(), data);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Always emit raw report for debugging
    {
        let state = engine.lock().unwrap();
        if let Some(handle) = &state.app_handle {
            let hex = data
                .iter()
                .map(|b| format!("{:02X}", b))
                .collect::<Vec<_>>()
                .join(" ");
            let raw_report = HidRawReport {
                hex,
                bytes: data.to_vec(),
                size: data.len(),
                timestamp,
            };
            let _ = handle.emit("hid_raw_report", &raw_report);
        }
    }

    // The Megalodon likely sends standard keyboard HID reports.
    // Format: [modifier, reserved, key1, key2, key3, key4, key5, key6]
    // Or it might use a consumer control report for media keys.
    //
    // Common patterns for rotary encoders in VIA/QMK:
    // - Clockwise: sends a specific keycode (e.g., KC_VOLU, or a custom key)
    // - Counter-clockwise: sends another keycode (e.g., KC_VOLD, or custom key)
    //
    // We'll detect patterns and map them to encoder events.

    // Try to interpret as encoder events
    if let Some(event) = parse_encoder_event(data, timestamp) {
        let state = engine.lock().unwrap();

        // Emit event for UI
        if let Some(handle) = &state.app_handle {
            let _ = handle.emit("hid_encoder", &event);
        }

        // Apply to mapped parameters
        log::debug!(
            "[HID] Encoder event: index={}, delta={}, mappings_count={}",
            event.encoder_index,
            event.delta,
            state.mappings.len()
        );

        for mapping in &state.mappings {
            if mapping.encoder_index == event.encoder_index {
                let delta = if mapping.inverted {
                    -(event.delta as f64)
                } else {
                    event.delta as f64
                };

                let change = delta * mapping.sensitivity;
                log::debug!("[HID] Applying {} to '{}'", change, mapping.parameter_id);
                apply_encoder_to_parameter(
                    &mapping.parameter_id,
                    change,
                    state.app_handle.as_ref(),
                );
            }
        }
    }
}

/// Try to parse encoder event from HID report.
/// Tuned for DOIO/Megalodon Triple Knob Macropad.
fn parse_encoder_event(data: &[u8], timestamp: u64) -> Option<HidEncoderEvent> {
    if data.is_empty() {
        return None;
    }

    // ==========================================================================
    // DOIO/Megalodon Pattern Detection
    // ==========================================================================
    //
    // Based on actual device output:
    //
    // Left Knob (Consumer Control, 4 bytes starting with 0x04):
    //   - Clockwise:        04 B5 00 → Next Track
    //   - Counter-clockwise: 04 B6 00 → Previous Track
    //
    // Middle Knob (Consumer Control, 4 bytes starting with 0x04):
    //   - Clockwise:        04 E9 00 → Volume Up
    //   - Counter-clockwise: 04 EA 00 → Volume Down
    //
    // Right Knob (Keyboard NKRO, 32 bytes starting with 0x06):
    //   - Clockwise:        byte[11] = 0x08
    //   - Counter-clockwise: byte[11] = 0x40
    //
    // Release events are all zeros (04 00 00 or 06 00 00...)
    // ==========================================================================

    // Pattern A: DOIO Consumer Control Report (4 bytes, starts with 0x04)
    // Format: [0x04, consumer_code, 0x00]
    if data.len() >= 3 && data[0] == 0x04 {
        let consumer_code = data[1];

        // Skip release events (all zeros after report ID)
        if consumer_code == 0x00 {
            return None;
        }

        match consumer_code {
            // Middle Knob: Volume Up/Down
            0xE9 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1, // Middle knob
                    delta: 1,
                    timestamp,
                });
            }
            0xEA => {
                return Some(HidEncoderEvent {
                    encoder_index: 1, // Middle knob
                    delta: -1,
                    timestamp,
                });
            }

            // Left Knob: Next/Previous Track
            0xB5 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0, // Left knob
                    delta: 1,
                    timestamp,
                });
            }
            0xB6 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0, // Left knob
                    delta: -1,
                    timestamp,
                });
            }

            _ => {}
        }
    }

    // Pattern B: DOIO Keyboard NKRO Report (32 bytes, starts with 0x06)
    // Right knob sends keyboard report with specific bit patterns
    // Format: [0x06, 0x00, ..., byte[11] contains the key]
    if data.len() >= 12 && data[0] == 0x06 {
        let key_byte = data[11];

        // Skip release events (all zeros)
        if key_byte == 0x00 {
            return None;
        }

        match key_byte {
            0x08 => {
                return Some(HidEncoderEvent {
                    encoder_index: 2, // Right knob
                    delta: 1,         // Clockwise
                    timestamp,
                });
            }
            0x40 => {
                return Some(HidEncoderEvent {
                    encoder_index: 2, // Right knob
                    delta: -1,        // Counter-clockwise
                    timestamp,
                });
            }
            _ => {}
        }
    }

    // Pattern C: Generic Consumer Control (for other devices)
    // Format: [consumer_code_lo, consumer_code_hi]
    if data.len() >= 2 && data[0] != 0x04 && data[0] != 0x06 {
        let consumer_code = u16::from_le_bytes([data[0], data[1]]);
        match consumer_code {
            0x00E9 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: 1,
                    timestamp,
                })
            } // Volume Up
            0x00EA => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: -1,
                    timestamp,
                })
            } // Volume Down
            0x00B5 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: 1,
                    timestamp,
                })
            } // Next Track
            0x00B6 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: -1,
                    timestamp,
                })
            } // Prev Track
            _ => {}
        }
    }

    None
}

/// Apply an encoder change to a parameter.
fn apply_encoder_to_parameter(parameter_id: &str, change: f64, app_handle: Option<&AppHandle>) {
    // Get current value, add change, and set new target
    let new_value = crate::with_parameter_store(|store| {
        if let Some(param) = store.get(parameter_id) {
            // Add change to current value (not target, for immediate feedback)
            let new_val = (param.value + change).clamp(0.0, 2.0); // Clamp to reasonable range
            store.set_target(parameter_id.to_string(), new_val);
            Some(new_val)
        } else {
            // Parameter doesn't exist, create it with the change as initial value
            log::debug!("[HID] Parameter '{}' not found, creating", parameter_id);
            let initial = change.clamp(0.0, 2.0);
            store.set_target(parameter_id.to_string(), initial);
            Some(initial)
        }
    });

    if let Some(value) = new_value {
        log::debug!("[HID] {} → {}", parameter_id, value);

        // Emit parameter_changed event
        if let Some(handle) = app_handle {
            if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
                let _ = handle.emit("parameter_changed", &param);
            }
        }
    }
}

// ============================================================================
// Mapping Management
// ============================================================================

/// Get all HID mappings.
pub fn get_mappings() -> Vec<HidMapping> {
    with_hid_engine(|state| state.mappings.clone())
}

/// Add or update a mapping.
pub fn add_mapping(mapping: HidMapping) -> Result<(), String> {
    with_hid_engine(|state| {
        // Remove existing mapping for this encoder
        state
            .mappings
            .retain(|m| m.encoder_index != mapping.encoder_index);
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();
    log::info!("[HID] Mapping added/updated");

    Ok(())
}

/// Remove a mapping by encoder index.
pub fn remove_mapping(encoder_index: u8) -> Result<(), String> {
    let removed = with_hid_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.encoder_index != encoder_index);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        log::info!("[HID] Mapping removed for encoder {}", encoder_index);
    }

    Ok(())
}

/// Clear all mappings.
pub fn clear_mappings() -> Result<(), String> {
    with_hid_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();
    log::info!("[HID] All mappings cleared");

    Ok(())
}

/// Set up default mappings for the Megalodon.
pub fn setup_default_mappings() -> Result<(), String> {
    let defaults = vec![
        HidMapping {
            encoder_index: 0,
            parameter_id: "crossfade".to_string(),
            sensitivity: 0.02,
            inverted: false,
        },
        HidMapping {
            encoder_index: 1,
            parameter_id: "scene_a_brightness".to_string(),
            sensitivity: 0.05,
            inverted: false,
        },
        HidMapping {
            encoder_index: 2,
            parameter_id: "scene_a_tint".to_string(),
            sensitivity: 0.02,
            inverted: false,
        },
    ];

    with_hid_engine(|state| {
        state.mappings = defaults;
    });

    save_mappings_to_disk();
    log::info!("[HID] Default mappings configured");

    Ok(())
}

// ============================================================================
// Persistence
// ============================================================================

fn mappings_path(app_handle: &AppHandle) -> Option<std::path::PathBuf> {
    app_handle.path().app_config_dir().ok().map(|mut p| {
        p.push("hid_mappings.json");
        p
    })
}

fn load_mappings_from_disk() {
    let app_handle = with_hid_engine(|state| state.app_handle.clone());

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            if path.exists() {
                match std::fs::read_to_string(&path) {
                    Ok(contents) => match serde_json::from_str::<Vec<HidMapping>>(&contents) {
                        Ok(mappings) => {
                            with_hid_engine(|state| {
                                state.mappings = mappings;
                            });
                            log::info!("[HID] Loaded mappings from {:?}", path);
                        }
                        Err(e) => {
                            log::error!("[HID] Failed to parse mappings: {}", e);
                        }
                    },
                    Err(e) => {
                        log::error!("[HID] Failed to read mappings file: {}", e);
                    }
                }
            }
        }
    }
}

fn save_mappings_to_disk() {
    let (mappings, app_handle) =
        with_hid_engine(|state| (state.mappings.clone(), state.app_handle.clone()));

    if let Some(handle) = app_handle {
        if let Some(path) = mappings_path(&handle) {
            // Ensure directory exists
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }

            match serde_json::to_string_pretty(&mappings) {
                Ok(json) => {
                    if let Err(e) = std::fs::write(&path, json) {
                        log::error!("[HID] Failed to write mappings: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[HID] Failed to serialize mappings: {}", e);
                }
            }
        }
    }
}

// ============================================================================
// Event Emission
// ============================================================================

fn emit_status_changed() {
    let (status, handle) =
        with_hid_engine(|state| (state.status.clone(), state.app_handle.clone()));

    if let Some(handle) = handle {
        let _ = handle.emit("hid_status_changed", &status);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn list_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    list_devices()
}

#[tauri::command]
pub fn list_supported_hid_devices() -> Result<Vec<HidDeviceInfo>, String> {
    list_supported_devices()
}

#[tauri::command]
pub fn connect_hid_device(path: String) -> Result<(), String> {
    connect_device(&path)
}

#[tauri::command]
pub fn connect_hid_megalodon() -> Result<(), String> {
    connect_megalodon()
}

#[tauri::command]
pub fn disconnect_hid_device() -> Result<(), String> {
    disconnect_device()
}

#[tauri::command]
pub fn get_hid_status() -> HidStatus {
    get_status()
}

#[tauri::command]
pub fn get_hid_mappings() -> Vec<HidMapping> {
    get_mappings()
}

#[tauri::command]
pub fn add_hid_mapping(mapping: HidMapping) -> Result<(), String> {
    add_mapping(mapping)
}

#[tauri::command]
pub fn remove_hid_mapping(encoder_index: u8) -> Result<(), String> {
    remove_mapping(encoder_index)
}

#[tauri::command]
pub fn clear_hid_mappings() -> Result<(), String> {
    clear_mappings()
}

#[tauri::command]
pub fn setup_default_hid_mappings() -> Result<(), String> {
    setup_default_mappings()
}
