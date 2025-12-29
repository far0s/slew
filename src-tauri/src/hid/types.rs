//! Type definitions for the HID input module.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidDeviceInfo {
    pub vendor_id: u16,
    pub product_id: u16,
    pub path: String,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial: Option<String>,
    pub is_supported: bool,
    pub usage_page: u16,
    pub usage: u16,
    pub interface_number: i32,
    pub interface_description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidStatus {
    pub is_connected: bool,
    pub device: Option<HidDeviceInfo>,
    pub error: Option<String>,
    pub is_searching: bool,
}

/// Encoder-to-parameter mapping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidMapping {
    pub encoder_index: u8,
    pub parameter_id: String,
    pub sensitivity: f64,
    pub inverted: bool,
}

impl Default for HidMapping {
    fn default() -> Self {
        Self {
            encoder_index: 0,
            parameter_id: String::new(),
            sensitivity: super::constants::DEFAULT_SENSITIVITY,
            inverted: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidEncoderEvent {
    pub encoder_index: u8,
    /// Positive = clockwise, negative = counter-clockwise
    pub delta: i8,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidKeyEvent {
    pub key_code: u8,
    pub key_name: String,
    pub pressed: bool,
    pub timestamp: u64,
}

/// Raw HID report for debugging.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HidRawReport {
    pub hex: String,
    pub bytes: Vec<u8>,
    pub size: usize,
    pub timestamp: u64,
}
