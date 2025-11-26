use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub mod audio;
pub mod hid;
pub mod midi;
pub mod modulation;
pub mod osc;
#[cfg(target_os = "macos")]
pub mod syphon;
pub mod video_out;

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
        "scene_a_brightness" | "scene_b_brightness" | "scene_c_brightness" => {
            (0.3, ParameterCurve::Linear)
        }
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
// Persistence
// =============================================================================

fn parameters_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("parameters.json");
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

/// Notify Renderer which scenes are active/next for crossfade.
#[tauri::command]
fn set_scene_pairing(
    app: AppHandle,
    active_scene_id: String,
    next_scene_id: String,
) -> Result<(), String> {
    app.emit(
        "scene_pairing_changed",
        serde_json::json!({
            "active_scene_id": active_scene_id,
            "next_scene_id": next_scene_id,
        }),
    )
    .map_err(|e| format!("Failed to emit scene_pairing_changed: {e}"))
}

/// Restart the Controls window (for crash recovery).
/// This closes the existing Controls window and creates a new one.
#[tauri::command]
async fn restart_controls_window(app: AppHandle) -> Result<(), String> {
    // Log the restart attempt
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    if let Some(log_path) = app.path().app_log_dir().ok() {
        let _ = std::fs::create_dir_all(&log_path);
        let crash_log = log_path.join("controls_restarts.log");
        let entry = format!("[{}] Controls window restart requested\n", timestamp);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log)
            .and_then(|mut f| std::io::Write::write_all(&mut f, entry.as_bytes()));
    }

    // Close existing Controls window if it exists
    if let Some(window) = app.get_webview_window("controls") {
        window
            .close()
            .map_err(|e| format!("Failed to close Controls window: {e}"))?;
    }

    // Wait a moment for cleanup
    tokio::time::sleep(Duration::from_millis(100)).await;

    // Create new Controls window
    let new_window = WebviewWindowBuilder::new(&app, "controls", WebviewUrl::App("/".into()))
        .title("sebcat-vj — Controls")
        .inner_size(1440.0, 1080.0)
        .resizable(true)
        .visible(true)
        .build()
        .map_err(|e| format!("Failed to create Controls window: {e}"))?;

    // Position the window (similar to initial setup)
    if let Ok(Some(primary_monitor)) = app.primary_monitor() {
        let _ = new_window.set_position(*primary_monitor.position());
        let _ = new_window.set_size(*primary_monitor.size());
    }

    Ok(())
}

/// Get the path to the crash/restart log file.
#[tauri::command]
fn get_crash_log_path(app: AppHandle) -> Option<String> {
    app.path().app_log_dir().ok().map(|p| {
        p.join("controls_restarts.log")
            .to_string_lossy()
            .to_string()
    })
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
        .setup(|app| {
            load_parameters_from_disk(app);

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
                "[App] Initialized: MIDI, OSC, Audio, HID, Modulation, Video ({})",
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
        .invoke_handler(tauri::generate_handler![
            greet,
            forward_controls_event,
            get_parameters,
            get_parameter,
            set_parameter,
            clear_parameters,
            set_scene_pairing,
            restart_controls_window,
            get_crash_log_path,
            // MIDI
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
