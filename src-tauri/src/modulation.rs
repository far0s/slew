//! Modulation Engine — Backend LFO sources and modulation matrix
//!
//! This module provides:
//! - LFO (Low Frequency Oscillator) sources with various waveforms
//! - Modulation targets that route LFOs to parameters
//! - Audio-reactive modulation (audio sources can modulate LFO rate/depth)
//! - A tick loop that runs at ~60Hz alongside the parameter tick loop

use std::collections::HashMap;
use std::f64::consts::PI;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener, Manager};

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
            sync_to_bpm: false,
            bpm_division: 1.0,
            current_phase: 0.0,
            current_value: 0.0,
            last_random: 0.0,
            next_random_phase: 0.0,
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

// ============================================================================
// Engine State
// ============================================================================

const MODULATION_TICK_INTERVAL_MS: u64 = 16; // ~60 Hz

struct ModulationEngineState {
    lfos: HashMap<String, LfoSource>,
    targets: Vec<ModulationTarget>,
    audio_modulations: Vec<AudioModulation>,
    app_handle: Option<AppHandle>,
    last_tick: Instant,
    /// Cache of base parameter values (before modulation)
    base_values: HashMap<String, f64>,
    /// Current BPM from audio engine (if available)
    current_bpm: Option<f64>,
    /// Last known audio levels for audio modulation
    last_audio_levels: Option<crate::audio::AudioLevels>,
}

impl ModulationEngineState {
    fn new() -> Self {
        Self {
            lfos: HashMap::new(),
            targets: Vec::new(),
            audio_modulations: Vec::new(),
            app_handle: None,
            last_tick: Instant::now(),
            base_values: HashMap::new(),
            current_bpm: None,
            last_audio_levels: None,
        }
    }
}

static MODULATION_ENGINE: Lazy<Arc<Mutex<ModulationEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(ModulationEngineState::new())));

fn with_modulation_engine<F, R>(f: F) -> R
where
    F: FnOnce(&mut ModulationEngineState) -> R,
{
    let mut guard = MODULATION_ENGINE.lock().unwrap();
    f(&mut guard)
}

// ============================================================================
// Engine Initialization
// ============================================================================

/// Initialize the modulation engine
pub fn init_modulation_engine(app_handle: AppHandle) {
    with_modulation_engine(|state| {
        state.app_handle = Some(app_handle.clone());
    });

    load_state_from_disk(&app_handle);
    start_modulation_loop();
    start_audio_listener(app_handle);

    log::info!("[Modulation] Engine initialized");
}

/// Listen for audio level events to get BPM and levels for audio modulation
fn start_audio_listener(app_handle: AppHandle) {
    let engine = MODULATION_ENGINE.clone();
    let engine_for_levels = engine.clone();

    // Listen for audio_levels events to get levels for audio modulation
    let _ = app_handle.listen("audio_levels", move |event| {
        if let Ok(levels) = serde_json::from_str::<crate::audio::AudioLevels>(event.payload()) {
            let mut state = engine_for_levels.lock().unwrap();
            state.last_audio_levels = Some(levels);
        }
    });

    // Listen for BPM updates (frontend calculates BPM from beat events)
    let _ = app_handle.listen("audio_bpm", move |event| {
        if let Ok(bpm) = event.payload().parse::<f64>() {
            let mut state = engine.lock().unwrap();
            state.current_bpm = Some(bpm);
        }
    });
}

/// Start the modulation tick loop
fn start_modulation_loop() {
    let engine = MODULATION_ENGINE.clone();

    std::thread::spawn(move || {
        let interval = Duration::from_millis(MODULATION_TICK_INTERVAL_MS);

        loop {
            std::thread::sleep(interval);

            let (should_tick, app_handle) = {
                let state = engine.lock().unwrap();
                (!state.lfos.is_empty(), state.app_handle.clone())
            };

            if should_tick {
                tick_modulation(&engine);

                // Emit LFO values for UI visualization
                if let Some(handle) = app_handle {
                    let values = {
                        let state = engine.lock().unwrap();
                        state
                            .lfos
                            .iter()
                            .map(|(id, lfo)| (id.clone(), lfo.get_value()))
                            .collect::<HashMap<_, _>>()
                    };

                    if !values.is_empty() {
                        let lfo_values = LfoValues {
                            values,
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .map(|d| d.as_millis() as u64)
                                .unwrap_or(0),
                        };
                        let _ = handle.emit("lfo_values", &lfo_values);
                    }
                }
            }
        }
    });
}

/// Advance all LFOs and apply modulation to parameters
fn tick_modulation(engine: &Arc<Mutex<ModulationEngineState>>) {
    let now = Instant::now();

    let (dt, bpm, targets, audio_mods, last_audio, app_handle) = {
        let mut state = engine.lock().unwrap();
        let dt = now.duration_since(state.last_tick).as_secs_f64().min(0.25);
        state.last_tick = now;
        (
            dt,
            state.current_bpm,
            state.targets.clone(),
            state.audio_modulations.clone(),
            state.last_audio_levels.clone(),
            state.app_handle.clone(),
        )
    };

    // Apply audio modulations to LFO properties
    if let Some(levels) = &last_audio {
        for audio_mod in &audio_mods {
            if !audio_mod.enabled {
                continue;
            }

            let audio_value = audio_mod.source.get_value(levels);
            let scaled = audio_mod.min_output
                + audio_value * (audio_mod.max_output - audio_mod.min_output) * audio_mod.amount;

            let mut state = engine.lock().unwrap();
            if let Some(lfo) = state.lfos.get_mut(&audio_mod.lfo_id) {
                match audio_mod.property {
                    LfoProperty::Rate => lfo.rate = scaled.clamp(0.01, 20.0),
                    LfoProperty::Depth => lfo.depth = scaled.clamp(0.0, 1.0),
                    LfoProperty::Phase => lfo.phase = scaled.clamp(0.0, 1.0),
                }
            }
        }
    }

    // Tick all LFOs
    {
        let mut state = engine.lock().unwrap();
        for lfo in state.lfos.values_mut() {
            lfo.tick(dt, bpm);
        }
    }

    // Apply modulation targets
    for target in &targets {
        if !target.enabled {
            continue;
        }

        let lfo_value = {
            let state = engine.lock().unwrap();
            state.lfos.get(&target.source_id).map(|lfo| {
                if target.bipolar {
                    lfo.get_value()
                } else {
                    lfo.get_unipolar_value()
                }
            })
        };

        if let Some(lfo_value) = lfo_value {
            // Get or cache the base parameter value
            let base_value = {
                let mut state = engine.lock().unwrap();
                if let Some(base) = state.base_values.get(&target.parameter_id) {
                    *base
                } else {
                    // Fetch from parameter store
                    let current = crate::with_parameter_store(|store| {
                        store.get(&target.parameter_id).map(|p| p.target)
                    })
                    .unwrap_or(0.0);
                    state
                        .base_values
                        .insert(target.parameter_id.clone(), current);
                    current
                }
            };

            // Calculate modulated value
            let modulation = lfo_value * target.depth;
            let modulated = base_value + modulation;

            // Apply to parameter (clamped to 0-1 range for now)
            apply_modulation_to_parameter(&target.parameter_id, modulated, app_handle.as_ref());
        }
    }
}

/// Apply a modulated value to a parameter
fn apply_modulation_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    // Don't use set_target as it would override our modulation
    // Instead, directly set the value (not target) for immediate effect
    crate::with_parameter_store(|store| {
        if let Some(param) = store.parameters.get_mut(parameter_id) {
            // Clamp based on known parameter ranges (simplified)
            let clamped = value.clamp(0.0, 2.0);
            param.value = clamped;
            // Also set target to prevent the tick loop from fighting us
            param.target = clamped;
        }
    });

    // Emit parameter_changed event
    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }
}

// ============================================================================
// LFO Management
// ============================================================================

/// Get all LFO sources
pub fn get_lfos() -> Vec<LfoSource> {
    with_modulation_engine(|state| state.lfos.values().cloned().collect())
}

/// Get an LFO by ID
pub fn get_lfo(id: &str) -> Option<LfoSource> {
    with_modulation_engine(|state| state.lfos.get(id).cloned())
}

/// Add or update an LFO
pub fn add_lfo(mut lfo: LfoSource) -> LfoSource {
    if lfo.id.is_empty() {
        lfo.id = generate_id("lfo");
    }

    let result = lfo.clone();
    let app_handle = with_modulation_engine(|state| {
        state.lfos.insert(lfo.id.clone(), lfo);
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle);
    }

    result
}

/// Update an existing LFO
pub fn update_lfo(lfo: LfoSource) -> Option<LfoSource> {
    let (result, app_handle) = with_modulation_engine(|state| {
        if state.lfos.contains_key(&lfo.id) {
            state.lfos.insert(lfo.id.clone(), lfo.clone());
            (Some(lfo), state.app_handle.clone())
        } else {
            (None, None)
        }
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle);
    }

    result
}

/// Remove an LFO by ID
pub fn remove_lfo(id: &str) -> bool {
    let (removed, app_handle) = with_modulation_engine(|state| {
        let existed = state.lfos.remove(id).is_some();
        // Also remove any targets and audio modulations that reference this LFO
        state.targets.retain(|t| t.source_id != id);
        state.audio_modulations.retain(|m| m.lfo_id != id);
        (existed, state.app_handle.clone())
    });

    if removed {
        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_lfos_changed(&handle);
            emit_targets_changed(&handle);
            emit_audio_modulations_changed(&handle);
        }
    }

    removed
}

/// Clear all LFOs
pub fn clear_lfos() {
    let app_handle = with_modulation_engine(|state| {
        state.lfos.clear();
        state.targets.clear();
        state.audio_modulations.clear();
        state.base_values.clear();
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_lfos_changed(&handle);
        emit_targets_changed(&handle);
        emit_audio_modulations_changed(&handle);
    }
}

// ============================================================================
// Modulation Target Management
// ============================================================================

/// Get all modulation targets
pub fn get_targets() -> Vec<ModulationTarget> {
    with_modulation_engine(|state| state.targets.clone())
}

/// Add or update a modulation target
pub fn add_target(mut target: ModulationTarget) -> ModulationTarget {
    if target.id.is_empty() {
        target.id = generate_id("target");
    }

    // Clear cached base value for this parameter so it gets refreshed
    let result = target.clone();
    let app_handle = with_modulation_engine(|state| {
        // Update existing or add new
        if let Some(existing) = state.targets.iter_mut().find(|t| t.id == target.id) {
            *existing = target;
        } else {
            state.targets.push(target);
        }
        state.base_values.remove(&result.parameter_id);
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_targets_changed(&handle);
    }

    result
}

/// Remove a modulation target by ID
pub fn remove_target(id: &str) -> bool {
    let (removed, app_handle, parameter_id) = with_modulation_engine(|state| {
        if let Some(pos) = state.targets.iter().position(|t| t.id == id) {
            let target = state.targets.remove(pos);
            (true, state.app_handle.clone(), Some(target.parameter_id))
        } else {
            (false, None, None)
        }
    });

    if removed {
        // Clear the base value cache for this parameter
        if let Some(param_id) = parameter_id {
            with_modulation_engine(|state| {
                state.base_values.remove(&param_id);
            });
        }

        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_targets_changed(&handle);
        }
    }

    removed
}

/// Clear all modulation targets
pub fn clear_targets() {
    let app_handle = with_modulation_engine(|state| {
        state.targets.clear();
        state.base_values.clear();
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_targets_changed(&handle);
    }
}

/// Update the base value for a parameter (called when user manually adjusts a modulated parameter)
pub fn update_base_value(parameter_id: &str, value: f64) {
    with_modulation_engine(|state| {
        state.base_values.insert(parameter_id.to_string(), value);
    });
}

// ============================================================================
// Audio Modulation Management
// ============================================================================

/// Get all audio modulations
pub fn get_audio_modulations() -> Vec<AudioModulation> {
    with_modulation_engine(|state| state.audio_modulations.clone())
}

/// Add or update an audio modulation
pub fn add_audio_modulation(mut audio_mod: AudioModulation) -> AudioModulation {
    if audio_mod.id.is_empty() {
        audio_mod.id = generate_id("audiomod");
    }

    let result = audio_mod.clone();
    let app_handle = with_modulation_engine(|state| {
        // Update existing or add new
        if let Some(existing) = state
            .audio_modulations
            .iter_mut()
            .find(|m| m.id == audio_mod.id)
        {
            *existing = audio_mod;
        } else {
            state.audio_modulations.push(audio_mod);
        }
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_audio_modulations_changed(&handle);
    }

    result
}

/// Remove an audio modulation by ID
pub fn remove_audio_modulation(id: &str) -> bool {
    let (removed, app_handle) = with_modulation_engine(|state| {
        if let Some(pos) = state.audio_modulations.iter().position(|m| m.id == id) {
            state.audio_modulations.remove(pos);
            (true, state.app_handle.clone())
        } else {
            (false, None)
        }
    });

    if removed {
        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_audio_modulations_changed(&handle);
        }
    }

    removed
}

/// Clear all audio modulations
pub fn clear_audio_modulations() {
    let app_handle = with_modulation_engine(|state| {
        state.audio_modulations.clear();
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_audio_modulations_changed(&handle);
    }
}

/// Update audio levels from the audio engine (called from audio.rs or via event)
pub fn update_audio_levels(levels: crate::audio::AudioLevels) {
    with_modulation_engine(|state| {
        state.last_audio_levels = Some(levels);
    });
}

/// Update BPM from the audio engine
pub fn update_bpm(bpm: Option<f64>) {
    with_modulation_engine(|state| {
        state.current_bpm = bpm;
    });
}

// ============================================================================
// State Query
// ============================================================================

/// Get the full modulation state
pub fn get_modulation_state() -> ModulationState {
    with_modulation_engine(|state| ModulationState {
        lfos: state.lfos.values().cloned().collect(),
        targets: state.targets.clone(),
        audio_modulations: state.audio_modulations.clone(),
    })
}

/// Check if a parameter has any active modulation targets
pub fn is_parameter_modulated(parameter_id: &str) -> bool {
    with_modulation_engine(|state| {
        state
            .targets
            .iter()
            .any(|t| t.enabled && t.parameter_id == parameter_id)
    })
}

/// Get all modulation targets for a specific parameter
pub fn get_targets_for_parameter(parameter_id: &str) -> Vec<ModulationTarget> {
    with_modulation_engine(|state| {
        state
            .targets
            .iter()
            .filter(|t| t.parameter_id == parameter_id)
            .cloned()
            .collect()
    })
}

// ============================================================================
// Persistence
// ============================================================================

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("modulation_state.json");
        dir
    })
}

fn load_state_from_disk(app: &AppHandle) {
    let path = match state_path(app) {
        Some(p) => p,
        None => return,
    };

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(state) = serde_json::from_slice::<ModulationState>(&bytes) {
            with_modulation_engine(|engine| {
                engine.lfos.clear();
                for lfo in state.lfos {
                    engine.lfos.insert(lfo.id.clone(), lfo);
                }
                engine.targets = state.targets;
                engine.audio_modulations = state.audio_modulations;
            });
            log::info!("[Modulation] Loaded state from disk");
        }
    }
}

fn save_state_to_disk(app: &AppHandle) {
    let state = get_modulation_state();

    if let Some(path) = state_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&state) {
            let _ = fs::write(path, json);
        }
    }
}

// ============================================================================
// Events
// ============================================================================

fn emit_lfos_changed(handle: &AppHandle) {
    let lfos = get_lfos();
    let _ = handle.emit("modulation_lfos_changed", &lfos);
}

fn emit_targets_changed(handle: &AppHandle) {
    let targets = get_targets();
    let _ = handle.emit("modulation_targets_changed", &targets);
}

fn emit_audio_modulations_changed(handle: &AppHandle) {
    let mods = get_audio_modulations();
    let _ = handle.emit("modulation_audio_changed", &mods);
}

// ============================================================================
// Helpers
// ============================================================================

fn generate_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        rand::thread_rng().gen::<u32>() % 10000
    )
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub fn get_modulation_lfos() -> Vec<LfoSource> {
    get_lfos()
}

#[tauri::command]
pub fn get_modulation_lfo(id: String) -> Option<LfoSource> {
    get_lfo(&id)
}

#[tauri::command]
pub fn add_modulation_lfo(lfo: LfoSource) -> LfoSource {
    add_lfo(lfo)
}

#[tauri::command]
pub fn update_modulation_lfo(lfo: LfoSource) -> Option<LfoSource> {
    update_lfo(lfo)
}

#[tauri::command]
pub fn remove_modulation_lfo(id: String) -> bool {
    remove_lfo(&id)
}

#[tauri::command]
pub fn clear_modulation_lfos() {
    clear_lfos()
}

#[tauri::command]
pub fn get_modulation_targets() -> Vec<ModulationTarget> {
    get_targets()
}

#[tauri::command]
pub fn add_modulation_target(target: ModulationTarget) -> ModulationTarget {
    add_target(target)
}

#[tauri::command]
pub fn remove_modulation_target(id: String) -> bool {
    remove_target(&id)
}

#[tauri::command]
pub fn clear_modulation_targets() {
    clear_targets()
}

#[tauri::command]
pub fn update_modulation_base_value(parameter_id: String, value: f64) {
    update_base_value(&parameter_id, value)
}

#[tauri::command]
pub fn get_modulation_audio_modulations() -> Vec<AudioModulation> {
    get_audio_modulations()
}

#[tauri::command]
#[allow(non_snake_case)]
pub fn add_modulation_audio_modulation(audioMod: AudioModulation) -> AudioModulation {
    add_audio_modulation(audioMod)
}

#[tauri::command]
pub fn remove_modulation_audio_modulation(id: String) -> bool {
    remove_audio_modulation(&id)
}

#[tauri::command]
pub fn clear_modulation_audio_modulations() {
    clear_audio_modulations()
}

#[tauri::command]
pub fn get_full_modulation_state() -> ModulationState {
    get_modulation_state()
}

#[tauri::command]
pub fn is_parameter_modulated_cmd(parameter_id: String) -> bool {
    is_parameter_modulated(&parameter_id)
}
