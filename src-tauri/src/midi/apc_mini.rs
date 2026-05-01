//! AKAI APC Mini mk1 and mk2 specific functionality.
//!
//! Handles LED startup feedback and default fader-to-slot-alpha mappings
//! for both mk1 and mk2 variants.

use super::constants::*;
use super::mappings::install_default_cc_mappings;
use super::output::send_note_on;

// ============================================================================
// LED Feedback
// ============================================================================

fn send_startup_leds(output_device_id: &str, notes: &'static [u8; 8]) {
    let device_id = output_device_id.to_string();
    std::thread::spawn(move || {
        for note in notes {
            let _ = send_note_on(Some(&device_id), 0, *note, APC_MINI_LED_GREEN);
        }
        log::debug!("[MIDI] APC Mini startup LEDs sent");
    });
}

/// Light the 8 scene launch buttons green on an APC Mini mk1.
pub fn send_apc_mini_mk1_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending APC Mini mk1 startup LEDs");
    send_startup_leds(output_device_id, &APC_MINI_MK1_SCENE_NOTES);
}

/// Light the 8 scene launch buttons green on an APC Mini mk2.
pub fn send_apc_mini_mk2_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending APC Mini mk2 startup LEDs");
    send_startup_leds(output_device_id, &APC_MINI_MK2_SCENE_NOTES);
}

// ============================================================================
// Default Mappings
// ============================================================================

/// Set up default APC Mini mappings on first connect.
///
/// Maps faders CC 48-55 to slot_0_alpha..slot_7_alpha.
/// CC 56 (master fader) is left free for the user.
/// Skips any slot that already has a mapping.
pub fn setup_apc_mini_default_mappings() {
    log::debug!("[MIDI] Setting up APC Mini default mappings");
    // Only the 8 channel faders (indices 0-7); skip index 8 (CC 56 = master)
    install_default_cc_mappings(&APC_MINI_FADER_CCS[..8]);
}
