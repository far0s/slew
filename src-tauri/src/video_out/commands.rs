use std::collections::HashMap;

use super::manager::VIDEO_OUTPUT_MANAGER;
use super::types::{BackendConfig, BackendStatus, PixelFormat, VideoFrame};

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
pub(super) fn base64_decode_into_buffer(input: &str, expected_size: usize) -> Result<Vec<u8>, String> {
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
