//! Window Manager Module
//!
//! Handles window lifecycle management, health monitoring, and recovery for live performance.
//!
//! Features:
//! - Independent window restart (controls can be restarted from menu or renderer)
//! - Health heartbeat monitoring (detect frozen windows)
//! - Native menu bar with window controls
//! - State preservation across restarts

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

// =============================================================================
// Constants
// =============================================================================

/// Heartbeat timeout threshold - if no heartbeat for this duration, window is considered frozen
const HEARTBEAT_TIMEOUT_SECS: u64 = 15;

/// Heartbeat check interval
const HEARTBEAT_CHECK_INTERVAL_MS: u64 = 5000;

// =============================================================================
// Window Health Tracking
// =============================================================================

/// Tracks the health state of a window
#[derive(Debug, Clone)]
pub struct WindowHealth {
    pub label: String,
    pub last_heartbeat: Instant,
    pub is_responsive: bool,
    pub restart_count: u32,
}

impl WindowHealth {
    fn new(label: &str) -> Self {
        Self {
            label: label.to_string(),
            last_heartbeat: Instant::now(),
            is_responsive: true,
            restart_count: 0,
        }
    }
}

/// Global window health store
static WINDOW_HEALTH: Lazy<Arc<Mutex<HashMap<String, WindowHealth>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Access the window health store
pub fn with_window_health<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, WindowHealth>) -> R,
{
    let mut store = WINDOW_HEALTH.lock().unwrap();
    f(&mut store)
}

// =============================================================================
// Window Management Commands
// =============================================================================

/// Restart the controls window
#[tauri::command]
pub async fn restart_controls_window(app: AppHandle) -> Result<(), String> {
    restart_window(&app, "controls", "/", "Slew — Controls", 1440.0, 1080.0).await
}

/// Restart the renderer window
#[tauri::command]
pub async fn restart_renderer_window(app: AppHandle) -> Result<(), String> {
    restart_window(
        &app,
        "renderer",
        "/renderer",
        "Slew — Renderer",
        1920.0,
        1080.0,
    )
    .await
}

/// Toggle window visibility
#[tauri::command]
pub fn toggle_window_visibility(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// Focus a window
#[tauri::command]
pub fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

/// Get window status for all managed windows
#[tauri::command]
pub fn get_window_status(app: AppHandle) -> HashMap<String, WindowStatus> {
    let mut status = HashMap::new();

    for label in ["controls", "renderer"] {
        let window_status = if let Some(window) = app.get_webview_window(label) {
            let health = with_window_health(|h| h.get(label).cloned());

            WindowStatus {
                exists: true,
                visible: window.is_visible().unwrap_or(false),
                focused: window.is_focused().unwrap_or(false),
                responsive: health.as_ref().map(|h| h.is_responsive).unwrap_or(true),
                restart_count: health.as_ref().map(|h| h.restart_count).unwrap_or(0),
            }
        } else {
            WindowStatus {
                exists: false,
                visible: false,
                focused: false,
                responsive: false,
                restart_count: 0,
            }
        };

        status.insert(label.to_string(), window_status);
    }

    status
}

/// Record a heartbeat from a window
#[tauri::command]
pub fn window_heartbeat(label: String) {
    with_window_health(|health| {
        if let Some(h) = health.get_mut(&label) {
            h.last_heartbeat = Instant::now();
            h.is_responsive = true;
        } else {
            health.insert(label.clone(), WindowHealth::new(&label));
        }
    });
}

/// Get the path to the window restart log
#[tauri::command]
pub fn get_window_restart_log_path(app: AppHandle) -> Option<String> {
    app.path()
        .app_log_dir()
        .ok()
        .map(|p| p.join("window_restarts.log").to_string_lossy().to_string())
}

// =============================================================================
// Status Types
// =============================================================================

#[derive(Debug, Clone, serde::Serialize)]
pub struct WindowStatus {
    pub exists: bool,
    pub visible: bool,
    pub focused: bool,
    pub responsive: bool,
    pub restart_count: u32,
}

// =============================================================================
// Internal Functions
// =============================================================================

/// Generic window restart function
async fn restart_window(
    app: &AppHandle,
    label: &str,
    url: &str,
    title: &str,
    width: f64,
    height: f64,
) -> Result<(), String> {
    log::info!("[WindowManager] Restarting window: {}", label);

    // Log the restart
    log_window_restart(app, label);

    // Update health tracking
    with_window_health(|health| {
        if let Some(h) = health.get_mut(label) {
            h.restart_count += 1;
        }
    });

    // Close existing window if it exists
    if let Some(window) = app.get_webview_window(label) {
        // Try to close gracefully
        if let Err(e) = window.close() {
            log::warn!(
                "[WindowManager] Failed to close {} gracefully: {}",
                label,
                e
            );
        }
    }

    // Wait for cleanup
    tokio::time::sleep(Duration::from_millis(150)).await;

    // Create new window
    let new_window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(width, height)
        .resizable(true)
        .visible(true)
        .build()
        .map_err(|e| format!("Failed to create {} window: {}", label, e))?;

    // Position the window appropriately
    position_window(app, &new_window, label);

    // Emit event so other windows know about the restart
    let _ = app.emit(
        "window_restarted",
        serde_json::json!({ "label": label, "timestamp": chrono::Utc::now().to_rfc3339() }),
    );

    log::info!("[WindowManager] Window {} restarted successfully", label);
    Ok(())
}

/// Position a window based on its role
fn position_window(app: &AppHandle, window: &tauri::WebviewWindow, label: &str) {
    let primary_monitor = match app.primary_monitor().ok().flatten() {
        Some(m) => m,
        None => return,
    };

    match label {
        "controls" => {
            // Controls → primary monitor
            let _ = window.set_position(*primary_monitor.position());
            let _ = window.set_size(*primary_monitor.size());
        }
        "renderer" => {
            // Find secondary monitor or use primary
            let all_monitors = app.available_monitors().unwrap_or_default();
            let secondary = all_monitors
                .into_iter()
                .filter(|m| {
                    m.position() != primary_monitor.position() || m.size() != primary_monitor.size()
                })
                .max_by_key(|m| {
                    let size = m.size();
                    size.width as i64 * size.height as i64
                });

            let target = secondary.as_ref().unwrap_or(&primary_monitor);
            let _ = window.set_position(*target.position());
            let _ = window.set_size(*target.size());
        }
        _ => {}
    }
}

/// Log a window restart event
fn log_window_restart(app: &AppHandle, label: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");

    if let Some(log_path) = app.path().app_log_dir().ok() {
        let _ = std::fs::create_dir_all(&log_path);
        let restart_log = log_path.join("window_restarts.log");
        let entry = format!("[{}] Window '{}' restart requested\n", timestamp, label);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&restart_log)
            .and_then(|mut f| std::io::Write::write_all(&mut f, entry.as_bytes()));
    }
}

// =============================================================================
// Health Monitoring
// =============================================================================

/// Start the heartbeat monitoring loop
pub fn start_heartbeat_monitor(app_handle: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(HEARTBEAT_CHECK_INTERVAL_MS));
        check_window_health(&app_handle);
    });
}

/// Check all windows for health status
fn check_window_health(app: &AppHandle) {
    let now = Instant::now();
    let timeout = Duration::from_secs(HEARTBEAT_TIMEOUT_SECS);

    let unresponsive_windows: Vec<String> = with_window_health(|health| {
        let mut unresponsive = Vec::new();

        for (label, h) in health.iter_mut() {
            let was_responsive = h.is_responsive;
            h.is_responsive = now.duration_since(h.last_heartbeat) < timeout;

            // Log state change
            if was_responsive && !h.is_responsive {
                log::warn!(
                    "[WindowManager] Window '{}' became unresponsive (no heartbeat for {}s)",
                    label,
                    HEARTBEAT_TIMEOUT_SECS
                );
                unresponsive.push(label.clone());
            } else if !was_responsive && h.is_responsive {
                log::info!("[WindowManager] Window '{}' is now responsive", label);
            }
        }

        unresponsive
    });

    // Emit events for unresponsive windows
    for label in unresponsive_windows {
        let _ = app.emit(
            "window_unresponsive",
            serde_json::json!({ "label": label, "timestamp": chrono::Utc::now().to_rfc3339() }),
        );
    }
}

// =============================================================================
// Menu Builder
// =============================================================================

/// Build the application menu with window management options
pub fn build_app_menu(app: &AppHandle) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    // App menu (macOS)
    let app_menu = SubmenuBuilder::new(app, "Slew")
        .item(&PredefinedMenuItem::about(app, Some("About Slew"), None)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, None)?)
        .item(&PredefinedMenuItem::hide_others(app, None)?)
        .item(&PredefinedMenuItem::show_all(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    // Edit menu (for copy/paste support)
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // Window menu with custom items
    let restart_controls = MenuItemBuilder::with_id("restart_controls", "Restart Controls")
        .accelerator("CmdOrCtrl+Shift+C")
        .build(app)?;

    let restart_renderer = MenuItemBuilder::with_id("restart_renderer", "Restart Renderer")
        .accelerator("CmdOrCtrl+Shift+R")
        .build(app)?;

    let focus_controls = MenuItemBuilder::with_id("focus_controls", "Focus Controls")
        .accelerator("CmdOrCtrl+1")
        .build(app)?;

    let focus_renderer = MenuItemBuilder::with_id("focus_renderer", "Focus Renderer")
        .accelerator("CmdOrCtrl+2")
        .build(app)?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .item(&restart_controls)
        .item(&restart_renderer)
        .separator()
        .item(&focus_controls)
        .item(&focus_renderer)
        .separator()
        .item(&PredefinedMenuItem::minimize(app, None)?)
        .item(&PredefinedMenuItem::maximize(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, None)?)
        .build()?;

    // Help menu
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&PredefinedMenuItem::about(app, Some("About Slew"), None)?)
        .build()?;

    // Build full menu
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;

    Ok(menu)
}

/// Handle menu item clicks
pub fn handle_menu_event(app: &AppHandle, event_id: &str) {
    match event_id {
        "restart_controls" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = restart_controls_window(app).await {
                    log::error!("[WindowManager] Failed to restart controls: {}", e);
                }
            });
        }
        "restart_renderer" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = restart_renderer_window(app).await {
                    log::error!("[WindowManager] Failed to restart renderer: {}", e);
                }
            });
        }
        "focus_controls" => {
            let _ = focus_window(app.clone(), "controls".to_string());
        }
        "focus_renderer" => {
            let _ = focus_window(app.clone(), "renderer".to_string());
        }
        _ => {}
    }
}

// =============================================================================
// Initialization
// =============================================================================

/// Initialize the window manager
pub fn init_window_manager(app: &AppHandle) {
    log::info!("[WindowManager] Initializing window manager");

    // Register initial window health
    with_window_health(|health| {
        health.insert("controls".to_string(), WindowHealth::new("controls"));
        health.insert("renderer".to_string(), WindowHealth::new("renderer"));
    });

    // Start heartbeat monitor
    start_heartbeat_monitor(app.clone());

    log::info!("[WindowManager] Window manager initialized");
}
