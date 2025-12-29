//! HID device constants.

pub const MEGALODON_VENDOR_ID: u16 = 0xD010;
pub const MEGALODON_PRODUCT_ID: u16 = 0x1601;

pub const POLL_INTERVAL_MS: u64 = 10;
pub const AUTO_CONNECT_INTERVAL_MS: u64 = 2500;
pub const DEFAULT_SENSITIVITY: f64 = 0.02;

// HID Usage Pages and Usages
pub const USAGE_PAGE_GENERIC_DESKTOP: u16 = 0x01;
pub const USAGE_KEYBOARD: u16 = 0x06;
pub const USAGE_PAGE_CONSUMER: u16 = 0x0C;
pub const USAGE_CONSUMER_CONTROL: u16 = 0x01;
