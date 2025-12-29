use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent};

pub mod audio;
pub mod hid;
pub mod midi;
pub mod modulation;
pub mod osc;
#[cfg(target_os = "macos")]
pub mod syphon;
pub mod video_out;
pub mod window_manager;

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
pub(crate) struct ParameterStore {
    pub(crate) parameters: HashMap<ParameterId, Parameter>,
    last_tick: Option<Instant>,
}

impl ParameterStore {
    fn get_all(&self) -> Vec<Parameter> {
        self.parameters.values().cloned().collect()
    }

    fn get(&self, id: &str) -> Option<Parameter> {
        self.parameters.get(id).cloned()
    }

    /// Set parameter target. Creates the parameter if it doesn't exist.
    fn set_target(&mut self, id: ParameterId, target: f64) -> Parameter {
        let entry = self
            .parameters
            .entry(id.clone())
            .or_insert_with(|| default_parameter_for_id(id, target));
        entry.target = target;
        entry.clone()
    }

    /// Set parameter target with a specific transition speed (in seconds).
    /// Creates the parameter if it doesn't exist.
    fn set_target_with_transition(
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

    fn clear(&mut self) {
        self.parameters.clear();
        self.last_tick = None;
    }

    /// Advance parameters toward targets. Returns parameters that changed.
    fn tick(&mut self, dt: f64) -> Vec<Parameter> {
        if self.parameters.is_empty() {
            return Vec::new();
        }

        let mut changed: Vec<Parameter> = Vec::new();

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
fn default_parameter_for_id(id: ParameterId, initial_value: f64) -> Parameter {
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

pub(crate) fn with_parameter_store<F, R>(f: F) -> R
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

/// Persisted slot state - survives window restarts.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SlotState {
    pub slots: Vec<SlotInfo>,
    pub active_slot_index: usize,
    pub crossfade_target_index: Option<usize>,
}

static SLOT_STATE: Lazy<Arc<Mutex<SlotState>>> =
    Lazy::new(|| Arc::new(Mutex::new(SlotState::default())));

pub(crate) fn with_slot_state<F, R>(f: F) -> R
where
    F: FnOnce(&mut SlotState) -> R,
{
    let mut guard = SLOT_STATE.lock().expect("slot state mutex poisoned");
    f(&mut guard)
}

// =============================================================================
// Persistence
// =============================================================================

fn parameters_path(app: &AppHandle) -> Option<PathBuf> {
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

fn load_parameters_from_disk(app: &tauri::App) {
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

fn load_slots_from_disk(app: &tauri::App) {
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
            log::info!(
                "[SlotState] Loaded {} slots from disk",
                with_slot_state(|s| s.slots.len())
            );
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

fn save_slots_to_disk(app: &AppHandle) {
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
fn start_parameter_tick_loop(app: AppHandle) {
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
// Tauri Commands
// =============================================================================

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Forward an event from Controls to Renderer (prefixed with "renderer:").
#[tauri::command]
fn forward_controls_event(app: AppHandle, event: String, payload: String) -> Result<(), String> {
    app.emit(&format!("renderer:{event}"), payload)
        .map_err(|e| format!("Failed to emit: {e}"))
}

#[tauri::command]
fn get_parameters() -> Vec<Parameter> {
    with_parameter_store(|store| store.get_all())
}

#[tauri::command]
fn get_parameter(id: String) -> Option<Parameter> {
    with_parameter_store(|store| store.get(&id))
}

/// Set a parameter's target. Emits immediate feedback for most parameters,
/// but lets crossfade animate smoothly via the tick loop.
/// Also sends MIDI feedback to connected controllers.
#[tauri::command]
fn set_parameter(app: AppHandle, id: String, value: f64) -> Parameter {
    let updated = with_parameter_store(|store| store.set_target(id.clone(), value));
    save_parameters_to_disk(&app);

    // Crossfade: emit current value (let tick loop animate smoothly)
    // Others: emit target as value (immediate UI feedback)
    let immediate = if id == "crossfade" {
        updated.clone()
    } else {
        Parameter {
            value: updated.target,
            ..updated.clone()
        }
    };

    let _ = app.emit("parameter_changed", &immediate);

    // Send MIDI feedback for this parameter (if it has a mapping)
    midi::send_parameter_feedback(&id, value);

    updated
}

#[tauri::command]
fn clear_parameters(app: AppHandle) {
    with_parameter_store(|store| store.clear());
    if let Some(path) = parameters_path(&app) {
        let _ = fs::remove_file(path);
    }
    let _ = app.emit("parameters_cleared", ());
}

/// Notify Renderer which slots are active/next for crossfade (multi-instance support).
#[tauri::command]
fn set_slot_pairing(
    app: AppHandle,
    active_slot_index: usize,
    active_scene_id: String,
    next_slot_index: usize,
    next_scene_id: String,
) -> Result<(), String> {
    app.emit(
        "slot_pairing_changed",
        serde_json::json!({
            "active_slot_index": active_slot_index,
            "active_scene_id": active_scene_id,
            "next_slot_index": next_slot_index,
            "next_scene_id": next_scene_id,
        }),
    )
    .map_err(|e| format!("Failed to emit slot_pairing_changed: {e}"))
}

/// Slot info for multi-layer rendering.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SlotInfo {
    pub index: usize,
    pub sketch_id: String,
}

/// Notify Renderer of ALL slots for multi-layer alpha rendering.
/// This allows the renderer to render all slots based on their alpha values.
/// Also persists slot state so it survives Controls window restarts.
#[tauri::command]
fn set_all_slots(
    app: AppHandle,
    slots: Vec<SlotInfo>,
    active_slot_index: usize,
    crossfade_target_index: Option<usize>,
) -> Result<(), String> {
    // Persist slot state to backend storage
    with_slot_state(|state| {
        state.slots = slots.clone();
        state.active_slot_index = active_slot_index;
        state.crossfade_target_index = crossfade_target_index;
    });

    // Save to disk for persistence across app restarts
    save_slots_to_disk(&app);

    // Update MIDI engine with slot states for LED feedback and knob mappings
    // A slot "exists" if it's in the slots array (LEDs indicate slot count)
    let slot_states: Vec<(usize, bool, String)> = slots
        .iter()
        .map(|s| (s.index, true, s.sketch_id.clone()))
        .collect();
    midi::set_active_slots(slot_states);

    app.emit(
        "all_slots_changed",
        serde_json::json!({
            "slots": slots,
            "active_slot_index": active_slot_index,
            "crossfade_target_index": crossfade_target_index,
        }),
    )
    .map_err(|e| format!("Failed to emit all_slots_changed: {e}"))
}

/// Get the current slot state from backend storage.
/// Used by Controls window on startup/restart to hydrate from persisted state.
#[tauri::command]
fn get_slot_state() -> SlotState {
    with_slot_state(|state| state.clone())
}

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
fn ensure_slot_audio_reactivity(app: &AppHandle, slot_index: usize) -> Option<Parameter> {
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
fn ensure_global_fade_parameters(app: &AppHandle) {
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

/// Initialize parameters for a new slot with default values.
#[tauri::command]
fn initialize_slot_parameters(
    app: AppHandle,
    slot_index: usize,
    scene_id: String, // Keep param name for API compatibility, but it's now a sketch ID
) -> Vec<Parameter> {
    let defaults = get_sketch_defaults(&scene_id);
    let mut created: Vec<Parameter> = Vec::new();

    // Ensure audio_reactivity parameter exists for this slot
    if let Some(param) = ensure_slot_audio_reactivity(&app, slot_index) {
        created.push(param);
    }

    with_parameter_store(|store| {
        for (template_id, default_value) in defaults {
            let param_id = format!("slot_{}_{}", slot_index, template_id);

            // Only create if it doesn't already exist
            if !store.parameters.contains_key(&param_id) {
                let param = default_parameter_for_id(param_id.clone(), default_value);
                store.parameters.insert(param_id, param.clone());
                created.push(param);
            }
        }
    });

    if !created.is_empty() {
        save_parameters_to_disk(&app);
        for param in &created {
            let _ = app.emit("parameter_changed", param);
        }
    }

    created
}

/// Get default parameter values for a sketch type.
fn get_sketch_defaults(sketch_id: &str) -> Vec<(&'static str, f64)> {
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
        _ => vec![],
    }
}

// =============================================================================
// App Entry Point
// =============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    log::info!("[App] Starting sebcat-vj");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            load_parameters_from_disk(app);
            load_slots_from_disk(app);

            // Ensure audio_reactivity parameters exist for all 8 slots
            // These are slot-level parameters that gate audio mappings
            for slot_index in 0..8 {
                ensure_slot_audio_reactivity(&app.handle(), slot_index);
            }

            // Initialize global fade time parameters
            ensure_global_fade_parameters(&app.handle());

            // Initialize window manager (health monitoring, etc.)
            window_manager::init_window_manager(app.handle());

            // Build and set the application menu
            match window_manager::build_app_menu(app.handle()) {
                Ok(menu) => {
                    if let Err(e) = app.set_menu(menu) {
                        log::error!("[App] Failed to set menu: {}", e);
                    }
                }
                Err(e) => {
                    log::error!("[App] Failed to build menu: {}", e);
                }
            }

            // Initialize all engines (they log internally at debug level)
            midi::init_midi_engine(app.handle().clone());
            osc::init_osc_engine(app.handle().clone());
            audio::init_audio_engine(app.handle().clone());
            hid::init_hid_engine(app.handle());
            modulation::init_modulation_engine(app.handle().clone());
            video_out::init_video_output(app.handle().clone());

            // Log startup summary
            let video_backends = video_out::get_available_backends();
            log::info!(
                "[App] Initialized: MIDI, OSC, Audio, HID, Modulation, Video, WindowManager ({})",
                if video_backends.is_empty() {
                    "no backends".to_string()
                } else {
                    video_backends.join(", ")
                }
            );

            start_parameter_tick_loop(app.handle().clone());

            // Window placement - spawn with delay to ensure windows are ready
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                // Wait for windows to be fully initialized
                std::thread::sleep(Duration::from_millis(100));
                setup_window_placement(&app_handle);
            });

            Ok(())
        })
        // Handle menu events
        .on_menu_event(|app, event| {
            window_manager::handle_menu_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            forward_controls_event,
            get_parameters,
            get_parameter,
            set_parameter,
            clear_parameters,
            set_slot_pairing,
            set_all_slots,
            get_slot_state,
            initialize_slot_parameters,
            // Window Manager
            window_manager::restart_controls_window,
            window_manager::restart_renderer_window,
            window_manager::toggle_window_visibility,
            window_manager::focus_window,
            window_manager::get_window_status,
            window_manager::window_heartbeat,
            window_manager::get_window_restart_log_path,
            // MIDI Input
            midi::list_midi_devices,
            midi::open_midi_device,
            midi::close_midi_device,
            midi::start_midi_learn,
            midi::cancel_midi_learn,
            midi::get_midi_learn_state,
            midi::get_midi_mappings,
            midi::set_midi_mapping,
            midi::remove_midi_mapping,
            midi::clear_midi_mappings,
            midi::set_midi_auto_reconnect,
            midi::get_midi_auto_reconnect,
            midi::clear_midi_auto_reconnect_devices,
            // MIDI Output
            midi::list_midi_output_devices,
            midi::open_midi_output_device,
            midi::close_midi_output_device,
            midi::send_midi_cc,
            midi::send_midi_note_on,
            midi::send_midi_note_off,
            midi::set_midi_output_config,
            midi::get_midi_output_config,
            midi::trigger_midi_feedback,
            // OSC
            osc::start_osc_server,
            osc::stop_osc_server,
            osc::get_osc_status,
            osc::get_osc_mappings,
            osc::add_osc_mapping,
            osc::remove_osc_mapping,
            osc::clear_osc_mappings,
            // Audio
            audio::list_audio_devices,
            audio::start_audio_capture,
            audio::stop_audio_capture,
            audio::get_audio_status,
            audio::get_audio_mappings,
            audio::add_audio_mapping,
            audio::remove_audio_mapping,
            audio::clear_audio_mappings,
            audio::set_audio_mapping_enabled,
            audio::set_audio_auto_reconnect,
            audio::get_audio_auto_reconnect,
            // HID
            hid::list_hid_devices,
            hid::list_supported_hid_devices,
            hid::connect_hid_device,
            hid::connect_hid_megalodon,
            hid::disconnect_hid_device,
            hid::get_hid_status,
            hid::get_hid_mappings,
            hid::add_hid_mapping,
            hid::remove_hid_mapping,
            hid::clear_hid_mappings,
            hid::setup_default_hid_mappings,
            hid::set_hid_auto_connect,
            hid::get_hid_auto_connect,
            // Modulation
            modulation::get_modulation_lfos,
            modulation::get_modulation_lfo,
            modulation::add_modulation_lfo,
            modulation::update_modulation_lfo,
            modulation::remove_modulation_lfo,
            modulation::clear_modulation_lfos,
            modulation::get_modulation_targets,
            modulation::add_modulation_target,
            modulation::remove_modulation_target,
            modulation::clear_modulation_targets,
            modulation::update_modulation_base_value,
            modulation::get_modulation_audio_modulations,
            modulation::add_modulation_audio_modulation,
            modulation::remove_modulation_audio_modulation,
            modulation::clear_modulation_audio_modulations,
            modulation::get_full_modulation_state,
            modulation::is_parameter_modulated_cmd,
            // Video Output
            video_out::list_video_backends,
            video_out::get_video_backend_status,
            video_out::init_video_backend,
            video_out::shutdown_video_backend,
            video_out::publish_video_frame,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::Exit = event {
                log::info!("[App] Exit event received, cleaning up...");
                midi::cleanup_midi();
                log::info!("[App] Cleanup complete, exiting");
            }
        });
}

/// Place Controls on primary monitor, Renderer on largest secondary (or primary if none).
/// In dev mode, Renderer is centered on target monitor. In production, both go fullscreen.
///
/// Called with a delay to ensure windows are fully initialized.
fn setup_window_placement(app_handle: &AppHandle) {
    let is_dev = cfg!(debug_assertions);

    let primary_monitor = match app_handle.primary_monitor().ok().flatten() {
        Some(m) => m,
        None => return,
    };

    // Controls → primary monitor
    if let Some(window) = app_handle.get_webview_window("controls") {
        let _ = window.set_position(*primary_monitor.position());
        let _ = window.set_size(*primary_monitor.size());
        if !is_dev {
            let _ = window.set_fullscreen(true);
        }
    }

    // Find largest secondary monitor
    let all_monitors = app_handle.available_monitors().unwrap_or_default();
    let secondary = all_monitors
        .into_iter()
        .filter(|m| {
            m.position() != primary_monitor.position() || m.size() != primary_monitor.size()
        })
        .max_by_key(|m| {
            let size = m.size();
            size.width as i64 * size.height as i64
        });

    // Renderer → secondary or primary
    if let Some(window) = app_handle.get_webview_window("renderer") {
        let target = secondary.as_ref().unwrap_or(&primary_monitor);
        let monitor_pos = target.position();
        let monitor_size = target.size();
        let monitor_scale = target.scale_factor();

        if is_dev {
            // Two-step positioning: move to target monitor first (so macOS updates the
            // window's scale factor), then center it.
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: monitor_pos.x,
                y: monitor_pos.y,
            }));

            // Let window manager process the move and update scale
            std::thread::sleep(std::time::Duration::from_millis(50));

            // Calculate center using actual window size, or fallback to config size
            let (window_width, window_height) = window
                .outer_size()
                .map(|s| (s.width as i32, s.height as i32))
                .unwrap_or((
                    (1920.0 * monitor_scale) as i32,
                    (1080.0 * monitor_scale) as i32,
                ));

            let center_x = monitor_pos.x + ((monitor_size.width as i32 - window_width) / 2);
            let center_y = monitor_pos.y + ((monitor_size.height as i32 - window_height) / 2);

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: center_x,
                y: center_y,
            }));
        } else {
            let _ = window.set_position(*monitor_pos);
            let _ = window.set_size(*monitor_size);
            let _ = window.set_fullscreen(true);
        }
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
