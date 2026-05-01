//! Audio engine state and initialization.

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::{Host, Stream};
use once_cell::sync::Lazy;
use rustfft::num_complex::Complex;
use rustfft::FftPlanner;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

use super::analysis::analyze_audio;
use super::buffer::{AudioBuffer, BeatDetector};
use super::capture::start_capture;
use super::constants::{ANALYSIS_RATE_HZ, DEVICE_POLL_INTERVAL_MS};
use super::devices::list_devices;
use super::mappings::{apply_audio_mappings, load_mappings_from_disk};
use super::types::{AudioMapping, AudioStatus};

/// Pre-allocated scratch buffers for FFT analysis to avoid per-frame allocations.
/// These are reused across analysis calls for better performance.
pub struct AnalysisScratchBuffers {
    pub windowed: Vec<f32>,
    pub complex: Vec<Complex<f32>>,
    pub magnitudes: Vec<f32>,
}

impl AnalysisScratchBuffers {
    pub fn new(fft_size: usize) -> Self {
        Self {
            windowed: vec![0.0; fft_size],
            complex: vec![Complex::new(0.0, 0.0); fft_size],
            magnitudes: vec![0.0; fft_size / 2],
        }
    }
}

pub struct AudioEngineState {
    pub host: Host,
    #[allow(dead_code)]
    pub stream: Option<Stream>,
    pub buffer: Arc<Mutex<Option<AudioBuffer>>>,
    pub beat_detector: Arc<Mutex<BeatDetector>>,
    pub fft_planner: Arc<Mutex<FftPlanner<f32>>>,
    pub status: AudioStatus,
    pub app_handle: Option<AppHandle>,
    pub mappings: Vec<AudioMapping>,
    pub smoothed_values: HashMap<String, f64>,
    pub known_device_names: HashSet<String>,
    pub last_active_device: Option<String>,
    pub auto_reconnect_enabled: bool,
    /// Pre-allocated scratch buffers for FFT analysis (avoids allocations in hot path)
    pub analysis_scratch: AnalysisScratchBuffers,
}

impl AudioEngineState {
    pub fn new() -> Self {
        use super::constants::FFT_SIZE;
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
            analysis_scratch: AnalysisScratchBuffers::new(FFT_SIZE),
        }
    }
}

// Note: Stream is not Send, but we manage it carefully
unsafe impl Send for AudioEngineState {}

pub static AUDIO_ENGINE: Lazy<Arc<Mutex<AudioEngineState>>> =
    Lazy::new(|| Arc::new(Mutex::new(AudioEngineState::new())));

pub fn with_audio_engine<T, F: FnOnce(&mut AudioEngineState) -> T>(f: F) -> T {
    let mut state = AUDIO_ENGINE.lock().unwrap();
    f(&mut state)
}

pub fn init_audio_engine(app_handle: AppHandle) {
    load_mappings_from_disk(&app_handle);

    with_audio_engine(|state| {
        state.app_handle = Some(app_handle);
    });

    if let Ok(devices) = list_devices() {
        with_audio_engine(|state| {
            state.known_device_names = devices.iter().map(|d| d.name.clone()).collect();
        });
    }

    start_analysis_loop();
    start_device_watcher_thread();

    log::debug!("[Audio] Engine initialized with hot-plug detection");
}

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
                    crate::midi::pulse_beat_led(levels.beat);
                    apply_audio_mappings(&engine, &levels);

                    let app_handle = {
                        let state = engine.lock().unwrap();
                        state.app_handle.clone()
                    };

                    if let Some(handle) = app_handle {
                        use tauri::Emitter;
                        let _ = handle.emit("audio_levels", &levels);
                    }
                    // Forward beat to OSC output if enabled
                    if levels.beat {
                        crate::osc::send_osc_beat();
                    }
                }
            }
        }
    });
}

fn start_device_watcher_thread() {
    let engine = AUDIO_ENGINE.clone();

    thread::spawn(move || {
        log::debug!("[Audio] Device watcher thread started");

        loop {
            thread::sleep(Duration::from_millis(DEVICE_POLL_INTERVAL_MS));

            let current_devices = match list_devices_internal(&engine) {
                Ok(devices) => devices,
                Err(e) => {
                    log::debug!("[Audio] Device enumeration error: {}", e);
                    continue;
                }
            };

            let current_names: HashSet<String> =
                current_devices.iter().map(|d| d.name.clone()).collect();

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

            let added: Vec<String> = current_names.difference(&previous_names).cloned().collect();
            let removed: Vec<String> = previous_names.difference(&current_names).cloned().collect();
            let has_changes = !added.is_empty() || !removed.is_empty();

            for name in &added {
                log::debug!("[Audio] Device connected: {}", name);
            }
            for name in &removed {
                log::debug!("[Audio] Device disconnected: {}", name);
            }

            let active_device_lost = if let Some(active_name) = &active_device_name {
                removed.contains(active_name)
            } else {
                false
            };

            if active_device_lost && is_running {
                log::warn!(
                    "[Audio] Active device disconnected: {}",
                    active_device_name.as_deref().unwrap_or("unknown")
                );

                let buffer_arc = {
                    let mut state = engine.lock().unwrap();
                    state.last_active_device = active_device_name.clone();

                    state.status = AudioStatus {
                        is_running: false,
                        device_name: None,
                        sample_rate: None,
                        error: Some(format!(
                            "Device disconnected: {}",
                            active_device_name.as_deref().unwrap_or("unknown")
                        )),
                    };

                    state.stream = None;
                    state.buffer.clone()
                };

                if let Ok(mut buf) = buffer_arc.lock() {
                    *buf = None;
                }

                if let Some(handle) = &app_handle {
                    use tauri::Emitter;
                    let status = with_audio_engine(|state| state.status.clone());
                    let _ = handle.emit("audio_status_changed", &status);
                }
            }

            {
                let mut state = engine.lock().unwrap();
                state.known_device_names = current_names.clone();
            }

            if has_changes {
                if let Some(handle) = &app_handle {
                    use tauri::Emitter;
                    if let Ok(devices) = list_devices() {
                        let _ = handle.emit("audio_devices_changed", &devices);
                    }
                }
            }

            if auto_reconnect_enabled && !added.is_empty() {
                let last_active = with_audio_engine(|state| state.last_active_device.clone());

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

fn list_devices_internal(
    engine: &Arc<Mutex<AudioEngineState>>,
) -> Result<Vec<super::types::AudioDeviceInfo>, String> {
    let state = engine.lock().unwrap();
    let active_device_name = state.status.device_name.clone();

    let default_device = state.host.default_input_device();
    let default_name = default_device.as_ref().and_then(|d| d.name().ok());

    let devices: Vec<super::types::AudioDeviceInfo> = state
        .host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate devices: {}", e))?
        .filter_map(|device| {
            let name = device.name().ok()?;
            Some(super::types::AudioDeviceInfo {
                name: name.clone(),
                is_default: Some(&name) == default_name.as_ref(),
                is_active: Some(&name) == active_device_name.as_ref(),
            })
        })
        .collect();

    Ok(devices)
}
