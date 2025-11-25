// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// ----------------------------------------------------------------------------
/// Minimal Parameter Server (backend-local, in-memory)
/// ----------------------------------------------------------------------------

/// Identifier for a parameter. Kept as a simple string for now so that the
/// frontend can evolve independently; later this can be tightened to enums.
pub type ParameterId = String;

/// Basic numeric parameter model using transitionable signals.
///
/// - `value`: current runtime value exposed to renderer/controls
/// - `target`: desired value set by UI / modulation / inputs
/// - `transition_speed`: approximate seconds to move from value → target
/// - `curve`: easing behavior (currently only Linear is implemented)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub id: ParameterId,
    pub value: f64,
    pub target: f64,
    pub transition_speed: f64,
    pub curve: ParameterCurve,
}

impl Parameter {
    /// Convenience helper to update transition-related fields while keeping
    /// the public API surface explicit.
    pub fn with_transition(self, transition_speed: f64, curve: ParameterCurve) -> Self {
        Self {
            transition_speed,
            curve,
            ..self
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

/// In-memory store for all parameters. This is intentionally simple and
/// single-process; it serves as a scaffold for a richer Parameter Server later.
#[derive(Default)]
struct ParameterStore {
    /// Parameters keyed by ID.
    parameters: HashMap<ParameterId, Parameter>,
    /// Last time the transition tick ran.
    last_tick: Option<Instant>,
}

impl ParameterStore {
    fn get_all(&self) -> Vec<Parameter> {
        self.parameters.values().cloned().collect()
    }

    fn get(&self, id: &str) -> Option<Parameter> {
        self.parameters.get(id).cloned()
    }

    /// Set the *target* of a parameter.
    ///
    /// - If the parameter does not exist, it is created with per-ID transition
    ///   defaults and `value == target`.
    /// - If it exists, only `target` is updated; `value` will be moved towards
    ///   `target` over time by the transition tick.
    fn set_target(&mut self, id: ParameterId, target: f64) -> Parameter {
        let entry = self
            .parameters
            .entry(id.clone())
            .or_insert_with(|| default_parameter_for_id(id, target));

        entry.target = target;
        entry.clone()
    }

    fn clear(&mut self) {
        self.parameters.clear();
        self.last_tick = None;
    }

    /// Advance all parameters towards their targets by `dt` seconds.
    ///
    /// Returns a Vec of parameters that actually changed `value`.
    fn tick(&mut self, dt: f64) -> Vec<Parameter> {
        if self.parameters.is_empty() {
            return Vec::new();
        }

        let mut changed: Vec<Parameter> = Vec::new();

        for p in self.parameters.values_mut() {
            // Skip parameters that are already at their target (within epsilon).
            if (p.value - p.target).abs() < 1e-5 {
                p.value = p.target;
                continue;
            }

            // If transition_speed is zero or negative, snap immediately.
            if p.transition_speed <= 0.0 {
                p.value = p.target;
                changed.push(p.clone());
                continue;
            }

            // Compute how far to move this tick.
            // transition_speed is interpreted as "seconds to reach target".
            let t = (dt / p.transition_speed).clamp(0.0, 1.0);

            let new_value = match p.curve {
                ParameterCurve::Linear | ParameterCurve::Ease | ParameterCurve::Exp => {
                    // For now all curves are linear; curve-specific behavior
                    // can be added later without changing the public API.
                    p.value + (p.target - p.value) * t
                }
            };

            // Avoid tiny oscillations near the target.
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

/// Create a parameter with per-ID defaults for transition behavior.
/// This lets us tune e.g. crossfade to be slower than brightness, without
/// hardcoding logic all over the codebase.
fn default_parameter_for_id(id: ParameterId, initial_value: f64) -> Parameter {
    // Per-parameter defaults:
    // - crossfade: slower transition (e.g. ~0.8s) for visible fades
    // - scene_a_brightness: quicker response
    // - scene_a_wobble: medium-fast, kept responsive for live tweaking
    // - scene_a_tint: similar to wobble, responsive but not twitchy
    // - fallback: medium-fast
    let (transition_speed, curve) = match id.as_str() {
        "crossfade" => (0.8_f64, ParameterCurve::Linear),
        "scene_a_brightness" => (0.3_f64, ParameterCurve::Linear),
        "scene_a_wobble" => (0.4_f64, ParameterCurve::Linear),
        "scene_a_tint" => (0.4_f64, ParameterCurve::Linear),
        _ => (0.4_f64, ParameterCurve::Linear),
    };

    Parameter {
        id,
        value: initial_value,
        target: initial_value,
        transition_speed,
        curve,
    }
}

/// Global, process-local parameter store.
/// This is deliberately simple; if we later move to a more complex architecture
/// (multi-process, networked, etc.), this can be replaced with a different
/// backend without changing the frontend API surface.
static PARAMETER_STORE: Lazy<Arc<Mutex<ParameterStore>>> =
    Lazy::new(|| Arc::new(Mutex::new(ParameterStore::default())));

/// Public API to access the global store.
fn with_parameter_store<F, R>(f: F) -> R
where
    F: FnOnce(&mut ParameterStore) -> R,
{
    let store_arc = &*PARAMETER_STORE;
    let mut guard = store_arc.lock().expect("parameter store mutex poisoned");
    f(&mut guard)
}

/// ----------------------------------------------------------------------------
/// Persistence helpers
/// ----------------------------------------------------------------------------

fn parameters_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("parameters.json");
        dir
    })
}

fn load_parameters_from_disk(app: &tauri::App) {
    if let Some(path) = app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("parameters.json");
        dir
    }) {
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
}

fn save_parameters_to_disk(app: &AppHandle) {
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

/// ----------------------------------------------------------------------------
/// Transition tick loop
/// ----------------------------------------------------------------------------

/// Minimum interval between ticks. We aim for ~60 Hz but tolerate slower ticks.
const PARAMETER_TICK_INTERVAL_MS: u64 = 16;

/// Start a simple background thread that periodically advances parameters
/// towards their targets and emits `parameter_changed` events when values
/// actually change.
///
/// This keeps the existing API surface:
/// - Controls still call `set_parameter`
/// - Renderer/controls still listen to `parameter_changed`
///
/// but the underlying values now move smoothly over time.
fn start_parameter_tick_loop(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_tick = Instant::now();

        loop {
            let now = Instant::now();
            let dt = now
                .duration_since(last_tick)
                .as_secs_f64()
                // Clamp to avoid huge jumps after sleep/standby.
                .min(0.25);
            last_tick = now;

            // Advance parameters and collect those that changed.
            let changed: Vec<Parameter> = with_parameter_store(|store| {
                // Track last_tick inside the store for potential future use.
                store.last_tick = Some(now);
                store.tick(dt)
            });

            if !changed.is_empty() {
                // Emit events and persist the updated snapshot.
                for p in &changed {
                    if let Err(error) = app.emit("parameter_changed", p) {
                        eprintln!(
                            "Failed to emit parameter_changed event for {}: {error}",
                            p.id
                        );
                    }
                }
                save_parameters_to_disk(&app);
            }

            std::thread::sleep(Duration::from_millis(PARAMETER_TICK_INTERVAL_MS));
        }
    });
}

/// Simple demo command kept from the scaffold for now.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Forward a value coming from the controls window to the renderer window.
///
/// This is intentionally minimal: it just forwards an opaque payload under a
/// well-known event name. The frontend can agree on a payload shape, e.g.
/// `{ value: number }`.
#[tauri::command]
fn forward_controls_event(app: AppHandle, event: String, payload: String) -> Result<(), String> {
    // In the future we can:
    // - Validate which events are allowed
    // - Transform payloads
    // - Route to specific subsystems
    //
    // For now we just emit to all windows; the renderer window can listen for
    // a namespaced event like `renderer:{event}`.
    let forwarded_event = format!("renderer:{event}");

    // In Tauri 2, `AppHandle::emit` broadcasts to all windows.
    app.emit(&forwarded_event, payload)
        .map_err(|error| format!("Failed to emit forwarded event: {error}"))
}

/// Get the full set of parameters currently known to the backend.
///
/// Frontends can use this to hydrate local state or debug the parameter model.
/// For now this returns a flat list; later we can add filtering, paging,
/// grouping, or scene scoping.
#[tauri::command]
fn get_parameters() -> Vec<Parameter> {
    with_parameter_store(|store| store.get_all())
}

/// Get a single parameter by ID.
///
/// Returns `None` if the parameter does not exist in the store yet.
#[tauri::command]
fn get_parameter(id: String) -> Option<Parameter> {
    with_parameter_store(|store| store.get(&id))
}

/// Set a parameter's *target* by ID.
///
/// This will create the parameter if it does not exist yet, and **only**
/// updates the `target` field. The `value` field will be moved towards
/// `target` over time by the transition tick loop.
///
/// The updated `Parameter` (after updating `target`) is returned so the
/// caller can render the canonical state (including curve/speed if they care).
#[tauri::command]
fn set_parameter(app: AppHandle, id: String, value: f64) -> Parameter {
    let updated = with_parameter_store(|store| store.set_target(id.clone(), value));

    // Persist the new target to disk immediately so restarts preserve intent.
    save_parameters_to_disk(&app);

    // We do *not* emit `parameter_changed` here for the target change alone;
    // the tick loop will emit events as `value` moves. Frontends that care
    // about target values can read them from the returned struct or via
    // `get_parameters`.
    updated
}

/// Clear all parameters from the store and persisted file.
#[tauri::command]
fn clear_parameters(app: AppHandle) {
    with_parameter_store(|store| store.clear());
    if let Some(path) = parameters_path(&app) {
        let _ = fs::remove_file(path);
    }
    // Optionally emit a broadcast so UIs can react.
    if let Err(error) = app.emit("parameters_cleared", ()) {
        eprintln!("Failed to emit parameters_cleared event: {error}");
    }
}

#[tauri::command]
fn set_scene_pairing(
    app: AppHandle,
    active_scene_id: String,
    next_scene_id: String,
) -> Result<(), String> {
    // For now we accept arbitrary strings and trust the frontend to
    // use valid SceneId values ("sceneA" | "sceneB" | "sceneC", etc.).
    // The renderer will interpret these IDs on its side.
    app.emit(
        "scene_pairing_changed",
        serde_json::json!({
            "active_scene_id": active_scene_id,
            "next_scene_id": next_scene_id,
        }),
    )
    .map_err(|error| format!("Failed to emit scene_pairing_changed event: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Load parameters from disk into the in-memory store on startup
            // so renderer/controls can hydrate from canonical state.
            load_parameters_from_disk(app);

            // Start the background transition tick loop once the app is ready.
            // This loop:
            // - Moves parameter `value` towards `target`
            // - Emits `parameter_changed` for parameters whose value changed
            // - Persists updated parameters to disk
            start_parameter_tick_loop(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            forward_controls_event,
            get_parameters,
            get_parameter,
            set_parameter,
            clear_parameters,
            set_scene_pairing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
