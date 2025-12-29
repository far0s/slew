//! Audio Input Engine
//!
//! Provides audio device enumeration, capture, FFT analysis, and
//! extraction of audio-reactive features (RMS, frequency bands, beat detection).
//! Also supports mapping audio sources to parameters for reactive visuals.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig};
use once_cell::sync::Lazy;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Emitter, Manager};

// ============================================================================
// Constants
// ============================================================================

/// Interval for polling device list changes (in milliseconds)
const DEVICE_POLL_INTERVAL_MS: u64 = 2000;

// ============================================================================
// Types
// ============================================================================

/// Information about an available audio input device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceInfo {
    /// Device name
    pub name: String,
    /// Whether this is the default input device
    pub is_default: bool,
    /// Whether this device is currently active
    pub is_active: bool,
}

/// Audio analysis results emitted periodically.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioLevels {
    /// RMS (root mean square) loudness, normalized 0-1
    pub rms: f64,
    /// Peak amplitude, normalized 0-1
    pub peak: f64,
    /// Frequency bands (bass, low-mid, high-mid, treble), each 0-1
    pub bands: AudioBands,
    /// Beat detection flag (true if beat detected this frame)
    pub beat: bool,
    /// Timestamp in milliseconds
    pub timestamp: u64,
}

/// Frequency band energy levels.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioBands {
    /// Bass (20-250 Hz)
    pub bass: f64,
    /// Low-mid (250-500 Hz)
    pub low_mid: f64,
    /// High-mid (500-2000 Hz)
    pub high_mid: f64,
    /// Treble (2000-20000 Hz)
    pub treble: f64,
}

impl Default for AudioBands {
    fn default() -> Self {
        Self {
            bass: 0.0,
            low_mid: 0.0,
            high_mid: 0.0,
            treble: 0.0,
        }
    }
}

/// Status of the audio engine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioStatus {
    /// Whether audio capture is currently running
    pub is_running: bool,
    /// Name of the active device (if running)
    pub device_name: Option<String>,
    /// Sample rate in Hz (if running)
    pub sample_rate: Option<u32>,
    /// Error message if capture failed
    pub error: Option<String>,
}

/// Audio source that can be mapped to a parameter.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    /// RMS amplitude (0-1)
    Rms,
    /// Peak amplitude (0-1)
    Peak,
    /// Bass frequency band (0-1)
    Bass,
    /// Low-mid frequency band (0-1)
    LowMid,
    /// High-mid frequency band (0-1)
    HighMid,
    /// Treble frequency band (0-1)
    Treble,
    /// Beat detection (triggers on beat)
    Beat,
}

impl AudioSource {
    /// Get all available audio sources.
    pub fn all() -> &'static [AudioSource] {
        &[
            AudioSource::Rms,
            AudioSource::Peak,
            AudioSource::Bass,
            AudioSource::LowMid,
            AudioSource::HighMid,
            AudioSource::Treble,
            AudioSource::Beat,
        ]
    }

    /// Get the current value from audio levels.
    pub fn get_value(&self, levels: &AudioLevels) -> f64 {
        match self {
            AudioSource::Rms => levels.rms,
            AudioSource::Peak => levels.peak,
            AudioSource::Bass => levels.bands.bass,
            AudioSource::LowMid => levels.bands.low_mid,
            AudioSource::HighMid => levels.bands.high_mid,
            AudioSource::Treble => levels.bands.treble,
            AudioSource::Beat => {
                if levels.beat {
                    1.0
                } else {
                    0.0
                }
            }
        }
    }
}

/// Mode for how audio values are applied to parameters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioMappingMode {
    /// Direct continuous mapping (source value → parameter value)
    Continuous,
    /// Trigger mode: set to max_output on beat, stays there until next update
    Trigger,
    /// Add mode: add scaled value to parameter's current value
    Add,
}

impl Default for AudioMappingMode {
    fn default() -> Self {
        AudioMappingMode::Continuous
    }
}

/// An audio mapping that routes an audio source to a parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioMapping {
    /// Unique ID for this mapping
    pub id: String,
    /// Audio source (rms, bass, beat, etc.)
    pub source: AudioSource,
    /// Target parameter ID
    pub parameter_id: String,
    /// Minimum input value (maps to min_output)
    pub min_input: f64,
    /// Maximum input value (maps to max_output)
    pub max_input: f64,
    /// Minimum output value
    pub min_output: f64,
    /// Maximum output value
    pub max_output: f64,
    /// Mapping mode (continuous, trigger, add)
    pub mode: AudioMappingMode,
    /// Smoothing factor (0-1, 0=instant, higher=smoother)
    pub smoothing: f64,
    /// Whether this mapping is currently enabled
    pub enabled: bool,
}

impl Default for AudioMapping {
    fn default() -> Self {
        Self {
            id: String::new(),
            source: AudioSource::Rms,
            parameter_id: String::new(),
            min_input: 0.0,
            max_input: 1.0,
            min_output: 0.0,
            max_output: 1.0,
            mode: AudioMappingMode::Continuous,
            smoothing: 0.0,
            enabled: true,
        }
    }
}

// ============================================================================
// Constants
// ============================================================================

/// FFT size (must be power of 2)
const FFT_SIZE: usize = 2048;

/// Analysis rate in Hz (how often we emit AudioLevels)
const ANALYSIS_RATE_HZ: f64 = 60.0;

/// Beat detection threshold multiplier (relative to recent average)
const BEAT_THRESHOLD: f64 = 1.5;

/// Beat detection cooldown in samples
const BEAT_COOLDOWN_SAMPLES: usize = 8000; // ~180ms at 44.1kHz

// ============================================================================
// Global State
// ============================================================================

/// Audio buffer for accumulating samples before FFT
struct AudioBuffer {
    samples: Vec<f32>,
    sample_rate: u32,
}

impl AudioBuffer {
    fn new(sample_rate: u32) -> Self {
        Self {
            samples: Vec::with_capacity(FFT_SIZE * 2),
            sample_rate,
        }
    }

    fn push_samples(&mut self, data: &[f32]) {
        self.samples.extend_from_slice(data);
        // Keep only the most recent samples we need
        if self.samples.len() > FFT_SIZE * 4 {
            self.samples.drain(0..(self.samples.len() - FFT_SIZE * 2));
        }
    }

    fn get_analysis_window(&self) -> Option<Vec<f32>> {
        if self.samples.len() >= FFT_SIZE {
            Some(self.samples[self.samples.len() - FFT_SIZE..].to_vec())
        } else {
            None
        }
    }
}

/// Beat detection state
struct BeatDetector {
    /// Recent bass energy history for adaptive threshold
    history: Vec<f64>,
    /// Samples since last beat
    cooldown: usize,
}

impl BeatDetector {
    fn new() -> Self {
        Self {
            history: Vec::with_capacity(64),
            cooldown: 0,
        }
    }

    fn update(&mut self, bass_energy: f64, samples_processed: usize) -> bool {
        // Update cooldown
        if self.cooldown > 0 {
            self.cooldown = self.cooldown.saturating_sub(samples_processed);
        }

        // Add to history
        self.history.push(bass_energy);
        if self.history.len() > 64 {
            self.history.remove(0);
        }

        // Calculate average
        let avg = if self.history.is_empty() {
            0.0
        } else {
            self.history.iter().sum::<f64>() / self.history.len() as f64
        };

        // Detect beat
        let is_beat = self.cooldown == 0 && bass_energy > avg * BEAT_THRESHOLD && bass_energy > 0.1;

        if is_beat {
            self.cooldown = BEAT_COOLDOWN_SAMPLES;
        }

        is_beat
    }
}

/// Global audio engine state
struct AudioEngineState {
    /// cpal host
    host: Host,
    /// Currently active stream (kept alive to maintain capture)
    #[allow(dead_code)]
    stream: Option<Stream>,
    /// Audio buffer shared with the stream callback
    buffer: Arc<Mutex<Option<AudioBuffer>>>,
    /// Beat detector
    beat_detector: Arc<Mutex<BeatDetector>>,
    /// FFT planner
    fft_planner: Arc<Mutex<FftPlanner<f32>>>,
    /// Current status
    status: AudioStatus,
    /// App handle for emitting events
    app_handle: Option<AppHandle>,
    /// Last analysis time for rate limiting

    /// Audio → parameter mappings
    mappings: Vec<AudioMapping>,
    /// Smoothed values for each mapping (by mapping ID)
    smoothed_values: HashMap<String, f64>,
    /// Previously known device names (for hot-plug detection)
    known_device_names: HashSet<String>,
    /// Device name that was active before disconnect (for auto-reconnect)
    last_active_device: Option<String>,
    /// Whether auto-reconnect is enabled
    auto_reconnect_enabled: bool,
}

impl AudioEngineState {
    fn new() -> Self {
        Self {
            host: cpal::default_host(),
            stream: None,
            buffer: Arc::new(Mutex::new(None)),
            beat_detector: Arc::new(Mutex::new(BeatDetector::new())),
            fft_planner: Arc::new(Mutex::new(FftPlanner::new())),
            status: AudioStatus {
                is_running: false,
                device_name: None,
                sample_rate: None,
                error: None,
            },
            app_handle: None,
            mappings: Vec::new(),
            smoothed_values: HashMap::new(),
            known_device_names: HashSet::new(),
            last_active_device: None,
            auto_reconnect_enabled: true,
        }
    }
}

// Note: Stream is not Send, but we manage it carefully
unsafe impl Send for AudioEngineState {}

static AUDIO_ENGINE: Lazy<Arc<Mutex<AudioEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(AudioEngineState::new())));

/// Helper to access the audio engine state
fn with_audio_engine<T, F: FnOnce(&mut AudioEngineState) -> T>(f: F) -> T {
    let mut state = AUDIO_ENGINE.lock().unwrap();
    f(&mut state)
}

// ============================================================================
// Initialization
// ============================================================================

/// Initialize the audio engine with an app handle for event emission.
pub fn init_audio_engine(app_handle: AppHandle) {
    // Load mappings from disk
    load_mappings_from_disk(&app_handle);

    with_audio_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    // Initialize known devices list
    if let Ok(devices) = list_devices() {
        with_audio_engine(|state| {
            state.known_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
    }

    // Start the analysis loop
    start_analysis_loop();

    // Start device watcher thread
    start_device_watcher_thread();

    log::debug!("[Audio] Engine initialized with hot-plug detection");
}

/// Start the background thread that polls for device changes.
fn start_device_watcher_thread() {
    let engine = AUDIO_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[Audio] Device watcher thread started");

        loop {
            thread::sleep(Duration::from_millis(DEVICE_POLL_INTERVAL_MS));

            // Get current device list
            let current_devices = match list_devices_internal(&engine) {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[Audio] Device enumeration error: {}", e);
                    continue;
                }
            };

            let current_names: HashSet<String> =
                current_devices.iter().map(|d| d.name.clone()).collect();

            // Get previous state
            let (
                previous_names,
                active_device_name,
                auto_reconnect_enabled,
                is_running,
                app_handle,
            ) = {
                let state = engine.lock().unwrap();
                (
                    state.known_device_names.clone(),
                    state.status.device_name.clone(),
                    state.auto_reconnect_enabled,
                    state.status.is_running,
                    state.app_handle.clone(),
                )
            };

            // Detect changes
            let added: Vec<String> = current_names.difference(&previous_names).cloned().collect();
            let removed: Vec<String> = previous_names.difference(&current_names).cloned().collect();

            let has_changes = !added.is_empty() || !removed.is_empty();

            // Log changes
            for name in &added {
                log::debug!("[Audio] Device connected: {}", name);
            }
            for name in &removed {
                log::debug!("[Audio] Device disconnected: {}", name);
            }

            // Check if active device was disconnected
            let active_device_lost = if let Some(active_name) = &active_device_name {
                removed.contains(active_name)
            } else {
                false
            };

            // Handle active device disconnect
            if active_device_lost && is_running {
                log::warn!(
                    "[Audio] Active device disconnected: {}",
                    active_device_name.as_deref().unwrap_or("unknown")
                );

                // Store the device name for potential reconnect and update status
                let buffer_arc = {
                    let mut state = engine.lock().unwrap();
                    state.last_active_device = active_device_name.clone();

                    // Update status to show error
                    state.status = AudioStatus {
                        is_running: false,
                        device_name: None,
                        sample_rate: None,
                        error: Some(format!(
                            "Device disconnected: {}",
                            active_device_name.as_deref().unwrap_or("unknown")
                        )),
                    };

                    // Clear the stream
                    state.stream = None;

                    // Clone the buffer Arc to access it after releasing state lock
                    state.buffer.clone()
                };

                // Clear buffer outside the state lock
                if let Ok(mut buf) = buffer_arc.lock() {
                    *buf = None;
                }

                // Emit status change
                if let Some(handle) = &app_handle {
                    let status = with_audio_engine(|state| state.status.clone());
                    let _ = handle.emit("audio_status_changed", &status);
                }
            }

            // Update known devices
            {
                let mut state = engine.lock().unwrap();
                state.known_device_names = current_names.clone();
            }

            // Emit event if devices changed
            if has_changes {
                if let Some(handle) = &app_handle {
                    // Re-fetch with active status
                    if let Ok(devices) = list_devices() {
                        let _ = handle.emit("audio_devices_changed", &devices);
                    }
                }
            }

            // Auto-reconnect logic
            if auto_reconnect_enabled && !added.is_empty() {
                let last_active = with_audio_engine(|state| state.last_active_device.clone());

                // Check if the previously active device came back
                if let Some(last_name) = last_active {
                    if added.contains(&last_name) {
                        log::debug!("[Audio] Auto-reconnecting to: {}", last_name);
                        match start_capture(Some(last_name.clone())) {
                            Ok(()) => {
                                with_audio_engine(|state| {
                                    state.last_active_device = None;
                                });
                                log::debug!("[Audio] Auto-reconnect successful");
                            }
                            Err(e) => {
                                log::warn!("[Audio] Auto-reconnect failed: {}", e);
                            }
                        }
                    }
                }
            }
        }
    });
}

/// Internal device listing that works within the engine context.
fn list_devices_internal(
    engine: &Arc<Mutex<AudioEngineState>>,
) -> Result<Vec<AudioDeviceInfo>, String> {
    let state = engine.lock().unwrap();
    let active_device_name = state.status.device_name.clone();

    let default_device = state.host.default_input_device();
    let default_name = default_device.as_ref().and_then(|d| d.name().ok());

    let devices: Vec<AudioDeviceInfo> = state
        .host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate devices: {}", e))?
        .filter_map(|device| {
            let name = device.name().ok()?;
            Some(AudioDeviceInfo {
                name: name.clone(),
                is_default: Some(&name) == default_name.as_ref(),
                is_active: Some(&name) == active_device_name.as_ref(),
            })
        })
        .collect();

    Ok(devices)
}

/// Start the background analysis loop
fn start_analysis_loop() {
    let engine = AUDIO_ENGINE.clone();

    std::thread::spawn(move || {
        let interval = std::time::Duration::from_secs_f64(1.0 / ANALYSIS_RATE_HZ);

        loop {
            std::thread::sleep(interval);

            let should_analyze = {
                let state = engine.lock().unwrap();
                state.status.is_running
            };

            if should_analyze {
                if let Some(levels) = analyze_audio(&engine) {
                    // Apply mappings to parameters
                    apply_audio_mappings(&engine, &levels);

                    let app_handle = {
                        let state = engine.lock().unwrap();
                        state.app_handle.clone()
                    };

                    if let Some(handle) = app_handle {
                        let _ = handle.emit("audio_levels", &levels);
                    }
                }
            }
        }
    });
}

// ============================================================================
// Device Management
// ============================================================================

/// List all available audio input devices.
pub fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    with_audio_engine(|state| {
        let active_device_name = state.status.device_name.clone();

        let default_device = state.host.default_input_device();
        let default_name = default_device.as_ref().and_then(|d| d.name().ok());

        let devices: Vec<AudioDeviceInfo> = state
            .host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {}", e))?
            .filter_map(|device| {
                let name = device.name().ok()?;
                Some(AudioDeviceInfo {
                    name: name.clone(),
                    is_default: Some(&name) == default_name.as_ref(),
                    is_active: Some(&name) == active_device_name.as_ref(),
                })
            })
            .collect();

        Ok(devices)
    })
}

/// Start audio capture from a device.
pub fn start_capture(device_name: Option<String>) -> Result<(), String> {
    // Stop any existing capture first
    let _ = stop_capture();

    // Find and configure the device within the lock, but build stream outside
    let (device, sample_rate, channels, buffer, beat_detector) = with_audio_engine(|state| {
        // Find the device
        let device: Device = if let Some(name) = &device_name {
            state
                .host
                .input_devices()
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?
                .find(|d| d.name().ok().as_ref() == Some(name))
                .ok_or_else(|| format!("Device not found: {}", name))?
        } else {
            state
                .host
                .default_input_device()
                .ok_or("No default input device".to_string())?
        };

        // Get default config
        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get device config: {}", e))?;

        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;

        Ok::<_, String>((
            device,
            sample_rate,
            channels,
            state.buffer.clone(),
            state.beat_detector.clone(),
        ))
    })?;

    let actual_name = device.name().unwrap_or_else(|_| "Unknown".to_string());

    // Initialize buffer
    {
        let mut buf = buffer.lock().unwrap();
        *buf = Some(AudioBuffer::new(sample_rate));
    }

    // Reset beat detector
    {
        let mut detector = beat_detector.lock().unwrap();
        *detector = BeatDetector::new();
    }

    // Create stream config
    let stream_config = StreamConfig {
        channels: channels as u16,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    // Clone buffer for the callback
    let buffer_for_callback = buffer.clone();

    // Build the stream
    let stream = device
        .build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // Mix to mono if stereo
                let mono: Vec<f32> = if channels > 1 {
                    data.chunks(channels)
                        .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                        .collect()
                } else {
                    data.to_vec()
                };

                // Add to buffer
                if let Ok(mut buf) = buffer_for_callback.lock() {
                    if let Some(ref mut b) = *buf {
                        b.push_samples(&mono);
                    }
                }
            },
            |err| {
                log::error!("[Audio] Stream error: {}", err);
            },
            None, // No timeout
        )
        .map_err(|e| format!("Failed to build stream: {}", e))?;

    // Start the stream
    stream
        .play()
        .map_err(|e| format!("Failed to start stream: {}", e))?;

    // Update state
    with_audio_engine(|state| {
        state.stream = Some(stream);
        state.status = AudioStatus {
            is_running: true,
            device_name: Some(actual_name.clone()),
            sample_rate: Some(sample_rate),
            error: None,
        };
    });

    emit_status_changed();

    log::debug!(
        "[Audio] Started capture on '{}' at {} Hz",
        actual_name,
        sample_rate
    );

    Ok(())
}

/// Stop audio capture.
pub fn stop_capture() -> Result<(), String> {
    with_audio_engine(|state| {
        // Drop the stream (stops capture)
        state.stream = None;

        // Clear buffer
        if let Ok(mut buf) = state.buffer.lock() {
            *buf = None;
        }

        // Update status
        state.status = AudioStatus {
            is_running: false,
            device_name: None,
            sample_rate: None,
            error: None,
        };
    });

    emit_status_changed();

    log::debug!("[Audio] Capture stopped");

    Ok(())
}

/// Get current audio status.
pub fn get_status() -> AudioStatus {
    with_audio_engine(|state| state.status.clone())
}

/// Enable or disable auto-reconnect for audio devices.
pub fn set_auto_reconnect(enabled: bool) {
    with_audio_engine(|state| {
        state.auto_reconnect_enabled = enabled;
    });
    log::debug!("[Audio] Auto-reconnect set to: {}", enabled);
}

/// Check if auto-reconnect is enabled.
pub fn is_auto_reconnect_enabled() -> bool {
    with_audio_engine(|state| state.auto_reconnect_enabled)
}

// ============================================================================
// Audio Analysis
// ============================================================================

/// Perform audio analysis and return levels.
fn analyze_audio(engine: &Arc<Mutex<AudioEngineState>>) -> Option<AudioLevels> {
    let state = engine.lock().unwrap();

    // Get the analysis window
    let buffer_guard = state.buffer.lock().ok()?;
    let buffer = buffer_guard.as_ref()?;
    let window = buffer.get_analysis_window()?;
    let sample_rate = buffer.sample_rate;

    // Release locks for computation
    drop(buffer_guard);
    drop(state);

    // Apply Hann window
    let windowed: Vec<f32> = window
        .iter()
        .enumerate()
        .map(|(i, &s)| {
            let hann =
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / FFT_SIZE as f32).cos());
            s * hann
        })
        .collect();

    // Calculate RMS and peak
    let rms = (windowed.iter().map(|&s| s * s).sum::<f32>() / FFT_SIZE as f32).sqrt();
    let peak = windowed.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);

    // Perform FFT
    let planner_guard = engine.lock().unwrap().fft_planner.clone();
    let mut planner = planner_guard.lock().unwrap();
    let fft = planner.plan_fft_forward(FFT_SIZE);
    drop(planner);

    let mut complex: Vec<Complex<f32>> = windowed.iter().map(|&s| Complex::new(s, 0.0)).collect();

    fft.process(&mut complex);

    // Calculate magnitude spectrum (only need first half due to symmetry)
    let magnitudes: Vec<f32> = complex[..FFT_SIZE / 2].iter().map(|c| c.norm()).collect();

    // Calculate frequency bands
    let freq_per_bin = sample_rate as f32 / FFT_SIZE as f32;

    let bass = band_energy(&magnitudes, 20.0, 250.0, freq_per_bin);
    let low_mid = band_energy(&magnitudes, 250.0, 500.0, freq_per_bin);
    let high_mid = band_energy(&magnitudes, 500.0, 2000.0, freq_per_bin);
    let treble = band_energy(&magnitudes, 2000.0, 20000.0, freq_per_bin);

    // Normalize bands (empirical scaling)
    let bands = AudioBands {
        bass: (bass * 10.0).min(1.0) as f64,
        low_mid: (low_mid * 15.0).min(1.0) as f64,
        high_mid: (high_mid * 20.0).min(1.0) as f64,
        treble: (treble * 30.0).min(1.0) as f64,
    };

    // Beat detection
    let beat = {
        let state = engine.lock().unwrap();
        let mut detector = state.beat_detector.lock().unwrap();
        detector.update(bands.bass, FFT_SIZE)
    };

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    Some(AudioLevels {
        rms: (rms * 8.0).min(1.0) as f64, // Empirical scaling (increased for visibility)
        peak: (peak * 4.0).min(1.0) as f64, // Empirical scaling
        bands,
        beat,
        timestamp,
    })
}

/// Calculate energy in a frequency band.
fn band_energy(magnitudes: &[f32], low_hz: f32, high_hz: f32, freq_per_bin: f32) -> f32 {
    let low_bin = (low_hz / freq_per_bin) as usize;
    let high_bin = ((high_hz / freq_per_bin) as usize).min(magnitudes.len());

    if low_bin >= high_bin || low_bin >= magnitudes.len() {
        return 0.0;
    }

    let sum: f32 = magnitudes[low_bin..high_bin].iter().map(|&m| m * m).sum();
    (sum / (high_bin - low_bin) as f32).sqrt()
}

// ============================================================================
// Audio Mappings
// ============================================================================

/// Apply audio mappings to parameters.
fn apply_audio_mappings(engine: &Arc<Mutex<AudioEngineState>>, levels: &AudioLevels) {
    let (mappings, app_handle, mut smoothed_values) = {
        let state = engine.lock().unwrap();
        (
            state.mappings.clone(),
            state.app_handle.clone(),
            state.smoothed_values.clone(),
        )
    };

    if mappings.is_empty() {
        return;
    }

    let dt = 1.0 / ANALYSIS_RATE_HZ;

    for mapping in &mappings {
        if !mapping.enabled {
            continue;
        }

        // Get raw value from audio source
        let raw_value = mapping.source.get_value(levels);

        // Skip beat source if no beat detected (unless in continuous mode)
        if mapping.source == AudioSource::Beat
            && mapping.mode != AudioMappingMode::Continuous
            && !levels.beat
        {
            continue;
        }

        // Normalize to input range
        let normalized = if mapping.max_input != mapping.min_input {
            (raw_value - mapping.min_input) / (mapping.max_input - mapping.min_input)
        } else {
            raw_value
        };
        let clamped = normalized.clamp(0.0, 1.0);

        // Scale to output range
        let scaled = mapping.min_output + clamped * (mapping.max_output - mapping.min_output);

        // Apply smoothing
        let smoothed = if mapping.smoothing > 0.0 {
            let prev = smoothed_values.get(&mapping.id).copied().unwrap_or(scaled);
            let smoothing_factor = (1.0 - mapping.smoothing).powf(dt * 60.0); // Normalize to ~60fps
            prev + (scaled - prev) * smoothing_factor
        } else {
            scaled
        };

        // Store smoothed value
        smoothed_values.insert(mapping.id.clone(), smoothed);

        // Apply to parameter based on mode
        let final_value = match mapping.mode {
            AudioMappingMode::Continuous => smoothed,
            AudioMappingMode::Trigger => {
                // On beat: set to max_output
                mapping.max_output
            }
            AudioMappingMode::Add => {
                // Get current value and add
                let current = crate::with_parameter_store(|store| {
                    store
                        .get(&mapping.parameter_id)
                        .map(|p| p.value)
                        .unwrap_or(0.0)
                });
                (current + smoothed).clamp(mapping.min_output, mapping.max_output)
            }
        };

        // Apply to parameter
        apply_audio_to_parameter(&mapping.parameter_id, final_value, app_handle.as_ref());
    }

    // Store updated smoothed values
    {
        let mut state = engine.lock().unwrap();
        state.smoothed_values = smoothed_values;
    }
}

fn apply_audio_to_parameter(parameter_id: &str, value: f64, app_handle: Option<&AppHandle>) {
    crate::with_parameter_store(|store| {
        store.set_target(parameter_id.to_string(), value);
    });

    if let Some(handle) = app_handle {
        if let Some(param) = crate::with_parameter_store(|store| store.get(parameter_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }
}

/// Get all audio mappings.
pub fn get_mappings() -> Vec<AudioMapping> {
    with_audio_engine(|state| state.mappings.clone())
}

/// Add or update an audio mapping.
pub fn add_mapping(mapping: AudioMapping) -> AudioMapping {
    let app_handle = with_audio_engine(|state| {
        // Remove existing mapping with same ID
        state.mappings.retain(|m| m.id != mapping.id);
        state.mappings.push(mapping.clone());
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_mappings_to_disk(&handle);
    }

    emit_mappings_changed();

    log::debug!(
        "[Audio] Added mapping: {} -> {} ({})",
        format!("{:?}", mapping.source),
        mapping.parameter_id,
        mapping.id
    );

    mapping
}

/// Remove an audio mapping by ID.
pub fn remove_mapping(id: &str) -> bool {
    let (removed, app_handle) = with_audio_engine(|state| {
        let len_before = state.mappings.len();
        state.mappings.retain(|m| m.id != id);
        state.smoothed_values.remove(id);
        (state.mappings.len() < len_before, state.app_handle.clone())
    });

    if removed {
        if let Some(handle) = app_handle {
            save_mappings_to_disk(&handle);
        }
        emit_mappings_changed();
        log::debug!("[Audio] Removed mapping: {}", id);
    }

    removed
}

/// Clear all audio mappings.
pub fn clear_mappings() {
    let app_handle = with_audio_engine(|state| {
        state.mappings.clear();
        state.smoothed_values.clear();
        state.app_handle.clone()
    });

    if let Some(handle) = app_handle {
        save_mappings_to_disk(&handle);
    }

    emit_mappings_changed();

    log::debug!("[Audio] Cleared all mappings");
}

/// Set mapping enabled state.
pub fn set_mapping_enabled(id: &str, enabled: bool) -> bool {
    let (found, app_handle) = with_audio_engine(|state| {
        let found = state.mappings.iter_mut().find(|m| m.id == id);
        if let Some(mapping) = found {
            mapping.enabled = enabled;
            (true, state.app_handle.clone())
        } else {
            (false, None)
        }
    });

    if found {
        if let Some(handle) = app_handle {
            save_mappings_to_disk(&handle);
        }
        emit_mappings_changed();
    }

    found
}

// ============================================================================
// Persistence
// ============================================================================

fn mappings_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|mut dir| {
        dir.push("audio_mappings.json");
        dir
    })
}

fn load_mappings_from_disk(app: &AppHandle) {
    let path = match mappings_path(app) {
        Some(p) => p,
        None => return,
    };

    if let Ok(bytes) = fs::read(&path) {
        if let Ok(mappings) = serde_json::from_slice::<Vec<AudioMapping>>(&bytes) {
            with_audio_engine(|state| {
                state.mappings = mappings;
            });
            log::debug!(
                "[Audio] Loaded {} mappings from disk",
                with_audio_engine(|s| s.mappings.len())
            );
        }
    }
}

fn save_mappings_to_disk(app: &AppHandle) {
    let mappings = with_audio_engine(|state| state.mappings.clone());

    if let Some(path) = mappings_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_vec_pretty(&mappings) {
            let _ = fs::write(path, json);
        }
    }
}

// ============================================================================
// Event Emission
// ============================================================================

/// Emit an audio_status_changed event.
fn emit_status_changed() {
    let (app_handle, status) =
        with_audio_engine(|state| (state.app_handle.clone(), state.status.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("audio_status_changed", status);
    }
}

/// Emit an audio_mappings_changed event.
fn emit_mappings_changed() {
    let (app_handle, mappings) =
        with_audio_engine(|state| (state.app_handle.clone(), state.mappings.clone()));

    if let Some(handle) = app_handle {
        let _ = handle.emit("audio_mappings_changed", mappings);
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// List available audio input devices.
#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    list_devices()
}

/// Start audio capture from a device.
#[tauri::command]
pub fn start_audio_capture(device_name: Option<String>) -> Result<(), String> {
    start_capture(device_name)
}

/// Stop audio capture.
#[tauri::command]
pub fn stop_audio_capture() -> Result<(), String> {
    stop_capture()
}

/// Get current audio status.
#[tauri::command]
pub fn get_audio_status() -> AudioStatus {
    get_status()
}

/// Get all audio mappings.
#[tauri::command]
pub fn get_audio_mappings() -> Vec<AudioMapping> {
    get_mappings()
}

/// Add or update an audio mapping.
#[tauri::command]
pub fn add_audio_mapping(mapping: AudioMapping) -> AudioMapping {
    add_mapping(mapping)
}

/// Remove an audio mapping by ID.
#[tauri::command]
pub fn remove_audio_mapping(id: String) -> bool {
    remove_mapping(&id)
}

/// Clear all audio mappings.
#[tauri::command]
pub fn clear_audio_mappings() {
    clear_mappings()
}

/// Set mapping enabled state.
#[tauri::command]
pub fn set_audio_mapping_enabled(id: String, enabled: bool) -> bool {
    set_mapping_enabled(&id, enabled)
}

/// Set auto-reconnect enabled state.
#[tauri::command]
pub fn set_audio_auto_reconnect(enabled: bool) {
    set_auto_reconnect(enabled)
}

/// Get auto-reconnect enabled state.
#[tauri::command]
pub fn get_audio_auto_reconnect() -> bool {
    is_auto_reconnect_enabled()
}
