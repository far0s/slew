//! Spout video output backend for Windows
//!
//! Wraps the `spout-rs` crate to share rendered frames with other applications
//! via the Spout protocol (Resolume, TouchDesigner, MadMapper, etc.).
//!
//! The public API mirrors `syphon.rs` so `video_out.rs` can use both backends
//! symmetrically.

use once_cell::sync::Lazy;
use spout_rs::SpoutSender;
use std::sync::Mutex;

// ============================================================================
// Global sender (mirrors SYPHON_SERVER in syphon.rs)
// ============================================================================

static SPOUT_SENDER: Lazy<Mutex<Option<SpoutSender>>> = Lazy::new(|| Mutex::new(None));

// ============================================================================
// Public API
// ============================================================================

/// Create and activate a Spout sender with the given name.
pub fn init_spout_sender(name: &str) -> Result<(), String> {
    let mut guard = SPOUT_SENDER
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    if guard.is_some() {
        return Ok(()); // already running
    }

    let sender = SpoutSender::new(name);
    *guard = Some(sender);
    log::info!("[Spout] Sender '{}' created", name);
    Ok(())
}

/// Destroy the active Spout sender.
pub fn shutdown_spout_sender() -> Result<(), String> {
    let mut guard = SPOUT_SENDER
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    if guard.take().is_some() {
        log::info!("[Spout] Sender shut down");
    }
    Ok(())
}

/// Send a raw RGBA8 frame through the active Spout sender.
///
/// Returns `Err` if no sender is active or if the send call fails.
pub fn publish_spout_frame(data: &[u8], width: u32, height: u32) -> Result<(), String> {
    let mut guard = SPOUT_SENDER
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    match guard.as_mut() {
        None => Err("[Spout] No active sender".to_string()),
        Some(sender) => {
            let ok = sender.send_image_rgba(data, width, height);
            if ok {
                Ok(())
            } else {
                Err("[Spout] send_image_rgba returned false".to_string())
            }
        }
    }
}

/// Returns `true` when the sender exists and has been initialised by Spout.
pub fn is_spout_active() -> bool {
    SPOUT_SENDER
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| true))
        .unwrap_or(false)
}
