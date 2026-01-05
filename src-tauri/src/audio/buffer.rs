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

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // AudioBuffer tests
    // =========================================================================

    #[test]
    fn test_audio_buffer_new() {
        let buffer = AudioBuffer::new(44100);
        assert_eq!(buffer.sample_rate(), 44100);
        assert!(buffer.get_analysis_window().is_none());
    }

    #[test]
    fn test_audio_buffer_push_samples() {
        let mut buffer = AudioBuffer::new(44100);

        // Push some samples
        let samples: Vec<f32> = (0..100).map(|i| i as f32 * 0.01).collect();
        buffer.push_samples(&samples);

        // Not enough samples for analysis window yet
        assert!(buffer.get_analysis_window().is_none());
    }

    #[test]
    fn test_audio_buffer_get_analysis_window() {
        let mut buffer = AudioBuffer::new(44100);

        // Push exactly FFT_SIZE samples
        let samples: Vec<f32> = (0..FFT_SIZE).map(|i| i as f32 * 0.001).collect();
        buffer.push_samples(&samples);

        // Should now have enough for analysis
        let window = buffer.get_analysis_window();
        assert!(window.is_some());

        let window = window.unwrap();
        assert_eq!(window.len(), FFT_SIZE);

        // Check last sample is correct
        assert!((window[FFT_SIZE - 1] - (FFT_SIZE - 1) as f32 * 0.001).abs() < 0.0001);
    }

    #[test]
    fn test_audio_buffer_returns_most_recent_samples() {
        let mut buffer = AudioBuffer::new(44100);

        // Push more than FFT_SIZE samples
        let first_batch: Vec<f32> = (0..FFT_SIZE).map(|_| 0.0).collect();
        buffer.push_samples(&first_batch);

        let second_batch: Vec<f32> = (0..FFT_SIZE).map(|_| 1.0).collect();
        buffer.push_samples(&second_batch);

        let window = buffer.get_analysis_window().unwrap();

        // Should contain the most recent samples (all 1.0)
        assert_eq!(window.len(), FFT_SIZE);
        assert!((window[0] - 1.0).abs() < 0.0001);
        assert!((window[FFT_SIZE - 1] - 1.0).abs() < 0.0001);
    }

    #[test]
    fn test_audio_buffer_drains_old_samples() {
        let mut buffer = AudioBuffer::new(44100);

        // Push way more than the buffer limit (FFT_SIZE * 4)
        for _ in 0..10 {
            let batch: Vec<f32> = vec![0.5; FFT_SIZE];
            buffer.push_samples(&batch);
        }

        // Buffer should have drained to FFT_SIZE * 2
        // We can verify by checking get_analysis_window still works
        let window = buffer.get_analysis_window();
        assert!(window.is_some());
        assert_eq!(window.unwrap().len(), FFT_SIZE);
    }

    #[test]
    fn test_audio_buffer_sample_rate() {
        let buffer1 = AudioBuffer::new(44100);
        assert_eq!(buffer1.sample_rate(), 44100);

        let buffer2 = AudioBuffer::new(48000);
        assert_eq!(buffer2.sample_rate(), 48000);

        let buffer3 = AudioBuffer::new(96000);
        assert_eq!(buffer3.sample_rate(), 96000);
    }

    // =========================================================================
    // BeatDetector tests
    // =========================================================================

    #[test]
    fn test_beat_detector_new() {
        let detector = BeatDetector::new();
        // Initial state should not detect beats on low energy
        assert!(!detector.history.is_empty() == false || detector.history.is_empty());
    }

    #[test]
    fn test_beat_detector_default() {
        let detector = BeatDetector::default();
        assert!(detector.history.is_empty());
        assert_eq!(detector.cooldown, 0);
    }

    #[test]
    fn test_beat_detector_no_beat_on_low_energy() {
        let mut detector = BeatDetector::new();

        // Low energy should not trigger beat
        let is_beat = detector.update(0.05, FFT_SIZE);
        assert!(!is_beat);
    }

    #[test]
    fn test_beat_detector_no_beat_below_threshold() {
        let mut detector = BeatDetector::new();

        // Build up history with consistent energy
        for _ in 0..10 {
            detector.update(0.5, FFT_SIZE);
        }

        // Energy at threshold (1.5x average) should not trigger
        // Average is ~0.5, so 0.75 (1.5x) is right at threshold
        let is_beat = detector.update(0.74, FFT_SIZE);
        assert!(!is_beat);
    }

    #[test]
    fn test_beat_detector_beat_on_spike() {
        let mut detector = BeatDetector::new();

        // Build up history with low energy
        for _ in 0..10 {
            detector.update(0.2, FFT_SIZE);
        }

        // Spike above threshold (> 0.2 * 1.5 = 0.3, and > 0.1)
        let is_beat = detector.update(0.8, FFT_SIZE);
        assert!(is_beat);
    }

    #[test]
    fn test_beat_detector_cooldown_prevents_rapid_beats() {
        let mut detector = BeatDetector::new();

        // Build up history
        for _ in 0..10 {
            detector.update(0.2, FFT_SIZE);
        }

        // First beat should trigger
        let first_beat = detector.update(0.8, FFT_SIZE);
        assert!(first_beat);

        // Immediate second high energy should NOT trigger (cooldown)
        let second_beat = detector.update(0.9, FFT_SIZE);
        assert!(!second_beat);
    }

    #[test]
    fn test_beat_detector_cooldown_decrements() {
        let mut detector = BeatDetector::new();

        // Build up history
        for _ in 0..10 {
            detector.update(0.2, FFT_SIZE);
        }

        // Trigger a beat
        let _ = detector.update(0.8, FFT_SIZE);

        // Process enough samples to clear cooldown
        // BEAT_COOLDOWN_SAMPLES = 8000, FFT_SIZE = 2048
        // Need ~4 updates to clear cooldown (4 * 2048 = 8192 > 8000)
        detector.update(0.2, FFT_SIZE);
        detector.update(0.2, FFT_SIZE);
        detector.update(0.2, FFT_SIZE);
        detector.update(0.2, FFT_SIZE);

        // Now another spike should trigger
        let is_beat = detector.update(0.8, FFT_SIZE);
        assert!(is_beat);
    }

    #[test]
    fn test_beat_detector_history_limited_to_64() {
        let mut detector = BeatDetector::new();

        // Push more than 64 entries
        for i in 0..100 {
            detector.update(i as f64 * 0.01, FFT_SIZE);
        }

        // History should be capped at 64
        assert_eq!(detector.history.len(), 64);
    }

    #[test]
    fn test_beat_detector_adaptive_threshold() {
        let mut detector = BeatDetector::new();

        // Build history with high energy
        for _ in 0..20 {
            detector.update(0.8, FFT_SIZE);
        }

        // After cooldown, a moderate spike relative to low history would trigger,
        // but not relative to high history
        // Wait for cooldown
        for _ in 0..4 {
            detector.update(0.8, FFT_SIZE);
        }

        // 0.9 is not much higher than 0.8 average (would need > 1.2)
        let is_beat = detector.update(0.9, FFT_SIZE);
        assert!(!is_beat);

        // Much higher would trigger
        for _ in 0..4 {
            detector.update(0.8, FFT_SIZE);
        }
        let is_beat = detector.update(1.5, FFT_SIZE);
        assert!(is_beat);
    }

    #[test]
    fn test_beat_detector_minimum_energy_threshold() {
        let mut detector = BeatDetector::new();

        // Build history with very low energy
        for _ in 0..10 {
            detector.update(0.01, FFT_SIZE);
        }

        // Even a spike relative to average won't trigger if below 0.1
        // 0.01 * 1.5 = 0.015, so 0.05 is above threshold but below 0.1
        let is_beat = detector.update(0.05, FFT_SIZE);
        assert!(!is_beat);

        // Above 0.1 should trigger (if also above threshold)
        let is_beat = detector.update(0.15, FFT_SIZE);
        assert!(is_beat);
    }
}
