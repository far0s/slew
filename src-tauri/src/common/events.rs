//! Event emission helpers.
//!
//! Provides common utilities for emitting Tauri events from the backend
//! to the frontend with consistent patterns and error handling.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Emit an event to all windows.
///
/// Logs a warning if the event fails to emit.
pub fn emit<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(e) = app.emit(event, payload) {
        log::warn!("[Events] Failed to emit '{}': {}", event, e);
    }
}

/// Emit an event to all windows, using a closure to build the payload.
///
/// This is useful when you need to compute the payload inside a lock guard.
pub fn emit_with<T, F>(app: &AppHandle, event: &str, payload_fn: F)
where
    T: Serialize + Clone,
    F: FnOnce() -> T,
{
    emit(app, event, payload_fn());
}

/// Emit a status changed event with a standard naming convention.
///
/// Given a module name like "midi", emits "midi-status-changed".
pub fn emit_status_changed<T: Serialize + Clone>(app: &AppHandle, module: &str, payload: T) {
    let event = format!("{}-status-changed", module);
    emit(app, &event, payload);
}

/// Emit a devices changed event with a standard naming convention.
///
/// Given a module name like "midi", emits "midi-devices-changed".
pub fn emit_devices_changed<T: Serialize + Clone>(app: &AppHandle, module: &str, payload: T) {
    let event = format!("{}-devices-changed", module);
    emit(app, &event, payload);
}

/// Emit a mappings changed event with a standard naming convention.
///
/// Given a module name like "midi", emits "midi-mappings-changed".
pub fn emit_mappings_changed<T: Serialize + Clone>(app: &AppHandle, module: &str, payload: T) {
    let event = format!("{}-mappings-changed", module);
    emit(app, &event, payload);
}

#[cfg(test)]
mod tests {
    // Note: Testing event emission requires a Tauri app context,
    // which is complex to set up in unit tests. These functions
    // are simple wrappers around Tauri's emit, so integration
    // testing through the app is preferred.
}
