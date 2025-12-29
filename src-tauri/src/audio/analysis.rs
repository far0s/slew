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
