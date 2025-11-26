//! HID Input Module
//!
//! Provides direct HID device access for hardware like the DOIO Megalodon Macropad.
//! Supports:
//! - Auto-connect with periodic device polling
//! - Encoder events (3 knobs → parameter control)
//! - Key events (16 keys → scene selection and crossfade trigger)
//! - Raw report debugging

use hidapi::{HidApi, HidDevice};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Constants
// ============================================================================

/// Megalodon/DOIO Macropad identifiers
pub const MEGALODON_VENDOR_ID: u16 = 0xD010; // 53264
pub const MEGALODON_PRODUCT_ID: u16 = 0x1601; // 5633

/// How often to poll the device for data (in milliseconds)
const POLL_INTERVAL_MS: u64 = 10;

/// How often to check for device connection (in milliseconds)
const AUTO_CONNECT_INTERVAL_MS: u64 = 2500;

/// Sensitivity multiplier for encoder turns
const DEFAULT_SENSITIVITY: f64 = 0.02;

/// HID Usage Page for Keyboard (Generic Desktop)
const USAGE_PAGE_GENERIC_DESKTOP: u16 = 0x01;
/// HID Usage for Keyboard
const USAGE_KEYBOARD: u16 = 0x06;
/// HID Usage Page for Consumer Control
const USAGE_PAGE_CONSUMER: u16 = 0x0C;
/// HID Usage for Consumer Control
const USAGE_CONSUMER_CONTROL: u16 = 0x01;

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
    /// Whether auto-connect is actively searching
    pub is_searching: bool,
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
    /// Which encoder (0 = K1/left, 1 = K2/right small, 2 = K3/large bottom)
    pub encoder_index: u8,
    /// Direction: positive = clockwise, negative = counter-clockwise
    pub delta: i8,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}

/// A key event from the macropad.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidKeyEvent {
    /// The key code (1-16 for the grid, or special codes for arrows/enter/etc)
    pub key_code: u8,
    /// Logical key name for easier handling
    pub key_name: String,
    /// Whether the key was pressed (true) or released (false)
    pub pressed: bool,
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
    /// Whether auto-connect is enabled
    auto_connect_enabled: Arc<Mutex<bool>>,
    /// Track previously pressed keys to detect releases
    pressed_keys: Vec<u8>,
}

impl Default for HidEngineState {
    fn default() -> Self {
        Self {
            status: HidStatus {
                is_connected: false,
                device: None,
                error: None,
                is_searching: false,
            },
            mappings: Vec::new(),
            app_handle: None,
            should_stop: Arc::new(Mutex::new(false)),
            active_readers: Arc::new(Mutex::new(0)),
            auto_connect_enabled: Arc::new(Mutex::new(true)),
            pressed_keys: Vec::new(),
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

    // Start auto-connect thread
    start_auto_connect_thread();
}

// ============================================================================
// Auto-Connect
// ============================================================================

/// Start a background thread that periodically checks for devices and auto-connects.
fn start_auto_connect_thread() {
    let engine = HID_ENGINE.clone();

    thread::spawn(move || {
        log::info!("[HID] Auto-connect thread started");

        loop {
            // Check if auto-connect is enabled
            let (enabled, is_connected) = {
                let state = engine.lock().unwrap();
                let enabled = *state.auto_connect_enabled.lock().unwrap();
                let is_connected = state.status.is_connected;
                (enabled, is_connected)
            };

            if !enabled {
                thread::sleep(Duration::from_millis(AUTO_CONNECT_INTERVAL_MS));
                continue;
            }

            // If not connected, try to find and connect
            if !is_connected {
                // Update status to searching
                {
                    let mut state = engine.lock().unwrap();
                    if !state.status.is_searching {
                        state.status.is_searching = true;
                        // Clone status and app_handle to emit outside the lock
                        let status = state.status.clone();
                        let handle = state.app_handle.clone();
                        drop(state);
                        if let Some(h) = handle {
                            let _ = h.emit("hid_status_changed", &status);
                        }
                    }
                }

                // Try to find supported devices
                match list_supported_devices() {
                    Ok(devices) if !devices.is_empty() => {
                        log::info!(
                            "[HID] Auto-connect: Found {} supported device interface(s)",
                            devices.len()
                        );

                        // Try to connect to all interfaces
                        if let Err(e) = connect_megalodon() {
                            log::warn!("[HID] Auto-connect failed: {}", e);
                        } else {
                            log::info!("[HID] Auto-connect successful");
                        }
                    }
                    Ok(_) => {
                        // No devices found, keep searching
                    }
                    Err(e) => {
                        log::debug!("[HID] Auto-connect device scan error: {}", e);
                    }
                }
            } else {
                // Already connected, clear searching status if set
                let mut state = engine.lock().unwrap();
                if state.status.is_searching {
                    state.status.is_searching = false;
                    let status = state.status.clone();
                    let handle = state.app_handle.clone();
                    drop(state);
                    if let Some(h) = handle {
                        let _ = h.emit("hid_status_changed", &status);
                    }
                }
            }

            thread::sleep(Duration::from_millis(AUTO_CONNECT_INTERVAL_MS));
        }
    });
}

/// Enable or disable auto-connect.
pub fn set_auto_connect(enabled: bool) {
    with_hid_engine(|state| {
        *state.auto_connect_enabled.lock().unwrap() = enabled;
    });
    log::info!(
        "[HID] Auto-connect {}",
        if enabled { "enabled" } else { "disabled" }
    );
}

/// Check if auto-connect is enabled.
pub fn is_auto_connect_enabled() -> bool {
    with_hid_engine(|state| *state.auto_connect_enabled.lock().unwrap())
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
        log::debug!(
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
                is_searching: false,
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
    // - Keyboard (0x01:0x06) for right knob AND key presses
    //
    // Connect to all relevant interfaces
    let consumer_control = supported
        .iter()
        .find(|d| d.usage_page == USAGE_PAGE_CONSUMER && d.usage == USAGE_CONSUMER_CONTROL);

    let keyboard = supported
        .iter()
        .find(|d| d.usage_page == USAGE_PAGE_GENERIC_DESKTOP && d.usage == USAGE_KEYBOARD);

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

    // Connect to keyboard for right knob AND key presses
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
            is_searching: false,
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
            is_searching: *state.auto_connect_enabled.lock().unwrap(),
        };
        state.pressed_keys.clear();
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
                        let is_searching = *state.auto_connect_enabled.lock().unwrap();
                        state.status = HidStatus {
                            is_connected: false,
                            device: None,
                            error: Some(format!("Device read error: {}", e)),
                            is_searching,
                        };
                        state.pressed_keys.clear();
                        let status = state.status.clone();
                        let handle = state.app_handle.clone();
                        drop(state);
                        if let Some(h) = handle {
                            let _ = h.emit("hid_status_changed", &status);
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

        log::debug!("[HID] Reading thread exiting");
    });
}

/// Parse an HID report from the Megalodon.
/// Handles both encoder events and key events.
fn handle_hid_report(data: &[u8], engine: &Arc<Mutex<HidEngineState>>) {
    // Debug: log raw data
    log::trace!("[HID] Raw report ({} bytes): {:?}", data.len(), data);

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

    // Try to interpret as encoder events
    if let Some(event) = parse_encoder_event(data, timestamp) {
        let state = engine.lock().unwrap();

        // Emit event for UI - frontend handles parameter routing via useMacropad
        if let Some(handle) = &state.app_handle {
            let _ = handle.emit("hid_encoder", &event);
        }

        log::debug!(
            "[HID] Encoder event: index={}, delta={}",
            event.encoder_index,
            event.delta
        );

        // Note: Legacy backend mapping removed. All encoder → parameter routing
        // is now handled by the frontend's useMacropad hook, which routes
        // encoder changes to the currently selected scene's parameters.
        return;
    }

    // Try to interpret as key events (keyboard NKRO report)
    parse_and_emit_key_events(data, timestamp, engine);
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
    // K1 - Left small knob (Consumer Control, 4 bytes starting with 0x04):
    //   - Clockwise:        04 B5 00 → Next Track
    //   - Counter-clockwise: 04 B6 00 → Previous Track
    //
    // K2 - Right small knob (Keyboard NKRO, 32 bytes starting with 0x06):
    //   - Clockwise:        byte[11] = 0x08
    //   - Counter-clockwise: byte[11] = 0x40
    //
    // K3 - Large bottom knob (Consumer Control, 4 bytes starting with 0x04):
    //   - Clockwise:        04 E9 00 → Volume Up
    //   - Counter-clockwise: 04 EA 00 → Volume Down
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
            // K3 (Large bottom knob): Volume Up/Down
            0xE9 => {
                return Some(HidEncoderEvent {
                    encoder_index: 2, // K3
                    delta: 1,
                    timestamp,
                });
            }
            0xEA => {
                return Some(HidEncoderEvent {
                    encoder_index: 2, // K3
                    delta: -1,
                    timestamp,
                });
            }

            // K1 (Left small knob): Next/Previous Track
            0xB5 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0, // K1
                    delta: 1,
                    timestamp,
                });
            }
            0xB6 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0, // K1
                    delta: -1,
                    timestamp,
                });
            }

            _ => {}
        }
    }

    // Pattern B: DOIO Keyboard NKRO Report (32 bytes, starts with 0x06)
    // K2 (Right small knob) sends keyboard report with specific bit patterns
    // Format: [0x06, 0x00, ..., byte[11] contains the key]
    if data.len() >= 12 && data[0] == 0x06 {
        let key_byte = data[11];

        // Only process encoder-specific bit patterns (0x08 and 0x40)
        // Other key_byte values are regular key presses, handled separately
        match key_byte {
            0x08 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1, // K2 (right small knob)
                    delta: 1,         // Clockwise
                    timestamp,
                });
            }
            0x40 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1, // K2 (right small knob)
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

/// Parse keyboard NKRO report and emit key events.
/// Handles both key press and key release detection.
fn parse_and_emit_key_events(data: &[u8], timestamp: u64, engine: &Arc<Mutex<HidEngineState>>) {
    // Only process keyboard NKRO reports (32 bytes starting with 0x06)
    if data.len() < 12 || data[0] != 0x06 {
        return;
    }

    // DOIO keyboard NKRO report structure:
    // Byte 0: Report ID (0x06)
    // Bytes 1-31: NKRO bitmap (each bit represents a key)
    //
    // Standard HID key codes for the number row:
    // 1 = 0x1E (30), 2 = 0x1F (31), 3 = 0x20 (32), 4 = 0x21 (33)
    // 5 = 0x22 (34), 6 = 0x23 (35), 7 = 0x24 (36), 8 = 0x25 (37)
    // 9 = 0x26 (38), 0 = 0x27 (39)
    // Arrow Up = 0x52, Arrow Down = 0x51, Arrow Left = 0x50, Arrow Right = 0x4F
    // Enter = 0x28 (40)
    //
    // The NKRO bitmap places key code N at bit (N % 8) of byte (N / 8 + 1)

    // Extract all currently pressed keys from the NKRO bitmap
    let mut current_keys: Vec<u8> = Vec::new();

    for byte_idx in 1..data.len() {
        let byte = data[byte_idx];
        if byte == 0 {
            continue;
        }

        for bit_idx in 0..8 {
            if byte & (1 << bit_idx) != 0 {
                let key_code = ((byte_idx - 1) * 8 + bit_idx) as u8;

                // Skip the encoder-specific codes (handled above)
                // 0x08 and 0x40 in byte[11] correspond to key codes that we use for encoder
                // But we need to check the actual key code, not the byte value
                // The encoder uses byte[11] directly, which is different from NKRO bitmap

                // For NKRO, key_code is the HID usage ID
                // We want keys 1-4 (0x1E-0x21), 5-8 (0x22-0x25), 9-0 (0x26-0x27)
                // Arrow keys (0x4F-0x52), Enter (0x28)
                // And any function/layer keys

                current_keys.push(key_code);
            }
        }
    }

    // Compare with previously pressed keys to detect changes
    let mut state = engine.lock().unwrap();
    let prev_keys = state.pressed_keys.clone();

    // Find newly pressed keys
    for &key_code in &current_keys {
        if !prev_keys.contains(&key_code) {
            // New key pressed
            if let Some(event) = create_key_event(key_code, true, timestamp) {
                log::debug!("[HID] Key pressed: {} (0x{:02X})", event.key_name, key_code);
                if let Some(handle) = &state.app_handle {
                    let _ = handle.emit("hid_key", &event);
                }
            }
        }
    }

    // Find released keys
    for &key_code in &prev_keys {
        if !current_keys.contains(&key_code) {
            // Key released
            if let Some(event) = create_key_event(key_code, false, timestamp) {
                log::debug!(
                    "[HID] Key released: {} (0x{:02X})",
                    event.key_name,
                    key_code
                );
                if let Some(handle) = &state.app_handle {
                    let _ = handle.emit("hid_key", &event);
                }
            }
        }
    }

    // Update state
    state.pressed_keys = current_keys;
}

/// Create a key event from an HID key code.
/// Maps DOIO Megalodon key codes to logical key names based on physical layout.
fn create_key_event(key_code: u8, pressed: bool, timestamp: u64) -> Option<HidKeyEvent> {
    // DOIO Megalodon key mapping based on actual device output:
    // Physical layout (4x4 grid + bottom row):
    //
    // ┌─────┬─────┬─────┬─────┐
    // │  1  │  2  │  3  │  4  │  → 0x26(9), 0x27(0), 0x28(Enter), 0x29(Esc)
    // ├─────┼─────┼─────┼─────┤
    // │  5  │  6  │  7  │  8  │  → 0x2A, 0x2B, 0x2C(Space), 0x2D
    // ├─────┼─────┼─────┼─────┤
    // │  9  │  0  │  ↑  │Enter│  → 0x2E, 0x2F, 0x5A(Num2), 0x30
    // ├─────┼─────┼─────┼─────┤
    // │MO(3)│  ←  │  ↓  │  →  │  → 0x30(?), 0x59(Num1), 0x57
    // └─────┴─────┴─────┴─────┘
    //
    // Note: MO(3) sends same code as row 3 Enter (0x30), or may not send anything

    let key_name = match key_code {
        // Row 1: Keys 1-4 (scene selection keys)
        0x26 => "1", // Physical key 1 (sends HID "9")
        0x27 => "2", // Physical key 2 (sends HID "0")
        0x28 => "3", // Physical key 3 (sends HID "Enter")
        0x29 => "4", // Physical key 4 (sends HID "Escape")

        // Row 2: Keys 5-8
        0x2A => "5", // Physical key 5 (Backspace)
        0x2B => "6", // Physical key 6 (Tab)
        0x2C => "7", // Physical key 7 (sends HID "Space")
        0x2D => "8", // Physical key 8 (Minus)

        // Row 3: Keys 9, 0, Up, Enter
        0x2E => "9",     // Physical key 9 (Equal)
        0x2F => "0",     // Physical key 0 (Left Bracket)
        0x5A => "Up",    // Physical Up arrow (sends Num2)
        0x30 => "Enter", // Physical Enter (Right Bracket) - also MO(3)?

        // Row 4: MO(3), Left, Down, Right
        // 0x30 is shared with Enter above, MO(3) might not send a unique code
        // 0x57 is shared by both Down and Right arrows (firmware quirk)
        0x59 => "Left",       // Physical Left arrow (sends Num1)
        0x57 => "Down/Right", // Physical Down AND Right arrows share this code

        // Action key - use key 7 (Space position) as primary action
        // Or physical Enter key (0x30)

        // Fallback standard mappings for any keys not remapped
        // Standard arrow keys (if device sends these)
        0x4F => "Right",
        0x50 => "Left_Std",
        0x51 => "Down_Std",
        0x52 => "Up_Std",

        // Function keys (F13+ are often used for macros)
        0x68 => "F13",
        0x69 => "F14",
        0x6A => "F15",
        0x6B => "F16",
        0x6C => "F17",
        0x6D => "F18",
        0x6E => "F19",
        0x6F => "F20",
        0x70 => "F21",
        0x71 => "F22",
        0x72 => "F23",
        0x73 => "F24",

        // Application key
        0x65 => "App",

        // Other numpad keys
        0x62 => "Num0",
        0x5B => "Num3",
        0x5C => "Num4",
        0x5D => "Num5",
        0x5E => "Num6",
        0x5F => "Num7",
        0x60 => "Num8",
        0x61 => "Num9",

        // Common modifiers
        0xE0 => "LCtrl",
        0xE1 => "LShift",
        0xE2 => "LAlt",
        0xE3 => "LMeta",
        0xE4 => "RCtrl",
        0xE5 => "RShift",
        0xE6 => "RAlt",
        0xE7 => "RMeta",

        // Unknown key - still emit it with the code
        _ => {
            return Some(HidKeyEvent {
                key_code,
                key_name: format!("0x{:02X}", key_code),
                pressed,
                timestamp,
            })
        }
    };

    Some(HidKeyEvent {
        key_code,
        key_name: key_name.to_string(),
        pressed,
        timestamp,
    })
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
/// NOTE: These are legacy mappings. With the new macropad integration,
/// encoder mappings are handled dynamically based on selected scene.
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

#[tauri::command]
pub fn set_hid_auto_connect(enabled: bool) {
    set_auto_connect(enabled);
}

#[tauri::command]
pub fn get_hid_auto_connect() -> bool {
    is_auto_connect_enabled()
}
