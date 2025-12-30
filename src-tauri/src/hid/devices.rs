//! HID device enumeration.

use hidapi::HidApi;

use super::constants::{MEGALODON_PRODUCT_ID, MEGALODON_VENDOR_ID};
use super::types::HidDeviceInfo;

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

pub fn list_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let api = HidApi::new().map_err(|e| format!("Failed to initialize HID API: {}", e))?;

    let devices: Vec<HidDeviceInfo> = api
        .device_list()
            .map(|dev| {
                let is_supported = dev.vendor_id() == MEGALODON_VENDOR_ID
                    && dev.product_id() == MEGALODON_PRODUCT_ID;

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

/// Returns ALL interfaces for supported devices.
pub fn list_supported_devices() -> Result<Vec<HidDeviceInfo>, String> {
    let all = list_devices()?;
    let supported: Vec<HidDeviceInfo> = all.into_iter().filter(|d| d.is_supported).collect();

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
