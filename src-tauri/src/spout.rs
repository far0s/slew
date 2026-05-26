//! Spout video output backend for Windows (stub)
//!
//! Full implementation is blocked on a suitable Rust/Spout2 crate.
//! As of May 2026:
//! - `spout-rs` v0.1.3 requires `SPOUT2_LIB_DIR` pointing at a pre-built SDK
//! - `rust-spout2` v0.1.3 builds from source but `autocxx-bindgen` 0.65.1
//!   panics on `_Float16` complex types emitted by LLVM 20 headers on
//!   windows-2025 GitHub Actions runners
//!
//! Until one of these issues is resolved upstream, this module is a no-op
//! stub that keeps the rest of `video_out.rs` compiling cleanly on Windows.
//! The `SpoutBackend` in `video_out.rs` will accept frames and count them,
//! but not actually share them with other applications.

/// Initialise the Spout sender (no-op stub).
pub fn init_spout_sender(name: &str) -> Result<(), String> {
    log::warn!(
        "[Spout] Stub: sender '{}' not initialised (no Spout crate)",
        name
    );
    Ok(())
}

/// Shut down the Spout sender (no-op stub).
pub fn shutdown_spout_sender() -> Result<(), String> {
    Ok(())
}

/// Publish a frame (no-op stub).
pub fn publish_spout_frame(_data: &[u8], _width: u32, _height: u32) -> Result<(), String> {
    // Silently drop frames until a working Spout crate is available.
    Ok(())
}

/// Returns `false` — sender is never active in stub mode.
pub fn is_spout_active() -> bool {
    false
}
