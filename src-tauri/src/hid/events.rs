//! Event emission for the HID engine.

use tauri::Emitter;

use super::engine::with_hid_engine;

pub fn emit_status_changed() {
    let (status, handle) =
        with_hid_engine(|state| (state.status.clone(), state.app_handle.clone()));

    if let Some(handle) = handle {
        let _ = handle.emit("hid_status_changed", &status);
    }
}
