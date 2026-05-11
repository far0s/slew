//! Audio buffering and beat detection.

use std::sync::atomic::{AtomicU32, Ordering};
use std::time::{Duration, Instant};

use super::constants::{BEAT_COOLDOWN_MS, BEAT_HISTORY_SIZE, FFT_SIZE};

// ---------------------------------------------------------------------------
// Global beat sensitivity (threshold multiplier stored as fixed-point u32)
// Range 0.5 – 3.0, encoded as (value * 1000) as u32.
// Default: BEAT_THRESHOLD * 1000 = 1500.
// ---------------------------------------------------------------------------

static BEAT_SENSITIVITY_FP: AtomicU32 = AtomicU32::new(1500);

/// Get the current beat threshold (relative multiplier over rolling average).
pub fn get_beat_threshold() -> f64 {
    BEAT_SENSITIVITY_FP.load(Ordering::Relaxed) as f64 / 1000.0
}

/// Set the beat threshold from a normalised 0–1 UI slider.
///
/// The slider maps linearly:
///   0.0 → 0.5  (very sensitive — fires on small spikes)
///   0.5 → 1.5  (default)
///   1.0 → 3.0  (insensitive — only fires on large transients)
pub fn set_beat_sensitivity(normalised: f64) {
    let clamped = normalised.clamp(0.0, 1.0);
    // lerp: 0.5 at 0.0, 3.0 at 1.0
    let threshold = 0.5 + clamped * 2.5;
    let fp = (threshold * 1000.0).round() as u32;
    BEAT_SENSITIVITY_FP.store(fp, Ordering::Relaxed);
}

// ---------------------------------------------------------------------------

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
///
/// Improvements over the original implementation:
/// - **Time-based cooldown** (`BEAT_COOLDOWN_MS`) instead of sample-count based,
///   so the minimum BPM floor is consistent regardless of buffer size / sample rate.
/// - **Longer rolling average window** (`BEAT_HISTORY_SIZE` = 256 frames ≈ 4 s at
///   60 Hz) so slow tempos are tracked reliably.
/// - **Runtime-adjustable threshold** via `set_beat_sensitivity`, exposed to the UI
///   so the user can tune detection for their room and music genre.
pub struct BeatDetector {
    history: Vec<f64>,
    last_beat: Option<Instant>,
}

impl BeatDetector {
    pub fn new() -> Self {
        Self {
            history: Vec::with_capacity(BEAT_HISTORY_SIZE),
            last_beat: None,
        }
    }

    /// Returns `true` if a beat was detected.
    ///
    /// `bass_energy` — normalised energy in the bass frequency band (0.0–1.0+).
    pub fn update(&mut self, bass_energy: f64) -> bool {
        // Update rolling history
        self.history.push(bass_energy);
        if self.history.len() > BEAT_HISTORY_SIZE {
            self.history.remove(0);
        }

        // Rolling average
        let avg = if self.history.is_empty() {
            0.0
        } else {
            self.history.iter().sum::<f64>() / self.history.len() as f64
        };

        // Time-based cooldown: enforce a minimum inter-beat gap.
        let in_cooldown = match self.last_beat {
            Some(t) => t.elapsed() < Duration::from_millis(BEAT_COOLDOWN_MS),
            None => false,
        };

        let threshold = get_beat_threshold();

        // A beat fires when:
        //   • not in cooldown
        //   • bass energy exceeds the adaptive average × threshold
        //   • bass energy is above an absolute floor (avoids triggering on silence)
        let is_beat = !in_cooldown && bass_energy > avg * threshold && bass_energy > 0.1;

        if is_beat {
            self.last_beat = Some(Instant::now());
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

    // Helper: run the detector for `n` frames at `energy`, returns beat flags.
    fn run_frames(detector: &mut BeatDetector, energy: f64, n: usize) -> Vec<bool> {
        (0..n).map(|_| detector.update(energy)).collect()
    }

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
        let samples: Vec<f32> = (0..100).map(|i| i as f32 * 0.01).collect();
        buffer.push_samples(&samples);
        assert!(buffer.get_analysis_window().is_none());
    }

    #[test]
    fn test_audio_buffer_get_analysis_window() {
        let mut buffer = AudioBuffer::new(44100);
        let samples: Vec<f32> = (0..FFT_SIZE).map(|i| i as f32 * 0.001).collect();
        buffer.push_samples(&samples);
        let window = buffer.get_analysis_window();
        assert!(window.is_some());
        let window = window.unwrap();
        assert_eq!(window.len(), FFT_SIZE);
        assert!((window[FFT_SIZE - 1] - (FFT_SIZE - 1) as f32 * 0.001).abs() < 0.0001);
    }

    #[test]
    fn test_audio_buffer_returns_most_recent_samples() {
        let mut buffer = AudioBuffer::new(44100);
        let first_batch: Vec<f32> = (0..FFT_SIZE).map(|_| 0.0).collect();
        buffer.push_samples(&first_batch);
        let second_batch: Vec<f32> = (0..FFT_SIZE).map(|_| 1.0).collect();
        buffer.push_samples(&second_batch);
        let window = buffer.get_analysis_window().unwrap();
        assert_eq!(window.len(), FFT_SIZE);
        assert!((window[0] - 1.0).abs() < 0.0001);
        assert!((window[FFT_SIZE - 1] - 1.0).abs() < 0.0001);
    }

    #[test]
    fn test_audio_buffer_drains_old_samples() {
        let mut buffer = AudioBuffer::new(44100);
        for _ in 0..10 {
            let batch: Vec<f32> = vec![0.5; FFT_SIZE];
            buffer.push_samples(&batch);
        }
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
        assert!(detector.history.is_empty());
        assert!(detector.last_beat.is_none());
    }

    #[test]
    fn test_beat_detector_default() {
        let detector = BeatDetector::default();
        assert!(detector.history.is_empty());
        assert!(detector.last_beat.is_none());
    }

    #[test]
    fn test_beat_detector_no_beat_on_low_energy() {
        let mut detector = BeatDetector::new();
        assert!(!detector.update(0.05));
    }

    #[test]
    fn test_beat_detector_no_beat_below_absolute_floor() {
        let mut detector = BeatDetector::new();
        // Even a spike relative to tiny average won't trigger below 0.1
        run_frames(&mut detector, 0.01, 10);
        assert!(!detector.update(0.05));
    }

    #[test]
    fn test_beat_detector_beat_on_spike() {
        let mut detector = BeatDetector::new();
        run_frames(&mut detector, 0.2, 20);
        // Spike: 0.8 >> 0.2 * 1.5 = 0.3 and > 0.1
        assert!(detector.update(0.8));
    }

    #[test]
    fn test_beat_detector_cooldown_prevents_rapid_beats() {
        let mut detector = BeatDetector::new();
        run_frames(&mut detector, 0.2, 20);
        // First beat fires
        assert!(detector.update(0.8));
        // Immediate second high energy is blocked by cooldown
        assert!(!detector.update(0.9));
    }

    #[test]
    fn test_beat_detector_cooldown_is_time_based() {
        // After BEAT_COOLDOWN_MS the beat should be allowed again.
        // We directly manipulate last_beat to simulate elapsed time.
        let mut detector = BeatDetector::new();
        run_frames(&mut detector, 0.2, 20);
        assert!(detector.update(0.8)); // first beat

        // Simulate that enough time has passed
        detector.last_beat = Some(
            Instant::now() - Duration::from_millis(BEAT_COOLDOWN_MS + 10),
        );

        // Now another spike should fire
        assert!(detector.update(0.8));
    }

    #[test]
    fn test_beat_detector_history_capped_at_beat_history_size() {
        let mut detector = BeatDetector::new();
        for i in 0..BEAT_HISTORY_SIZE + 50 {
            detector.update(i as f64 * 0.001);
        }
        assert_eq!(detector.history.len(), BEAT_HISTORY_SIZE);
    }

    #[test]
    fn test_beat_detector_adaptive_threshold_high_baseline() {
        let mut detector = BeatDetector::new();
        // Build history at high energy
        run_frames(&mut detector, 0.8, 40);
        // Simulate cooldown elapsed
        detector.last_beat = Some(Instant::now() - Duration::from_millis(BEAT_COOLDOWN_MS + 10));
        // 0.9 is not 1.5× above 0.8 — should NOT fire
        assert!(!detector.update(0.9));
    }

    #[test]
    fn test_beat_detector_adaptive_threshold_low_baseline() {
        let mut detector = BeatDetector::new();
        run_frames(&mut detector, 0.1, 40);
        // 0.5 >> 0.1 * 1.5 = 0.15 — should fire
        assert!(detector.update(0.5));
    }

    #[test]
    fn test_set_beat_sensitivity_range() {
        // Store original so we restore after test
        let orig = BEAT_SENSITIVITY_FP.load(Ordering::Relaxed);

        set_beat_sensitivity(0.0);
        assert!((get_beat_threshold() - 0.5).abs() < 0.01);

        set_beat_sensitivity(0.5);
        assert!((get_beat_threshold() - 1.75).abs() < 0.01);

        set_beat_sensitivity(1.0);
        assert!((get_beat_threshold() - 3.0).abs() < 0.01);

        // Restore
        BEAT_SENSITIVITY_FP.store(orig, Ordering::Relaxed);
    }

    #[test]
    fn test_set_beat_sensitivity_clamps() {
        let orig = BEAT_SENSITIVITY_FP.load(Ordering::Relaxed);

        set_beat_sensitivity(-1.0);
        assert!((get_beat_threshold() - 0.5).abs() < 0.01);

        set_beat_sensitivity(5.0);
        assert!((get_beat_threshold() - 3.0).abs() < 0.01);

        BEAT_SENSITIVITY_FP.store(orig, Ordering::Relaxed);
    }
}
