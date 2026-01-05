//! Audio analysis using FFT.
//!
//! Uses pre-allocated scratch buffers to avoid per-frame allocations in the hot path.

use rustfft::num_complex::Complex;
use std::sync::{Arc, Mutex};

use super::constants::FFT_SIZE;
use super::engine::AudioEngineState;
use super::types::{AudioBands, AudioLevels};

/// Perform audio analysis and return levels. Returns `None` if not enough data.
///
/// Uses pre-allocated scratch buffers from the engine state to avoid allocations.
pub fn analyze_audio(engine: &Arc<Mutex<AudioEngineState>>) -> Option<AudioLevels> {
    // First, get the audio window and sample rate (short lock)
    let (window, sample_rate) = {
        let state = engine.lock().unwrap();
        let buffer_guard = state.buffer.lock().ok()?;
        let buffer = buffer_guard.as_ref()?;
        let window = buffer.get_analysis_window()?;
        let sample_rate = buffer.sample_rate();
        (window, sample_rate)
    };

    // Get FFT planner (Arc clone is cheap)
    let planner_guard = {
        let state = engine.lock().unwrap();
        state.fft_planner.clone()
    };

    // Plan FFT outside of engine lock
    let fft = {
        let mut planner = planner_guard.lock().unwrap();
        planner.plan_fft_forward(FFT_SIZE)
    };

    // Compute RMS and peak from raw window (avoid iterating twice)
    let mut sum_sq = 0.0f32;
    let mut peak = 0.0f32;

    // Now lock the engine to use scratch buffers and perform analysis
    let (rms, peak_val, bands) = {
        let mut state = engine.lock().unwrap();
        let scratch = &mut state.analysis_scratch;

        // Apply Hann window to scratch buffer and compute RMS/peak in one pass
        for (i, &s) in window.iter().enumerate() {
            let hann =
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / FFT_SIZE as f32).cos());
            let windowed_sample = s * hann;
            scratch.windowed[i] = windowed_sample;
            sum_sq += windowed_sample * windowed_sample;
            let abs_val = windowed_sample.abs();
            if abs_val > peak {
                peak = abs_val;
            }
        }

        let rms = (sum_sq / FFT_SIZE as f32).sqrt();

        // Prepare complex buffer for FFT (reuse allocation)
        for (i, &s) in scratch.windowed.iter().enumerate() {
            scratch.complex[i] = Complex::new(s, 0.0);
        }

        // Perform FFT in-place
        fft.process(&mut scratch.complex);

        // Compute magnitude spectrum (first half due to symmetry)
        for i in 0..FFT_SIZE / 2 {
            scratch.magnitudes[i] = scratch.complex[i].norm();
        }

        let freq_per_bin = sample_rate as f32 / FFT_SIZE as f32;

        let bass = band_energy(&scratch.magnitudes, 20.0, 250.0, freq_per_bin);
        let low_mid = band_energy(&scratch.magnitudes, 250.0, 500.0, freq_per_bin);
        let high_mid = band_energy(&scratch.magnitudes, 500.0, 2000.0, freq_per_bin);
        let treble = band_energy(&scratch.magnitudes, 2000.0, 20000.0, freq_per_bin);

        // Normalize bands (empirical scaling)
        let bands = AudioBands {
            bass: (bass * 10.0).min(1.0) as f64,
            low_mid: (low_mid * 15.0).min(1.0) as f64,
            high_mid: (high_mid * 20.0).min(1.0) as f64,
            treble: (treble * 30.0).min(1.0) as f64,
        };

        (rms, peak, bands)
    };

    // Beat detection (separate lock)
    let beat = {
        let state = engine.lock().unwrap();
        let mut detector = state.beat_detector.lock().unwrap();
        detector.update(bands.bass, FFT_SIZE)
    };

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Some(AudioLevels {
        rms: (rms * 8.0).min(1.0) as f64,
        peak: (peak_val * 4.0).min(1.0) as f64,
        bands,
        beat,
        timestamp,
    })
}

/// Calculate RMS energy in a frequency band.
pub fn band_energy(magnitudes: &[f32], low_hz: f32, high_hz: f32, freq_per_bin: f32) -> f32 {
    let low_bin = (low_hz / freq_per_bin) as usize;
    let high_bin = ((high_hz / freq_per_bin) as usize).min(magnitudes.len());

    if low_bin >= high_bin || low_bin >= magnitudes.len() {
        return 0.0;
    }

    let sum: f32 = magnitudes[low_bin..high_bin].iter().map(|&m| m * m).sum();
    (sum / (high_bin - low_bin) as f32).sqrt()
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // band_energy tests
    // =========================================================================

    #[test]
    fn test_band_energy_basic() {
        // 1024 bins, sample rate 44100, so freq_per_bin = 44100 / 2048 ≈ 21.5 Hz
        let freq_per_bin = 44100.0 / 2048.0;
        let magnitudes: Vec<f32> = vec![1.0; 1024];

        // Bass band: 20-250 Hz
        let bass = band_energy(&magnitudes, 20.0, 250.0, freq_per_bin);

        // With all magnitudes = 1.0, RMS should be 1.0
        assert!((bass - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_band_energy_empty_magnitudes() {
        let magnitudes: Vec<f32> = vec![];
        let energy = band_energy(&magnitudes, 20.0, 250.0, 21.5);
        assert_eq!(energy, 0.0);
    }

    #[test]
    fn test_band_energy_low_bin_exceeds_length() {
        let magnitudes: Vec<f32> = vec![1.0; 10];
        // With freq_per_bin = 10 Hz, 200 Hz would be bin 20, which exceeds length
        let energy = band_energy(&magnitudes, 200.0, 300.0, 10.0);
        assert_eq!(energy, 0.0);
    }

    #[test]
    fn test_band_energy_high_bin_clamped() {
        let magnitudes: Vec<f32> = vec![1.0; 50];
        // Request a range that extends beyond the array
        // freq_per_bin = 10, so 100 Hz = bin 10, 1000 Hz = bin 100 (clamped to 50)
        let energy = band_energy(&magnitudes, 100.0, 1000.0, 10.0);

        // Should calculate over bins 10-50 (40 bins of magnitude 1.0)
        assert!((energy - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_band_energy_inverted_range() {
        let magnitudes: Vec<f32> = vec![1.0; 100];
        // high_hz < low_hz should return 0
        let energy = band_energy(&magnitudes, 500.0, 100.0, 10.0);
        assert_eq!(energy, 0.0);
    }

    #[test]
    fn test_band_energy_varying_magnitudes() {
        // Create magnitudes that vary
        let magnitudes: Vec<f32> = vec![0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let freq_per_bin = 10.0;

        // Bins 2-5 (20-50 Hz): magnitudes [2.0, 3.0, 4.0]
        let energy = band_energy(&magnitudes, 20.0, 50.0, freq_per_bin);

        // RMS = sqrt((4 + 9 + 16) / 3) = sqrt(29/3) ≈ 3.11
        let expected = ((4.0 + 9.0 + 16.0) / 3.0_f32).sqrt();
        assert!((energy - expected).abs() < 0.01);
    }

    #[test]
    fn test_band_energy_single_bin() {
        let magnitudes: Vec<f32> = vec![0.5; 100];
        let freq_per_bin = 10.0;

        // Exactly one bin: 10-20 Hz = bins 1-2, so just bin 1
        let energy = band_energy(&magnitudes, 10.0, 20.0, freq_per_bin);

        // RMS of single 0.5 value is 0.5
        assert!((energy - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_band_energy_zero_magnitudes() {
        let magnitudes: Vec<f32> = vec![0.0; 100];
        let energy = band_energy(&magnitudes, 20.0, 200.0, 10.0);
        assert_eq!(energy, 0.0);
    }

    #[test]
    fn test_band_energy_different_sample_rates() {
        let magnitudes: Vec<f32> = vec![1.0; 512];

        // 44.1kHz sample rate, FFT size 1024
        let freq_per_bin_44k = 44100.0 / 1024.0;
        let energy_44k = band_energy(&magnitudes, 100.0, 500.0, freq_per_bin_44k);

        // 48kHz sample rate, FFT size 1024
        let freq_per_bin_48k = 48000.0 / 1024.0;
        let energy_48k = band_energy(&magnitudes, 100.0, 500.0, freq_per_bin_48k);

        // Both should return 1.0 (same magnitude values)
        assert!((energy_44k - 1.0).abs() < 0.01);
        assert!((energy_48k - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_band_energy_bass_vs_treble() {
        // Simulate spectrum with more bass energy
        let mut magnitudes: Vec<f32> = vec![0.0; 512];
        // Bass region (bins 0-20): high energy
        for i in 0..20 {
            magnitudes[i] = 0.8;
        }
        // Treble region (bins 100-200): low energy
        for i in 100..200 {
            magnitudes[i] = 0.2;
        }

        let freq_per_bin = 44100.0 / 1024.0; // ~43 Hz per bin

        // Bass: 0-860 Hz (bins 0-20)
        let bass = band_energy(&magnitudes, 0.0, 860.0, freq_per_bin);
        // Treble: 4300-8600 Hz (bins 100-200)
        let treble = band_energy(&magnitudes, 4300.0, 8600.0, freq_per_bin);

        assert!(bass > treble);
        assert!((bass - 0.8).abs() < 0.01);
        assert!((treble - 0.2).abs() < 0.01);
    }
}
