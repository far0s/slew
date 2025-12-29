//! HID report parsing for the DOIO Megalodon macropad.

use std::sync::{Arc, Mutex};
use tauri::Emitter;

use super::engine::HidEngineState;
use super::types::{HidEncoderEvent, HidKeyEvent};

/// Try to parse encoder event from HID report. Returns `None` if not an encoder event.
///
/// DOIO/Megalodon encoder patterns:
/// - K1 (left): Consumer Control 0x04, codes 0xB5/0xB6 (Next/Prev Track)
/// - K2 (right small): Keyboard NKRO 0x06, byte[11] = 0x08/0x40
/// - K3 (large): Consumer Control 0x04, codes 0xE9/0xEA (Volume Up/Down)
pub fn parse_encoder_event(data: &[u8], timestamp: u64) -> Option<HidEncoderEvent> {
    if data.is_empty() {
        return None;
    }

    // Consumer Control Report (4 bytes, starts with 0x04)
    if data.len() >= 3 && data[0] == 0x04 {
        let consumer_code = data[1];
        if consumer_code == 0x00 {
            return None; // Release event
        }

        match consumer_code {
            0xE9 => {
                return Some(HidEncoderEvent {
                    encoder_index: 2,
                    delta: 1,
                    timestamp,
                })
            }
            0xEA => {
                return Some(HidEncoderEvent {
                    encoder_index: 2,
                    delta: -1,
                    timestamp,
                })
            }
            0xB5 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: 1,
                    timestamp,
                })
            }
            0xB6 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: -1,
                    timestamp,
                })
            }
            _ => {}
        }
    }

    // Keyboard NKRO Report (32 bytes, starts with 0x06) - K2 encoder
    if data.len() >= 12 && data[0] == 0x06 {
        match data[11] {
            0x08 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: 1,
                    timestamp,
                })
            }
            0x40 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: -1,
                    timestamp,
                })
            }
            _ => {}
        }
    }

    // Generic Consumer Control (for other devices)
    if data.len() >= 2 && data[0] != 0x04 && data[0] != 0x06 {
        let consumer_code = u16::from_le_bytes([data[0], data[1]]);
        match consumer_code {
            0x00E9 => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: 1,
                    timestamp,
                })
            }
            0x00EA => {
                return Some(HidEncoderEvent {
                    encoder_index: 1,
                    delta: -1,
                    timestamp,
                })
            }
            0x00B5 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: 1,
                    timestamp,
                })
            }
            0x00B6 => {
                return Some(HidEncoderEvent {
                    encoder_index: 0,
                    delta: -1,
                    timestamp,
                })
            }
            _ => {}
        }
    }

    None
}

/// Parse keyboard NKRO report and emit key events (press and release detection).
pub fn parse_and_emit_key_events(data: &[u8], timestamp: u64, engine: &Arc<Mutex<HidEngineState>>) {
    if data.len() < 12 || data[0] != 0x06 {
        return;
    }

    // Extract currently pressed keys from NKRO bitmap
    let mut current_keys: Vec<u8> = Vec::new();
    for byte_idx in 1..data.len() {
        let byte = data[byte_idx];
        if byte == 0 {
            continue;
        }
        for bit_idx in 0..8 {
            if byte & (1 << bit_idx) != 0 {
                current_keys.push(((byte_idx - 1) * 8 + bit_idx) as u8);
            }
        }
    }

    let mut state = engine.lock().unwrap();
    let prev_keys = state.pressed_keys.clone();

    // Newly pressed keys
    for &key_code in &current_keys {
        if !prev_keys.contains(&key_code) {
            if let Some(event) = create_key_event(key_code, true, timestamp) {
                log::debug!("[HID] Key pressed: {} (0x{:02X})", event.key_name, key_code);
                if let Some(handle) = &state.app_handle {
                    let _ = handle.emit("hid_key", &event);
                }
            }
        }
    }

    // Released keys
    for &key_code in &prev_keys {
        if !current_keys.contains(&key_code) {
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

    state.pressed_keys = current_keys;
}

/// Map HID key code to logical key name based on DOIO Megalodon physical layout.
fn create_key_event(key_code: u8, pressed: bool, timestamp: u64) -> Option<HidKeyEvent> {
    let key_name = match key_code {
        // Row 1: Keys 1-4
        0x26 => "1",
        0x27 => "2",
        0x28 => "3",
        0x29 => "4",

        // Row 2: Keys 5-8
        0x2A => "5",
        0x2B => "6",
        0x2C => "7",
        0x2D => "8",

        // Row 3: Keys 9, 0, Up, Enter
        0x2E => "9",
        0x2F => "0",
        0x5A => "Up",
        0x30 => "Enter",

        // Row 4: Left, Down/Right
        0x59 => "Left",
        0x57 => "Down/Right",

        // Standard arrow keys
        0x4F => "Right",
        0x50 => "Left_Std",
        0x51 => "Down_Std",
        0x52 => "Up_Std",

        // Function keys F13-F24
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

        0x65 => "App",

        // Numpad
        0x62 => "Num0",
        0x5B => "Num3",
        0x5C => "Num4",
        0x5D => "Num5",
        0x5E => "Num6",
        0x5F => "Num7",
        0x60 => "Num8",
        0x61 => "Num9",

        // Modifiers
        0xE0 => "LCtrl",
        0xE1 => "LShift",
        0xE2 => "LAlt",
        0xE3 => "LMeta",
        0xE4 => "RCtrl",
        0xE5 => "RShift",
        0xE6 => "RAlt",
        0xE7 => "RMeta",

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
