// ============================================================================
// NDI Backend (Cross-platform)
// ============================================================================

// When the `ndi` feature is enabled, use the real implementation
#[cfg(feature = "ndi")]
mod ndi_impl {
    use super::super::super::types::{
        BackendConfig, BackendStatus, PixelFormat, VideoFrame, VideoOutputBackend,
    };

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
    use super::super::super::types::{
        BackendConfig, BackendStatus, VideoFrame, VideoOutputBackend,
    };

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
