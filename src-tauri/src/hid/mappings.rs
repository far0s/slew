//! HID mapping management and persistence.

use crate::common::persistence;

use super::engine::with_hid_engine;
use super::types::HidMapping;

pub fn get_mappings() -> Vec<HidMapping> {
    with_hid_engine(|state| state.mappings.clone())
}

pub fn add_mapping(mapping: HidMapping) -> Result<(), String> {
    with_hid_engine(|state| {
        state
            .mappings
            .retain(|m| m.encoder_index != mapping.encoder_index);
        state.mappings.push(mapping);
    });

    save_mappings_to_disk();
    log::debug!("[HID] Mapping added/updated");

    Ok(())
}

pub fn remove_mapping(encoder_index: u8) -> Result<(), String> {
    let removed = with_hid_engine(|state| {
        let before = state.mappings.len();
        state.mappings.retain(|m| m.encoder_index != encoder_index);
        before != state.mappings.len()
    });

    if removed {
        save_mappings_to_disk();
        log::debug!("[HID] Mapping removed for encoder {}", encoder_index);
    }

    Ok(())
}

pub fn clear_mappings() -> Result<(), String> {
    with_hid_engine(|state| {
        state.mappings.clear();
    });

    save_mappings_to_disk();
    log::debug!("[HID] All mappings cleared");

    Ok(())
}

/// Set up default mappings for the Megalodon.
///
/// NOTE: Legacy mappings. Encoder mappings are now handled dynamically
/// based on selected slot.
pub fn setup_default_mappings() -> Result<(), String> {
    let defaults = vec![
        HidMapping {
            encoder_index: 0,
            parameter_id: "crossfade".to_string(),
            sensitivity: 0.02,
            inverted: false,
        },
        HidMapping {
            encoder_index: 1,
            parameter_id: "slot_0_brightness".to_string(),
            sensitivity: 0.05,
            inverted: false,
        },
        HidMapping {
            encoder_index: 2,
            parameter_id: "slot_0_tint".to_string(),
            sensitivity: 0.02,
            inverted: false,
        },
    ];

    with_hid_engine(|state| {
        state.mappings = defaults;
    });

    save_mappings_to_disk();
    log::debug!("[HID] Default mappings configured");

    Ok(())
}

const MAPPINGS_FILENAME: &str = "hid_mappings.json";

pub fn load_mappings_from_disk() {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[HID] Could not determine mappings file path");
        return;
    };

    if let Some(mappings) = persistence::load_json::<Vec<HidMapping>>(&path, "HID") {
        let count = mappings.len();
        with_hid_engine(|state| {
            state.mappings = mappings;
        });
        log::debug!("[HID] Loaded {} mappings from disk", count);
    }
}

pub fn save_mappings_to_disk() {
    let Some(path) = persistence::local_data_path(MAPPINGS_FILENAME) else {
        log::warn!("[HID] Could not determine mappings file path");
        return;
    };

    let mappings = with_hid_engine(|state| state.mappings.clone());

    if let Err(e) = persistence::save_json(&path, &mappings, "HID") {
        log::warn!("[HID] Failed to save mappings: {}", e);
    }
}
