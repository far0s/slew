use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
