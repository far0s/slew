//! Audio buffering and beat detection.

use super::constants::{BEAT_COOLDOWN_SAMPLES, BEAT_THRESHOLD, FFT_SIZE};

/// Accumulates samples before FFT analysis.
pub struct AudioBuffer {
    samples: Vec<f32>,
    sample_rate: u32,
}

impl AudioBuffer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::with_capacity(FFT_SIZE * 2),
            sample_rate,
        }
    }

    pub fn push_samples(&mut self, data: &[f32]) {
        self.samples.extend_from_slice(data);
        if self.samples.len() > FFT_SIZE * 4 {
            self.samples.drain(0..(self.samples.len() - FFT_SIZE * 2));
        }
    }

    pub fn get_analysis_window(&self) -> Option<Vec<f32>> {
        if self.samples.len() >= FFT_SIZE {
            Some(self.samples[self.samples.len() - FFT_SIZE..].to_vec())
        } else {
            None
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
}

/// Adaptive threshold beat detection on bass energy.
pub struct BeatDetector {
    history: Vec<f64>,
    cooldown: usize,
}

impl BeatDetector {
    pub fn new() -> Self {
        Self {
            history: Vec::with_capacity(64),
            cooldown: 0,
        }
    }

    /// Returns `true` if a beat was detected.
    pub fn update(&mut self, bass_energy: f64, samples_processed: usize) -> bool {
        if self.cooldown > 0 {
            self.cooldown = self.cooldown.saturating_sub(samples_processed);
        }

        self.history.push(bass_energy);
        if self.history.len() > 64 {
            self.history.remove(0);
        }

        let avg = if self.history.is_empty() {
            0.0
        } else {
            self.history.iter().sum::<f64>() / self.history.len() as f64
        };

        let is_beat = self.cooldown == 0 && bass_energy > avg * BEAT_THRESHOLD && bass_energy > 0.1;

        if is_beat {
            self.cooldown = BEAT_COOLDOWN_SAMPLES;
        }

        is_beat
    }
}

impl Default for BeatDetector {
    fn default() -> Self {
        Self::new()
    }
}
