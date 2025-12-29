//! Audio analysis constants.

/// Device poll interval (ms)
pub const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

/// FFT size (must be power of 2)
pub const FFT_SIZE: usize = 2048;

/// Analysis rate (Hz)
pub const ANALYSIS_RATE_HZ: f64 = 60.0;

/// Beat detection threshold (relative to recent average)
pub const BEAT_THRESHOLD: f64 = 1.5;

/// Beat cooldown in samples (~180ms at 44.1kHz)
pub const BEAT_COOLDOWN_SAMPLES: usize = 8000;
