//! AKAI MIDImix specific functionality.
//!
//! Contains all code specific to the AKAI MIDImix controller including:
//! - LED animations (startup, shutdown)
//! - LED state management
//! - Button handlers (mute, solo)
//! - Knob/fader mappings
//! - Soft takeover (pickup) logic

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;

use super::constants::*;
use super::engine::{is_midimix_device, with_midi_engine, MIDI_ENGINE};
use super::events::emit_pickup_state_changed;
use super::mappings::save_mappings_to_disk;
use super::output::{send_note_off, send_note_on};
use super::types::{
    MidiEngineState, MidiMapping, MidiPickupStateUpdate, MidiSlotSnapshot, PickupEventThrottle,
    PickupState,
};

// ============================================================================
// LED Animations
// ============================================================================

/// Send a startup animation to Midimix LEDs
pub fn send_midimix_startup_animation(output_device_id: &str) {
    log::debug!("[MIDI] Sending Midimix startup animation");

    // Staggered cascade animation with final state based on active slots
    std::thread::spawn({
        let device_id = output_device_id.to_string();
        move || {
            // First, turn off all LEDs
            for i in 0..8 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
            }
            // Also turn off master column buttons
            let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MASTER_SOLO_NOTE, 0);

            std::thread::sleep(Duration::from_millis(100));

            // Staggered cascade: each LED turns on then off with overlap
            // Creates a wave effect across columns and rows
            let stagger_delay = Duration::from_millis(25);
            let hold_time = Duration::from_millis(80);

            // Wave 1: Mute row left to right
            for i in 0..8 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            std::thread::sleep(hold_time);
            for i in 0..8 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }

            // Wave 2: Solo row left to right
            for i in 0..8 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            // Also flash master SOLO button
            let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MASTER_SOLO_NOTE, 127);
            std::thread::sleep(hold_time);
            for i in 0..8 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }
            let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MASTER_SOLO_NOTE, 0);
            std::thread::sleep(stagger_delay);

            // Wave 3: Rec Arm row left to right
            for i in 0..8 {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
                std::thread::sleep(stagger_delay);
            }
            std::thread::sleep(hold_time);
            for i in 0..8 {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
                std::thread::sleep(stagger_delay);
            }

            std::thread::sleep(Duration::from_millis(150));

            // Final state: sync LED state from parameters and slot existence
            sync_leds_from_parameters(&device_id);

            log::debug!("[MIDI] Midimix startup animation complete");
        }
    });
}

/// Send a shutdown animation to Midimix LEDs (synchronous - blocks until complete)
pub fn send_midimix_shutdown_animation_sync(device_id: &str) {
    log::debug!("[MIDI] Sending Midimix shutdown animation");

    let stagger_delay = Duration::from_millis(20);

    // Turn off LEDs in reverse order: Rec Arm, Solo, Mute (right to left)
    // Wave 1: Rec Arm row right to left
    for i in (0..8).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }

    // Wave 2: Solo row right to left
    for i in (0..8).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }
    let _ = send_note_off(Some(device_id), 0, MIDIMIX_MASTER_SOLO_NOTE, 0);
    std::thread::sleep(stagger_delay);

    // Wave 3: Mute row right to left
    for i in (0..8).rev() {
        let _ = send_note_off(Some(device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
        std::thread::sleep(stagger_delay);
    }

    std::thread::sleep(Duration::from_millis(50));

    log::debug!("[MIDI] Midimix shutdown animation complete");
}

/// Sync LED state from parameters on startup
fn sync_leds_from_parameters(device_id: &str) {
    let active_slots = with_midi_engine(|state| state.active_slots.clone());

    // Sync mute state from audio_reactivity parameters
    for i in 0..8 {
        let reactivity_id = format!("slot_{}_audio_reactivity", i);
        let is_muted = crate::with_parameter_store(|store| {
            store
                .get(&reactivity_id)
                .map(|p| p.value < 0.5)
                .unwrap_or(false)
        });

        // Update engine state to match persisted parameter
        with_midi_engine(|state| {
            state.slot_muted[i] = is_muted;
        });

        // Check if slot exists
        let slot_exists = active_slots
            .iter()
            .find(|s| s.index == i)
            .map(|s| s.exists)
            .unwrap_or(false);

        // Rec Arm LED = slot exists
        if slot_exists {
            let _ = send_note_on(Some(device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
        } else {
            let _ = send_note_off(Some(device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
        }

        // Mute LED = audio active (slot exists AND not muted)
        let audio_active = slot_exists && !is_muted;
        if audio_active {
            let _ = send_note_on(Some(device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
        } else {
            let _ = send_note_off(Some(device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
        }
    }
}

// ============================================================================
// LED State Management
// ============================================================================

/// Update Midimix LEDs based on current slot states
pub fn update_midimix_leds() {
    let (active_slots, slot_muted, output_device_ids) = with_midi_engine(|state| {
        let slots = state.active_slots.clone();
        let muted = state.slot_muted;
        // Find all connected Midimix output devices
        let midimix_outputs: Vec<String> = state
            .output_connections
            .iter()
            .filter(|(_, conn)| is_midimix_device(&conn.device_name))
            .map(|(id, _)| id.clone())
            .collect();
        (slots, muted, midimix_outputs)
    });

    if output_device_ids.is_empty() {
        return;
    }

    for device_id in output_device_ids {
        // Update LEDs for all 8 columns
        // - Rec Arm LED: slot has a sketch loaded
        // - Mute LED: audio reactive (not muted) AND slot exists
        for i in 0..8 {
            let slot_exists = active_slots
                .iter()
                .find(|s| s.index == i)
                .map(|s| s.exists)
                .unwrap_or(false);

            // Rec Arm = slot exists (has sketch loaded)
            if slot_exists {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
            } else {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
            }

            // Mute LED = audio reactive (ON when NOT muted, OFF when muted)
            // Only show as active if slot exists AND not muted
            let audio_active = slot_exists && !slot_muted[i];
            if audio_active {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
            } else {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
            }
        }

        // Per-column solo buttons and master SOLO stay off
        for i in 0..8 {
            let _ = send_note_off(Some(&device_id), 0, MIDIMIX_SOLO_NOTES[i], 0);
        }
        let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MASTER_SOLO_NOTE, 0);
    }

    log::debug!(
        "[MIDI] Updated Midimix LEDs for {} slots",
        active_slots.len()
    );
}

/// Update the mute LED for a single slot
fn update_mute_led(slot_index: usize, on: bool) {
    if slot_index >= 8 {
        return;
    }

    let note = MIDIMIX_MUTE_NOTES[slot_index];
    if on {
        let _ = send_note_on(None, 0, note, 127);
    } else {
        let _ = send_note_off(None, 0, note, 0);
    }
}

/// Pulse the Bank Left and Bank Right LEDs to indicate beat detection.
/// Called from audio engine when beat state changes.
pub fn pulse_beat_led(beat_detected: bool) {
    if beat_detected {
        let _ = send_note_on(None, 0, MIDIMIX_BANK_LEFT_LED_NOTE, 127);
        let _ = send_note_on(None, 0, MIDIMIX_BANK_RIGHT_LED_NOTE, 127);
    } else {
        let _ = send_note_off(None, 0, MIDIMIX_BANK_LEFT_LED_NOTE, 0);
        let _ = send_note_off(None, 0, MIDIMIX_BANK_RIGHT_LED_NOTE, 0);
    }
}

// ============================================================================
// Button Handlers
// ============================================================================

/// Handle mute button press - toggles audio reactivity for the slot
pub(crate) fn handle_mute_button_press(
    _engine: &Arc<Mutex<MidiEngineState>>,
    slot_index: usize,
    app_handle: Option<&AppHandle>,
) {
    log::debug!("[MIDI] handle_mute_button_press: slot={}", slot_index);
    toggle_slot_mute(slot_index, app_handle);
}

/// Handle per-column solo button press - isolates the slot (alpha 1.0, others 0.0)
pub(crate) fn handle_solo_button_press_for_slot(
    _engine: &Arc<Mutex<MidiEngineState>>,
    slot_index: usize,
    app_handle: Option<&AppHandle>,
) {
    log::debug!(
        "[MIDI] handle_solo_button_press_for_slot: slot={}",
        slot_index
    );
    handle_solo_slot(slot_index, app_handle);
}

/// Handle master SOLO button press/release
pub(crate) fn handle_master_solo_button_press(
    _engine: &Arc<Mutex<MidiEngineState>>,
    pressed: bool,
) {
    with_midi_engine(|state| {
        state.solo_held = pressed;
    });

    // Update master SOLO LED
    if pressed {
        let _ = send_note_on(None, 0, MIDIMIX_MASTER_SOLO_NOTE, 127);
    } else {
        let _ = send_note_off(None, 0, MIDIMIX_MASTER_SOLO_NOTE, 0);
    }

    log::debug!(
        "[MIDI] Master Solo button: {}",
        if pressed { "HELD" } else { "RELEASED" }
    );
}

/// Toggle audio reactivity (mute) for a slot
fn toggle_slot_mute(slot_index: usize, app_handle: Option<&AppHandle>) {
    if slot_index >= 8 {
        return;
    }

    // Toggle the mute state
    let (new_muted, slot_exists) = with_midi_engine(|state| {
        let current = state.slot_muted[slot_index];
        state.slot_muted[slot_index] = !current;

        let exists = state
            .active_slots
            .iter()
            .any(|s| s.index == slot_index && s.exists);

        (!current, exists)
    });

    log::debug!(
        "[MIDI] Slot {} audio reactivity: {} (slot_exists={})",
        slot_index,
        if new_muted { "MUTED" } else { "ACTIVE" },
        slot_exists
    );

    // Update the audio_reactivity parameter with fade time from global setting
    let param_id = format!("slot_{}_audio_reactivity", slot_index);
    let value = if new_muted { 0.0 } else { 1.0 };

    // Read the global mute fade time (default 0.25s if not set)
    let fade_time = crate::with_parameter_store(|store| {
        store
            .get("global_mute_fade_time")
            .map(|p| p.value)
            .unwrap_or(0.25)
    });

    crate::with_parameter_store(|store| {
        store.set_target_with_transition(param_id.clone(), value, fade_time);
    });

    // Emit parameter changed event
    if let Some(handle) = app_handle {
        use tauri::Emitter;
        if let Some(param) = crate::with_parameter_store(|store| store.get(&param_id)) {
            let _ = handle.emit("parameter_changed", &param);
        }
    }

    // Update the mute LED - only show as active if slot exists AND not muted
    let led_on = slot_exists && !new_muted;
    update_mute_led(slot_index, led_on);
}

/// Handle solo for a slot - set this slot to alpha 1.0, all others to 0.0
fn handle_solo_slot(slot_index: usize, app_handle: Option<&AppHandle>) {
    if slot_index >= 8 {
        return;
    }

    log::debug!("[MIDI] Soloing slot {}", slot_index);

    // Read the global solo fade time (default 0.3s if not set)
    let fade_time = crate::with_parameter_store(|store| {
        store
            .get("global_solo_fade_time")
            .map(|p| p.value)
            .unwrap_or(0.3)
    });

    // Set all slot alphas: solo slot = 1.0, others = 0.0
    for i in 0..8 {
        let param_id = format!("slot_{}_alpha", i);
        let value = if i == slot_index { 1.0 } else { 0.0 };

        crate::with_parameter_store(|store| {
            store.set_target_with_transition(param_id.clone(), value, fade_time);
        });

        // Emit parameter changed event
        if let Some(handle) = app_handle {
            use tauri::Emitter;
            if let Some(param) = crate::with_parameter_store(|store| store.get(&param_id)) {
                let _ = handle.emit("parameter_changed", &param);
            }
        }
    }

    // Flash the solo LED for the selected slot
    let _ = send_note_on(None, 0, MIDIMIX_SOLO_NOTES[slot_index], 127);
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        let _ = send_note_off(None, 0, MIDIMIX_SOLO_NOTES[slot_index], 0);
    });
}

// ============================================================================
// Slot State Management
// ============================================================================

/// Update the active slots state (called from lib.rs when slots change)
/// Accepts (index, exists, sketch_id) tuples for LED and knob mapping support.
pub fn set_active_slots(slots: Vec<(usize, bool, String)>) {
    // Get old slot states to detect sketch changes
    let old_slots = with_midi_engine(|state| state.active_slots.clone());

    // Build new slot states
    let new_slots: Vec<MidiSlotSnapshot> = slots
        .into_iter()
        .map(|(index, exists, sketch_id)| MidiSlotSnapshot {
            index,
            exists,
            sketch_id: if exists { Some(sketch_id) } else { None },
        })
        .collect();

    // Detect which slots had sketch changes
    let mut changed_slots: Vec<usize> = Vec::new();
    for new_slot in &new_slots {
        let old_sketch = old_slots
            .iter()
            .find(|s| s.index == new_slot.index)
            .and_then(|s| s.sketch_id.as_deref())
            .unwrap_or("");

        let new_sketch = new_slot.sketch_id.as_deref().unwrap_or("");

        // If sketch changed (including load into empty or unload), mark for pickup reset
        if old_sketch != new_sketch {
            log::debug!(
                "[MIDI] Slot {} sketch changed: '{}' -> '{}'",
                new_slot.index,
                old_sketch,
                new_sketch
            );
            changed_slots.push(new_slot.index);
        }
    }

    // Update state and reset pickup for changed slots (single lock acquisition)
    {
        let engine = MIDI_ENGINE.clone();
        let mut state = engine.lock().unwrap();

        // Update active slots
        state.active_slots = new_slots;

        // Reset pickup for changed slots
        for slot_index in changed_slots {
            if slot_index >= 8 {
                continue;
            }

            // Reset fader for this slot
            let fader_cc = MIDIMIX_FADER_CCS[slot_index];
            if let Some(pickup) = state.pickup_state.get_mut(&(0, fader_cc)) {
                pickup.picked_up = false;
                // Keep last_cc so crossing detection still works
            }

            // Reset knobs for this slot (3 knobs per column)
            for knob_idx in 0..3 {
                let knob_cc = MIDIMIX_KNOB_CCS[slot_index][knob_idx];
                if let Some(pickup) = state.pickup_state.get_mut(&(0, knob_cc)) {
                    pickup.picked_up = false;
                    // Keep last_cc so crossing detection still works
                }
            }

            log::debug!(
                "[MIDI] Pickup: reset for slot {} (fader CC {}, knob CCs {:?})",
                slot_index,
                fader_cc,
                MIDIMIX_KNOB_CCS[slot_index]
            );
        }
    }

    // Update LEDs to reflect new state
    update_midimix_leds();

    // Update knob mappings based on loaded sketches
    update_midimix_knob_mappings();
}

// ============================================================================
// Knob Mappings
// ============================================================================

/// Update Midimix knob mappings based on currently loaded sketches.
/// Maps the top 3 knobs of each column to the first 3 parameters of that slot's sketch.
fn update_midimix_knob_mappings() {
    let active_slots = with_midi_engine(|state| state.active_slots.clone());

    // Check if we have any Midimix connected
    let has_midimix = with_midi_engine(|state| {
        state
            .connections
            .values()
            .any(|conn| is_midimix_device(&conn.device_name))
    });

    if !has_midimix {
        return;
    }

    // Remove existing knob mappings (keep fader mappings)
    with_midi_engine(|state| {
        state.mappings.retain(|m| {
            // Keep if it's not a Midimix knob CC
            !MIDIMIX_KNOB_CCS
                .iter()
                .flatten()
                .any(|&cc| m.cc_number == Some(cc) && m.channel == Some(0))
        });
    });

    // Add new knob mappings for each active slot
    for slot in &active_slots {
        if !slot.exists {
            continue;
        }

        let sketch_id = slot.sketch_id.as_deref().unwrap_or("");
        if sketch_id.is_empty() {
            continue;
        }

        // Get the first 3 parameters for this sketch
        let params = get_sketch_first_params(sketch_id, slot.index);

        // Map each param to a knob
        for (knob_idx, param_id) in params.iter().enumerate() {
            if knob_idx >= 3 {
                break;
            }

            let cc = MIDIMIX_KNOB_CCS[slot.index][knob_idx];
            let (min, max) = get_sketch_param_range(sketch_id, param_id);

            let mapping = MidiMapping {
                parameter_id: param_id.clone(),
                channel: Some(0),
                cc_number: Some(cc),
                note_number: None,
                note_mode: None,
                min_value: min,
                max_value: max,
                device_id: None,
            };

            with_midi_engine(|state| {
                state.mappings.push(mapping);
            });

            log::debug!(
                "[MIDI] Added knob mapping: slot {} knob {} (CC {}) -> {} (range {} - {})",
                slot.index,
                knob_idx + 1,
                cc,
                param_id,
                min,
                max
            );
        }
    }

    save_mappings_to_disk();
}

/// Setup default Midimix mappings (faders 1-8 to slot 0-7 alpha)
/// Set up default Midimix mappings on first connect.
///
/// Maps faders 1-8 (CC 19,23,27,31,49,53,57,61) to slot_0_alpha..slot_7_alpha.
/// Skips any slot that already has a mapping.
pub fn setup_midimix_default_mappings() {
    log::debug!("[MIDI] Setting up Midimix default mappings");
    super::mappings::install_default_cc_mappings(&MIDIMIX_FADER_CCS);
}

/// System parameter suffixes that should be excluded from knob mappings.
/// These are managed at the slot level, not per-sketch.
const SYSTEM_PARAM_SUFFIXES: &[&str] = &["_alpha", "_brightness", "_audio_reactivity"];

/// Get the first 3 controllable parameter IDs for a slot by querying the live
/// parameter store.  This replaces the old sketch-ID look-up table which
/// silently drifted whenever sketches changed.
///
/// Parameters are sorted alphabetically for deterministic ordering, then
/// system params (alpha, brightness, audio_reactivity) are excluded.
fn get_sketch_first_params(_sketch_id: &str, slot_index: usize) -> Vec<String> {
    let prefix = format!("slot_{}_", slot_index);

    let mut params: Vec<String> = crate::with_parameter_store(|store| {
        store
            .get_all()
            .into_iter()
            .map(|p| p.id)
            .filter(|id| {
                if !id.starts_with(&prefix) {
                    return false;
                }
                // Exclude system parameters
                !SYSTEM_PARAM_SUFFIXES
                    .iter()
                    .any(|suffix| id.ends_with(suffix))
            })
            .collect()
    });

    params.sort();
    params.truncate(3);
    params
}

/// Return the parameter range for a knob mapping.
///
/// The canonical min/max for a parameter lives in the TypeScript sketch
/// descriptors, not in the Rust parameter store.  Rather than maintaining a
/// second copy here that can drift, we use the standard normalised range
/// (0.0–1.0).  The MIDI mapping layer already normalises CC values into
/// whatever range is set here, so 0–1 is the safe universal default.
fn get_sketch_param_range(_sketch_id: &str, _param_id: &str) -> (f64, f64) {
    (0.0, 1.0)
}

// ============================================================================
// Soft Takeover (Pickup)
// ============================================================================

/// Throttle interval for pickup state events (~30fps)
const PICKUP_EVENT_THROTTLE: Duration = Duration::from_millis(33);

/// Check if a CC value has "picked up" the current parameter value.
/// Returns true if the CC should be applied, false if it should be ignored.
/// Updates the pickup state as a side effect and emits events for the frontend indicator.
pub(crate) fn check_and_update_pickup(
    engine: &Arc<Mutex<MidiEngineState>>,
    channel: u8,
    cc_number: u8,
    cc_value: u8,
    mapping: &MidiMapping,
) -> bool {
    let key = (channel, cc_number);

    // Get current parameter value
    let current_param_value =
        crate::with_parameter_store(|store| store.get(&mapping.parameter_id).map(|p| p.value));

    let Some(param_value) = current_param_value else {
        // Parameter doesn't exist, allow the CC through (it will create it)
        return true;
    };

    // Convert parameter value to CC scale (0-127)
    let range = mapping.max_value - mapping.min_value;
    let param_cc = if range.abs() < f64::EPSILON {
        64 // Default to middle if range is zero
    } else {
        let normalized = (param_value - mapping.min_value) / range;
        (normalized.clamp(0.0, 1.0) * 127.0).round() as u8
    };

    // Convert CC value to parameter range for the frontend indicator
    let midi_value_normalized = (cc_value as f64) / 127.0;
    let midi_value_in_range = mapping.min_value + midi_value_normalized * range;

    let mut state = engine.lock().unwrap();
    let pickup = state
        .pickup_state
        .entry(key)
        .or_insert_with(PickupState::default);

    // Check if we should ignore this CC (first CC after reconnect)
    if pickup.ignore_next {
        pickup.ignore_next = false;
        pickup.last_cc = Some(cc_value);
        pickup.picked_up = false;
        log::debug!(
            "[MIDI] Pickup: ignoring first CC after reconnect (ch={}, cc={}, val={})",
            channel,
            cc_number,
            cc_value
        );

        // Emit initial pickup state (not picked up, show ghost marker)
        let direction = calculate_pickup_direction(cc_value, param_cc);
        drop(state); // Release lock before emitting
        emit_pickup_state_throttled(
            engine,
            &mapping.parameter_id,
            false,
            midi_value_in_range,
            direction,
            true, // Force emit on first CC
        );

        return false;
    }

    // If already picked up, allow the CC through
    if pickup.picked_up {
        pickup.last_cc = Some(cc_value);
        return true;
    }

    // Check for crossing
    let crossed = match pickup.last_cc {
        None => {
            // First CC we've seen, can't determine crossing yet
            // But check if we're already at the target (within tolerance)
            let diff = (cc_value as i16 - param_cc as i16).abs();
            diff <= 2
        }
        Some(last) => {
            // Check if we crossed the parameter value
            let last_i = last as i16;
            let current_i = cc_value as i16;
            let param_i = param_cc as i16;

            // Crossed from below to at-or-above, or from above to at-or-below
            let crossed_up = last_i < param_i && current_i >= param_i;
            let crossed_down = last_i > param_i && current_i <= param_i;
            // Or we're within tolerance
            let within_tolerance = (current_i - param_i).abs() <= 2;

            crossed_up || crossed_down || within_tolerance
        }
    };

    pickup.last_cc = Some(cc_value);

    if crossed {
        pickup.picked_up = true;
        log::debug!(
            "[MIDI] Pickup: CC picked up (ch={}, cc={}, val={}, param_cc={})",
            channel,
            cc_number,
            cc_value,
            param_cc
        );

        // Emit pickup complete event (always emit immediately for feedback)
        drop(state); // Release lock before emitting
        emit_pickup_state_throttled(
            engine,
            &mapping.parameter_id,
            true,
            midi_value_in_range,
            None,
            true, // Force emit on pickup
        );

        true
    } else {
        log::trace!(
            "[MIDI] Pickup: waiting for crossing (ch={}, cc={}, val={}, param_cc={}, last={:?})",
            channel,
            cc_number,
            cc_value,
            param_cc,
            pickup.last_cc
        );

        // Emit pickup state update (throttled)
        let direction = calculate_pickup_direction(cc_value, param_cc);
        drop(state); // Release lock before emitting
        emit_pickup_state_throttled(
            engine,
            &mapping.parameter_id,
            false,
            midi_value_in_range,
            direction,
            false,
        );

        false
    }
}

/// Calculate which direction the user needs to move the controller to pick up.
fn calculate_pickup_direction(cc_value: u8, param_cc: u8) -> Option<String> {
    if cc_value < param_cc {
        Some("right".to_string())
    } else if cc_value > param_cc {
        Some("left".to_string())
    } else {
        None // Already at target
    }
}

/// Emit pickup state update, with throttling to prevent UI flooding.
/// State change events (picked_up transitions) are always emitted immediately.
fn emit_pickup_state_throttled(
    engine: &Arc<Mutex<MidiEngineState>>,
    parameter_id: &str,
    picked_up: bool,
    midi_value: f64,
    direction: Option<String>,
    force: bool,
) {
    let now = Instant::now();

    // Check throttle (unless forced)
    if !force {
        let mut state = engine.lock().unwrap();
        let throttle = state
            .pickup_event_throttle
            .entry(parameter_id.to_string())
            .or_insert_with(PickupEventThrottle::default);

        if let Some(last_time) = throttle.last_event_time {
            if now.duration_since(last_time) < PICKUP_EVENT_THROTTLE {
                return; // Throttled, skip this event
            }
        }

        throttle.last_event_time = Some(now);
    } else {
        // Update throttle time even when forced
        let mut state = engine.lock().unwrap();
        let throttle = state
            .pickup_event_throttle
            .entry(parameter_id.to_string())
            .or_insert_with(PickupEventThrottle::default);
        throttle.last_event_time = Some(now);
    }

    // Emit the event
    let update = MidiPickupStateUpdate {
        parameter_id: parameter_id.to_string(),
        picked_up,
        midi_value,
        direction,
    };

    emit_pickup_state_changed(&update);
}

/// Check pickup for the master fader.
/// The master fader is special: it doesn't map to a single parameter, so we can't
/// do crossing detection. Instead, we just check if we should ignore the first CC
/// after reconnect, then allow through (the direction logic handles the rest).
pub(crate) fn check_master_fader_pickup(
    engine: &Arc<Mutex<MidiEngineState>>,
    cc_value: u8,
) -> bool {
    let key = (0u8, MIDIMIX_MASTER_FADER_CC);

    let mut state = engine.lock().unwrap();
    let pickup = state
        .pickup_state
        .entry(key)
        .or_insert_with(PickupState::default);

    // Check if we should ignore this CC (first CC after reconnect)
    if pickup.ignore_next {
        pickup.ignore_next = false;
        pickup.last_cc = Some(cc_value);
        pickup.picked_up = true; // Master fader picks up immediately after first ignore
        log::debug!(
            "[MIDI] Pickup: ignoring first master fader CC after reconnect (val={})",
            cc_value
        );
        return false;
    }

    pickup.last_cc = Some(cc_value);
    true
}

/// Reset all pickup state (called on MIDI reconnect).
pub(crate) fn reset_all_pickup(engine: &Arc<Mutex<MidiEngineState>>) {
    let mut state = engine.lock().unwrap();

    for pickup in state.pickup_state.values_mut() {
        pickup.picked_up = false;
        pickup.last_cc = None;
        pickup.ignore_next = true;
    }

    // Also pre-populate pickup state for all known Midimix controls
    // so they get the ignore_next treatment even if we haven't seen them yet
    for &fader_cc in &MIDIMIX_FADER_CCS {
        let entry = state
            .pickup_state
            .entry((0, fader_cc))
            .or_insert_with(PickupState::default);
        entry.ignore_next = true;
    }
    for column in &MIDIMIX_KNOB_CCS {
        for &knob_cc in column {
            let entry = state
                .pickup_state
                .entry((0, knob_cc))
                .or_insert_with(PickupState::default);
            entry.ignore_next = true;
        }
    }
    // Master fader
    let entry = state
        .pickup_state
        .entry((0, MIDIMIX_MASTER_FADER_CC))
        .or_insert_with(PickupState::default);
    entry.ignore_next = true;

    log::debug!("[MIDI] Pickup: reset all pickup state (reconnect)");
}

/// Get all current pickup states for mapped parameters.
/// Returns pickup state updates for parameters that haven't been picked up yet.
pub fn get_all_pickup_states() -> Vec<MidiPickupStateUpdate> {
    use super::engine::with_midi_engine;

    with_midi_engine(|state| {
        let mut updates = Vec::new();

        // For each mapping, check if there's a pickup state that isn't picked up
        for mapping in &state.mappings {
            // Pickup state only applies to CC mappings
            let cc_number = match mapping.cc_number {
                Some(cc) => cc,
                None => continue,
            };
            // Find the pickup state for this mapping's channel/cc
            let channel = mapping.channel.unwrap_or(0);
            let key = (channel, cc_number);

            if let Some(pickup) = state.pickup_state.get(&key) {
                // Only include if we have a last_cc value and haven't picked up
                if let Some(last_cc) = pickup.last_cc {
                    // Get current parameter value to calculate direction
                    let param_value = crate::with_parameter_store(|store| {
                        store.get(&mapping.parameter_id).map(|p| p.value)
                    });

                    if let Some(param_value) = param_value {
                        let range = mapping.max_value - mapping.min_value;
                        let param_cc = if range.abs() < f64::EPSILON {
                            64
                        } else {
                            let normalized = (param_value - mapping.min_value) / range;
                            (normalized.clamp(0.0, 1.0) * 127.0).round() as u8
                        };

                        // Convert CC value to parameter range
                        let midi_value_normalized = (last_cc as f64) / 127.0;
                        let midi_value_in_range = mapping.min_value + midi_value_normalized * range;

                        let direction = if pickup.picked_up {
                            None
                        } else {
                            calculate_pickup_direction(last_cc, param_cc)
                        };

                        updates.push(MidiPickupStateUpdate {
                            parameter_id: mapping.parameter_id.clone(),
                            picked_up: pickup.picked_up,
                            midi_value: midi_value_in_range,
                            direction,
                        });
                    }
                }
            }
        }

        updates
    })
}

// ============================================================================
// Master Fader
// ============================================================================

/// Handle the Midimix master fader (CC 62).
/// When fading down: only affects slots with alpha > new value (clamp down).
/// When fading up: sets all slot alphas to the master value (bring up together).
pub(crate) fn handle_master_fader(
    engine: &Arc<Mutex<MidiEngineState>>,
    cc_value: u8,
    app_handle: Option<&AppHandle>,
) {
    let normalized = (cc_value as f64) / 127.0;

    // Get last master value and current slot states
    let (last_master, active_slots) = {
        let state = engine.lock().unwrap();
        (state.last_master_value, state.active_slots.clone())
    };

    // Determine direction
    let is_fading_down = last_master.map_or(false, |last| (cc_value as f64) < last);

    // Update stored master value
    {
        let mut state = engine.lock().unwrap();
        state.last_master_value = Some(cc_value as f64);
    }

    log::debug!(
        "[MIDI] Master fader: {} (normalized: {:.2}, direction: {})",
        cc_value,
        normalized,
        if is_fading_down { "down" } else { "up" }
    );

    // Apply to all slot alphas
    for slot_state in &active_slots {
        if !slot_state.exists {
            continue;
        }

        let param_id = format!("slot_{}_alpha", slot_state.index);

        // Get current alpha value
        let current_alpha = crate::with_parameter_store(|store| {
            store.get(&param_id).map(|p| p.target).unwrap_or(1.0)
        });

        let new_alpha = if is_fading_down {
            // Fading down: only clamp slots that are above the master value
            if current_alpha > normalized {
                normalized
            } else {
                // Don't change slots that are already below master
                continue;
            }
        } else {
            // Fading up: bring all slots up to the master value
            normalized
        };

        // Apply the new alpha
        crate::with_parameter_store(|store| {
            store.set_target(param_id.clone(), new_alpha);
        });

        // Emit parameter_changed event
        if let Some(handle) = app_handle {
            use tauri::Emitter;
            if let Some(param) = crate::with_parameter_store(|store| store.get(&param_id)) {
                let _ = handle.emit("parameter_changed", &param);
            }
        }

        log::debug!(
            "[MIDI] Master fader set slot {} alpha: {:.2} -> {:.2}",
            slot_state.index,
            current_alpha,
            new_alpha
        );
    }
}
