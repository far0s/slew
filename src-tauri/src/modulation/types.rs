//! Type definitions for the modulation engine

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

// ============================================================================
// Types
// ============================================================================

/// LFO waveform shapes
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LfoShape {
    Sine,
    Triangle,
    Saw,
    Square,
    Random,
    SmoothRandom,
}

impl Default for LfoShape {
    fn default() -> Self {
        LfoShape::Sine
    }
}

/// An LFO source that generates a periodic signal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LfoSource {
    /// Unique identifier
    pub id: String,
    /// Human-readable name
    pub name: String,
    /// Waveform shape
    pub shape: LfoShape,
    /// Frequency in Hz (0.01 to 20.0)
    pub rate: f64,
    /// Phase offset (0.0 to 1.0)
    pub phase: f64,
    /// Output amplitude (0.0 to 1.0)
    pub depth: f64,
    /// Center offset for bipolar output (-1.0 to 1.0)
    pub offset: f64,
    /// Whether the LFO is enabled
    pub enabled: bool,
    /// Whether to sync rate to BPM (if audio provides it)
    pub sync_to_bpm: bool,
    /// BPM division when synced (1 = 1 beat, 2 = 2 beats, 0.5 = half beat, etc.)
    pub bpm_division: f64,
    /// Display order index for reordering in the UI (lower = higher in list)
    pub order: u32,
    /// Whether this LFO is pinned (stays at top and survives Clear All)
    pub pinned: bool,
    /// Current phase accumulator (internal state, 0.0 to 1.0)
    #[serde(skip)]
    pub current_phase: f64,
    /// Current output value (internal state, -1.0 to 1.0 before depth/offset)
    #[serde(skip)]
    pub current_value: f64,
    /// Last random value for Random shape
    #[serde(skip)]
    pub last_random: f64,
    /// Phase at which to generate next random value
    #[serde(skip)]
    pub next_random_phase: f64,
    /// Target value for SmoothRandom interpolation
    #[serde(skip)]
    pub smooth_target: f64,
}

impl Default for LfoSource {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::from("LFO"),
            shape: LfoShape::Sine,
            rate: 1.0,
            phase: 0.0,
            depth: 1.0,
            offset: 0.0,
            enabled: true,
            sync_to_bpm: true,
            bpm_division: 4.0,
            order: 0,
            pinned: false,
            current_phase: 0.0,
            current_value: 0.0,
            last_random: 0.0,
            next_random_phase: 0.0,
            smooth_target: 0.0,
        }
    }
}

impl LfoSource {
    /// Create a new LFO with a unique ID
    pub fn new(id: String, name: String) -> Self {
        Self {
            id,
            name,
            ..Default::default()
        }
    }

    /// Advance the LFO by dt seconds and compute new output value
    pub fn tick(&mut self, dt: f64, bpm: Option<f64>) {
        use std::f64::consts::PI;
        use rand::Rng;

        if !self.enabled {
            return;
        }

        // Calculate effective rate (possibly synced to BPM)
        let effective_rate = if self.sync_to_bpm {
            if let Some(bpm) = bpm {
                // Convert BPM to Hz, then divide by bpm_division
                // e.g., 120 BPM = 2 Hz for quarter notes, / 4 = 0.5 Hz for whole notes
                (bpm / 60.0) / self.bpm_division.max(0.01)
            } else {
                self.rate
            }
        } else {
            self.rate
        };

        // Advance phase
        self.current_phase += effective_rate * dt;
        self.current_phase = self.current_phase.fract();
        if self.current_phase < 0.0 {
            self.current_phase += 1.0;
        }

        // Apply phase offset
        let phase_with_offset = (self.current_phase + self.phase).fract();

        // Calculate raw waveform value (-1.0 to 1.0)
        let raw_value = match self.shape {
            LfoShape::Sine => (phase_with_offset * 2.0 * PI).sin(),
            LfoShape::Triangle => {
                if phase_with_offset < 0.25 {
                    phase_with_offset * 4.0
                } else if phase_with_offset < 0.75 {
                    1.0 - (phase_with_offset - 0.25) * 4.0
                } else {
                    -1.0 + (phase_with_offset - 0.75) * 4.0
                }
            }
            LfoShape::Saw => 2.0 * phase_with_offset - 1.0,
            LfoShape::Square => {
                if phase_with_offset < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            LfoShape::Random => {
                // Generate new random value at each cycle
                if self.current_phase < self.next_random_phase
                    || self.current_phase > self.next_random_phase + 0.5
                {
                    let mut rng = rand::thread_rng();
                    self.last_random = rng.gen_range(-1.0..1.0);
                    self.next_random_phase = self.current_phase;
                }
                self.last_random
            }
            LfoShape::SmoothRandom => {
                // Initialize on first use
                if self.smooth_target == 0.0 && self.last_random == 0.0 && self.next_random_phase == 0.0 {
                    let mut rng = rand::thread_rng();
                    self.last_random = rng.gen_range(-1.0..1.0);
                    self.smooth_target = rng.gen_range(-1.0..1.0);
                }
                // Detect phase wrap and advance to new target
                if self.current_phase < self.next_random_phase {
                    self.last_random = self.smooth_target;
                    let mut rng = rand::thread_rng();
                    self.smooth_target = rng.gen_range(-1.0..1.0);
                }
                self.next_random_phase = self.current_phase;
                // Cosine ease interpolation over the cycle
                let t = (1.0 - (phase_with_offset * 2.0 * PI).cos()) / 2.0;
                self.last_random + (self.smooth_target - self.last_random) * t
            }
        };

        // Apply depth and offset
        // Output range: offset + raw_value * depth
        // With depth=1 and offset=0: output is -1 to 1
        // With depth=0.5 and offset=0.5: output is 0 to 1
        self.current_value = self.offset + raw_value * self.depth;
    }

    /// Get the current output value (clamped to -1.0 to 1.0)
    pub fn get_value(&self) -> f64 {
        self.current_value.clamp(-1.0, 1.0)
    }

    /// Get the current output value mapped to 0.0 to 1.0
    pub fn get_unipolar_value(&self) -> f64 {
        (self.current_value + 1.0) / 2.0
    }
}

/// A modulation target that routes an LFO to a parameter
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModulationTarget {
    /// Unique identifier
    pub id: String,
    /// Source LFO ID
    pub source_id: String,
    /// Target parameter ID
    pub parameter_id: String,
    /// Modulation depth (how much the LFO affects the parameter)
    pub depth: f64,
    /// Whether modulation is bipolar (±depth) or unipolar (0 to depth)
    pub bipolar: bool,
    /// Whether this target is enabled
    pub enabled: bool,
}

impl Default for ModulationTarget {
    fn default() -> Self {
        Self {
            id: String::new(),
            source_id: String::new(),
            parameter_id: String::new(),
            depth: 0.5,
            bipolar: true,
            enabled: true,
        }
    }
}

/// What property of an LFO can be modulated by audio
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LfoProperty {
    Rate,
    Depth,
    Phase,
}

/// An audio modulation that routes an audio source to an LFO property
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioModulation {
    /// Unique identifier
    pub id: String,
    /// Audio source to read from
    pub source: crate::audio::AudioSource,
    /// Target LFO ID
    pub lfo_id: String,
    /// Property to modulate
    pub property: LfoProperty,
    /// Modulation amount (multiplier for audio value)
    pub amount: f64,
    /// Minimum output value
    pub min_output: f64,
    /// Maximum output value
    pub max_output: f64,
    /// Whether this modulation is enabled
    pub enabled: bool,
}

impl Default for AudioModulation {
    fn default() -> Self {
        Self {
            id: String::new(),
            source: crate::audio::AudioSource::Rms,
            lfo_id: String::new(),
            property: LfoProperty::Rate,
            amount: 1.0,
            min_output: 0.0,
            max_output: 1.0,
            enabled: true,
        }
    }
}

/// Snapshot of modulation state for UI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModulationState {
    pub lfos: Vec<LfoSource>,
    pub targets: Vec<ModulationTarget>,
    pub audio_modulations: Vec<AudioModulation>,
}

/// LFO values emitted to frontend for visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LfoValues {
    /// Map of LFO ID to current value (-1.0 to 1.0)
    pub values: HashMap<String, f64>,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}
