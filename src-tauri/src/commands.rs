use std::fs;

use tauri::{AppHandle, Emitter};

use crate::parameter_store::{
    default_parameter_for_id, ensure_slot_audio_reactivity, get_sketch_defaults,
    parameters_path, save_parameters_to_disk, save_slots_to_disk, with_parameter_store,
    with_slot_state, Parameter, SlotInfo, SlotState,
};
use crate::{midi, osc};

// =============================================================================
// Tauri Commands
// =============================================================================

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn notify_beat() {
    osc::send_osc_beat();
}

#[tauri::command]
pub fn send_color_osc(slot: usize, template_id: String, r: u8, g: u8, b: u8) {
    osc::send_osc_color(slot, &template_id, r, g, b);
}

/// Forward an event from Controls to Renderer (prefixed with "renderer:").
#[tauri::command]
pub fn forward_controls_event(app: AppHandle, event: String, payload: String) -> Result<(), String> {
    app.emit(&format!("renderer:{event}"), payload)
        .map_err(|e| format!("Failed to emit: {e}"))
}

#[tauri::command]
pub fn get_parameters() -> Vec<Parameter> {
    with_parameter_store(|store| store.get_all())
}

#[tauri::command]
pub fn get_parameter(id: String) -> Option<Parameter> {
    with_parameter_store(|store| store.get(&id))
}

/// Set all three RGB channels of a colour parameter atomically in one call.
/// Avoids partial-update flicker when animating colour in real time (e.g. chroma loop).
/// transition_speed 0 = instant snap (recommended for high-rate animation).
#[tauri::command]
pub fn set_color_channels(
    app: AppHandle,
    base_id: String,
    r: f64,
    g: f64,
    b: f64,
    transition_speed: f64,
) {
    let r_id = format!("{}_r", base_id);
    let g_id = format!("{}_g", base_id);
    let b_id = format!("{}_b", base_id);

    let (pr, pg, pb) = with_parameter_store(|store| {
        let pr = store.set_target_with_transition(r_id.clone(), r, transition_speed);
        let pg = store.set_target_with_transition(g_id.clone(), g, transition_speed);
        let pb = store.set_target_with_transition(b_id.clone(), b, transition_speed);
        (pr, pg, pb)
    });

    // For instant-snap (transition_speed = 0) emit value=target so the renderer
    // sees the final colour right away without waiting for the next tick.
    // For non-zero transition, emit as-is so the tick loop can animate smoothly.
    let make_immediate = |p: Parameter| -> Parameter {
        if transition_speed <= 0.0 {
            Parameter {
                value: p.target,
                ..p
            }
        } else {
            p
        }
    };

    // Emit all three atomically — renderer sees a coherent RGB triple
    let _ = app.emit("parameter_changed", &make_immediate(pr));
    let _ = app.emit("parameter_changed", &make_immediate(pg));
    let _ = app.emit("parameter_changed", &make_immediate(pb));

    // Do NOT save to disk here — this command is called at animation frame rate
    // (up to 60fps). The values are transient animation state; persistence happens
    // when the loop stops and the user picks a static color.
}

/// Set a parameter's target with an explicit transition speed (in seconds, 0 = instant).
/// Useful for colour changes where the caller wants a specific fade duration.
#[tauri::command]
pub fn set_parameter_with_transition(
    app: AppHandle,
    id: String,
    value: f64,
    transition_speed: f64,
) -> Parameter {
    let updated = with_parameter_store(|store| {
        store.set_target_with_transition(id.clone(), value, transition_speed)
    });
    save_parameters_to_disk(&app);

    // Emit current value so the tick loop animates smoothly
    let _ = app.emit("parameter_changed", &updated);

    // Send MIDI feedback
    midi::send_parameter_feedback(&id, value);

    updated
}

/// Set a parameter's target. Emits immediate feedback for most parameters,
/// but lets crossfade animate smoothly via the tick loop.
/// Also sends MIDI feedback to connected controllers.
#[tauri::command]
pub fn set_parameter(app: AppHandle, id: String, value: f64) -> Parameter {
    let updated = with_parameter_store(|store| store.set_target(id.clone(), value));
    save_parameters_to_disk(&app);

    // Crossfade: emit current value (let tick loop animate smoothly)
    // Others: emit target as value (immediate UI feedback)
    let immediate = if id == "crossfade" {
        updated.clone()
    } else {
        Parameter {
            value: updated.target,
            ..updated.clone()
        }
    };

    let _ = app.emit("parameter_changed", &immediate);

    // Send MIDI feedback for this parameter (if it has a mapping)
    midi::send_parameter_feedback(&id, value);

    updated
}

#[tauri::command]
pub fn clear_parameters(app: AppHandle) {
    with_parameter_store(|store| store.clear());
    if let Some(path) = parameters_path(&app) {
        let _ = fs::remove_file(path);
    }
    let _ = app.emit("parameters_cleared", ());
}

/// Notify Renderer which slots are active/next for crossfade (multi-instance support).
#[tauri::command]
pub fn set_slot_pairing(
    app: AppHandle,
    active_slot_index: usize,
    active_scene_id: String,
    next_slot_index: usize,
    next_scene_id: String,
) -> Result<(), String> {
    app.emit(
        "slot_pairing_changed",
        serde_json::json!({
            "active_slot_index": active_slot_index,
            "active_scene_id": active_scene_id,
            "next_slot_index": next_slot_index,
            "next_scene_id": next_scene_id,
        }),
    )
    .map_err(|e| format!("Failed to emit slot_pairing_changed: {e}"))
}

/// Notify Renderer of ALL slots for multi-layer alpha rendering.
/// This allows the renderer to render all slots based on their alpha values.
/// Also persists slot state so it survives Controls window restarts.
#[tauri::command]
pub fn set_all_slots(
    app: AppHandle,
    slots: Vec<SlotInfo>,
    active_slot_index: usize,
    crossfade_target_index: Option<usize>,
) -> Result<(), String> {
    // Persist slot state to backend storage
    with_slot_state(|state| {
        state.slots = slots.clone();
        state.active_slot_index = active_slot_index;
        state.crossfade_target_index = crossfade_target_index;
    });

    // Save to disk for persistence across app restarts
    save_slots_to_disk(&app);

    // Update MIDI engine with slot states for LED feedback and knob mappings
    // A slot "exists" if it's in the slots array (LEDs indicate slot count)
    let slot_states: Vec<(usize, bool, String)> = slots
        .iter()
        .map(|s| (s.index, true, s.sketch_id.clone()))
        .collect();
    midi::set_active_slots(slot_states);

    app.emit(
        "all_slots_changed",
        serde_json::json!({
            "slots": slots,
            "active_slot_index": active_slot_index,
            "crossfade_target_index": crossfade_target_index,
        }),
    )
    .map_err(|e| format!("Failed to emit all_slots_changed: {e}"))
}

/// Get the current slot state from backend storage.
/// Used by Controls window on startup/restart to hydrate from persisted state.
#[tauri::command]
pub fn get_slot_state() -> SlotState {
    with_slot_state(|state| state.clone())
}

/// Initialize parameters for a new slot with default values.
#[tauri::command]
pub fn initialize_slot_parameters(
    app: AppHandle,
    slot_index: usize,
    scene_id: String, // Keep param name for API compatibility, but it's now a sketch ID
) -> Vec<Parameter> {
    let defaults = get_sketch_defaults(&scene_id);
    let mut created: Vec<Parameter> = Vec::new();

    // Ensure audio_reactivity parameter exists for this slot
    if let Some(param) = ensure_slot_audio_reactivity(&app, slot_index) {
        created.push(param);
    }

    with_parameter_store(|store| {
        for (template_id, default_value) in defaults {
            let param_id = format!("slot_{}_{}", slot_index, template_id);

            // Always reset to new sketch defaults (overwrite existing values)
            let param = default_parameter_for_id(param_id.clone(), default_value);
            store.parameters.insert(param_id, param.clone());
            created.push(param);
        }
    });

    if !created.is_empty() {
        save_parameters_to_disk(&app);
        for param in &created {
            let _ = app.emit("parameter_changed", param);
        }
    }

    created
}

/// Reset all parameters for a slot to new sketch defaults.
/// This first clears ALL existing parameters for the slot, then reinitializes from defaults.
/// This ensures a clean slate when switching between sketches.
#[tauri::command]
pub fn reset_slot_parameters(
    app: AppHandle,
    slot_index: usize,
    sketch_id: String,
    initial_alpha: Option<f64>,
) -> Vec<Parameter> {
    let prefix = format!("slot_{}_", slot_index);
    let defaults = get_sketch_defaults(&sketch_id);
    let mut result: Vec<Parameter> = Vec::new();
    let alpha_value = initial_alpha.unwrap_or(1.0);

    with_parameter_store(|store| {
        // First, remove ALL existing parameters for this slot
        let keys_to_remove: Vec<String> = store
            .parameters
            .keys()
            .filter(|k| k.starts_with(&prefix))
            .cloned()
            .collect();

        for key in keys_to_remove {
            store.parameters.remove(&key);
        }

        // Add alpha parameter with the requested initial value
        let alpha_id = format!("slot_{}_alpha", slot_index);
        let alpha_param = default_parameter_for_id(alpha_id.clone(), alpha_value);
        store.parameters.insert(alpha_id, alpha_param.clone());
        result.push(alpha_param);

        // Add audio_reactivity parameter
        let audio_id = format!("slot_{}_audio_reactivity", slot_index);
        let audio_param = default_parameter_for_id(audio_id.clone(), 1.0);
        store.parameters.insert(audio_id, audio_param.clone());
        result.push(audio_param);

        // Add all sketch-specific parameters from defaults
        for (template_id, default_value) in defaults {
            let param_id = format!("slot_{}_{}", slot_index, template_id);
            let param = default_parameter_for_id(param_id.clone(), default_value);
            store.parameters.insert(param_id, param.clone());
            result.push(param);
        }
    });

    // Save and emit all parameters
    save_parameters_to_disk(&app);
    for param in &result {
        let _ = app.emit("parameter_changed", param);
    }

    result
}
