// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// ----------------------------------------------------------------------------
/// Minimal Parameter Server (backend-local, in-memory)
/// ----------------------------------------------------------------------------

/// Identifier for a parameter. Kept as a simple string for now so that the
/// frontend can evolve independently; later this can be tightened to enums.
pub type ParameterId = String;

/// Basic numeric parameter model. This mirrors the architectural idea of
/// "transitionable signals", but omits transitions for now; we're focused on
/// wiring and API shape.
///
/// Transition behavior (value → target with speed/curve) will be implemented
/// in a later phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Parameter {
    pub id: ParameterId,
    pub value: f64,
    pub target: f64,
    pub transition_speed: f64,
    pub curve: ParameterCurve,
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
}

impl ParameterStore {
    fn get_all(&self) -> Vec<Parameter> {
        self.parameters.values().cloned().collect()
    }

    fn get(&self, id: &str) -> Option<Parameter> {
        self.parameters.get(id).cloned()
    }

    fn set(&mut self, id: ParameterId, value: f64) -> Parameter {
        // For now, "set" updates both `value` and `target` immediately.
        // When transitions are implemented, `value` would be updated over time
        // towards `target` instead.
        let entry = self
            .parameters
            .entry(id.clone())
            .or_insert_with(|| Parameter {
                id,
                value,
                target: value,
                transition_speed: 1.0,
                curve: ParameterCurve::Linear,
            });

        entry.value = value;
        entry.target = value;
        entry.clone()
    }

    fn clear(&mut self) {
        self.parameters.clear();
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

/// Set a parameter's value by ID.
///
/// This will create the parameter if it does not exist yet, and currently
/// updates both `value` and `target` immediately. When transitions are
/// implemented, this API will likely update `target` and let a tick loop
/// move `value` over time.
///
/// The updated `Parameter` is returned so the caller can render the canonical
/// state (including curve/speed if they care).
#[tauri::command]
fn set_parameter(app: AppHandle, id: String, value: f64) -> Parameter {
    let updated = with_parameter_store(|store| store.set(id.clone(), value));

    // Persist to disk.
    save_parameters_to_disk(&app);

    // Emit a change event so interested frontends (e.g. Controls window)
    // can update live without polling `get_parameters`.
    //
    // Event name is `parameter_changed`, payload is the full Parameter.
    if let Err(error) = app.emit("parameter_changed", &updated) {
        eprintln!("Failed to emit parameter_changed event for {id}: {error}");
    }

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Load parameters from disk into the in-memory store on startup
            // so renderer/controls can hydrate from canonical state.
            load_parameters_from_disk(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            forward_controls_event,
            get_parameters,
            get_parameter,
            set_parameter,
            clear_parameters
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
