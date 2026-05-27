//! Novation Launchpad mk2 / mk3 / X specific functionality.

use super::constants::*;
use super::mappings::install_default_note_mappings;
use super::output::send_note_on;

// ============================================================================
// LED Feedback
// ============================================================================

/// Light the 8 bottom-row pads green on any Launchpad variant.
pub fn send_launchpad_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending Launchpad startup LEDs");
    let device_id = output_device_id.to_string();
    std::thread::spawn(move || {
        for note in &LAUNCHPAD_BOTTOM_ROW_NOTES {
            let _ = send_note_on(Some(&device_id), 0, *note, LAUNCHPAD_LED_GREEN);
        }
        log::debug!("[MIDI] Launchpad startup LEDs sent");
    });
}

// ============================================================================
// Default Mappings
// ============================================================================

/// Set up default Launchpad mappings on first connect.
///
/// Maps bottom-row pad notes 11-18 to slot_0_alpha..slot_7_alpha (gate mode).
/// Skips any slot that already has a mapping.
pub fn setup_launchpad_default_mappings() {
    log::debug!("[MIDI] Setting up Launchpad default mappings");
    install_default_note_mappings(&LAUNCHPAD_BOTTOM_ROW_NOTES, 0);
}
