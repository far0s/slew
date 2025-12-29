//! Audio analysis using FFT.

use rustfft::num_complex::Complex;
use std::sync::{Arc, Mutex};

use super::constants::FFT_SIZE;
use super::engine::AudioEngineState;
use super::types::{AudioBands, AudioLevels};

/// Perform audio analysis and return levels. Returns `None` if not enough data.
pub fn analyze_audio(engine: &Arc<Mutex<AudioEngineState>>) -> Option<AudioLevels> {
    let state = engine.lock().unwrap();

    let buffer_guard = state.buffer.lock().ok()?;
    let buffer = buffer_guard.as_ref()?;
    let window = buffer.get_analysis_window()?;
    let sample_rate = buffer.sample_rate();

    drop(buffer_guard);
    drop(state);

    // Apply Hann window
    let windowed: Vec<f32> = window
        .iter()
        .enumerate()
        .map(|(i, &s)| {
            let hann =
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / FFT_SIZE as f32).cos());
            s * hann
        })
        .collect();

    let rms = (windowed.iter().map(|&s| s * s).sum::<f32>() / FFT_SIZE as f32).sqrt();
    let peak = windowed.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);

    // Perform FFT
    let planner_guard = engine.lock().unwrap().fft_planner.clone();
    let mut planner = planner_guard.lock().unwrap();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    drop(planner);

    let mut complex: Vec<Complex<f32>> = windowed.iter().map(|&s| Complex::new(s, 0.0)).collect();
    fft.process(&mut complex);

    // Magnitude spectrum (first half due to symmetry)
    let magnitudes: Vec<f32> = complex[..FFT_SIZE / 2].iter().map(|c| c.norm()).collect();

    let freq_per_bin = sample_rate as f32 / FFT_SIZE as f32;

    let bass = band_energy(&magnitudes, 20.0, 250.0, freq_per_bin);
    let low_mid = band_energy(&magnitudes, 250.0, 500.0, freq_per_bin);
    let high_mid = band_energy(&magnitudes, 500.0, 2000.0, freq_per_bin);
    let treble = band_energy(&magnitudes, 2000.0, 20000.0, freq_per_bin);

    // Normalize bands (empirical scaling)
    let bands = AudioBands {
        bass: (bass * 10.0).min(1.0) as f64,
        low_mid: (low_mid * 15.0).min(1.0) as f64,
        high_mid: (high_mid * 20.0).min(1.0) as f64,
        treble: (treble * 30.0).min(1.0) as f64,
    };

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
        peak: (peak * 4.0).min(1.0) as f64,
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
