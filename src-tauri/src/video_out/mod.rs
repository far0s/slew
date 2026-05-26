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

pub mod types;
pub mod backends;
pub mod manager;
pub mod commands;

// Re-export all public types
pub use types::{BackendConfig, BackendStatus, PixelFormat, VideoFrame, VideoOutputBackend};

// Re-export backends
pub use backends::NdiBackend;
#[cfg(target_os = "macos")]
pub use backends::SyphonBackend;
#[cfg(target_os = "windows")]
pub use backends::SpoutBackend;

// Re-export manager and global state
pub use manager::{VideoOutputManager, VIDEO_OUTPUT_MANAGER, init_video_output, get_available_backends};

// Re-export commands
pub use commands::{
    list_video_backends,
    get_video_backend_status,
    init_video_backend,
    shutdown_video_backend,
    publish_video_frame,
    publish_video_frame_binary,
};

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
        let decoded = commands::base64_decode_into_buffer(encoded, 11).unwrap();
        assert_eq!(decoded, b"Hello World");
    }

    #[test]
    fn test_base64_decode_with_data_url() {
        let encoded = "data:image/png;base64,SGVsbG8=";
        let decoded = commands::base64_decode_into_buffer(encoded, 5).unwrap();
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
