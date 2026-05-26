//! Modulation target management

use super::engine::with_modulation_engine;
use super::persistence::{emit_targets_changed, generate_id, save_state_to_disk};
use super::types::ModulationTarget;

// ============================================================================
// Modulation Target Management
// ============================================================================

/// Get all modulation targets
pub fn get_targets() -> Vec<ModulationTarget> {
    with_modulation_engine(|state| state.targets.clone())
}

/// Add or update a modulation target
pub fn add_target(mut target: ModulationTarget) -> ModulationTarget {
    if target.id.is_empty() {
        target.id = generate_id("target");
    }

    // Clear cached base value for this parameter so it gets refreshed
    let result = target.clone();
    let (app_handle, targets) = with_modulation_engine(|state| {
        // Update existing or add new
        if let Some(existing) = state.targets.iter_mut().find(|t| t.id == target.id) {
            *existing = target;
        } else {
            state.targets.push(target);
        }
        state.base_values.remove(&result.parameter_id);
        let targets = state.targets.clone();
        (state.app_handle.clone(), targets)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_targets_changed(&handle, targets);
    }

    result
}

/// Remove a modulation target by ID
pub fn remove_target(id: &str) -> bool {
    let (removed, app_handle, parameter_id, targets) = with_modulation_engine(|state| {
        if let Some(pos) = state.targets.iter().position(|t| t.id == id) {
            let target = state.targets.remove(pos);
            let targets = state.targets.clone();
            (true, state.app_handle.clone(), Some(target.parameter_id), targets)
        } else {
            (false, None, None, Vec::new())
        }
    });

    if removed {
        // Clear the base value cache for this parameter
        if let Some(param_id) = parameter_id {
            with_modulation_engine(|state| {
                state.base_values.remove(&param_id);
            });
        }

        if let Some(handle) = app_handle {
            save_state_to_disk(&handle);
            emit_targets_changed(&handle, targets);
        }
    }

    removed
}

/// Clear all modulation targets
pub fn clear_targets() {
    let (app_handle, targets) = with_modulation_engine(|state| {
        state.targets.clear();
        state.base_values.clear();
        let targets = state.targets.clone();
        (state.app_handle.clone(), targets)
    });

    if let Some(handle) = app_handle {
        save_state_to_disk(&handle);
        emit_targets_changed(&handle, targets);
    }
}

/// Update the base value for a parameter (called when user manually adjusts a modulated parameter)
pub fn update_base_value(parameter_id: &str, value: f64) {
    with_modulation_engine(|state| {
        state.base_values.insert(parameter_id.to_string(), value);
    });
}
