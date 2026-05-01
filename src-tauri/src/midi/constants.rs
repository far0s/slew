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

/// Bank LED note numbers (channel 0)
pub const MIDIMIX_BANK_LEFT_LED_NOTE: u8 = 25;
pub const MIDIMIX_BANK_RIGHT_LED_NOTE: u8 = 26;

/// Master SOLO button (right column) - used as modifier key
pub const MIDIMIX_MASTER_SOLO_NOTE: u8 = 28;

// ============================================================================
// APC Mini constants
// ============================================================================
// Note: LED colour constants and button note arrays below are reference data
// for future features (slot-state LED feedback, MIDI Learn display).
// They are not all wired up yet.

/// APC Mini mk1 port name pattern
pub const APC_MINI_MK1_NAME_PATTERN: &str = "APC MINI";

/// APC Mini mk2 port name pattern
pub const APC_MINI_MK2_NAME_PATTERN: &str = "APC mini mk2";

/// APC Mini fader CC numbers (channel 0): 8 channel faders (CC 48–55) + master fader (CC 56)
pub const APC_MINI_FADER_CCS: [u8; 9] = [48, 49, 50, 51, 52, 53, 54, 55, 56];

/// APC Mini mk1 scene launch button notes (right column, channel 0): notes 82–89
pub const APC_MINI_MK1_SCENE_NOTES: [u8; 8] = [82, 83, 84, 85, 86, 87, 88, 89];

#[allow(dead_code)]
/// APC Mini mk1 bottom clip-stop button notes (channel 0): notes 64–71
pub const APC_MINI_MK1_CLIP_STOP_NOTES: [u8; 8] = [64, 65, 66, 67, 68, 69, 70, 71];

#[allow(dead_code)]
/// APC Mini mk1 shift button note (channel 0)
pub const APC_MINI_MK1_SHIFT_NOTE: u8 = 98;

/// APC Mini mk2 scene launch button notes (right column, channel 0): notes 112–119
pub const APC_MINI_MK2_SCENE_NOTES: [u8; 8] = [112, 113, 114, 115, 116, 117, 118, 119];

#[allow(dead_code)]
/// APC Mini mk2 bottom clip-stop button notes (channel 0): notes 100–107
pub const APC_MINI_MK2_CLIP_STOP_NOTES: [u8; 8] = [100, 101, 102, 103, 104, 105, 106, 107];

/// APC Mini LED velocity values
/// 0=off, 1=green, 2=green blink, 3=red, 4=red blink, 5=yellow, 6=yellow blink
#[allow(dead_code)] pub const APC_MINI_LED_OFF: u8 = 0;
pub const APC_MINI_LED_GREEN: u8 = 1;
#[allow(dead_code)] pub const APC_MINI_LED_GREEN_BLINK: u8 = 2;
#[allow(dead_code)] pub const APC_MINI_LED_RED: u8 = 3;
#[allow(dead_code)] pub const APC_MINI_LED_RED_BLINK: u8 = 4;
#[allow(dead_code)] pub const APC_MINI_LED_YELLOW: u8 = 5;
#[allow(dead_code)] pub const APC_MINI_LED_YELLOW_BLINK: u8 = 6;

// ============================================================================
// MPD218 constants
// ============================================================================

/// MPD218 port name pattern
pub const MPD218_NAME_PATTERN: &str = "MPD218";

#[allow(dead_code)]
/// MPD218 Bank A pad notes (channel 0): notes 36–51
pub const MPD218_PAD_BANK_A_NOTES: [u8; 16] = [
    36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
];

#[allow(dead_code)]
/// MPD218 Bank B pad notes (channel 0): notes 52–67
pub const MPD218_PAD_BANK_B_NOTES: [u8; 16] = [
    52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67,
];

/// MPD218 Bank A knob CC numbers (channel 0): factory defaults
pub const MPD218_KNOB_BANK_A_CCS: [u8; 6] = [3, 9, 12, 13, 14, 15];

#[allow(dead_code)]
/// MPD218 Bank B knob CC numbers (channel 0): factory defaults
pub const MPD218_KNOB_BANK_B_CCS: [u8; 6] = [16, 17, 18, 19, 20, 21];
