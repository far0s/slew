use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// =============================================================================
// Parameter Server
// =============================================================================

pub type ParameterId = String;

/// Numeric parameter with smooth transitions.
/// - `value`: current interpolated value
/// - `target`: desired value (set by UI/inputs)
/// - `transition_speed`: seconds to reach target
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub id: ParameterId,
    pub value: f64,
    pub target: f64,
    pub transition_speed: f64,
    pub curve: ParameterCurve,
}

impl Parameter {
    pub fn with_transition(self, transition_speed: f64, curve: ParameterCurve) -> Self {
        Self {
            transition_speed,
            curve,
            ..self
        }
    }
}

impl Default for Parameter {
    fn default() -> Self {
        Self {
            id: String::new(),
            value: 0.0,
            target: 0.0,
            transition_speed: 0.4,
            curve: ParameterCurve::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParameterCurve {
    Linear,
    Ease,
    Exp,
}

impl Default for ParameterCurve {
    fn default() -> Self {
        ParameterCurve::Linear
    }
}

#[derive(Default)]
pub struct ParameterStore {
    pub parameters: HashMap<ParameterId, Parameter>,
    pub last_tick: Option<Instant>,
}

impl ParameterStore {
    pub fn get_all(&self) -> Vec<Parameter> {
        self.parameters.values().cloned().collect()
    }

    pub fn get(&self, id: &str) -> Option<Parameter> {
        self.parameters.get(id).cloned()
    }

    /// Set parameter target. Creates the parameter if it doesn't exist.
    pub fn set_target(&mut self, id: ParameterId, target: f64) -> Parameter {
        let entry = self
            .parameters
            .entry(id.clone())
            .or_insert_with(|| default_parameter_for_id(id, target));
        entry.target = target;
        entry.clone()
    }

    /// Set parameter target with a specific transition speed (in seconds).
    /// Creates the parameter if it doesn't exist.
    #[allow(dead_code)]
    pub fn set_target_with_transition(
        &mut self,
        id: ParameterId,
        target: f64,
        transition_speed: f64,
    ) -> Parameter {
        let entry = self
            .parameters
            .entry(id.clone())
            .or_insert_with(|| default_parameter_for_id(id, target));
        entry.target = target;
        entry.transition_speed = transition_speed;
        entry.clone()
    }

    pub fn clear(&mut self) {
        self.parameters.clear();
        self.last_tick = None;
    }

    /// Advance parameters toward targets. Returns parameters that changed.
    ///
    /// Pre-allocates capacity based on parameter count to avoid reallocations
    /// in the hot path (this runs ~60 times per second).
    pub fn tick(&mut self, dt: f64) -> Vec<Parameter> {
        if self.parameters.is_empty() {
            return Vec::new();
        }

        // Pre-allocate with estimated capacity (typically a fraction of parameters change per tick)
        // Using 1/4 of total as a reasonable estimate to avoid most reallocations
        let mut changed: Vec<Parameter> = Vec::with_capacity(self.parameters.len() / 4 + 1);

        for p in self.parameters.values_mut() {
            // Already at target
            if (p.value - p.target).abs() < 1e-5 {
                p.value = p.target;
                continue;
            }

            // Instant snap if no transition
            if p.transition_speed <= 0.0 {
                p.value = p.target;
                changed.push(p.clone());
                continue;
            }

            // Interpolate toward target
            let t = (dt / p.transition_speed).clamp(0.0, 1.0);
            let new_value = p.value + (p.target - p.value) * t;

            // Snap when close enough
            if (new_value - p.target).abs() < 1e-5 {
                p.value = p.target;
            } else {
                p.value = new_value;
            }

            changed.push(p.clone());
        }

        changed
    }
}

/// Per-parameter transition defaults.
pub fn default_parameter_for_id(id: ParameterId, initial_value: f64) -> Parameter {
    let (transition_speed, curve) = match id.as_str() {
        "crossfade" => (0.8, ParameterCurve::Linear),
        // Brightness parameters get slightly faster transitions
        s if s.ends_with("_brightness") => (0.3, ParameterCurve::Linear),
        // Audio reactivity - default value, actual transition read from global_mute_fade_time
        s if s.ends_with("_audio_reactivity") => (0.25, ParameterCurve::Linear),
        // Alpha parameters - default value, solo uses global_solo_fade_time
        s if s.ends_with("_alpha") => (0.3, ParameterCurve::Linear),
        // Global fade time settings change instantly
        "global_mute_fade_time" | "global_solo_fade_time" => (0.0, ParameterCurve::Linear),
        _ => (0.4, ParameterCurve::Linear),
    };

    Parameter {
        id,
        value: initial_value,
        target: initial_value,
        transition_speed,
        curve,
    }
}

static PARAMETER_STORE: Lazy<Arc<Mutex<ParameterStore>>> =
    Lazy::new(|| Arc::new(Mutex::new(ParameterStore::default())));

pub fn with_parameter_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut ParameterStore) -> R,
{
    let mut guard = PARAMETER_STORE
        .lock()
        .expect("parameter store mutex poisoned");
    f(&mut guard)
}

// =============================================================================
// Slot State Storage
// =============================================================================

/// Slot info for multi-layer rendering.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SlotInfo {
    pub index: usize,
    pub sketch_id: String,
}

/// Persisted slot state - survives window restarts.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SlotState {
    pub slots: Vec<SlotInfo>,
    pub active_slot_index: usize,
    pub crossfade_target_index: Option<usize>,
}

static SLOT_STATE: Lazy<Arc<Mutex<SlotState>>> =
    Lazy::new(|| Arc::new(Mutex::new(SlotState::default())));

pub fn with_slot_state<F, R>(f: F) -> R
where
    F: FnOnce(&mut SlotState) -> R,
{
    let mut guard = SLOT_STATE.lock().expect("slot state mutex poisoned");
    f(&mut guard)
}

// =============================================================================
// Persistence
// =============================================================================

pub fn parameters_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("parameters.json");
        dir
    })
}

fn slots_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("slots.json");
        dir
    })
}

pub fn load_parameters_from_disk(app: &tauri::App) {
    let path = match app.path().app_config_dir().ok() {
        Some(mut dir) => {
            dir.push("parameters.json");
            dir
        }
        None => return,
    };

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(list) = serde_json::from_slice::<Vec<Parameter>>(&bytes) {
            with_parameter_store(|store| {
                store.parameters.clear();
                for p in list {
                    store.parameters.insert(p.id.clone(), p);
                }
            });
        }
    }
}

pub fn load_slots_from_disk(app: &tauri::App) {
    let path = match app.path().app_config_dir().ok() {
        Some(mut dir) => {
            dir.push("slots.json");
            dir
        }
        None => return,
    };

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(state) = serde_json::from_slice::<SlotState>(&bytes) {
            with_slot_state(|s| {
                *s = state;
            });
        }
    }
}

pub fn save_parameters_to_disk(app: &AppHandle) {
    let snapshot = with_parameter_store(|store| store.get_all());
    if let Some(path) = parameters_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&snapshot) {
            let _ = fs::write(path, json);
        }
    }
}

pub fn save_slots_to_disk(app: &AppHandle) {
    let state = with_slot_state(|s| s.clone());
    if let Some(path) = slots_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&state) {
            let _ = fs::write(path, json);
        }
    }
}

// =============================================================================
// Transition Tick Loop
// =============================================================================

const PARAMETER_TICK_INTERVAL_MS: u64 = 16; // ~60 Hz

/// Background thread that smoothly interpolates parameters and emits events.
pub fn start_parameter_tick_loop(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_tick = Instant::now();

        loop {
            let now = Instant::now();
            let dt = now.duration_since(last_tick).as_secs_f64().min(0.25);
            last_tick = now;

            let changed: Vec<Parameter> = with_parameter_store(|store| {
                store.last_tick = Some(now);
                store.tick(dt)
            });

            if !changed.is_empty() {
                for p in &changed {
                    let _ = app.emit("parameter_changed", p);
                }
                save_parameters_to_disk(&app);
            }

            std::thread::sleep(Duration::from_millis(PARAMETER_TICK_INTERVAL_MS));
        }
    });
}

// =============================================================================
// Slot and Parameter Helpers
// =============================================================================

/// Extract slot index from a slot-prefixed parameter ID.
/// Returns Some(index) for IDs like "slot_0_brightness", None otherwise.
pub fn extract_slot_index(param_id: &str) -> Option<usize> {
    if param_id.starts_with("slot_") {
        let rest = &param_id[5..]; // After "slot_"
        if let Some(underscore_pos) = rest.find('_') {
            rest[..underscore_pos].parse().ok()
        } else {
            None
        }
    } else {
        None
    }
}

/// Ensure audio_reactivity parameter exists for a slot.
/// Called when initializing slots to guarantee the parameter is available.
pub fn ensure_slot_audio_reactivity(app: &AppHandle, slot_index: usize) -> Option<Parameter> {
    let param_id = format!("slot_{}_audio_reactivity", slot_index);

    let created = with_parameter_store(|store| {
        if !store.parameters.contains_key(&param_id) {
            // Default to 1.0 (fully reactive)
            let param = default_parameter_for_id(param_id.clone(), 1.0);
            store.parameters.insert(param_id.clone(), param.clone());
            Some(param)
        } else {
            None
        }
    });

    if let Some(ref param) = created {
        save_parameters_to_disk(app);
        let _ = app.emit("parameter_changed", param);
    }

    created
}

/// Ensure global fade time parameters exist.
/// These control the transition speed for mute and solo actions.
pub fn ensure_global_fade_parameters(app: &AppHandle) {
    let params_to_create = [
        ("global_mute_fade_time", 0.25), // seconds for mute/unmute transition
        ("global_solo_fade_time", 0.3),  // seconds for solo transition
    ];

    for (param_id, default_value) in params_to_create {
        let created = with_parameter_store(|store| {
            if !store.parameters.contains_key(param_id) {
                // These are instant-apply parameters (no transition on themselves)
                let mut param = default_parameter_for_id(param_id.to_string(), default_value);
                param.transition_speed = 0.0; // Fade time settings change instantly
                store.parameters.insert(param_id.to_string(), param.clone());
                Some(param)
            } else {
                None
            }
        });

        if let Some(ref param) = created {
            save_parameters_to_disk(app);
            let _ = app.emit("parameter_changed", param);
        }
    }
}

/// Get default parameter values for a sketch type.
pub fn get_sketch_defaults(sketch_id: &str) -> Vec<(&'static str, f64)> {
    // Common Aura parameters shared by all presets
    let aura_base = |bloom: f64,
                     complexity: f64,
                     sample_offset: f64,
                     speed: f64,
                     scale_base: f64,
                     distance: f64,
                     attenuation: f64,
                     ray_steps: f64,
                     seed: f64,
                     color_interp: f64,
                     grain_intensity: f64,
                     tonemap_mode: f64|
     -> Vec<(&'static str, f64)> {
        vec![
            ("bloom", bloom),
            ("complexity", complexity),
            ("sample_offset", sample_offset),
            ("speed", speed),
            ("scale_base", scale_base),
            ("distance", distance),
            ("attenuation", attenuation),
            ("ray_steps", ray_steps),
            ("seed", seed),
            ("color_interp", color_interp),
            ("grain_intensity", grain_intensity),
            ("tonemap_mode", tonemap_mode),
        ]
    };

    match sketch_id {
        // New sketch IDs
        "blueCube" => vec![
            ("brightness", 1.0),
            ("rotation_speed", 0.6),
            ("wobble", 0.0),
            ("tint_lfo_depth", 0.2),
            ("tint", 0.0),
        ],
        "orangeCube" => vec![
            ("brightness", 1.0),
            ("rotation_speed", 0.4),
            ("tint", 0.5),
            ("scale", 1.0),
        ],
        "greenPulse" => vec![
            ("brightness", 1.0),
            ("pulse_speed", 1.5),
            ("rotation_speed", 0.4),
            ("tint", 0.5),
        ],
        // Aura presets - values from seb.cat/components/aura-controls/presets.ts
        // aura_base args: bloom, complexity, sample_offset, speed, scale_base, distance, attenuation, ray_steps, seed, color_interp, grain_intensity, tonemap_mode
        "auraOg" => aura_base(
            3.2, 3.3, 0.15, 0.3, 1.0, 2.0, 0.15, 8.0, 0.0, 0.9, 0.05, 0.0,
        ),
        "auraRoseGold" => aura_base(
            3.2, 3.3, 0.15, 0.3, 1.0, 2.0, 0.15, 8.0, 0.0, 0.9, 0.05, 4.0,
        ),
        "auraDeepBlue" => aura_base(
            3.2, 3.3, 0.15, 0.3, 1.0, 2.0, 0.15, 8.0, 0.0, 0.9, 0.05, 0.0,
        ),
        "auraSolarPlume" => aura_base(
            0.36, 1.57, 0.219, 0.3, 0.26, 3.05, 0.31, 8.0, 3598.0, 1.2, 0.05, 4.0,
        ),
        "auraGhostLike" => aura_base(
            1.33, 2.64, 0.073, 0.3, 0.24, 1.98, 0.08, 6.0, 28.0, 1.0, 0.05, 7.0,
        ),
        "auraForestClearing" => aura_base(
            0.29, 2.2, 0.209, 0.2, 0.15, 1.98, 0.17, 9.0, 28.0, 0.83, 0.05, 7.0,
        ),
        "auraDefaultIntense" => aura_base(
            1.57, 2.48, 0.218, 0.3, 0.25, 2.35, 0.25, 11.0, 3578.0, 0.9, 0.05, 7.0,
        ),
        "auraBlushNebula" => aura_base(
            3.0, 2.5, 0.5, 0.5, 0.2, 2.5, 0.1, 10.0, 10.0, 1.01, 0.1, 5.0,
        ),
        _ => vec![],
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_slot_index_valid() {
        assert_eq!(extract_slot_index("slot_0_brightness"), Some(0));
        assert_eq!(extract_slot_index("slot_1_alpha"), Some(1));
        assert_eq!(extract_slot_index("slot_7_audio_reactivity"), Some(7));
        assert_eq!(extract_slot_index("slot_12_something"), Some(12));
    }

    #[test]
    fn test_extract_slot_index_invalid() {
        assert_eq!(extract_slot_index("brightness"), None);
        assert_eq!(extract_slot_index("global_param"), None);
        assert_eq!(extract_slot_index("slot_"), None);
        assert_eq!(extract_slot_index("slot_abc_param"), None);
        assert_eq!(extract_slot_index(""), None);
    }
}
