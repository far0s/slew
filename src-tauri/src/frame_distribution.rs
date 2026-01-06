//! Frame Distribution Module
//!
//! Distributes captured frames from the Renderer window to the Controls window
//! for preview display. This enables pixel-perfect preview consistency between
//! what the operator sees and what goes out to Syphon/NDI.
//!
//! ## Architecture
//!
//! - Frames are captured in the Renderer window (via VideoOutputCapture)
//! - This module receives frames and emits them as events to the Controls window
//! - The Controls window updates preview textures from received frame data
//!
//! ## Performance
//!
//! - Uses base64 encoding instead of JSON array serialization (much faster)
//! - Configurable resolution scaling to reduce bandwidth
//! - Frame rate limiting to balance quality vs performance
//!
//! ## Logging
//!
//! All logs use `[PreviewStream:Distribute]` prefix for easy filtering.

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Configuration
// ============================================================================

/// How often to log distribution stats (in frames)
const STATS_LOG_INTERVAL: u64 = 300; // ~5 seconds at 60fps

/// Enable verbose per-frame logging (for debugging)
const VERBOSE_LOGGING: bool = false;

// ============================================================================
// Types
// ============================================================================

/// Source of a frame
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrameSource {
    /// Composited output (all slots blended)
    Composited,
    /// Individual slot (0-7)
    Slot(u8),
}

impl std::fmt::Display for FrameSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FrameSource::Composited => write!(f, "composited"),
            FrameSource::Slot(idx) => write!(f, "slot-{}", idx),
        }
    }
}

/// Metadata for a distributed frame (sent as event payload)
/// Includes base64-encoded pixel data to avoid JSON array serialization overhead
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameMetadata {
    /// Frame sequence number
    pub frame_number: u64,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// Frame source
    pub source: FrameSource,
    /// Timestamp when frame was captured (ms since Unix epoch)
    pub capture_timestamp_ms: u64,
    /// Base64-encoded RGBA pixel data
    /// Using base64 is ~3x smaller than JSON array and much faster to parse
    #[serde(default)]
    pub data: String,
}

/// Event payload for frame distribution
/// Note: The actual pixel data is sent separately via binary event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameEvent {
    /// Frame metadata
    pub metadata: FrameMetadata,
    /// Size of pixel data in bytes
    pub data_size: usize,
}

/// Statistics for frame distribution
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DistributionStats {
    /// Total frames distributed
    pub frames_distributed: u64,
    /// Frames dropped (Controls couldn't keep up)
    pub frames_dropped: u64,
    /// Average distribution time in milliseconds
    pub avg_distribute_ms: f64,
    /// Current frames per second
    pub fps: f64,
}

/// Configuration for frame distribution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionConfig {
    /// Enable streaming to Controls window
    pub enabled: bool,
    /// Stream composited output
    pub stream_composited: bool,
    /// Stream individual slot frames
    pub stream_slots: bool,
    /// Target resolution scale (0.25 = 540p, 0.5 = 720p, 1.0 = 1080p)
    pub resolution_scale: f32,
    /// Target frame rate for preview streams
    pub target_fps: u32,
}

impl Default for DistributionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            stream_composited: true,
            stream_slots: false, // Disabled by default to reduce bandwidth
            resolution_scale: 0.5,
            target_fps: 30,
        }
    }
}

// ============================================================================
// Frame Distributor
// ============================================================================

/// Manages frame distribution to the Controls window
pub struct FrameDistributor {
    /// App handle for emitting events
    app_handle: RwLock<Option<AppHandle>>,
    /// Distribution configuration
    config: RwLock<DistributionConfig>,
    /// Frame counter for sequence numbers
    frame_counter: AtomicU64,
    /// Whether distribution is currently active
    active: AtomicBool,
    /// Stats tracking
    stats: RwLock<DistributorStats>,
}

/// Internal stats tracking
struct DistributorStats {
    frames_distributed: u64,
    frames_dropped: u64,
    distribute_times_ms: Vec<f64>,
    last_fps_check: Instant,
    frames_since_fps_check: u64,
    current_fps: f64,
}

impl Default for DistributorStats {
    fn default() -> Self {
        Self {
            frames_distributed: 0,
            frames_dropped: 0,
            distribute_times_ms: Vec::with_capacity(60),
            last_fps_check: Instant::now(),
            frames_since_fps_check: 0,
            current_fps: 0.0,
        }
    }
}

impl FrameDistributor {
    /// Create a new frame distributor
    pub fn new() -> Self {
        Self {
            app_handle: RwLock::new(None),
            config: RwLock::new(DistributionConfig::default()),
            frame_counter: AtomicU64::new(0),
            active: AtomicBool::new(true),
            stats: RwLock::new(DistributorStats::default()),
        }
    }

    /// Set the app handle for emitting events
    pub fn set_app_handle(&self, app: AppHandle) {
        if let Ok(mut handle) = self.app_handle.write() {
            *handle = Some(app);
            log::debug!("[PreviewStream:Distribute] App handle set");
        }
    }

    /// Update distribution configuration
    pub fn set_config(&self, config: DistributionConfig) {
        if let Ok(mut cfg) = self.config.write() {
            log::info!(
                "[PreviewStream:Distribute] Config updated: enabled={}, composited={}, slots={}, scale={}, fps={}",
                config.enabled,
                config.stream_composited,
                config.stream_slots,
                config.resolution_scale,
                config.target_fps
            );
            *cfg = config;
        }
    }

    /// Get current configuration
    pub fn get_config(&self) -> DistributionConfig {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }

    /// Enable or disable distribution
    pub fn set_enabled(&self, enabled: bool) {
        self.active.store(enabled, Ordering::SeqCst);
        log::info!(
            "[PreviewStream:Distribute] Distribution {}",
            if enabled { "enabled" } else { "disabled" }
        );
    }

    /// Check if distribution is enabled
    pub fn is_enabled(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    /// Distribute a frame to the Controls window
    ///
    /// Returns Ok(true) if frame was distributed, Ok(false) if skipped, Err on failure
    pub fn distribute_frame(
        &self,
        data: &[u8],
        width: u32,
        height: u32,
        source: FrameSource,
        capture_timestamp_ms: u64,
    ) -> Result<bool, String> {
        let start = Instant::now();

        // Check if distribution is enabled
        if !self.active.load(Ordering::SeqCst) {
            return Ok(false);
        }

        // Check config for this source type
        let config = self.config.read().map_err(|e| e.to_string())?;
        if !config.enabled {
            return Ok(false);
        }

        match source {
            FrameSource::Composited if !config.stream_composited => return Ok(false),
            FrameSource::Slot(_) if !config.stream_slots => return Ok(false),
            _ => {}
        }
        drop(config);

        // Get app handle
        let app = {
            let handle = self.app_handle.read().map_err(|e| e.to_string())?;
            match handle.as_ref() {
                Some(app) => app.clone(),
                None => return Err("App handle not set".to_string()),
            }
        };

        // Generate frame number
        let frame_number = self.frame_counter.fetch_add(1, Ordering::SeqCst);

        // Emit frame event with metadata
        // The Controls window listens for this event and updates preview textures
        let event_name = match source {
            FrameSource::Composited => "preview-frame-composited".to_string(),
            FrameSource::Slot(idx) => format!("preview-frame-slot-{}", idx),
        };

        // Encode frame data as base64 (much faster than JSON array serialization)
        // A 480x270 frame = 518KB raw, ~690KB base64 (vs 2MB+ as JSON array)
        let encoded_data = base64::engine::general_purpose::STANDARD.encode(data);

        // Create metadata with embedded data
        let metadata = FrameMetadata {
            frame_number,
            width,
            height,
            source,
            capture_timestamp_ms,
            data: encoded_data,
        };

        // Emit single event with metadata + base64 data
        // This is much more efficient than emitting Vec<u8> which becomes a JSON array
        if let Err(e) = app.emit(&event_name, &metadata) {
            log::warn!(
                "[PreviewStream:Distribute] Failed to emit frame for {}: {}",
                source,
                e
            );
            self.record_dropped_frame();
            return Err(format!("Failed to emit frame: {}", e));
        }

        let distribute_time = start.elapsed();
        let distribute_ms = distribute_time.as_secs_f64() * 1000.0;

        // Update stats
        self.record_distributed_frame(distribute_ms);

        // Verbose logging
        if VERBOSE_LOGGING {
            log::debug!(
                "[PreviewStream:Distribute] Frame {} ({}) @ {}x{}, size: {} bytes, took: {:.2}ms",
                frame_number,
                source,
                width,
                height,
                data.len(),
                distribute_ms
            );
        }

        // Periodic stats logging
        if frame_number % STATS_LOG_INTERVAL == 0 && frame_number > 0 {
            self.log_stats();
        }

        Ok(true)
    }

    /// Record a successfully distributed frame
    fn record_distributed_frame(&self, distribute_ms: f64) {
        if let Ok(mut stats) = self.stats.write() {
            stats.frames_distributed += 1;
            stats.frames_since_fps_check += 1;

            // Track distribute times (keep last 60 samples)
            stats.distribute_times_ms.push(distribute_ms);
            if stats.distribute_times_ms.len() > 60 {
                stats.distribute_times_ms.remove(0);
            }

            // Update FPS every second
            let elapsed = stats.last_fps_check.elapsed();
            if elapsed.as_secs_f64() >= 1.0 {
                stats.current_fps = stats.frames_since_fps_check as f64 / elapsed.as_secs_f64();
                stats.frames_since_fps_check = 0;
                stats.last_fps_check = Instant::now();
            }
        }
    }

    /// Record a dropped frame
    fn record_dropped_frame(&self) {
        if let Ok(mut stats) = self.stats.write() {
            stats.frames_dropped += 1;
        }
    }

    /// Log current stats
    fn log_stats(&self) {
        if let Ok(stats) = self.stats.read() {
            let avg_ms = if stats.distribute_times_ms.is_empty() {
                0.0
            } else {
                stats.distribute_times_ms.iter().sum::<f64>()
                    / stats.distribute_times_ms.len() as f64
            };

            log::info!(
                "[PreviewStream:Distribute] Stats: {} fps, avg distribute: {:.1}ms, total: {}, dropped: {}",
                stats.current_fps as u32,
                avg_ms,
                stats.frames_distributed,
                stats.frames_dropped
            );
        }
    }

    /// Get current distribution stats
    pub fn get_stats(&self) -> DistributionStats {
        self.stats
            .read()
            .map(|stats| {
                let avg_ms = if stats.distribute_times_ms.is_empty() {
                    0.0
                } else {
                    stats.distribute_times_ms.iter().sum::<f64>()
                        / stats.distribute_times_ms.len() as f64
                };

                DistributionStats {
                    frames_distributed: stats.frames_distributed,
                    frames_dropped: stats.frames_dropped,
                    avg_distribute_ms: avg_ms,
                    fps: stats.current_fps,
                }
            })
            .unwrap_or_default()
    }
}

impl Default for FrameDistributor {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Global Instance
// ============================================================================

/// Global frame distributor instance
pub static FRAME_DISTRIBUTOR: Lazy<FrameDistributor> = Lazy::new(FrameDistributor::new);

/// Initialize frame distribution with app handle
pub fn init_frame_distribution(app: AppHandle) {
    FRAME_DISTRIBUTOR.set_app_handle(app);
    log::info!("[PreviewStream:Distribute] Frame distribution initialized");
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Distribute a frame from the Renderer to Controls window
///
/// This is called from VideoOutputCapture after capturing a frame.
/// The frame data is passed via binary IPC for efficiency.
#[tauri::command]
pub fn distribute_frame(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    // Extract metadata from headers
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

    let source_str = headers
        .get("X-Source")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("composited");

    // Parse source
    let source = if source_str == "composited" {
        FrameSource::Composited
    } else if let Some(idx_str) = source_str.strip_prefix("slot-") {
        let idx: u8 = idx_str
            .parse()
            .map_err(|_| "Invalid slot index".to_string())?;
        if idx > 7 {
            return Err("Slot index must be 0-7".to_string());
        }
        FrameSource::Slot(idx)
    } else {
        return Err(format!("Unknown source: {}", source_str));
    };

    // Get raw binary data from request body
    let tauri::ipc::InvokeBody::Raw(pixel_data) = request.body() else {
        return Err("Request body must be raw binary data (Uint8Array)".to_string());
    };

    // Get timestamp
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    // Distribute the frame
    FRAME_DISTRIBUTOR.distribute_frame(pixel_data, width, height, source, timestamp_ms)
}

/// Get frame distribution configuration
#[tauri::command]
pub fn get_frame_distribution_config() -> DistributionConfig {
    FRAME_DISTRIBUTOR.get_config()
}

/// Set frame distribution configuration
#[tauri::command]
pub fn set_frame_distribution_config(config: DistributionConfig) -> Result<(), String> {
    FRAME_DISTRIBUTOR.set_config(config);
    Ok(())
}

/// Enable or disable frame distribution
#[tauri::command]
pub fn set_frame_distribution_enabled(enabled: bool) -> Result<(), String> {
    FRAME_DISTRIBUTOR.set_enabled(enabled);
    Ok(())
}

/// Get frame distribution stats
#[tauri::command]
pub fn get_frame_distribution_stats() -> DistributionStats {
    FRAME_DISTRIBUTOR.get_stats()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_source_display() {
        assert_eq!(FrameSource::Composited.to_string(), "composited");
        assert_eq!(FrameSource::Slot(0).to_string(), "slot-0");
        assert_eq!(FrameSource::Slot(7).to_string(), "slot-7");
    }

    #[test]
    fn test_default_config() {
        let config = DistributionConfig::default();
        assert!(config.enabled);
        assert!(config.stream_composited);
        assert!(!config.stream_slots);
        assert_eq!(config.resolution_scale, 0.5);
        assert_eq!(config.target_fps, 30);
    }

    #[test]
    fn test_distributor_enabled_toggle() {
        let distributor = FrameDistributor::new();
        assert!(distributor.is_enabled());

        distributor.set_enabled(false);
        assert!(!distributor.is_enabled());

        distributor.set_enabled(true);
        assert!(distributor.is_enabled());
    }

    #[test]
    fn test_distributor_config() {
        let distributor = FrameDistributor::new();
        let mut config = distributor.get_config();
        config.stream_slots = true;
        config.target_fps = 60;

        distributor.set_config(config.clone());

        let retrieved = distributor.get_config();
        assert!(retrieved.stream_slots);
        assert_eq!(retrieved.target_fps, 60);
    }
}
