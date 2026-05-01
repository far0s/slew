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

// ============================================================================
// Known HID device catalog
// ============================================================================

/// A recognised HID device with its VID, PID, and a friendly display name.
pub struct KnownHidDevice {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: &'static str,
}

// --- Elgato Stream Deck ---
pub const ELGATO_VENDOR_ID: u16 = 0x0FD9;
pub const STREAM_DECK_ORIGINAL_PID: u16 = 0x0060;
pub const STREAM_DECK_ORIGINAL_V2_PID: u16 = 0x006D;
pub const STREAM_DECK_MK2_PID: u16 = 0x0080;
pub const STREAM_DECK_MINI_PID: u16 = 0x0063;
pub const STREAM_DECK_MINI_MK2_PID: u16 = 0x0090;
pub const STREAM_DECK_XL_PID: u16 = 0x006C;
pub const STREAM_DECK_XL_V2_PID: u16 = 0x008F;
pub const STREAM_DECK_PEDAL_PID: u16 = 0x0086;
pub const STREAM_DECK_PLUS_PID: u16 = 0x0084;

// --- Loupedeck ---
pub const LOUPEDECK_VENDOR_ID: u16 = 0x2EC2;
pub const LOUPEDECK_CT_PID: u16 = 0x0004;
pub const LOUPEDECK_LIVE_PID: u16 = 0x0003;
pub const LOUPEDECK_LIVE_S_PID: u16 = 0x0007;

// --- Contour Design (ShuttlePRO / ShuttleXpress) ---
pub const CONTOUR_VENDOR_ID: u16 = 0x0B33;
pub const SHUTTLE_XPRESS_PID: u16 = 0x0020;
pub const SHUTTLE_PRO_V2_PID: u16 = 0x0030;

// --- Sony (DualShock 4 / DualSense) ---
pub const SONY_VENDOR_ID: u16 = 0x054C;
pub const DUALSHOCK4_V1_PID: u16 = 0x05C4;
pub const DUALSHOCK4_V2_PID: u16 = 0x09CC;
pub const DUALSENSE_PID: u16 = 0x0CE6;

// --- Nintendo Switch Pro Controller (USB) ---
pub const NINTENDO_VENDOR_ID: u16 = 0x057E;
pub const SWITCH_PRO_CONTROLLER_PID: u16 = 0x2009;

// --- Microsoft Xbox controllers (USB) ---
pub const MICROSOFT_VENDOR_ID: u16 = 0x045E;
pub const XBOX_ONE_CONTROLLER_PID: u16 = 0x02EA;
pub const XBOX_SERIES_CONTROLLER_PID: u16 = 0x0B12;

/// All known HID devices beyond the Megalodon macropad.
/// Used for device discovery and friendly labelling in the UI.
pub const KNOWN_HID_DEVICES: &[KnownHidDevice] = &[
    // Stream Deck family
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_ORIGINAL_PID,    name: "Stream Deck (Original)" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_ORIGINAL_V2_PID, name: "Stream Deck (Original v2)" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_MK2_PID,         name: "Stream Deck MK2" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_MINI_PID,        name: "Stream Deck Mini" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_MINI_MK2_PID,   name: "Stream Deck Mini MK2" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_XL_PID,         name: "Stream Deck XL" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_XL_V2_PID,      name: "Stream Deck XL v2" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_PEDAL_PID,      name: "Stream Deck Pedal" },
    KnownHidDevice { vendor_id: ELGATO_VENDOR_ID, product_id: STREAM_DECK_PLUS_PID,       name: "Stream Deck +" },
    // Loupedeck family
    KnownHidDevice { vendor_id: LOUPEDECK_VENDOR_ID, product_id: LOUPEDECK_CT_PID,     name: "Loupedeck CT" },
    KnownHidDevice { vendor_id: LOUPEDECK_VENDOR_ID, product_id: LOUPEDECK_LIVE_PID,   name: "Loupedeck Live" },
    KnownHidDevice { vendor_id: LOUPEDECK_VENDOR_ID, product_id: LOUPEDECK_LIVE_S_PID, name: "Loupedeck Live S" },
    // Contour Design jog wheels
    KnownHidDevice { vendor_id: CONTOUR_VENDOR_ID, product_id: SHUTTLE_XPRESS_PID, name: "Contour ShuttleXpress" },
    KnownHidDevice { vendor_id: CONTOUR_VENDOR_ID, product_id: SHUTTLE_PRO_V2_PID, name: "Contour ShuttlePRO v2" },
    // Gamepads
    KnownHidDevice { vendor_id: SONY_VENDOR_ID,      product_id: DUALSHOCK4_V1_PID,           name: "DualShock 4 v1" },
    KnownHidDevice { vendor_id: SONY_VENDOR_ID,      product_id: DUALSHOCK4_V2_PID,           name: "DualShock 4 v2" },
    KnownHidDevice { vendor_id: SONY_VENDOR_ID,      product_id: DUALSENSE_PID,               name: "DualSense" },
    KnownHidDevice { vendor_id: NINTENDO_VENDOR_ID,  product_id: SWITCH_PRO_CONTROLLER_PID,   name: "Switch Pro Controller" },
    KnownHidDevice { vendor_id: MICROSOFT_VENDOR_ID, product_id: XBOX_ONE_CONTROLLER_PID,     name: "Xbox One Controller" },
    KnownHidDevice { vendor_id: MICROSOFT_VENDOR_ID, product_id: XBOX_SERIES_CONTROLLER_PID, name: "Xbox Series Controller" },
];

/// Returns the friendly name for a known HID device, if recognised.
pub fn get_known_device_name(vendor_id: u16, product_id: u16) -> Option<&'static str> {
    KNOWN_HID_DEVICES
        .iter()
        .find(|d| d.vendor_id == vendor_id && d.product_id == product_id)
        .map(|d| d.name)
}
