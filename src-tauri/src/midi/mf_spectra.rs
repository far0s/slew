//! DJ TechTools Midi Fighter Spectra specific functionality.

use super::constants::*;
use super::mappings::install_default_note_mappings;
use super::output::send_note_on;

pub fn setup_mf_spectra_default_mappings() {
    log::debug!("[MIDI] Setting up Midi Fighter Spectra default mappings");
    install_default_note_mappings(&MF_SPECTRA_PAD_NOTES[..8], 0);
}

pub fn send_mf_spectra_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending Midi Fighter Spectra startup LEDs");
    let device_id = output_device_id.to_string();
    std::thread::spawn(move || {
        for note in &MF_SPECTRA_PAD_NOTES {
            let _ = send_note_on(Some(&device_id), 0, *note, 0);
        }
        log::debug!("[MIDI] Midi Fighter Spectra startup LEDs sent");
    });
}
