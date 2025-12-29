# Button Controls (Mute/Solo via Midimix)

Implementation plan for leveraging Midimix button rows for quick slot control during live performance.

**Status**: Feature Complete ✅

- ✅ Mute buttons toggle audio reactivity with smooth fade
- ✅ Solo buttons isolate slots with smooth fade
- ✅ LED feedback reflects mute/solo state
- ✅ State persists across app restart
- ✅ Adjustable fade times via Settings tab
- ✅ Mute indicator in UI (🔇 emoji in preview)

---

## Overview

The Akai Midimix has several button rows with LED feedback that are currently underutilized:

| Button Row  | Notes                | Current Use               | Planned Use                     |
| ----------- | -------------------- | ------------------------- | ------------------------------- |
| Mute 1-8    | 1,4,7,10,13,16,19,22 | LED indicates slot exists | Toggle audio reactivity         |
| Rec Arm 1-8 | 3,6,9,12,15,18,21,24 | LED indicates slot exists | (Future: bank select indicator) |
| SEND ALL    | 25                   | None                      | (Future: tap tempo?)            |
| BANK LEFT   | 26                   | None                      | Previous parameter bank         |
| BANK RIGHT  | 27                   | None                      | Next parameter bank             |
| SOLO        | 28                   | None                      | Solo mode modifier              |

This task focuses on implementing:

1. **Mute buttons** → Toggle slot audio reactivity (0.0 ↔ 1.0)
2. **Solo mode** → SOLO + Mute button isolates a single slot
3. **LED feedback** for mute/solo state

---

## Current State Analysis

### Existing MIDI Note Handling

From `src-tauri/src/midi.rs`:

```rust
// Constants already defined:
const MIDIMIX_MUTE_NOTES: [u8; 8] = [1, 4, 7, 10, 13, 16, 19, 22];
const MIDIMIX_REC_ARM_NOTES: [u8; 8] = [3, 6, 9, 12, 15, 18, 21, 24];
const MIDIMIX_SEND_ALL_NOTE: u8 = 25;
const MIDIMIX_BANK_LEFT_NOTE: u8 = 26;
const MIDIMIX_BANK_RIGHT_NOTE: u8 = 27;
const MIDIMIX_SOLO_NOTE: u8 = 28;
```

Note messages are parsed in `handle_midi_message()` but currently only CC messages trigger parameter changes. Note events are emitted as `midi_message` events but not acted upon.

### Current LED Behavior

LEDs currently reflect whether a slot has a sketch loaded (both Mute and Rec Arm LEDs light up when slot exists). This is managed by:

- `send_midimix_startup_animation()` - plays cascade, then sets final state
- `update_midimix_leds()` - called when slot configuration changes

### Audio Reactivity

Currently there's no per-slot "audio reactivity" toggle. Audio mappings are global and target specific parameters. We need to introduce a mechanism to mute/unmute audio influence on a per-slot basis.

**Options:**

1. **Per-slot `audio_reactivity` parameter** - A new slot-level parameter (like `alpha`) that gates all audio mappings targeting that slot
2. **Disable/enable all audio mappings for a slot** - Track which mappings target a slot and toggle their `enabled` field

Option 1 is cleaner and more flexible. We'll add `slot_N_audio_reactivity` parameters (0.0 = muted, 1.0 = full reactivity).

---

## Implementation Plan

### Phase 1: Add Audio Reactivity Parameter

**1.1 Add slot-level audio_reactivity parameter**

In `src-tauri/src/lib.rs`, update `register_slot_params()` to create `slot_N_audio_reactivity` alongside `slot_N_alpha`:

```rust
fn register_slot_params(slot_index: usize) {
    // ... existing alpha registration ...

    let reactivity_id = format!("slot_{}_audio_reactivity", slot_index);
    with_parameter_store(|store| {
        store.set_target(reactivity_id, 1.0); // Default: fully reactive
    });
}
```

**1.2 Apply reactivity scaling in audio mappings**

In `src-tauri/src/audio.rs`, modify `apply_audio_mappings()` to check the slot's audio_reactivity before applying:

```rust
fn apply_audio_mappings(engine: &Arc<Mutex<AudioEngineState>>, levels: &AudioLevels) {
    // ... existing mapping loop ...

    for mapping in &mappings {
        if !mapping.enabled { continue; }

        // Extract slot index from parameter_id if it's slot-prefixed
        let reactivity = if mapping.parameter_id.starts_with("slot_") {
            // Parse slot index and get reactivity
            if let Some(slot_index) = extract_slot_index(&mapping.parameter_id) {
                let reactivity_id = format!("slot_{}_audio_reactivity", slot_index);
                crate::with_parameter_store(|store| {
                    store.get(&reactivity_id).map(|p| p.value).unwrap_or(1.0)
                })
            } else {
                1.0
            }
        } else {
            1.0 // Non-slot parameters always apply fully
        };

        if reactivity < 0.001 { continue; } // Skip if muted

        // ... existing mapping logic, scale final_value by reactivity ...
        let scaled_value = final_value * reactivity;
        apply_audio_to_parameter(&mapping.parameter_id, scaled_value, app_handle.as_ref());
    }
}

fn extract_slot_index(param_id: &str) -> Option<usize> {
    // Parse "slot_N_something" -> N
    if param_id.starts_with("slot_") {
        let rest = &param_id[5..]; // After "slot_"
        if let Some(underscore_pos) = rest.find('_') {
            rest[..underscore_pos].parse().ok()
        } else {
            None
        }
    } else {
        None
    }
}
```

---

### Phase 2: Handle Mute Button Presses

**2.1 Add mute state tracking**

In `src-tauri/src/midi.rs`, add state for tracking mute:

```rust
struct MidiEngineState {
    // ... existing fields ...

    /// Mute state per slot (true = audio muted, LED should be OFF for mute row)
    slot_muted: [bool; 8],
}
```

**2.2 Handle mute note-on in `handle_midi_message()`**

Add logic to detect Midimix mute button presses:

```rust
fn handle_midi_message(...) {
    // ... existing parsing ...

    // Handle Midimix button presses
    if type_str == "note_on" && value > 0 {
        // Check if this is a mute button
        if let Some(slot_index) = MIDIMIX_MUTE_NOTES.iter().position(|&n| n == control) {
            handle_mute_button_press(engine, slot_index, app_handle.as_ref());
            return;
        }

        // Check solo button (modifier tracking)
        if control == MIDIMIX_SOLO_NOTE {
            handle_solo_button_press(engine, true);
            return;
        }

        // Bank buttons
        if control == MIDIMIX_BANK_LEFT_NOTE {
            handle_bank_button(engine, -1, app_handle.as_ref());
            return;
        }
        if control == MIDIMIX_BANK_RIGHT_NOTE {
            handle_bank_button(engine, 1, app_handle.as_ref());
            return;
        }
    }

    // Handle button release
    if type_str == "note_off" || (type_str == "note_on" && value == 0) {
        if control == MIDIMIX_SOLO_NOTE {
            handle_solo_button_press(engine, false);
            return;
        }
    }

    // ... existing CC handling ...
}
```

**2.3 Implement `handle_mute_button_press()`**

```rust
fn handle_mute_button_press(
    engine: &Arc<Mutex<MidiEngineState>>,
    slot_index: usize,
    app_handle: Option<&AppHandle>,
) {
    let is_solo_held = with_midi_engine(|state| state.solo_held);

    if is_solo_held {
        // Solo mode: set this slot to alpha 1.0, all others to 0.0
        handle_solo_slot(engine, slot_index, app_handle);
    } else {
        // Toggle mute: flip audio_reactivity between 0.0 and 1.0
        toggle_slot_mute(engine, slot_index, app_handle);
    }
}

fn toggle_slot_mute(
    engine: &Arc<Mutex<MidiEngineState>>,
    slot_index: usize,
    app_handle: Option<&AppHandle>,
) {
    // Get current mute state and toggle
    let new_muted = with_midi_engine(|state| {
        let current = state.slot_muted[slot_index];
        state.slot_muted[slot_index] = !current;
        !current
    });

    // Set audio_reactivity parameter
    let reactivity_id = format!("slot_{}_audio_reactivity", slot_index);
    let new_value = if new_muted { 0.0 } else { 1.0 };

    crate::with_parameter_store(|store| {
        store.set_target(reactivity_id.clone(), new_value);
    });

    // Emit parameter change
    if let Some(handle) = app_handle {
        let _ = handle.emit("parameter_changed", ParameterChanged {
            id: reactivity_id,
            value: new_value,
            target: new_value,
        });
    }

    // Update LED (mute LED = OFF when muted, ON when active)
    update_mute_led(slot_index, !new_muted);

    log::debug!(
        "[MIDI] Slot {} audio reactivity: {}",
        slot_index,
        if new_muted { "MUTED" } else { "ACTIVE" }
    );
}
```

---

### Phase 3: Implement Solo Mode

**3.1 Track solo button state**

```rust
struct MidiEngineState {
    // ... existing fields ...

    /// Whether the SOLO button is currently held
    solo_held: bool,
}

fn handle_solo_button_press(engine: &Arc<Mutex<MidiEngineState>>, pressed: bool) {
    with_midi_engine(|state| {
        state.solo_held = pressed;
    });

    // Update SOLO LED
    if pressed {
        let _ = send_note_on(None, 0, MIDIMIX_SOLO_NOTE, 127);
    } else {
        let _ = send_note_off(None, 0, MIDIMIX_SOLO_NOTE, 0);
    }
}
```

**3.2 Implement `handle_solo_slot()`**

When SOLO is held and a MUTE button is pressed, isolate that slot:

```rust
fn handle_solo_slot(
    engine: &Arc<Mutex<MidiEngineState>>,
    solo_slot: usize,
    app_handle: Option<&AppHandle>,
) {
    // Get current slot states to know which slots have sketches
    let active_slots = with_midi_engine(|state| state.active_slots.clone());

    // For each slot with a sketch:
    // - Solo slot: alpha -> 1.0
    // - Other slots: alpha -> 0.0
    for slot_state in &active_slots {
        if !slot_state.exists {
            continue;
        }

        let param_id = format!("slot_{}_alpha", slot_state.index);
        let target_value = if slot_state.index == solo_slot { 1.0 } else { 0.0 };

        crate::with_parameter_store(|store| {
            store.set_target(param_id.clone(), target_value);
        });

        if let Some(handle) = app_handle {
            let _ = handle.emit("parameter_changed", ParameterChanged {
                id: param_id,
                value: target_value, // Will animate via tick
                target: target_value,
            });
        }
    }

    log::info!("[MIDI] Solo: slot {} isolated", solo_slot);
}
```

---

### Phase 4: LED Feedback

**4.1 Rethink LED meaning**

Current: Both Mute + Rec Arm LEDs indicate "slot has sketch loaded"

New design:
| LED | Meaning |
|-----|---------|
| Mute LED | Audio reactivity active (ON = reactive, OFF = muted) |
| Rec Arm LED | Slot has sketch loaded |
| Solo LED | Solo mode active (held) |

**4.2 Update LED functions**

```rust
fn update_mute_led(slot_index: usize, on: bool) {
    if slot_index >= 8 { return; }

    let note = MIDIMIX_MUTE_NOTES[slot_index];
    if on {
        let _ = send_note_on(None, 0, note, 127);
    } else {
        let _ = send_note_off(None, 0, note, 0);
    }
}

fn update_rec_arm_led(slot_index: usize, on: bool) {
    if slot_index >= 8 { return; }

    let note = MIDIMIX_REC_ARM_NOTES[slot_index];
    if on {
        let _ = send_note_on(None, 0, note, 127);
    } else {
        let _ = send_note_off(None, 0, note, 0);
    }
}
```

**4.3 Update `update_midimix_leds()` and startup animation**

Modify to respect the new LED semantics:

```rust
pub fn update_midimix_leds() {
    let (active_slots, slot_muted, output_device_ids) = with_midi_engine(|state| {
        (
            state.active_slots.clone(),
            state.slot_muted,
            // ... get output device IDs ...
        )
    });

    for device_id in output_device_ids {
        for i in 0..8 {
            let slot_exists = active_slots
                .iter()
                .find(|s| s.index == i)
                .map(|s| s.exists)
                .unwrap_or(false);

            // Rec Arm = slot exists
            if slot_exists {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 127);
            } else {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_REC_ARM_NOTES[i], 0);
            }

            // Mute = audio reactive (not muted) AND slot exists
            let audio_active = slot_exists && !slot_muted[i];
            if audio_active {
                let _ = send_note_on(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 127);
            } else {
                let _ = send_note_off(Some(&device_id), 0, MIDIMIX_MUTE_NOTES[i], 0);
            }
        }
    }
}
```

---

### Phase 5: State Persistence

**5.1 Persist mute state**

The audio_reactivity parameters will be persisted automatically via the existing `parameters.json` mechanism. On app restart:

- Parameters are restored (including `slot_N_audio_reactivity`)
- On Midimix connect, sync LED state from parameter values

**5.2 Sync LEDs on connect**

In `send_midimix_startup_animation()`, after the animation, read actual parameter values:

```rust
// After animation, sync LED state from parameters
for i in 0..8 {
    let reactivity_id = format!("slot_{}_audio_reactivity", i);
    let is_muted = crate::with_parameter_store(|store| {
        store.get(&reactivity_id).map(|p| p.value < 0.5).unwrap_or(false)
    });

    // Update mute state in engine
    with_midi_engine(|state| {
        state.slot_muted[i] = is_muted;
    });
}

// Then call update_midimix_leds() to set final state
update_midimix_leds();
```

---

### Phase 6: Bank Buttons (Parameter Banks)

**Scope:** Lower priority, implement if time permits.

The idea is to allow knobs to control more than the first 3 parameters per sketch:

- Bank 0: Parameters 1-3
- Bank 1: Parameters 4-6
- etc.

**6.1 Track current bank**

```rust
struct MidiEngineState {
    // ... existing fields ...

    /// Current parameter bank (0 = first 3 params, 1 = next 3, etc.)
    param_bank: usize,
}
```

**6.2 Handle bank buttons**

```rust
fn handle_bank_button(
    engine: &Arc<Mutex<MidiEngineState>>,
    direction: i32, // -1 = left, +1 = right
    app_handle: Option<&AppHandle>,
) {
    let new_bank = with_midi_engine(|state| {
        let max_bank = 2; // Assuming max 9 params (3 banks)
        let current = state.param_bank as i32;
        let next = (current + direction).clamp(0, max_bank as i32);
        state.param_bank = next as usize;
        next as usize
    });

    // Update knob mappings for new bank
    update_midimix_knob_mappings();

    // Visual feedback: flash bank LEDs
    // (BANK LEFT = active if bank > 0, BANK RIGHT = active if bank < max)

    log::info!("[MIDI] Parameter bank: {}", new_bank);
}
```

**6.3 Update `get_sketch_first_params()`**

Modify to accept bank offset:

```rust
fn get_sketch_params_for_bank(sketch_id: &str, slot_index: usize, bank: usize) -> Vec<String> {
    let all_params = get_sketch_all_params(sketch_id, slot_index);
    let start = bank * 3;
    all_params.into_iter().skip(start).take(3).collect()
}
```

---

## Testing Checklist

### Phase 1: Audio Reactivity Parameter

- [x] `slot_N_audio_reactivity` parameter created for all slots
- [x] Parameter persists across app restart
- [x] Audio mappings respect reactivity value (reactivity=0 → no audio influence)

**Implementation Notes (Phase 1):**

- Added `extract_slot_index()` helper in `lib.rs` to parse slot index from parameter IDs
- Added `ensure_slot_audio_reactivity()` to create parameters with default value 1.0
- All 8 slots get audio_reactivity params initialized at app startup
- Modified `apply_audio_mappings()` in `audio.rs` to check reactivity before applying
- Reactivity < 0.001 skips the mapping entirely (muted)
- Partial reactivity (0-1) blends between current value and audio-driven value
- Audio reactivity params have instant transition (transition_speed = 0.0)
- Added unit tests for `extract_slot_index()`

### Phase 2: Mute Button

- [x] Pressing Mute button toggles audio reactivity
- [x] Mute LED reflects current state (ON = active, OFF = muted)
- [x] Multiple slots can be muted independently
- [x] Mute state persists across app restart

**Implementation Notes (Phase 2):**

- Added `slot_muted: [bool; 8]` and `solo_held: bool` to `MidiEngineState`
- Added `handle_mute_button_press()` - dispatches to toggle or solo based on SOLO state
- Added `toggle_slot_mute()` - flips mute state and updates audio_reactivity parameter
- Added `handle_solo_slot()` - sets target slot alpha to 1.0, others to 0.0
- Added `handle_solo_button_press()` - tracks SOLO held state and updates LED
- Added `update_mute_led()` - helper to update single mute LED
- Note On handling in `handle_midi_message()` for MUTE and SOLO buttons
- Note Off handling for SOLO release

### Phase 3: Solo Mode

- [x] Holding SOLO lights up SOLO LED
- [x] Releasing SOLO turns off SOLO LED
- [x] SOLO + Mute sets that slot alpha to 1.0, others to 0.0
- [x] Transition is smooth (uses existing transition system)

**Note:** Solo mode was implemented as part of Phase 2 since it shares the mute button logic.

### Phase 4: LED Feedback

- [x] Rec Arm LED = slot has sketch loaded
- [x] Mute LED = audio reactive AND slot has sketch
- [x] LEDs update correctly when sketches are loaded/unloaded
- [x] LEDs sync correctly on Midimix connect

**Implementation Notes (Phase 4):**

- Updated `update_midimix_leds()` to use new LED semantics
- Updated `send_midimix_startup_animation()` to sync mute state from parameters
- Mute LED: ON = audio active (not muted), OFF = muted or no sketch
- Rec Arm LED: ON = slot has sketch, OFF = empty slot

### Phase 5: State Persistence

- [x] Mute state restored from parameters.json on restart
- [x] LEDs reflect correct state after Midimix reconnect

**Implementation Notes (Phase 5):**

- Mute state is derived from `slot_N_audio_reactivity` parameters which persist automatically
- On Midimix connect, startup animation syncs `slot_muted[]` from parameter values
- LEDs then reflect the persisted state

### Additional Features Implemented

- [x] Mute indicator in UI (🔇 emoji next to alpha percentage)
- [x] Adjustable fade times via Settings tab
- [x] `global_mute_fade_time` parameter (default 0.25s)
- [x] `global_solo_fade_time` parameter (default 0.3s)

**Implementation Notes (UI & Settings):**

- Added `audioReactivity` prop to SceneColumn component
- Mute indicator shows 🔇 emoji in preview when `audioReactivity < 0.5`
- Added `audio_reactivity` to `ParameterTemplateId` type
- Added Settings tab to DebugPanel with fade time sliders
- Added `set_target_with_transition()` method to ParameterStore for dynamic transition speeds
- Added `ensure_global_fade_parameters()` to initialize global settings at startup
- Mute/solo handlers read global fade time params before setting transitions

### Phase 6: Bank Buttons (if implemented)

- [ ] BANK LEFT/RIGHT cycle through parameter banks
- [ ] Knobs control correct parameters for current bank
- [ ] Bank state resets on sketch change

---

## Files Modified

| File                                                | Changes                                                       |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `src-tauri/src/lib.rs`                              | Audio reactivity params, global fade params, new store method |
| `src-tauri/src/audio.rs`                            | Apply reactivity scaling in `apply_audio_mappings()`          |
| `src-tauri/src/midi.rs`                             | Note handling, mute/solo logic, LED updates, fade times       |
| `src/components/SceneColumn/SceneColumn.tsx`        | Mute indicator in preview overlay                             |
| `src/components/SceneColumn/SceneColumn.module.css` | Mute indicator styling                                        |
| `src/components/ScenesArea/ScenesArea.tsx`          | Pass audioReactivity prop to SceneColumn                      |
| `src/components/DebugPanel/DebugPanel.tsx`          | Settings tab with fade time sliders                           |
| `src/components/DebugPanel/DebugPanel.module.css`   | Settings panel styling                                        |
| `src/sketches/types.ts`                             | Add `audio_reactivity` to ParameterTemplateId                 |
| `src/controls/useParameterStore.ts`                 | Add audioReactivity to props key map                          |
| `src/renderer/RendererRoot.tsx`                     | Add audioReactivity to props key map                          |
| `src/App.tsx`                                       | Pass getValue/setValue to DebugPanel                          |
| `docs/CONTROLLERS.md`                               | Updated Midimix button documentation                          |

---

## Open Questions

1. **Mute behavior when no audio mappings exist**: Should the mute button still toggle the LED / parameter even if there are no audio mappings for that slot? (Recommendation: Yes, for consistency)

2. **Solo behavior for empty slots**: If SOLO + Mute is pressed on an empty slot, should it do nothing? (Recommendation: Yes, only affect slots with sketches)

3. **Un-solo mechanism**: After soloing, how does user return to previous alpha values?
   - Option A: Store previous alphas and restore on second solo press (toggle)
   - Option B: User manually adjusts faders
   - (Recommendation: Option B for simplicity, Option A as future enhancement)

4. **Bank button LED feedback**: Use LED on/off or flash pattern?
   - (Recommendation: BANK LEFT LED on if bank > 0, BANK RIGHT LED on if bank < max)

---

## Estimated Effort

| Phase                               | Effort             |
| ----------------------------------- | ------------------ |
| Phase 1: Audio Reactivity Parameter | 1 hour             |
| Phase 2: Mute Button Handling       | 2 hours            |
| Phase 3: Solo Mode                  | 1.5 hours          |
| Phase 4: LED Feedback               | 1 hour             |
| Phase 5: State Persistence          | 0.5 hours          |
| Phase 6: Bank Buttons               | 2 hours (optional) |
| **Total (without banks)**           | **~6 hours**       |
| **Total (with banks)**              | **~8 hours**       |

---

## Implementation Order

1. ✅ Create this task document
2. ✅ Phase 1: Add audio_reactivity parameter infrastructure
3. ✅ Phase 2: Implement mute button handling
4. ✅ Phase 4: Update LED logic (needed to test mute properly)
5. ✅ Phase 3: Implement solo mode
6. ✅ Phase 5: Verify persistence works
7. ✅ UI: Mute indicator in preview
8. ✅ UI: Adjustable fade times in Settings tab
9. Phase 6: Bank buttons (stretch goal)
10. Update CHANGELOG/BACKLOG and close out task
