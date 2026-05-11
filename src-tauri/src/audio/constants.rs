//! Audio analysis constants.

/// Device poll interval (ms)
pub const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

/// FFT size (must be power of 2)
pub const FFT_SIZE: usize = 2048;

/// Analysis rate (Hz)
pub const ANALYSIS_RATE_HZ: f64 = 60.0;

/// Beat detection threshold (relative to recent average).
/// Default: 1.5x average energy required to fire a beat.
pub const BEAT_THRESHOLD: f64 = 1.5;

/// Minimum cooldown between beats in milliseconds.
/// 250 ms ≈ 240 BPM max, which is a safe ceiling for the double-trigger
/// suppression window without blocking any realistic tempo.
/// The 60 BPM floor is enforced by the frontend's MIN_BPM clamp, not the
/// detector cooldown.
pub const BEAT_COOLDOWN_MS: u64 = 250;

/// Number of energy frames kept in the adaptive average history.
/// 256 frames at 60 Hz ≈ 4.3 s — long enough to track tempos down to ~60 BPM.
pub const BEAT_HISTORY_SIZE: usize = 256;
