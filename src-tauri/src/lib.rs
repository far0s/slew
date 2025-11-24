// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{AppHandle, Emitter};

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
    let forwarded_event = format!("renderer:{event}");

    // In Tauri 2, Emitter::emit broadcasts to all windows.
    app.emit(&forwarded_event, payload)
        .map_err(|error| format!("Failed to emit forwarded event: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, forward_controls_event])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
