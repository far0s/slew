//! Type definitions for the audio input engine.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    pub name: String,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevels {
    /// RMS loudness, normalized 0-1
    pub rms: f64,
    /// Peak amplitude, normalized 0-1
    pub peak: f64,
    pub bands: AudioBands,
    pub beat: bool,
    pub timestamp: u64,
    /// Downsampled FFT magnitude spectrum (32 bins, 0-1 normalized, log-scaled frequency).
    /// Covers 20 Hz – Nyquist in log-spaced bands.
    #[serde(default)]
    pub spectrum: Vec<f32>,
    /// Decimated waveform for time-domain display (64 samples, -1..1).
    #[serde(default)]
    pub waveform: Vec<f32>,
}

/// Frequency band energy levels (each 0-1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioBands {
    /// 20-250 Hz
    pub bass: f64,
    /// 250-500 Hz
    pub low_mid: f64,
    /// 500-2000 Hz
    pub high_mid: f64,
    /// 2000-20000 Hz
    pub treble: f64,
}

impl Default for AudioBands {
    fn default() -> Self {
        Self {
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStatus {
    pub is_running: bool,
    pub device_name: Option<String>,
    pub sample_rate: Option<u32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Rms,
    Peak,
    Bass,
    LowMid,
    HighMid,
    Treble,
    Beat,
}

impl AudioSource {
    pub fn all() -> &'static [AudioSource] {
        &[
            AudioSource::Rms,
            AudioSource::Peak,
            AudioSource::Bass,
            AudioSource::LowMid,
            AudioSource::HighMid,
            AudioSource::Treble,
            AudioSource::Beat,
        ]
    }

    pub fn get_value(&self, levels: &AudioLevels) -> f64 {
        match self {
            AudioSource::Rms => levels.rms,
            AudioSource::Peak => levels.peak,
            AudioSource::Bass => levels.bands.bass,
            AudioSource::LowMid => levels.bands.low_mid,
            AudioSource::HighMid => levels.bands.high_mid,
            AudioSource::Treble => levels.bands.treble,
            AudioSource::Beat => {
                if levels.beat {
                    1.0
                } else {
                    0.0
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioMappingMode {
    /// Source value maps directly to parameter
    Continuous,
    /// Set to max_output on beat
    Trigger,
    /// Add scaled value to current parameter value
    Add,
}

impl Default for AudioMappingMode {
    fn default() -> Self {
        AudioMappingMode::Continuous
    }
}

/// Routes an audio source to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMapping {
    pub id: String,
    pub source: AudioSource,
    pub parameter_id: String,
    pub min_input: f64,
    pub max_input: f64,
    pub min_output: f64,
    pub max_output: f64,
    pub mode: AudioMappingMode,
    /// 0-1, 0=instant, higher=smoother
    pub smoothing: f64,
    pub enabled: bool,
}

impl Default for AudioMapping {
    fn default() -> Self {
        Self {
            id: String::new(),
            source: AudioSource::Rms,
            parameter_id: String::new(),
            min_input: 0.0,
            max_input: 1.0,
            min_output: 0.0,
            max_output: 1.0,
            mode: AudioMappingMode::Continuous,
            smoothing: 0.0,
            enabled: true,
        }
    }
}
