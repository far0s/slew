//! Audio device enumeration.

use cpal::traits::{DeviceTrait, HostTrait};

use super::engine::with_audio_engine;
use super::types::AudioDeviceInfo;

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
