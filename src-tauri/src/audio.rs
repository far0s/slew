//! Audio Input Engine
//!
//! Provides audio device enumeration, capture, FFT analysis, and
//! extraction of audio-reactive features (RMS, frequency bands, beat detection).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Stream, StreamConfig};
use once_cell::sync::Lazy;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

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
    last_analysis_time: std::time::Instant,
    /// Samples processed since last analysis
    samples_since_analysis: usize,
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
            last_analysis_time: std::time::Instant::now(),
            samples_since_analysis: 0,
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
    with_audio_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    // Start the analysis loop
    start_analysis_loop();

    log::info!("[Audio] Engine initialized");
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
// Device Enumeration
// ============================================================================

/// List all available audio input devices.
pub fn list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    with_audio_engine(|state| {
        let mut devices = Vec::new();

        // Get default device name for comparison
        let default_name = state
            .host
            .default_input_device()
            .and_then(|d| d.name().ok());

        // Get active device name
        let active_name = state.status.device_name.clone();

        // Enumerate all input devices
        let input_devices = state
            .host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {}", e))?;

        for device in input_devices {
            if let Ok(name) = device.name() {
                devices.push(AudioDeviceInfo {
                    name: name.clone(),
                    is_default: Some(&name) == default_name.as_ref(),
                    is_active: Some(&name) == active_name.as_ref(),
                });
            }
        }

        Ok(devices)
    })
}

// ============================================================================
// Capture Management
// ============================================================================

/// Start audio capture from a device.
pub fn start_capture(device_name: Option<String>) -> Result<(), String> {
    // Stop any existing capture first
    let _ = stop_capture();

    with_audio_engine(|state| {
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
                .ok_or_else(|| "No default input device".to_string())?
        };

        let device_name_actual = device.name().unwrap_or_else(|_| "Unknown".to_string());

        // Get default config
        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get device config: {}", e))?;

        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;

        // Create audio buffer
        let buffer = Arc::new(Mutex::new(Some(AudioBuffer::new(sample_rate))));
        state.buffer = buffer.clone();

        // Reset beat detector
        *state.beat_detector.lock().unwrap() = BeatDetector::new();

        // Build stream config
        let stream_config = StreamConfig {
            channels: config.channels(),
            sample_rate: config.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        // Build the input stream
        let stream = device
            .build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    // Convert to mono if stereo
                    let mono: Vec<f32> = if channels == 2 {
                        data.chunks(2)
                            .map(|chunk| (chunk[0] + chunk.get(1).unwrap_or(&0.0)) * 0.5)
                            .collect()
                    } else {
                        data.to_vec()
                    };

                    // Add to buffer
                    if let Ok(mut buf_guard) = buffer.lock() {
                        if let Some(buf) = buf_guard.as_mut() {
                            buf.push_samples(&mono);
                        }
                    }
                },
                |err| {
                    log::error!("[Audio] Stream error: {}", err);
                },
                None,
            )
            .map_err(|e| format!("Failed to build stream: {}", e))?;

        // Start the stream
        stream
            .play()
            .map_err(|e| format!("Failed to start stream: {}", e))?;

        // Update state
        state.stream = Some(stream);
        state.status = AudioStatus {
            is_running: true,
            device_name: Some(device_name_actual.clone()),
            sample_rate: Some(sample_rate),
            error: None,
        };
        state.last_analysis_time = std::time::Instant::now();
        state.samples_since_analysis = 0;

        log::info!(
            "[Audio] Capture started: {} @ {}Hz",
            device_name_actual,
            sample_rate
        );

        Ok::<(), String>(())
    })?;

    emit_status_changed();
    Ok(())
}

/// Stop audio capture.
pub fn stop_capture() -> Result<(), String> {
    with_audio_engine(|state| {
        if !state.status.is_running {
            return Ok::<(), String>(());
        }

        // Drop the stream to stop capture
        state.stream = None;
        *state.buffer.lock().unwrap() = None;

        state.status = AudioStatus {
            is_running: false,
            device_name: None,
            sample_rate: None,
            error: None,
        };

        log::info!("[Audio] Capture stopped");

        Ok::<(), String>(())
    })?;

    emit_status_changed();
    Ok(())
}

/// Get current audio status.
pub fn get_status() -> AudioStatus {
    with_audio_engine(|state| state.status.clone())
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
        rms: (rms * 3.0).min(1.0) as f64, // Empirical scaling
        peak: peak.min(1.0) as f64,
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
