//! Frame distribution from Renderer to Controls window for preview streaming.

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FrameSource {
    Composited,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameMetadata {
    pub frame_number: u64,
    pub width: u32,
    pub height: u32,
    pub source: FrameSource,
    pub capture_timestamp_ms: u64,
    #[serde(default)]
    pub data: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DistributionStats {
    pub frames_distributed: u64,
    pub frames_dropped: u64,
    pub avg_distribute_ms: f64,
    pub fps: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionConfig {
    pub enabled: bool,
    pub stream_composited: bool,
    pub stream_slots: bool,
    pub resolution_scale: f32,
    pub target_fps: u32,
}

impl Default for DistributionConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            stream_composited: true,
            stream_slots: true,
            resolution_scale: 0.5,
            target_fps: 30,
        }
    }
}

struct DistributorStats {
    frames_distributed: u64,
    frames_dropped: u64,
    distribute_times_ms: Vec<f64>,
    last_fps_check: Instant,
    frames_since_fps_check: u64,
    current_fps: f64,
}

impl DistributorStats {
    fn new() -> Self {
        Self {
            frames_distributed: 0,
            frames_dropped: 0,
            distribute_times_ms: Vec::with_capacity(60),
            last_fps_check: Instant::now(),
            frames_since_fps_check: 0,
            current_fps: 0.0,
        }
    }

    fn avg_distribute_ms(&self) -> f64 {
        if self.distribute_times_ms.is_empty() {
            0.0
        } else {
            self.distribute_times_ms.iter().sum::<f64>() / self.distribute_times_ms.len() as f64
        }
    }

    fn record_distributed(&mut self, distribute_ms: f64) {
        self.frames_distributed += 1;
        self.frames_since_fps_check += 1;
        self.distribute_times_ms.push(distribute_ms);
        if self.distribute_times_ms.len() > 60 {
            self.distribute_times_ms.remove(0);
        }
        self.update_fps();
    }

    fn record_dropped(&mut self) {
        self.frames_dropped += 1;
    }

    fn update_fps(&mut self) {
        let elapsed = self.last_fps_check.elapsed();
        if elapsed.as_secs_f64() >= 1.0 {
            self.current_fps = self.frames_since_fps_check as f64 / elapsed.as_secs_f64();
            self.frames_since_fps_check = 0;
            self.last_fps_check = Instant::now();
        }
    }

    fn to_public_stats(&self) -> DistributionStats {
        DistributionStats {
            frames_distributed: self.frames_distributed,
            frames_dropped: self.frames_dropped,
            avg_distribute_ms: self.avg_distribute_ms(),
            fps: self.current_fps,
        }
    }
}

pub struct FrameDistributor {
    app_handle: RwLock<Option<AppHandle>>,
    config: RwLock<DistributionConfig>,
    frame_counter: AtomicU64,
    active: AtomicBool,
    stats: RwLock<DistributorStats>,
}

impl FrameDistributor {
    pub fn new() -> Self {
        Self {
            app_handle: RwLock::new(None),
            config: RwLock::new(DistributionConfig::default()),
            frame_counter: AtomicU64::new(0),
            active: AtomicBool::new(true),
            stats: RwLock::new(DistributorStats::new()),
        }
    }

    pub fn set_app_handle(&self, app: AppHandle) {
        if let Ok(mut handle) = self.app_handle.write() {
            *handle = Some(app);
        }
    }

    pub fn set_config(&self, config: DistributionConfig) {
        if let Ok(mut cfg) = self.config.write() {
            *cfg = config;
        }
    }

    pub fn get_config(&self) -> DistributionConfig {
        self.config.read().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.active.store(enabled, Ordering::SeqCst);
    }

    pub fn is_enabled(&self) -> bool {
        self.active.load(Ordering::SeqCst)
    }

    pub fn distribute_frame(
        &self,
        data: &[u8],
        width: u32,
        height: u32,
        source: FrameSource,
        capture_timestamp_ms: u64,
    ) -> Result<bool, String> {
        let start = Instant::now();

        if !self.active.load(Ordering::SeqCst) {
            return Ok(false);
        }

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

        let app = {
            let handle = self.app_handle.read().map_err(|e| e.to_string())?;
            handle.as_ref().cloned().ok_or("App handle not set")?
        };

        let frame_number = self.frame_counter.fetch_add(1, Ordering::SeqCst);

        // Use a single event name for all slot frames to avoid listener issues
        // The slot index is included in the payload for filtering
        let event_name = match source {
            FrameSource::Composited => "preview-frame-composited".to_string(),
            FrameSource::Slot(_) => "preview-frame-slot".to_string(),
        };

        let metadata = FrameMetadata {
            frame_number,
            width,
            height,
            source,
            capture_timestamp_ms,
            data: base64::engine::general_purpose::STANDARD.encode(data),
        };

        // Use broadcast emit for all frame types
        // Previously we tried window-specific emission for slots, but it stopped working after resize
        let emit_result = app.emit(&event_name, &metadata);

        if let Err(e) = emit_result {
            log::error!("Failed to emit frame to {}: {}", event_name, e);
            if let Ok(mut stats) = self.stats.write() {
                stats.record_dropped();
            }
            return Err(format!("Failed to emit frame: {}", e));
        }

        let distribute_ms = start.elapsed().as_secs_f64() * 1000.0;
        if let Ok(mut stats) = self.stats.write() {
            stats.record_distributed(distribute_ms);
        }

        Ok(true)
    }

    pub fn get_stats(&self) -> DistributionStats {
        self.stats
            .read()
            .map(|s| s.to_public_stats())
            .unwrap_or_default()
    }
}

impl Default for FrameDistributor {
    fn default() -> Self {
        Self::new()
    }
}

pub static FRAME_DISTRIBUTOR: Lazy<FrameDistributor> = Lazy::new(FrameDistributor::new);

pub fn init_frame_distribution(app: AppHandle) {
    FRAME_DISTRIBUTOR.set_app_handle(app);
}

#[tauri::command]
pub fn distribute_frame(request: tauri::ipc::Request<'_>) -> Result<bool, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let headers = request.headers();

    let width: u32 = headers
        .get("X-Width")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or("Missing or invalid X-Width header")?;

    let height: u32 = headers
        .get("X-Height")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .ok_or("Missing or invalid X-Height header")?;

    let source_str = headers
        .get("X-Source")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("composited");

    let source = if source_str == "composited" {
        FrameSource::Composited
    } else if let Some(idx_str) = source_str.strip_prefix("slot-") {
        let idx: u8 = idx_str.parse().map_err(|_| "Invalid slot index")?;
        if idx > 7 {
            return Err("Slot index must be 0-7".to_string());
        }
        FrameSource::Slot(idx)
    } else {
        return Err(format!("Unknown source: {}", source_str));
    };

    let tauri::ipc::InvokeBody::Raw(pixel_data) = request.body() else {
        return Err("Request body must be raw binary data".to_string());
    };

    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    FRAME_DISTRIBUTOR.distribute_frame(pixel_data, width, height, source, timestamp_ms)
}

#[tauri::command]
pub fn get_frame_distribution_config() -> DistributionConfig {
    FRAME_DISTRIBUTOR.get_config()
}

#[tauri::command]
pub fn set_frame_distribution_config(config: DistributionConfig) -> Result<(), String> {
    FRAME_DISTRIBUTOR.set_config(config);
    Ok(())
}

#[tauri::command]
pub fn set_frame_distribution_enabled(enabled: bool) -> Result<(), String> {
    FRAME_DISTRIBUTOR.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn get_frame_distribution_stats() -> DistributionStats {
    FRAME_DISTRIBUTOR.get_stats()
}

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
        assert!(config.stream_slots);
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
        distributor.set_config(config);

        let retrieved = distributor.get_config();
        assert!(retrieved.stream_slots);
        assert_eq!(retrieved.target_fps, 60);
    }
}
