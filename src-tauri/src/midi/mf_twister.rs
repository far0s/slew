//! DJ TechTools Midi Fighter Twister specific functionality.

use super::constants::*;
use super::mappings::install_default_cc_mappings;
use super::output::send_cc;

pub fn setup_mf_twister_default_mappings() {
    log::debug!("[MIDI] Setting up Midi Fighter Twister default mappings");
    install_default_cc_mappings(&MF_TWISTER_ENCODER_CCS[..8]);
}

pub fn send_mf_twister_startup_leds(output_device_id: &str) {
    log::debug!("[MIDI] Sending Midi Fighter Twister startup LEDs");
    let device_id = output_device_id.to_string();
    std::thread::spawn(move || {
        // Reset all 16 encoder LED rings to zero position on channel 1
        for cc in &MF_TWISTER_ENCODER_CCS {
            let _ = send_cc(Some(&device_id), 1, *cc, 0);
        }
        log::debug!("[MIDI] Midi Fighter Twister startup LEDs sent");
    });
}
