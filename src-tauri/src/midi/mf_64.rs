//! DJ TechTools Midi Fighter 64 specific functionality.

use super::constants::*;
use super::mappings::install_default_note_mappings;
use super::output::send_note_on;

pub fn setup_mf_64_default_mappings() {
    log::debug!("[MIDI] Setting up Midi Fighter 64 default mappings");
    install_default_note_mappings(&MF_64_BOTTOM_ROW_NOTES, 0);
}

pub fn send_mf_64_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending Midi Fighter 64 startup LEDs");
    let device_id = output_device_id.to_string();
    std::thread::spawn(move || {
        for note in &MF_64_PAD_NOTES {
            let _ = send_note_on(Some(&device_id), 0, *note, 0);
        }
        log::debug!("[MIDI] Midi Fighter 64 startup LEDs sent");
    });
}
