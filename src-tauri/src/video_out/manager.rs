use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter};

use super::backends::NdiBackend;
#[cfg(target_os = "macos")]
use super::backends::SyphonBackend;
#[cfg(target_os = "windows")]
use super::backends::SpoutBackend;
use super::types::{BackendConfig, BackendStatus, PixelFormat, VideoFrame, VideoOutputBackend};

// ============================================================================
// Video Output Manager
// ============================================================================

/// Manages all video output backends
pub struct VideoOutputManager {
    backends: HashMap<String, Arc<Mutex<Box<dyn VideoOutputBackend>>>>,
    app_handle: Option<AppHandle>,
}

impl VideoOutputManager {
    pub fn new() -> Self {
        let mut manager = Self {
            backends: HashMap::new(),
            app_handle: None,
        };

        // Register platform-appropriate backends
        #[cfg(target_os = "macos")]
        {
            let syphon = Box::new(SyphonBackend::new()) as Box<dyn VideoOutputBackend>;
            manager
                .backends
                .insert("syphon".to_string(), Arc::new(Mutex::new(syphon)));
        }

        #[cfg(target_os = "windows")]
        {
            let spout = Box::new(SpoutBackend::new()) as Box<dyn VideoOutputBackend>;
            manager
                .backends
                .insert("spout".to_string(), Arc::new(Mutex::new(spout)));
        }

        // NDI is cross-platform
        let ndi = Box::new(NdiBackend::new()) as Box<dyn VideoOutputBackend>;
        manager
            .backends
            .insert("ndi".to_string(), Arc::new(Mutex::new(ndi)));

        manager
    }

    /// Set the app handle for emitting events
    pub fn set_app_handle(&mut self, handle: AppHandle) {
        self.app_handle = Some(handle);
    }

    /// Get list of all available backends
    pub fn list_backends(&self) -> Vec<BackendStatus> {
        self.backends
            .values()
            .filter_map(|backend| backend.lock().ok().map(|b| b.status()))
            .collect()
    }

    /// Initialize a specific backend
    pub fn initialize_backend(
        &self,
        backend_id: &str,
        config: BackendConfig,
    ) -> Result<(), String> {
        let backend = self
            .backends
            .get(backend_id)
            .ok_or_else(|| format!("Backend '{}' not found", backend_id))?;

        let mut backend = backend
            .lock()
            .map_err(|e| format!("Failed to lock backend: {}", e))?;

        backend.initialize(&config)?;

        // Emit status change event
        if let Some(handle) = &self.app_handle {
            let _ = handle.emit("video_output_status_changed", backend.status());
        }

        Ok(())
    }

    /// Shutdown a specific backend
    pub fn shutdown_backend(&self, backend_id: &str) -> Result<(), String> {
        let backend = self
            .backends
            .get(backend_id)
            .ok_or_else(|| format!("Backend '{}' not found", backend_id))?;

        let mut backend = backend
            .lock()
            .map_err(|e| format!("Failed to lock backend: {}", e))?;

        backend.shutdown()?;

        // Emit status change event
        if let Some(handle) = &self.app_handle {
            let _ = handle.emit("video_output_status_changed", backend.status());
        }

        Ok(())
    }

    /// Publish a frame to all active backends
    pub fn publish_frame(&self, frame: &VideoFrame) -> Result<(), String> {
        let mut errors = Vec::new();

        for (id, backend) in &self.backends {
            if let Ok(mut backend) = backend.lock() {
                if backend.status().active {
                    if let Err(e) = backend.publish_frame(frame) {
                        errors.push(format!("{}: {}", id, e));
                    }
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    /// Publish raw frame data directly without creating a VideoFrame.
    /// This avoids an allocation/clone for the binary IPC path.
    pub fn publish_frame_data(
        &self,
        data: &[u8],
        width: u32,
        height: u32,
        format: PixelFormat,
    ) -> Result<(), String> {
        // Validate data size
        let expected_size = (width * height) as usize * format.bytes_per_pixel();
        if data.len() != expected_size {
            return Err(format!(
                "Frame data size mismatch: expected {} bytes, got {}",
                expected_size,
                data.len()
            ));
        }

        let mut errors = Vec::new();

        for (id, backend) in &self.backends {
            if let Ok(mut backend) = backend.lock() {
                if backend.status().active {
                    // For Syphon/NDI, we call the underlying publish directly
                    // This avoids creating a VideoFrame just to pass a reference
                    let result = match id.as_str() {
                        #[cfg(target_os = "macos")]
                        "syphon" => {
                            if format == PixelFormat::RGBA {
                                crate::syphon::publish_syphon_frame(data, width, height)
                            } else {
                                Err("Syphon requires RGBA format".to_string())
                            }
                        }
                        _ => {
                            // For other backends, create a temporary frame
                            // (NDI needs BGRA conversion anyway)
                            let frame = VideoFrame::new(data.to_vec(), width, height, format);
                            backend.publish_frame(&frame)
                        }
                    };

                    if let Err(e) = result {
                        errors.push(format!("{}: {}", id, e));
                    }
                }
            }
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join("; "))
        }
    }

    /// Publish a frame to a specific backend
    pub fn publish_frame_to(&self, backend_id: &str, frame: &VideoFrame) -> Result<(), String> {
        let backend = self
            .backends
            .get(backend_id)
            .ok_or_else(|| format!("Backend '{}' not found", backend_id))?;

        let mut backend = backend
            .lock()
            .map_err(|e| format!("Failed to lock backend: {}", e))?;

        backend.publish_frame(frame)
    }

    /// Get status of a specific backend
    pub fn get_backend_status(&self, backend_id: &str) -> Option<BackendStatus> {
        self.backends
            .get(backend_id)
            .and_then(|b| b.lock().ok())
            .map(|b| b.status())
    }
}

impl Default for VideoOutputManager {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Global State
// ============================================================================

pub static VIDEO_OUTPUT_MANAGER: Lazy<RwLock<VideoOutputManager>> =
    Lazy::new(|| RwLock::new(VideoOutputManager::new()));

/// Initialize the video output manager with the app handle
pub fn init_video_output(handle: AppHandle) {
    if let Ok(mut manager) = VIDEO_OUTPUT_MANAGER.write() {
        manager.set_app_handle(handle);

        // Log backend availability at debug level
        for status in manager.list_backends() {
            log::debug!(
                "[VideoOutput] Backend '{}' ({}): available={}",
                status.id,
                status.name,
                status.available
            );
        }
    }
}

/// Get list of available (working) video output backend names
pub fn get_available_backends() -> Vec<String> {
    if let Ok(manager) = VIDEO_OUTPUT_MANAGER.read() {
        manager
            .list_backends()
            .into_iter()
            .filter(|s| s.available)
            .map(|s| s.name)
            .collect()
    } else {
        Vec::new()
    }
}
