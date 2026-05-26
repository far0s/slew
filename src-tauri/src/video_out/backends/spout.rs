#[cfg(target_os = "windows")]
use crate::spout;

#[cfg(target_os = "windows")]
use super::super::types::{BackendConfig, BackendStatus, VideoFrame, VideoOutputBackend};

// ============================================================================
// Spout Backend (Windows)
// ============================================================================

/// Spout video output backend for Windows
///
/// Uses the `spout-rs` crate to share rendered frames with other applications
/// via the Spout protocol (Resolume, TouchDesigner, MadMapper, etc.).
#[cfg(target_os = "windows")]
pub struct SpoutBackend {
    config: Option<BackendConfig>,
    active: bool,
    frames_published: u64,
    last_error: Option<String>,
}

#[cfg(target_os = "windows")]
impl SpoutBackend {
    pub fn new() -> Self {
        Self {
            config: None,
            active: false,
            frames_published: 0,
            last_error: None,
        }
    }
}

#[cfg(target_os = "windows")]
impl Default for SpoutBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "windows")]
impl VideoOutputBackend for SpoutBackend {
    fn id(&self) -> &str {
        "spout"
    }

    fn name(&self) -> &str {
        "Spout"
    }

    fn is_available(&self) -> bool {
        // Spout implementation is currently a stub — return false so the
        // backend is shown as unavailable in the UI until a working Spout
        // crate is available. See src/spout.rs for details.
        false
    }

    fn initialize(&mut self, config: &BackendConfig) -> Result<(), String> {
        log::debug!("[Spout] Initializing with name: {}", config.name);

        match spout::init_spout_sender(&config.name) {
            Ok(()) => {
                self.config = Some(config.clone());
                self.active = true;
                self.frames_published = 0;
                self.last_error = None;
                log::info!("[Spout] Started '{}'", config.name);
                Ok(())
            }
            Err(e) => {
                self.last_error = Some(e.clone());
                log::error!("[Spout] Failed to initialize: {}", e);
                Err(e)
            }
        }
    }

    fn shutdown(&mut self) -> Result<(), String> {
        match spout::shutdown_spout_sender() {
            Ok(()) => {
                self.active = false;
                self.config = None;
                log::info!("[Spout] Stopped");
                Ok(())
            }
            Err(e) => {
                self.last_error = Some(e.clone());
                log::error!("[Spout] Failed to shut down: {}", e);
                Err(e)
            }
        }
    }

    fn publish_frame(&mut self, frame: &VideoFrame) -> Result<(), String> {
        use std::time::Instant;

        if !self.active {
            return Err("Spout backend is not active".to_string());
        }

        frame.validate()?;

        let publish_start = Instant::now();

        match spout::publish_spout_frame(&frame.data, frame.width, frame.height) {
            Ok(()) => {
                let publish_time = publish_start.elapsed();
                self.frames_published += 1;

                if self.frames_published % 1800 == 0 && self.frames_published > 0 {
                    log::debug!(
                        "[Spout] {} frames ({}x{}), last_publish: {:.2}ms",
                        self.frames_published,
                        frame.width,
                        frame.height,
                        publish_time.as_secs_f64() * 1000.0
                    );
                }

                Ok(())
            }
            Err(e) => {
                if self.frames_published % 300 == 0 {
                    log::warn!("[Spout] Frame publish error: {}", e);
                }
                self.last_error = Some(e.clone());
                Err(e)
            }
        }
    }

    fn status(&self) -> BackendStatus {
        BackendStatus {
            id: self.id().to_string(),
            name: self.name().to_string(),
            active: self.active,
            available: self.is_available(),
            receivers: None,
            frames_published: self.frames_published,
            last_error: self.last_error.clone(),
        }
    }
}
