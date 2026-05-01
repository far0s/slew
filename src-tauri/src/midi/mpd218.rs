//! AKAI MPD218 specific functionality.
//!
//! Handles default knob-to-slot-alpha mappings for the MPD218 pad controller.
//! The MPD218 has no addressable LEDs, so only mapping setup is needed.

use super::constants::*;
use super::mappings::install_default_cc_mappings;

// ============================================================================
// Default Mappings
// ============================================================================

/// Set up default MPD218 mappings on first connect.
///
/// Maps the 6 Bank A knobs (CC 3,9,12,13,14,15) to slot_0_alpha..slot_5_alpha.
/// Skips any slot that already has a mapping.
pub fn setup_mpd218_default_mappings() {
    log::debug!("[MIDI] Setting up MPD218 default mappings");
    install_default_cc_mappings(&MPD218_KNOB_BANK_A_CCS);
}
