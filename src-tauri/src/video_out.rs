//! Video Output Module
//!
//! Provides a trait-based plugin system for sharing rendered frames
//! with external applications via Syphon (macOS), Spout (Windows), or NDI (cross-platform).
//!
//! ## Architecture
//!
//! - `VideoOutputBackend` trait defines the interface all backends implement
//! - `VideoOutputManager` manages active backends and frame publishing
//! - Frame data flows: Renderer → Tauri command → Backend → External app
//!
//! ## Supported Backends
//!
//! - **Syphon** (macOS): GPU texture sharing with Resolume, VDMX, OBS
//! - **Spout** (Windows): GPU texture sharing with Resolume, TouchDesigner
//! - **NDI** (Cross-platform): Network-based video streaming
//!
//! ## Binary IPC
//!
//! For optimal performance, use `publish_video_frame_binary` which accepts raw
//! pixel data via `tauri::ipc::Request`, bypassing JSON serialization entirely.

#[cfg(target_os = "macos")]
use crate::syphon;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Emitter};

// ============================================================================
// Types & Traits
// ============================================================================

/// Pixel format for frame data
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PixelFormat {
    /// 8-bit RGBA (4 bytes per pixel)
    RGBA,
    /// 8-bit BGRA (4 bytes per pixel) — native for some backends
    BGRA,
    /// 8-bit RGB (3 bytes per pixel)
    RGB,
}

impl PixelFormat {
    /// Bytes per pixel for this format
    pub fn bytes_per_pixel(&self) -> usize {
        match self {
            PixelFormat::RGBA | PixelFormat::BGRA => 4,
            PixelFormat::RGB => 3,
        }
    }
}

/// A video frame ready for publishing
#[derive(Debug, Clone)]
pub struct VideoFrame {
    /// Raw pixel data
    pub data: Vec<u8>,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// Pixel format
    pub format: PixelFormat,
    /// Frame timestamp in milliseconds (optional)
    pub timestamp_ms: Option<u64>,
}

impl VideoFrame {
    /// Create a new video frame
    pub fn new(data: Vec<u8>, width: u32, height: u32, format: PixelFormat) -> Self {
        Self {
            data,
            width,
            height,
            format,
            timestamp_ms: None,
        }
    }

    /// Validate that the frame data matches the expected size
    pub fn validate(&self) -> Result<(), String> {
        let expected_size =
            self.width as usize * self.height as usize * self.format.bytes_per_pixel();
        if self.data.len() != expected_size {
            return Err(format!(
                "Frame data size mismatch: expected {} bytes, got {}",
                expected_size,
                self.data.len()
            ));
        }
        Ok(())
    }
}

/// Configuration for a video output backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// Display name for the output (shown in receiving applications)
    pub name: String,
    /// Backend-specific settings
    #[serde(default)]
    pub settings: HashMap<String, String>,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            name: "Slew".to_string(),
            settings: HashMap::new(),
        }
    }
}

/// Status of a video output backend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendStatus {
    /// Backend identifier
    pub id: String,
    /// Human-readable backend name
    pub name: String,
    /// Whether the backend is currently active
    pub active: bool,
    /// Whether the backend is available on this platform
    pub available: bool,
    /// Number of connected receivers (if known)
    pub receivers: Option<u32>,
    /// Frames published since activation
    pub frames_published: u64,
    /// Last error message (if any)
    pub last_error: Option<String>,
}

/// Trait that all video output backends must implement
pub trait VideoOutputBackend: Send + Sync {
    /// Unique identifier for this backend (e.g., "syphon", "spout", "ndi")
    fn id(&self) -> &str;

    /// Human-readable name for this backend
    fn name(&self) -> &str;

    /// Whether this backend is available on the current platform
    fn is_available(&self) -> bool;

    /// Initialize the backend with the given configuration
    fn initialize(&mut self, config: &BackendConfig) -> Result<(), String>;

    /// Shut down the backend and release resources
    fn shutdown(&mut self) -> Result<(), String>;

    /// Publish a video frame
    fn publish_frame(&mut self, frame: &VideoFrame) -> Result<(), String>;

    /// Get the current status of this backend
    fn status(&self) -> BackendStatus;
}

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

// ============================================================================
// Spout Backend (Windows) — Stub
// ============================================================================

/// Spout video output backend for Windows
///
/// Uses the Spout library to share textures with other applications.
/// Currently a stub implementation — full implementation requires Windows testing.
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
        // Spout is always available on Windows
        true
    }

    fn initialize(&mut self, config: &BackendConfig) -> Result<(), String> {
        // TODO: Create Spout sender
        self.config = Some(config.clone());
        self.active = true;
        self.frames_published = 0;
        self.last_error = None;

        log::debug!("[Spout] Started '{}' (stub)", config.name);
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        self.active = false;
        self.config = None;
        Ok(())
    }

    fn publish_frame(&mut self, frame: &VideoFrame) -> Result<(), String> {
        if !self.active {
            return Err("Spout backend is not active".to_string());
        }

        frame.validate()?;
        self.frames_published += 1;

        // Stub: Just count frames
        if self.frames_published % 300 == 0 {
            log::debug!("[Spout] Stub: {} frames received", self.frames_published);
        }

        Ok(())
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

// ============================================================================
// NDI Backend (Cross-platform)
// ============================================================================

// When the `ndi` feature is enabled, use the real implementation
#[cfg(feature = "ndi")]
mod ndi_impl {
    use super::*;

    /// Wrapper that owns NDI runtime and Sender together to handle lifetimes.
    /// The Sender borrows from NDI, so we use Box::leak to give NDI a 'static lifetime,
    /// then clean up properly in Drop.
    struct NdiContext {
        /// Leaked NDI instance (we clean it up in Drop)
        ndi: &'static grafton_ndi::NDI,
        /// Sender with 'static lifetime (since ndi is 'static)
        sender: grafton_ndi::Sender<'static>,
    }

    impl NdiContext {
        fn new(name: &str) -> Result<Self, String> {
            // Create NDI and leak it to get 'static lifetime
            let ndi =
                grafton_ndi::NDI::new().map_err(|e| format!("Failed to initialize NDI: {}", e))?;
            let ndi_static: &'static grafton_ndi::NDI = Box::leak(Box::new(ndi));

            // Log NDI version
            if let Ok(version) = grafton_ndi::NDI::version() {
                log::debug!("[NDI] SDK version: {}", version);
            }

            // Create sender options
            let send_options = grafton_ndi::SenderOptions::builder(name)
                .clock_video(true) // Let NDI handle frame timing
                .build();

            // Create the sender
            let sender = grafton_ndi::Sender::new(ndi_static, &send_options)
                .map_err(|e| format!("Failed to create NDI sender: {}", e))?;

            // Log the source name
            if let Ok(source_name) = sender.source() {
                log::debug!("[NDI] Created sender: {}", source_name);
            }

            Ok(Self {
                ndi: ndi_static,
                sender,
            })
        }

        fn send_video(&self, frame: &grafton_ndi::VideoFrame) {
            self.sender.send_video(frame);
        }
    }

    impl Drop for NdiContext {
        fn drop(&mut self) {
            // Convert the leaked reference back to a Box so it gets dropped
            // SAFETY: We created this via Box::leak in new(), and we're the only owner
            unsafe {
                let _ = Box::from_raw(self.ndi as *const grafton_ndi::NDI as *mut grafton_ndi::NDI);
            }
        }
    }

    /// NDI video output backend
    ///
    /// Uses the NDI SDK via grafton-ndi to stream video over the network.
    /// Requires the NDI SDK to be installed on the system.
    pub struct NdiBackend {
        config: Option<BackendConfig>,
        active: bool,
        frames_published: u64,
        last_error: Option<String>,
        /// NDI context (owns both NDI runtime and Sender)
        context: Option<NdiContext>,
        /// Reusable buffer for RGBA→BGRA conversion
        bgra_buffer: Vec<u8>,
    }

    impl NdiBackend {
        pub fn new() -> Self {
            Self {
                config: None,
                active: false,
                frames_published: 0,
                last_error: None,
                context: None,
                bgra_buffer: Vec::new(),
            }
        }

        /// Check if NDI SDK is available on this system
        fn check_ndi_available() -> bool {
            // Try to initialize NDI to check if SDK is present
            // Note: We don't log here because this is called frequently
            grafton_ndi::NDI::new().is_ok()
        }

        /// Convert RGBA to BGRA in-place in the buffer
        fn rgba_to_bgra(rgba: &[u8], bgra: &mut Vec<u8>) {
            bgra.clear();
            bgra.reserve(rgba.len());

            for chunk in rgba.chunks_exact(4) {
                bgra.push(chunk[2]); // B (was R)
                bgra.push(chunk[1]); // G
                bgra.push(chunk[0]); // R (was B)
                bgra.push(chunk[3]); // A
            }
        }
    }

    impl Default for NdiBackend {
        fn default() -> Self {
            Self::new()
        }
    }

    impl VideoOutputBackend for NdiBackend {
        fn id(&self) -> &str {
            "ndi"
        }

        fn name(&self) -> &str {
            "NDI"
        }

        fn is_available(&self) -> bool {
            Self::check_ndi_available()
        }

        fn initialize(&mut self, config: &BackendConfig) -> Result<(), String> {
            if !self.is_available() {
                return Err(
                    "NDI SDK is not installed. Please install the NDI SDK from https://ndi.video/type/developer/"
                        .to_string(),
                );
            }

            log::debug!("[NDI] Initializing with name: {}", config.name);

            // Create the NDI context (owns both NDI and Sender)
            let context = NdiContext::new(&config.name)?;

            self.context = Some(context);
            self.config = Some(config.clone());
            self.active = true;
            self.frames_published = 0;
            self.last_error = None;

            log::info!("[NDI] Started '{}'", config.name);
            Ok(())
        }

        fn shutdown(&mut self) -> Result<(), String> {
            // Drop context (this will properly clean up NDI and Sender)
            self.context = None;
            self.active = false;
            self.config = None;
            self.bgra_buffer.clear();

            log::info!("[NDI] Stopped");
            Ok(())
        }

        fn publish_frame(&mut self, frame: &VideoFrame) -> Result<(), String> {
            if !self.active {
                return Err("NDI backend is not active".to_string());
            }

            let context = self.context.as_ref().ok_or("NDI context not initialized")?;

            frame.validate()?;

            // Convert RGBA to BGRA if needed (NDI prefers BGRA)
            match frame.format {
                PixelFormat::RGBA => {
                    Self::rgba_to_bgra(&frame.data, &mut self.bgra_buffer);
                }
                PixelFormat::BGRA => {
                    self.bgra_buffer.clear();
                    self.bgra_buffer.extend_from_slice(&frame.data);
                }
                PixelFormat::RGB => {
                    // Convert RGB to BGRA
                    self.bgra_buffer.clear();
                    self.bgra_buffer.reserve(frame.data.len() / 3 * 4);
                    for chunk in frame.data.chunks_exact(3) {
                        self.bgra_buffer.push(chunk[2]); // B
                        self.bgra_buffer.push(chunk[1]); // G
                        self.bgra_buffer.push(chunk[0]); // R
                        self.bgra_buffer.push(255); // A
                    }
                }
            };

            // Create an owned VideoFrame for synchronous send
            // Using 30fps as default frame rate (30000/1001 for NTSC compatibility)
            let mut ndi_frame = grafton_ndi::VideoFrame::builder()
                .resolution(frame.width as i32, frame.height as i32)
                .pixel_format(grafton_ndi::PixelFormat::BGRA)
                .frame_rate(30000, 1001) // 29.97 fps
                .build()
                .map_err(|e| format!("Failed to create NDI frame: {}", e))?;

            // Copy our pixel data into the NDI frame's data field (it's public)
            if ndi_frame.data.len() == self.bgra_buffer.len() {
                ndi_frame.data.copy_from_slice(&self.bgra_buffer);
            } else {
                return Err(format!(
                    "NDI frame buffer size mismatch: expected {}, got {}",
                    self.bgra_buffer.len(),
                    ndi_frame.data.len()
                ));
            }

            // Send synchronously (NDI handles timing due to clock_video=true)
            context.send_video(&ndi_frame);

            self.frames_published += 1;

            // Log periodic stats
            // Log stats every ~30 seconds at 60fps
            if self.frames_published % 1800 == 0 && self.frames_published > 0 {
                log::debug!(
                    "[NDI] {} frames ({}x{})",
                    self.frames_published,
                    frame.width,
                    frame.height
                );
            }

            Ok(())
        }

        fn status(&self) -> BackendStatus {
            BackendStatus {
                id: self.id().to_string(),
                name: self.name().to_string(),
                active: self.active,
                available: self.is_available(),
                receivers: None, // NDI doesn't easily expose receiver count
                frames_published: self.frames_published,
                last_error: self.last_error.clone(),
            }
        }
    }
}

// When the `ndi` feature is NOT enabled, use a stub implementation
#[cfg(not(feature = "ndi"))]
mod ndi_impl {
    use super::*;

    /// NDI video output backend (stub)
    ///
    /// This is a stub implementation when the `ndi` feature is not enabled.
    /// Enable the feature with `cargo build --features ndi` and install the NDI SDK.
    pub struct NdiBackend {
        config: Option<BackendConfig>,
        active: bool,
        frames_published: u64,
        last_error: Option<String>,
    }

    impl NdiBackend {
        pub fn new() -> Self {
            Self {
                config: None,
                active: false,
                frames_published: 0,
                last_error: None,
            }
        }
    }

    impl Default for NdiBackend {
        fn default() -> Self {
            Self::new()
        }
    }

    impl VideoOutputBackend for NdiBackend {
        fn id(&self) -> &str {
            "ndi"
        }

        fn name(&self) -> &str {
            "NDI"
        }

        fn is_available(&self) -> bool {
            // NDI feature not enabled
            false
        }

        fn initialize(&mut self, _config: &BackendConfig) -> Result<(), String> {
            Err("NDI support is not enabled. Rebuild with `cargo build --features ndi` and install the NDI SDK.".to_string())
        }

        fn shutdown(&mut self) -> Result<(), String> {
            self.active = false;
            self.config = None;
            Ok(())
        }

        fn publish_frame(&mut self, _frame: &VideoFrame) -> Result<(), String> {
            Err("NDI backend is not available".to_string())
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
}

// Re-export the appropriate implementation
pub use ndi_impl::NdiBackend;

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

// ============================================================================
// Tauri Commands
// ============================================================================

/// List all video output backends and their status
#[tauri::command]
pub fn list_video_backends() -> Result<Vec<BackendStatus>, String> {
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;
    Ok(manager.list_backends())
}

/// Get status of a specific backend
#[tauri::command]
pub fn get_video_backend_status(backend_id: String) -> Result<BackendStatus, String> {
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;
    manager
        .get_backend_status(&backend_id)
        .ok_or_else(|| format!("Backend '{}' not found", backend_id))
}

/// Initialize a video output backend
#[tauri::command]
pub fn init_video_backend(backend_id: String, name: String) -> Result<BackendStatus, String> {
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;

    let config = BackendConfig {
        name,
        settings: HashMap::new(),
    };

    manager.initialize_backend(&backend_id, config)?;

    manager
        .get_backend_status(&backend_id)
        .ok_or_else(|| format!("Backend '{}' not found after init", backend_id))
}

/// Shutdown a video output backend
#[tauri::command]
pub fn shutdown_video_backend(backend_id: String) -> Result<BackendStatus, String> {
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;

    manager.shutdown_backend(&backend_id)?;

    manager
        .get_backend_status(&backend_id)
        .ok_or_else(|| format!("Backend '{}' not found after shutdown", backend_id))
}

// Thread-local pre-allocated buffer for base64 decoding to avoid allocations
thread_local! {
    static DECODE_BUFFER: std::cell::RefCell<Vec<u8>> = std::cell::RefCell::new(Vec::with_capacity(1920 * 1080 * 4));
    static FRAME_COUNTER: std::cell::Cell<u64> = const { std::cell::Cell::new(0) };
}

/// Publish a video frame from the renderer
///
/// This command receives base64-encoded frame data from the frontend.
/// The renderer should capture the WebGL canvas and send it here.
#[tauri::command]
pub fn publish_video_frame(
    data: String,
    width: u32,
    height: u32,
    format: String,
) -> Result<(), String> {
    use std::time::Instant;

    let total_start = Instant::now();

    // Parse pixel format first to calculate expected size
    let pixel_format = match format.to_lowercase().as_str() {
        "rgba" => PixelFormat::RGBA,
        "bgra" => PixelFormat::BGRA,
        "rgb" => PixelFormat::RGB,
        _ => return Err(format!("Unknown pixel format: {}", format)),
    };

    let expected_size = (width * height) as usize * pixel_format.bytes_per_pixel();

    // Decode base64 data into pre-allocated buffer
    let decode_start = Instant::now();
    let decoded = base64_decode_into_buffer(&data, expected_size)?;
    let decode_time = decode_start.elapsed();

    // Create frame (takes ownership of the decoded data)
    let frame = VideoFrame::new(decoded, width, height, pixel_format);

    // Publish to all active backends
    let publish_start = Instant::now();
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;

    let result = manager.publish_frame(&frame);
    let publish_time = publish_start.elapsed();

    let total_time = total_start.elapsed();

    // Log timing every ~5 seconds at 60fps (every 300 frames)
    FRAME_COUNTER.with(|counter| {
        let count = counter.get() + 1;
        counter.set(count);

        if count % 300 == 0 {
            log::info!(
                "[VideoOut] Backend timing @ {}x{}: decode={:.2}ms, publish={:.2}ms, total={:.2}ms",
                width,
                height,
                decode_time.as_secs_f64() * 1000.0,
                publish_time.as_secs_f64() * 1000.0,
                total_time.as_secs_f64() * 1000.0,
            );
        }
    });

    result
}

/// Publish a video frame using raw binary data (no base64 encoding).
/// This is the high-performance path that bypasses JSON serialization.
///
/// Frontend usage:
/// ```typescript
/// import { invoke } from '@tauri-apps/api/core';
/// await invoke('publish_video_frame_binary', pixelData, {
///   headers: { 'X-Width': '960', 'X-Height': '540', 'X-Format': 'rgba' }
/// });
/// ```
#[tauri::command]
pub fn publish_video_frame_binary(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    // Extract dimensions from headers
    let headers = request.headers();

    let width: u32 = headers
        .get("X-Width")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "Missing or invalid X-Width header".to_string())?;

    let height: u32 = headers
        .get("X-Height")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or_else(|| "Missing or invalid X-Height header".to_string())?;

    let format = headers
        .get("X-Format")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("rgba");

    // Parse pixel format
    let pixel_format = match format.to_lowercase().as_str() {
        "rgba" => PixelFormat::RGBA,
        "bgra" => PixelFormat::BGRA,
        "rgb" => PixelFormat::RGB,
        _ => return Err(format!("Unknown pixel format: {}", format)),
    };

    // Get raw binary data from request body
    let tauri::ipc::InvokeBody::Raw(pixel_data) = request.body() else {
        return Err("Request body must be raw binary data (Uint8Array)".to_string());
    };

    // Validate data size
    let expected_size = (width * height) as usize * pixel_format.bytes_per_pixel();
    if pixel_data.len() != expected_size {
        return Err(format!(
            "Data size mismatch: expected {} bytes, got {}",
            expected_size,
            pixel_data.len()
        ));
    }

    // Publish directly from the slice to avoid cloning ~1.7MB per frame
    let manager = VIDEO_OUTPUT_MANAGER
        .read()
        .map_err(|e| format!("Failed to read video output manager: {}", e))?;

    let result = manager.publish_frame_data(pixel_data, width, height, pixel_format);

    result
}

/// Decode base64 string into a pre-allocated buffer to minimize allocations.
/// Uses decode_slice_unchecked for better performance when we know the expected size.
fn base64_decode_into_buffer(input: &str, expected_size: usize) -> Result<Vec<u8>, String> {
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;

    // Remove any data URL prefix if present
    let input = if let Some(idx) = input.find(',') {
        &input[idx + 1..]
    } else {
        input
    };

    // Use thread-local buffer to avoid repeated allocations
    DECODE_BUFFER.with(|buf| {
        let mut buffer = buf.borrow_mut();

        // Ensure buffer is large enough
        let current_capacity = buffer.capacity();
        if current_capacity < expected_size {
            buffer.reserve(expected_size - current_capacity);
        }

        // Resize to expected size (fills with zeros, but we'll overwrite)
        buffer.resize(expected_size, 0);

        // Decode directly into buffer
        match STANDARD.decode_slice(input, &mut buffer[..]) {
            Ok(written) => {
                if written != expected_size {
                    return Err(format!(
                        "Decoded size mismatch: expected {}, got {}",
                        expected_size, written
                    ));
                }
                // Clone the data out of the thread-local buffer
                // (We have to clone because the buffer is reused)
                Ok(buffer[..written].to_vec())
            }
            Err(e) => Err(format!("Base64 decode error: {}", e)),
        }
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pixel_format_bytes_per_pixel() {
        assert_eq!(PixelFormat::RGBA.bytes_per_pixel(), 4);
        assert_eq!(PixelFormat::BGRA.bytes_per_pixel(), 4);
        assert_eq!(PixelFormat::RGB.bytes_per_pixel(), 3);
    }

    #[test]
    fn test_video_frame_validation() {
        // Valid frame
        let frame = VideoFrame::new(vec![0u8; 16], 2, 2, PixelFormat::RGBA);
        assert!(frame.validate().is_ok());

        // Invalid frame (wrong size)
        let frame = VideoFrame::new(vec![0u8; 10], 2, 2, PixelFormat::RGBA);
        assert!(frame.validate().is_err());
    }

    #[test]
    fn test_base64_decode() {
        let encoded = "SGVsbG8gV29ybGQ="; // "Hello World"
        let decoded = base64_decode_into_buffer(encoded, 11).unwrap();
        assert_eq!(decoded, b"Hello World");
    }

    #[test]
    fn test_base64_decode_with_data_url() {
        let encoded = "data:image/png;base64,SGVsbG8=";
        let decoded = base64_decode_into_buffer(encoded, 5).unwrap();
        assert_eq!(decoded, b"Hello");
    }

    #[test]
    fn test_video_output_manager_creation() {
        let manager = VideoOutputManager::new();
        let backends = manager.list_backends();

        // Should have at least NDI (cross-platform)
        assert!(backends.iter().any(|b| b.id == "ndi"));

        // On macOS, should have Syphon
        #[cfg(target_os = "macos")]
        assert!(backends.iter().any(|b| b.id == "syphon"));

        // On Windows, should have Spout
        #[cfg(target_os = "windows")]
        assert!(backends.iter().any(|b| b.id == "spout"));
    }
}
