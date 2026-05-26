#[cfg(target_os = "macos")]
use crate::syphon;

#[cfg(target_os = "macos")]
use super::super::types::{BackendConfig, BackendStatus, VideoFrame, VideoOutputBackend};

// ============================================================================
// Syphon Backend (macOS)
// ============================================================================

/// Syphon video output backend for macOS
///
/// Uses the Syphon framework to share textures with other applications
/// like Resolume, VDMX, and OBS.
#[cfg(target_os = "macos")]
pub struct SyphonBackend {
    config: Option<BackendConfig>,
    active: bool,
    frames_published: u64,
    last_error: Option<String>,
    /// Whether Syphon has any connected clients
    has_clients: bool,
}

#[cfg(target_os = "macos")]
impl SyphonBackend {
    pub fn new() -> Self {
        Self {
            config: None,
            active: false,
            frames_published: 0,
            last_error: None,
            has_clients: false,
        }
    }
}

#[cfg(target_os = "macos")]
impl Default for SyphonBackend {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "macos")]
impl VideoOutputBackend for SyphonBackend {
    fn id(&self) -> &str {
        "syphon"
    }

    fn name(&self) -> &str {
        "Syphon"
    }

    fn is_available(&self) -> bool {
        // Check if Syphon framework is loaded/available
        syphon::is_syphon_available()
    }

    fn initialize(&mut self, config: &BackendConfig) -> Result<(), String> {
        log::debug!("[Syphon] Initializing with name: {}", config.name);

        // Initialize the native Syphon server
        match syphon::init_syphon_server(&config.name) {
            Ok(()) => {
                self.config = Some(config.clone());
                self.active = true;
                self.frames_published = 0;
                self.last_error = None;
                log::info!("[Syphon] Started '{}'", config.name);
                Ok(())
            }
            Err(e) => {
                self.last_error = Some(e.clone());
                log::error!("[Syphon] Failed to initialize: {}", e);
                Err(e)
            }
        }
    }

    fn shutdown(&mut self) -> Result<(), String> {
        match syphon::shutdown_syphon_server() {
            Ok(()) => {
                self.active = false;
                self.config = None;
                self.has_clients = false;
                log::info!("[Syphon] Stopped");
                Ok(())
            }
            Err(e) => {
                self.last_error = Some(e.clone());
                log::error!("[Syphon] Failed to shut down: {}", e);
                Err(e)
            }
        }
    }

    fn publish_frame(&mut self, frame: &VideoFrame) -> Result<(), String> {
        use std::time::Instant;

        if !self.active {
            return Err("Syphon backend is not active".to_string());
        }

        frame.validate()?;

        // Time the native Syphon publish
        let publish_start = Instant::now();

        // Publish to native Syphon server
        match syphon::publish_syphon_frame(&frame.data, frame.width, frame.height) {
            Ok(()) => {
                let publish_time = publish_start.elapsed();
                self.frames_published += 1;

                // Check for clients periodically
                if self.frames_published % 60 == 0 {
                    self.has_clients = syphon::syphon_has_clients();
                }

                // Log stats with timing every ~30 seconds at 60fps
                if self.frames_published % 1800 == 0 && self.frames_published > 0 {
                    log::debug!(
                        "[Syphon] {} frames ({}x{}), clients: {}, last_publish: {:.2}ms",
                        self.frames_published,
                        frame.width,
                        frame.height,
                        self.has_clients,
                        publish_time.as_secs_f64() * 1000.0
                    );
                }

                Ok(())
            }
            Err(e) => {
                // Only log errors occasionally to avoid spam
                if self.frames_published % 300 == 0 {
                    log::warn!("[Syphon] Frame publish error: {}", e);
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
            receivers: if self.active && self.has_clients {
                Some(1) // We know at least one client is connected
            } else {
                Some(0)
            },
            frames_published: self.frames_published,
            last_error: self.last_error.clone(),
        }
    }
}
