//! Modulation Engine — Backend LFO sources and modulation matrix
//!
//! This module provides:
//! - LFO (Low Frequency Oscillator) sources with various waveforms
//! - Modulation targets that route LFOs to parameters
//! - Audio-reactive modulation (audio sources can modulate LFO rate/depth)
//! - A tick loop that runs at ~60Hz alongside the parameter tick loop

mod types;
mod engine;
mod persistence;
mod lfos;
mod targets;
mod audio_mod;
pub mod commands;

// Re-export all public types
pub use types::{
    AudioModulation, LfoProperty, LfoShape, LfoSource, LfoValues, ModulationState,
    ModulationTarget,
};

// Re-export public engine functions
pub use engine::{
    get_modulation_state, get_targets_for_parameter, init_modulation_engine,
    is_parameter_modulated, restore_state, update_audio_levels, update_bpm,
};

// Re-export persistence functions
pub use persistence::save_state_to_disk as save_modulation_state_to_disk;

// Re-export LFO management
pub use lfos::{add_lfo, clear_lfos, get_lfo, get_lfos, remove_lfo, update_lfo};

// Re-export target management
pub use targets::{
    add_target, clear_targets, get_targets, remove_target, update_base_value,
};

// Re-export audio modulation management
pub use audio_mod::{
    add_audio_modulation, clear_audio_modulations, get_audio_modulations,
    remove_audio_modulation,
};

// Re-export commands
pub use commands::*;

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // LfoSource::tick tests
    // =========================================================================

    #[test]
    fn test_lfo_sine_basic() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 1.0,
            phase: 0.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // At phase 0, sine should be 0
        lfo.current_phase = 0.0;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);

        // At phase 0.25 (quarter cycle), sine should be 1
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 1.0).abs() < 0.01);

        // At phase 0.5 (half cycle), sine should be 0
        lfo.current_phase = 0.5;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);

        // At phase 0.75, sine should be -1
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - (-1.0)).abs() < 0.01);
    }

    #[test]
    fn test_lfo_triangle_basic() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Triangle,
            rate: 1.0,
            phase: 0.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // At phase 0, triangle should be 0
        lfo.current_phase = 0.0;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);

        // At phase 0.25, triangle should be 1
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 1.0).abs() < 0.01);

        // At phase 0.5, triangle should be 0
        lfo.current_phase = 0.5;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);

        // At phase 0.75, triangle should be -1
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - (-1.0)).abs() < 0.01);
    }

    #[test]
    fn test_lfo_saw_basic() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Saw,
            rate: 1.0,
            phase: 0.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // At phase 0, saw should be -1
        lfo.current_phase = 0.0;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - (-1.0)).abs() < 0.01);

        // At phase 0.5, saw should be 0
        lfo.current_phase = 0.5;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);

        // At phase ~1.0 (just before wrap), saw should be close to 1
        lfo.current_phase = 0.99;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.98).abs() < 0.05);
    }

    #[test]
    fn test_lfo_square_basic() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            phase: 0.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // At phase 0.25 (first half), square should be 1
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert_eq!(lfo.get_value(), 1.0);

        // At phase 0.75 (second half), square should be -1
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert_eq!(lfo.get_value(), -1.0);
    }

    #[test]
    fn test_lfo_disabled() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 1.0,
            enabled: false,
            ..Default::default()
        };

        let initial_phase = lfo.current_phase;
        lfo.tick(1.0, None);

        // Phase should not advance when disabled
        assert_eq!(lfo.current_phase, initial_phase);
    }

    #[test]
    fn test_lfo_phase_advance() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 1.0, // 1 Hz
            enabled: true,
            ..Default::default()
        };

        // Advance by 0.5 seconds at 1 Hz should advance phase by 0.5
        lfo.tick(0.5, None);
        assert!((lfo.current_phase - 0.5).abs() < 0.001);

        // Advance by another 0.5 seconds should wrap back to 0
        lfo.tick(0.5, None);
        assert!((lfo.current_phase - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_lfo_phase_wraps() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 2.0, // 2 Hz
            enabled: true,
            ..Default::default()
        };

        // Advance by 1.0 second at 2 Hz = 2 full cycles, phase should wrap
        lfo.tick(1.0, None);
        assert!(lfo.current_phase >= 0.0 && lfo.current_phase < 1.0);
    }

    #[test]
    fn test_lfo_depth() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            depth: 0.5,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // Square at first half with depth 0.5 should output 0.5
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.5).abs() < 0.01);

        // Square at second half with depth 0.5 should output -0.5
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - (-0.5)).abs() < 0.01);
    }

    #[test]
    fn test_lfo_offset() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            depth: 0.5,
            offset: 0.5,
            enabled: true,
            ..Default::default()
        };

        // Square at first half: raw=1, output = 0.5 + 1*0.5 = 1.0
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 1.0).abs() < 0.01);

        // Square at second half: raw=-1, output = 0.5 + (-1)*0.5 = 0.0
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert!((lfo.get_value() - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_lfo_phase_offset() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            phase: 0.5, // 180 degree phase offset
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // At current_phase 0.0 + phase offset 0.5 = 0.5, which is second half
        lfo.current_phase = 0.0;
        lfo.tick(0.0, None);
        assert_eq!(lfo.get_value(), -1.0);
    }

    #[test]
    fn test_lfo_get_unipolar_value() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            ..Default::default()
        };

        // Square at first half = 1.0, unipolar = (1 + 1) / 2 = 1.0
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        assert!((lfo.get_unipolar_value() - 1.0).abs() < 0.01);

        // Square at second half = -1.0, unipolar = (-1 + 1) / 2 = 0.0
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        assert!((lfo.get_unipolar_value() - 0.0).abs() < 0.01);
    }

    #[test]
    fn test_lfo_bpm_sync() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 1.0, // This should be overridden by BPM sync
            sync_to_bpm: true,
            bpm_division: 1.0, // 1 beat per cycle
            enabled: true,
            ..Default::default()
        };

        // At 120 BPM, 1 beat = 0.5 seconds
        // So rate should be 2 Hz (2 beats per second = 1 cycle per beat)
        // In 0.25 seconds at 120 BPM with division 1, we should advance 0.5 phase
        lfo.tick(0.25, Some(120.0));
        assert!((lfo.current_phase - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_lfo_bpm_sync_with_division() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Sine,
            rate: 1.0,
            sync_to_bpm: true,
            bpm_division: 4.0, // 4 beats per cycle (one bar at 4/4)
            enabled: true,
            ..Default::default()
        };

        // At 120 BPM, base rate = 2 Hz, divided by 4 = 0.5 Hz
        // In 1 second, phase should advance by 0.5
        lfo.tick(1.0, Some(120.0));
        assert!((lfo.current_phase - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_lfo_value_clamping() {
        let mut lfo = LfoSource {
            id: "test".to_string(),
            name: "Test".to_string(),
            shape: LfoShape::Square,
            rate: 1.0,
            depth: 2.0, // Depth > 1 could cause values outside -1 to 1
            offset: 0.5,
            enabled: true,
            ..Default::default()
        };

        // Square at first half: raw=1, unclamped = 0.5 + 1*2 = 2.5
        lfo.current_phase = 0.25;
        lfo.tick(0.0, None);
        // get_value should clamp to 1.0
        assert_eq!(lfo.get_value(), 1.0);

        // Square at second half: raw=-1, unclamped = 0.5 + (-1)*2 = -1.5
        lfo.current_phase = 0.75;
        lfo.tick(0.0, None);
        // get_value should clamp to -1.0
        assert_eq!(lfo.get_value(), -1.0);
    }

    // =========================================================================
    // ModulationTarget tests
    // =========================================================================

    #[test]
    fn test_modulation_target_default() {
        let target = ModulationTarget::default();
        assert!(target.enabled);
        assert_eq!(target.depth, 0.5);
        assert!(target.bipolar);
    }

    // =========================================================================
    // LfoShape tests
    // =========================================================================

    #[test]
    fn test_lfo_shape_default() {
        assert_eq!(LfoShape::default(), LfoShape::Sine);
    }

    #[test]
    fn test_lfo_source_default() {
        let lfo = LfoSource::default();
        assert_eq!(lfo.shape, LfoShape::Sine);
        assert_eq!(lfo.rate, 1.0);
        assert_eq!(lfo.depth, 1.0);
        assert_eq!(lfo.offset, 0.0);
        assert!(lfo.enabled);
        assert!(lfo.sync_to_bpm);
        assert_eq!(lfo.bpm_division, 4.0);
    }

    #[test]
    fn test_lfo_new() {
        let lfo = LfoSource::new("test_id".to_string(), "Test LFO".to_string());
        assert_eq!(lfo.id, "test_id");
        assert_eq!(lfo.name, "Test LFO");
        assert_eq!(lfo.shape, LfoShape::Sine); // Default shape
    }
}
