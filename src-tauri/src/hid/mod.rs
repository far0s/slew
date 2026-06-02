//! HID input module for the DOIO Megalodon Macropad.
//!
//! Supports auto-connect, encoder events (3 knobs), and key events (16 keys).

pub mod commands;
pub mod connections;
pub mod constants;
pub mod devices;
pub mod engine;
pub mod events;
pub mod mappings;
pub mod parsing;
pub mod reading;
pub mod types;

pub use connections::{connect_device, connect_supported_device, disconnect_device, get_status};
pub use constants::{MEGALODON_PRODUCT_ID, MEGALODON_VENDOR_ID};
pub use devices::{list_devices, list_supported_devices};
pub use engine::{init_hid_engine, is_auto_connect_enabled, set_auto_connect};
#[allow(deprecated)]
pub use mappings::{
    add_mapping, clear_mappings, get_mappings, remove_mapping, restore_bulk, setup_default_mappings,
};
pub use types::{HidDeviceInfo, HidEncoderEvent, HidKeyEvent, HidMapping, HidRawReport, HidStatus};
