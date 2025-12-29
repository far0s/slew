# Midimix & Multi-Layer Alpha Rendering

Task documentation for the Midimix integration and multi-slot alpha rendering system.

---

## Goal

Render all slots simultaneously based on their alpha values, with 1:1 Midimix integration that's resilient to live performance conditions.

---

## Status Summary

| Phase | Description                       | Status      |
| ----- | --------------------------------- | ----------- |
| 1     | Multi-Slot Rendering              | ✅ Complete |
| 2     | Preview Updates                   | ✅ Complete |
| 3     | Crossfade Integration             | ✅ Complete |
| 4     | MIDI Output                       | ✅ Complete |
| 5     | Midimix Auto-Setup                | ✅ Complete |
| 6     | Enhanced MIDI Control             | ✅ Complete |
| 7     | Slot System Rework                | ✅ Complete |
| 8     | 8-Slot Harmonization              | ✅ Complete |
| 9     | State Persistence & Soft Takeover | ✅ Complete |

---

## Completed Features

### Multi-Slot Rendering

- Renderer displays ALL slots with alpha > 0 (not just active/next)
- Slots layer in index order (slot 0 = back, slot 7 = front)
- Each slot's opacity = its alpha parameter value

### Midimix Integration (8 columns = 8 slots)

- **Faders 1-8**: Control slot alpha (visibility)
- **Knobs 1-3 per column**: Control first 3 sketch parameters
- **Master fader**: Fade all slots simultaneously
- **LEDs**: Mute + Rec Arm rows indicate which slots have sketches
- Auto-connect on startup with LED animation

### Slot System

- 8 fixed slots always visible in UI
- Empty slots show inline sketch browser (no extra click)
- Copy-from-slot feature for duplicating configurations
- Removing a sketch returns slot to empty state

### MIDI Output

- Bidirectional Midimix connection (input + output)
- Per-device feedback toggle
- CC value caching to avoid redundant sends

### State Persistence (Partial)

- Slot configuration persisted to `slots.json`
- Parameter values persisted to `parameters.json`
- State restored on app startup / window reload
- LED states pushed on Midimix connect

---

## Phase 9: State Persistence & Soft Takeover

### Problem

Without soft takeover, absolute CC controllers (faders/knobs) cause parameter jumps:

1. Sketch A is loaded with `brightness` = 0.3
2. Physical knob is at 80% (from previous use)
3. User touches knob → parameter jumps from 0.3 to 0.8
4. Visible glitch during live performance

This happens on:

- **Sketch change** — new sketch has different parameter values
- **App restart** — parameters restored from disk, hardware position unchanged
- **Midimix reconnect** — controller may dump current positions on connect

### Core Principle

**Software owns reality. Hardware is lossy input.**

The Parameter Server is the source of truth. Physical fader positions are just input signals that must "catch up" to software state before they take effect.

### Solution: Soft Takeover (Pickup)

Controls have no effect until they "pick up" the current parameter value:

1. Track last CC value for each control
2. When CC arrives, check if it has "crossed" the current parameter value
3. Only apply CC to parameter once crossed (picked up)
4. Reset pickup state on sketch change, reconnect, and app startup

### Design

#### Pickup State Structure

Add to `MidiEngineState`:

```rust
/// Pickup state for soft takeover
/// Key: (channel, cc_number)
pickup_state: HashMap<(u8, u8), PickupState>,

struct PickupState {
    /// Whether this control has picked up the parameter value
    picked_up: bool,
    /// Last raw CC value received (0-127)
    last_cc: Option<u8>,
    /// Whether to ignore the next CC (for reconnect handling)
    ignore_next: bool,
}
```

#### Pickup Logic

In `handle_midi_message`, for each CC:

```
1. Get or create PickupState for (channel, cc)

2. If ignore_next is true:
   - Set ignore_next = false
   - Store last_cc = current CC value
   - Return (don't apply)

3. If not picked_up:
   - Get current parameter value (via mapping)
   - Convert parameter value to CC scale (0-127)
   - Check if CC has crossed the parameter value:
     - If last_cc is None: store and wait for next CC
     - If last_cc was below param and current CC >= param: picked up
     - If last_cc was above param and current CC <= param: picked up
     - If current CC matches param (within ±1): picked up
   - Store last_cc = current CC value
   - If not picked up: return (don't apply)

4. If picked_up:
   - Apply CC to parameter (existing logic)
   - Store last_cc = current CC value
```

#### Crossing Detection

```
param_cc = (param_value - min) / (max - min) * 127

crossed = (last_cc < param_cc && current_cc >= param_cc) ||
          (last_cc > param_cc && current_cc <= param_cc) ||
          abs(current_cc - param_cc) <= 1
```

The ±1 tolerance handles exact matches.

#### Reset Triggers

**On sketch change in slot N:**

- Get CC mappings for slot N (fader CC + 3 knob CCs for that column)
- Set `picked_up = false` for those CCs
- Keep `last_cc` intact (so crossing detection still works)

**On MIDI reconnect:**

- Set `ignore_next = true` for ALL CCs
- Set `picked_up = false` for ALL CCs
- Clear `last_cc` for ALL CCs

**On app startup with controller connected:**

- Same as reconnect (handled in `open_device`)

### Implementation Tasks

| Task                                                         | Status                             |
| ------------------------------------------------------------ | ---------------------------------- |
| Add `PickupState` struct to `midi.rs`                        | ✅                                 |
| Add `pickup_state` HashMap to `MidiEngineState`              | ✅                                 |
| Create `check_and_update_pickup()` helper function           | ✅                                 |
| Modify `handle_midi_message` to check pickup before applying | ✅                                 |
| Add `reset_pickup_for_slot()` function                       | ✅ (inlined in `set_active_slots`) |
| Call pickup reset in `set_active_slots` on sketch change     | ✅                                 |
| Add `reset_all_pickup()` function                            | ✅                                 |
| Call pickup reset in `open_device` after connection          | ✅                                 |
| Add `check_master_fader_pickup()` for master fader           | ✅                                 |
| Add debug logging for pickup events                          | ✅                                 |
| Manual testing: sketch change scenario                       | ✅                                 |
| Manual testing: reconnect scenario                           | ✅                                 |
| Manual testing: app restart scenario                         | ✅                                 |

### Edge Cases

#### Master Fader

The master fader has special direction-based logic. It should still require pickup, but once picked up, the existing direction logic applies.

#### Knobs Without Mappings

Empty slots or sketches with <3 parameters have unmapped knobs. These naturally have no effect (no mapping found), so no special handling needed.

#### Multiple Devices

Pickup state is per (channel, cc), not per device. Two controllers sending the same CC share pickup state. Acceptable for now.

#### MIDI Learn

During MIDI Learn, we're capturing mappings, not applying values. No pickup check needed.

---

## Remaining Tasks (Other)

### Midimix Documentation

- [x] Look up Midimix master column button note numbers
  - SEND ALL: Note 25
  - BANK LEFT: Note 26
  - BANK RIGHT: Note 27
  - SOLO (master column only): Note 28
  - Note: There are NO per-channel SOLO buttons — only MUTE and REC ARM per channel
  - Fixed code that was sending to non-existent notes 2,5,8,11,14,17,20,23

### Performance & UI Validation

- [x] Performance test with 8 active sketches at 1080p@60 — no significant impact

---

## Key Files

| File                            | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `src-tauri/src/midi.rs`         | MIDI I/O, Midimix mappings, LED control, **pickup logic** |
| `src-tauri/src/hid.rs`          | HID device support (Megalodon)                            |
| `src/renderer/RendererRoot.tsx` | Multi-slot rendering loop                                 |
| `src/scenes/useSceneSlots.ts`   | 8-slot state management                                   |
| `src/components/SceneColumn/`   | Slot UI with inline sketch browser                        |
| `docs/CONTROLLERS.md`           | Controller layouts and MIDI/HID reference                 |
| `docs/MIDIMIX_DESIGN_SPEC.md`   | Design constraints and philosophy                         |

---

## Quick Test

### Current Functionality

1. `npm run tauri dev`
2. Connect Midimix (auto-connects with LED animation)
3. Click sketches in empty slots to load them
4. Use faders to control alpha, knobs for parameters
5. All slots with alpha > 0 render simultaneously

### After Phase 9 (Soft Takeover)

1. Load a sketch, set a knob parameter to 30% via UI
2. Move physical knob to 80% position
3. Change to a different sketch (or restart app)
4. Touch the knob — should have NO effect
5. Move knob down past 30% — should "pick up" and start controlling
6. Disconnect/reconnect Midimix — same pickup behavior

---

## Test Checklist (Phase 9)

Complete these tests with the Midimix connected. Watch the terminal for `[MIDI] Pickup:` debug logs.

### Test 1: Sketch Change (Knob Pickup)

- [x] Load TslNoiseBlob in slot 0
- [x] Set first parameter (e.g., `scale`) to ~30% using the UI slider
- [x] Move physical knob 1 (top-left) to ~80% position
- [x] Replace sketch with TslText3D (or any other sketch)
- [x] Wiggle knob 1 slightly around 80% — **parameter should NOT change**
- [x] Move knob 1 down past 30% — **parameter should start responding**
- [x] Verify: once picked up, knob controls parameter normally

### Test 2: Sketch Change (Fader Pickup)

- [x] Load any sketch in slot 0
- [x] Set alpha to ~50% using the UI slider
- [x] Move physical fader 1 to top (100%)
- [x] Change to a different sketch in slot 0
- [x] Move fader down slightly — **alpha should NOT change**
- [x] Move fader down past 50% — **alpha should start responding**

### Test 3: MIDI Reconnect

- [x] Load sketches in slots 0 and 1
- [x] Set some parameter values via UI (not at fader/knob positions)
- [x] Unplug Midimix USB cable
- [x] Wait for "device disconnected" log
- [x] Plug Midimix back in
- [x] Observe: LEDs should animate, then show slot states
- [x] Move any fader/knob slightly — **should be ignored (first CC after reconnect)**
- [x] Move same control again — **should still wait for pickup crossing**
- [x] Move control to cross the parameter value — **should pick up and respond**

### Test 4: App Restart with Controller Connected

- [x] Start app with Midimix already plugged in
- [x] Observe: Midimix auto-connects, LEDs animate
- [x] Move any control — **first CC should be ignored**
- [x] Move again — **should wait for pickup crossing**
- [x] Verify: parameters don't jump to physical positions on startup

### Test 5: Master Fader

- [x] Load sketches in slots 0, 1, 2
- [x] Set their alphas to various values (e.g., 30%, 60%, 90%) via UI
- [x] Move master fader to a random position
- [x] Disconnect and reconnect Midimix
- [x] Move master fader — **first CC should be ignored**
- [x] Move master fader again — **should work normally (no crossing needed for master)**
- [x] Verify: slot alphas respond to master fader direction logic

### Test 6: Edge Cases

- [x] **Empty slot**: Move fader for an empty slot — should have no effect (no mapping)
- [x] **Tolerance**: Set parameter to exactly match physical position, move slightly — should pick up immediately
- [x] **Rapid sketch switching**: Quickly switch sketches while holding a control — no crashes, pickup resets each time

### Expected Log Output

When soft takeover is working, you should see logs like:

```
[MIDI] Pickup: ignoring first CC after reconnect (ch=0, cc=19, val=100)
[MIDI] Pickup: waiting for crossing (ch=0, cc=16, val=102, param_cc=38, last=Some(100))
[MIDI] Pickup: CC picked up (ch=0, cc=16, val=36, param_cc=38)
[MIDI] Slot 0 sketch changed: 'TslNoiseBlob' -> 'TslText3D'
[MIDI] Pickup: reset for slot 0 (fader CC 19, knob CCs [16, 17, 18])
```

### Troubleshooting

**Controls not responding at all:**

- Check if `picked_up` is stuck at `false`
- Verify the CC is crossing the parameter value
- Check that mappings exist for the control

**Controls responding immediately (no pickup):**

- Verify `reset_all_pickup` is called on connect
- Check that `ignore_next` is being set

**Parameter jumps on sketch change:**

- Verify `set_active_slots` detects the sketch change
- Check pickup reset logs for that slot

---

## Future Enhancements

### Visual Feedback

Show "needs pickup" state in UI (dimmed slider, indicator icon). Low priority.

### Delta Mode Option

Per-mapping option for delta interpretation instead of pickup. More complex, defer unless pickup feels awkward in practice.

### Dead Zones

Add small dead zone at top/bottom of CC range to prevent jitter. Can be added to value shaping later.

---

## References

- `docs/MIDIMIX_DESIGN_SPEC.md` — §4 Soft Takeover (Required), §10 Failure Handling
- Existing `last_master_value` tracking — similar pattern for direction detection
- `last_sent_cc` HashMap — existing CC tracking pattern (for output dedup)
