//! Spout video output backend for Windows
//!
//! Wraps the `rust-spout2` crate to share rendered frames with other applications
//! via the Spout protocol (Resolume, TouchDesigner, MadMapper, etc.).
//!
//! `rust-spout2` builds Spout2 from source at compile time (no pre-installed SDK
//! required). In CI the env var `RUST_SPOUT2_ALLOW_FETCH=1` enables auto-cloning
//! of the upstream Spout2 sources.
//!
//! The public API mirrors `syphon.rs` so `video_out.rs` can use both backends
//! symmetrically.

use once_cell::sync::Lazy;
use rust_spout2::Spout;
use std::sync::Mutex;

// OpenGL format constant (GL_RGBA = 0x1908)
const GL_RGBA: u32 = 0x1908;

// ============================================================================
// Global sender state
// ============================================================================

struct SpoutState {
    spout: Spout,
    name: String,
}

// SAFETY: `Spout` wraps a raw pointer to SPOUTLIBRARY. The library is
// single-threaded by design and we guard all access with a Mutex, so
// sending across threads is safe in practice.
unsafe impl Send for SpoutState {}

static SPOUT_STATE: Lazy<Mutex<Option<SpoutState>>> = Lazy::new(|| Mutex::new(None));

// ============================================================================
// Public API
// ============================================================================

/// Create and activate a Spout sender with the given name.
pub fn init_spout_sender(name: &str) -> Result<(), String> {
    let mut guard = SPOUT_STATE
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    if guard.is_some() {
        return Ok(()); // already running
    }

    let spout = Spout::new().ok_or_else(|| "[Spout] Failed to acquire Spout handle".to_string())?;
    *guard = Some(SpoutState {
        spout,
        name: name.to_string(),
    });
    log::info!("[Spout] Sender '{}' created", name);
    Ok(())
}

/// Destroy the active Spout sender.
pub fn shutdown_spout_sender() -> Result<(), String> {
    let mut guard = SPOUT_STATE
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    if let Some(mut state) = guard.take() {
        // Release the sender before dropping
        state.spout.as_pin_mut().ReleaseSender();
        log::info!("[Spout] Sender shut down");
    }
    Ok(())
}

/// Send a raw RGBA8 frame through the active Spout sender.
///
/// Returns `Err` if no sender is active or if the send call fails.
pub fn publish_spout_frame(data: &[u8], width: u32, height: u32) -> Result<(), String> {
    let mut guard = SPOUT_STATE
        .lock()
        .map_err(|e| format!("[Spout] Mutex poisoned: {e}"))?;

    match guard.as_mut() {
        None => Err("[Spout] No active sender".to_string()),
        Some(state) => {
            // SAFETY: SendImage reads pixels within the bounds of width*height*4 bytes.
            // We validated frame size before calling this function (VideoFrame::validate).
            let ok = unsafe {
                state.spout.as_pin_mut().SendImage(
                    data.as_ptr(),
                    width,
                    height,
                    GL_RGBA,
                    false, // bInvert — our frames are already Y-flipped by the renderer
                )
            };
            if ok {
                Ok(())
            } else {
                Err("[Spout] SendImage returned false".to_string())
            }
        }
    }
}

/// Returns `true` when the sender has been initialised.
pub fn is_spout_active() -> bool {
    SPOUT_STATE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|_| true))
        .unwrap_or(false)
}
