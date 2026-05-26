//! Modulation engine state, initialization, and tick loop

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use tauri::{AppHandle, Emitter, Listener};

use super::types::{AudioModulation, LfoProperty, LfoSource, LfoValues, ModulationState, ModulationTarget};

// ============================================================================
// Engine State
// ============================================================================

const MODULATION_TICK_INTERVAL_MS: u64 = 16; // ~60 Hz

pub(super) struct ModulationEngineState {
    pub lfos: HashMap<String, LfoSource>,
    pub targets: Vec<ModulationTarget>,
    pub audio_modulations: Vec<AudioModulation>,
    pub app_handle: Option<AppHandle>,
    pub last_tick: Instant,
    /// Cache of base parameter values (before modulation)
    pub base_values: HashMap<String, f64>,
    /// Current BPM from audio engine (if available)
    pub current_bpm: Option<f64>,
    /// Last known audio levels for audio modulation
    pub last_audio_levels: Option<crate::audio::AudioLevels>,
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

pub(super) static MODULATION_ENGINE: Lazy<Arc<Mutex<ModulationEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(ModulationEngineState::new())));

pub(super) fn with_modulation_engine<F, R>(f: F) -> R
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

    super::persistence::load_state_from_disk(&app_handle);
    start_modulation_loop();
    start_audio_listener(app_handle);

    log::debug!("[Modulation] Engine initialized");
}

/// Listen for audio level events to get BPM and levels for audio modulation
pub(super) fn start_audio_listener(app_handle: AppHandle) {
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
            {
                let mut state = engine.lock().unwrap();
                state.current_bpm = Some(bpm);
            }
            // Forward to OSC output if enabled
            crate::osc::send_osc_bpm(bpm);
        }
    });
}

/// Start the modulation tick loop
pub(super) fn start_modulation_loop() {
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

/// Advance all LFOs and apply modulation to parameters.
///
/// Optimized to minimize lock contention and avoid cloning in the hot path:
/// - Single lock acquisition for reading state and ticking LFOs
/// - Collects modulation results without repeated lock/unlock cycles
/// - Only clones what's needed for parameter updates
fn tick_modulation(engine: &Arc<Mutex<ModulationEngineState>>) {
    let now = Instant::now();

    // Collect all data and perform LFO updates in a single lock
    // This avoids the previous pattern of lock/unlock/lock/unlock for each operation
    let (modulations_to_apply, app_handle) = {
        let mut state = engine.lock().unwrap();
        let dt = now.duration_since(state.last_tick).as_secs_f64().min(0.25);
        state.last_tick = now;
        let bpm = state.current_bpm;

        // Collect audio modulation updates first (read phase)
        // We collect (lfo_id, property, scaled_value) tuples to apply after
        let audio_mod_updates: Vec<(String, LfoProperty, f64)> =
            if let Some(ref levels) = state.last_audio_levels {
                state
                    .audio_modulations
                    .iter()
                    .filter(|am| am.enabled)
                    .map(|audio_mod| {
                        let audio_value = audio_mod.source.get_value(levels);
                        let scaled = audio_mod.min_output
                            + audio_value
                                * (audio_mod.max_output - audio_mod.min_output)
                                * audio_mod.amount;
                        (audio_mod.lfo_id.clone(), audio_mod.property, scaled)
                    })
                    .collect()
            } else {
                Vec::new()
            };

        // Apply audio modulation updates to LFOs (write phase)
        for (lfo_id, property, scaled) in audio_mod_updates {
            if let Some(lfo) = state.lfos.get_mut(&lfo_id) {
                match property {
                    LfoProperty::Rate => lfo.rate = scaled.clamp(0.01, 20.0),
                    LfoProperty::Depth => lfo.depth = scaled.clamp(0.0, 1.0),
                    LfoProperty::Phase => lfo.phase = scaled.clamp(0.0, 1.0),
                }
            }
        }

        // Tick all LFOs (in same lock)
        for lfo in state.lfos.values_mut() {
            lfo.tick(dt, bpm);
        }

        // Collect target info for modulation calculation
        // We need: (parameter_id, source_id, bipolar, depth)
        let target_info: Vec<(String, String, bool, f64)> = state
            .targets
            .iter()
            .filter(|t| t.enabled)
            .map(|t| {
                (
                    t.parameter_id.clone(),
                    t.source_id.clone(),
                    t.bipolar,
                    t.depth,
                )
            })
            .collect();

        // Collect modulation results
        let mut modulations: Vec<(String, f64)> = Vec::with_capacity(target_info.len());

        for (parameter_id, source_id, bipolar, depth) in target_info {
            let lfo_value = state.lfos.get(&source_id).map(|lfo| {
                if bipolar {
                    lfo.get_value()
                } else {
                    lfo.get_unipolar_value()
                }
            });

            if let Some(lfo_value) = lfo_value {
                // Get or cache the base parameter value
                let base_value = if let Some(base) = state.base_values.get(&parameter_id) {
                    *base
                } else {
                    // Fetch from parameter store
                    let current = crate::with_parameter_store(|store| {
                        store.get(&parameter_id).map(|p| p.target)
                    })
                    .unwrap_or(0.0);
                    state.base_values.insert(parameter_id.clone(), current);
                    current
                };

                // Calculate modulated value.
                // For color channel params (0-255), scale depth by the full range so
                // depth=1.0 covers the whole range and depth=0.5 covers half.
                // All other params keep depth as an absolute offset (existing behaviour).
                let param_range = color_sub_param_range(&parameter_id);
                let scale = param_range.unwrap_or(1.0);
                let modulation = lfo_value * depth * scale;
                let modulated = base_value + modulation;

                modulations.push((parameter_id, modulated));
            }
        }

        (modulations, state.app_handle.clone())
    };

    // Apply modulations outside of the modulation engine lock
    // This prevents lock contention with the parameter store
    for (parameter_id, modulated_value) in modulations_to_apply {
        apply_modulation_to_parameter(&parameter_id, modulated_value, app_handle.as_ref());
    }
}

/// Returns the value range for colour channel sub-params (slot_N_color_*_r/g/b).
/// Returns None for all other parameters so existing code is unaffected.
pub(super) fn color_sub_param_range(parameter_id: &str) -> Option<f64> {
    // Pattern: ends with _r, _g, or _b AND contains _color_
    if parameter_id.contains("_color_")
        && (parameter_id.ends_with("_r")
            || parameter_id.ends_with("_g")
            || parameter_id.ends_with("_b"))
    {
        Some(255.0)
    } else {
        None
    }
}

/// Apply a modulated value to a parameter
pub(super) fn apply_modulation_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    // Don't use set_target as it would override our modulation
    // Instead, directly set the value (not target) for immediate effect
    crate::with_parameter_store(|store| {
        if let Some(param) = store.parameters.get_mut(parameter_id) {
            let (param_min, param_max) = match color_sub_param_range(parameter_id) {
                Some(max) => (0.0, max),   // colour channel: 0–255
                None => (0.0, 2.0),        // default range (legacy)
            };
            let clamped = value.clamp(param_min, param_max);
            // Round to nearest integer for colour channels (they are 0–255 byte values)
            let final_value = if color_sub_param_range(parameter_id).is_some() {
                clamped.round()
            } else {
                clamped
            };
            param.value = final_value;
            // Also set target to prevent the tick loop from fighting us
            param.target = final_value;
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
// State Query helpers (used by other submodules and persistence)
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
// Audio state setters (public API used from audio.rs)
// ============================================================================

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
