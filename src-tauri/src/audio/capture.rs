//! Audio capture management.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, StreamConfig};

use super::buffer::{AudioBuffer, BeatDetector};
use super::engine::with_audio_engine;
use super::events::emit_status_changed;
use super::types::AudioStatus;

/// Start audio capture. If `device_name` is `None`, uses the default input device.
pub fn start_capture(device_name: Option<String>) -> Result<(), String> {
    let _ = stop_capture();

    let (device, sample_rate, channels, buffer, beat_detector) = with_audio_engine(|state| {
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

    {
        let mut buf = buffer.lock().unwrap();
        *buf = Some(AudioBuffer::new(sample_rate));
    }

    {
        let mut detector = beat_detector.lock().unwrap();
        *detector = BeatDetector::new();
    }

    let stream_config = StreamConfig {
        channels: channels as u16,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    let buffer_for_callback = buffer.clone();

    let stream = device
        .build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let mono: Vec<f32> = if channels > 1 {
                    data.chunks(channels)
                        .map(|chunk| chunk.iter().sum::<f32>() / channels as f32)
                        .collect()
                } else {
                    data.to_vec()
                };

                if let Ok(mut buf) = buffer_for_callback.lock() {
                    if let Some(ref mut b) = *buf {
                        b.push_samples(&mono);
                    }
                }
            },
            |err| {
                log::error!("[Audio] Stream error: {}", err);
            },
            None,
        )
        .map_err(|e| format!("Failed to build stream: {}", e))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start stream: {}", e))?;

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

pub fn stop_capture() -> Result<(), String> {
    with_audio_engine(|state| {
        state.stream = None;

        if let Ok(mut buf) = state.buffer.lock() {
            *buf = None;
        }

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

pub fn get_status() -> AudioStatus {
    with_audio_engine(|state| state.status.clone())
}

pub fn set_auto_reconnect(enabled: bool) {
    with_audio_engine(|state| {
        state.auto_reconnect_enabled = enabled;
    });
    log::debug!("[Audio] Auto-reconnect set to: {}", enabled);
}

pub fn is_auto_reconnect_enabled() -> bool {
    with_audio_engine(|state| state.auto_reconnect_enabled)
}
