//! MIDI constants for the AKAI MIDImix controller and general MIDI operation.

/// Interval for polling device list changes (in milliseconds)
pub const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

/// Known device profiles for automatic setup
pub const MIDIMIX_NAME_PATTERN: &str = "MIDI Mix";

/// Midimix fader CC numbers (channel 0): faders 1-8
pub const MIDIMIX_FADER_CCS: [u8; 8] = [19, 23, 27, 31, 49, 53, 57, 61];

/// Midimix knob CC numbers (channel 0): 3 knobs per column, 8 columns
/// Each inner array is [top, middle, bottom] knob for that column
pub const MIDIMIX_KNOB_CCS: [[u8; 3]; 8] = [
    [16, 17, 18], // Column 1
    [20, 21, 22], // Column 2
    [24, 25, 26], // Column 3
    [28, 29, 30], // Column 4
    [46, 47, 48], // Column 5
    [50, 51, 52], // Column 6
    [54, 55, 56], // Column 7
    [58, 59, 60], // Column 8
];

/// Midimix master fader CC number (channel 0)
pub const MIDIMIX_MASTER_FADER_CC: u8 = 62;

/// Midimix LED note numbers for Mute row (channel 0) - top button row
pub const MIDIMIX_MUTE_NOTES: [u8; 8] = [1, 4, 7, 10, 13, 16, 19, 22];

/// Midimix LED note numbers for Solo row (channel 0) - middle button row
pub const MIDIMIX_SOLO_NOTES: [u8; 8] = [2, 5, 8, 11, 14, 17, 20, 23];

/// Midimix LED note numbers for Rec Arm row (channel 0) - bottom button row
pub const MIDIMIX_REC_ARM_NOTES: [u8; 8] = [3, 6, 9, 12, 15, 18, 21, 24];

/// Midimix master column button note numbers (channel 0)
/// Note: Button input note numbers differ from LED output note numbers
#[allow(dead_code)]
pub const MIDIMIX_SEND_ALL_NOTE: u8 = 25;

#[allow(dead_code)]
pub const MIDIMIX_BANK_LEFT_NOTE: u8 = 26;

#[allow(dead_code)]
pub const MIDIMIX_BANK_RIGHT_NOTE: u8 = 27;

/// Bank LEDs appear to use notes offset by 1 from button input notes
pub const MIDIMIX_BANK_LEFT_LED_NOTE: u8 = 25;
pub const MIDIMIX_BANK_RIGHT_LED_NOTE: u8 = 26;

/// Master SOLO button (right column) - used as modifier key
pub const MIDIMIX_MASTER_SOLO_NOTE: u8 = 28;
