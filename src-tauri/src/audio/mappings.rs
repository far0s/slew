//! Audio mapping management and application.

use std::sync::{Arc, Mutex};
use tauri::AppHandle;

use crate::common::persistence;

use super::constants::ANALYSIS_RATE_HZ;
use super::engine::{with_audio_engine, AudioEngineState};
use super::events::emit_mappings_changed;
use super::types::{AudioLevels, AudioMapping, AudioMappingMode, AudioSource};

/// Apply audio mappings to parameters (called from analysis loop).
pub fn apply_audio_mappings(engine: &Arc<Mutex<AudioEngineState>>, levels: &AudioLevels) {
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

        // Get slot's audio reactivity (1.0 for non-slot parameters)
        let reactivity = if let Some(slot_index) = crate::extract_slot_index(&mapping.parameter_id)
        {
            let reactivity_id = format!("slot_{}_audio_reactivity", slot_index);
            crate::with_parameter_store(|store| {
                store.get(&reactivity_id).map(|p| p.value).unwrap_or(1.0)
            })
        } else {
            1.0
        };

        if reactivity < 0.001 {
            continue;
        }

        let raw_value = mapping.source.get_value(levels);

        // Skip beat source if no beat detected (unless continuous mode)
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
            let smoothing_factor = (1.0 - mapping.smoothing).powf(dt * 60.0);
            prev + (scaled - prev) * smoothing_factor
        } else {
            scaled
        };

        smoothed_values.insert(mapping.id.clone(), smoothed);

        let final_value = match mapping.mode {
            AudioMappingMode::Continuous => smoothed,
            AudioMappingMode::Trigger => mapping.max_output,
            AudioMappingMode::Add => {
                let current = crate::with_parameter_store(|store| {
                    store
                        .get(&mapping.parameter_id)
                        .map(|p| p.value)
                        .unwrap_or(0.0)
                });
                (current + smoothed).clamp(mapping.min_output, mapping.max_output)
            }
        };

        // Scale by audio reactivity
        let scaled_value = if reactivity < 1.0 {
            let current = crate::with_parameter_store(|store| {
                store
                    .get(&mapping.parameter_id)
                    .map(|p| p.target)
                    .unwrap_or(final_value)
            });
            current + (final_value - current) * reactivity
        } else {
            final_value
        };

        apply_audio_to_parameter(&mapping.parameter_id, scaled_value, app_handle.as_ref());
    }

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
            use tauri::Emitter;
            let _ = handle.emit("parameter_changed", &param);
        }
    }
}

pub fn get_mappings() -> Vec<AudioMapping> {
    with_audio_engine(|state| state.mappings.clone())
}

pub fn add_mapping(mapping: AudioMapping) -> AudioMapping {
    let app_handle = with_audio_engine(|state| {
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

const MAPPINGS_FILENAME: &str = "audio_mappings.json";

pub fn load_mappings_from_disk(_app: &AppHandle) {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[Audio] Could not determine mappings file path");
        return;
    };

    if let Some(mappings) = persistence::load_json::<Vec<AudioMapping>>(&path, "Audio") {
        let count = mappings.len();
        with_audio_engine(|state| {
            state.mappings = mappings;
        });
        log::debug!("[Audio] Loaded {} mappings from disk", count);
    }
}

pub fn save_mappings_to_disk(_app: &AppHandle) {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[Audio] Could not determine mappings file path");
        return;
    };

    let mappings = with_audio_engine(|state| state.mappings.clone());

    if let Err(e) = persistence::save_json(&path, &mappings, "Audio") {
        log::warn!("[Audio] Failed to save mappings: {}", e);
    }
}
