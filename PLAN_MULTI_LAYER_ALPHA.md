# Multi-Layer Alpha Rendering Plan

## Overview

Rework the renderer to support true multi-layer mixing where each slot's alpha controls its visibility independently, rather than the current active/next crossfade model.

## Current Architecture (Before)

```
┌─────────────────────────────────────────┐
│ Renderer                                │
│  - Only renders activeSlot + nextSlot   │
│  - Crossfade blends between them        │
│  - Alpha multiplies crossfade weight    │
│  - Other slots are NOT rendered         │
└─────────────────────────────────────────┘
```

**Limitations:**

- Slots other than active/next are never rendered
- Alpha only affects the active/next slots
- Can't layer multiple visuals simultaneously

## Proposed Architecture (After)

```
┌─────────────────────────────────────────┐
│ Renderer                                │
│  - Renders ALL slots with alpha > 0     │
│  - Each slot's opacity = its alpha      │
│  - Slots layer in index order (0→5)     │
│  - "Active slot" = UI focus only        │
│  - Crossfade = convenience automation   │
│    that fades between two slots         │
└─────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Multi-Slot Rendering ✅ COMPLETE

**Goal:** Render all slots based on their alpha values.

**Implementation completed:**

1. **`src-tauri/src/lib.rs`**
   - Added `SlotInfo` struct with `index` and `sketch_id`
   - Added `set_all_slots` command that emits `all_slots_changed` event
   - Event includes: `slots`, `active_slot_index`, `crossfade_target_index`

2. **`src/renderer/RendererRoot.tsx`**
   - Replaced `activeSlot`/`nextSlot` state with `allSlots` array
   - Added `handleAllSlotsChanged` to process the new event
   - `RendererContent` now iterates all slots with `alpha > 0.001`
   - Slots render in index order (lower index = behind)
   - Opacity calculation:
     - Slots in crossfade: `crossfadeWeight * alpha`
     - Other slots: just `alpha`

3. **`src/App.tsx`**
   - Added effect to sync all slots via `set_all_slots` command
   - Triggers when slots, activeIndex, or crossfadeTargetIndex changes

4. **`src/components/SceneColumn/`**
   - Added `alpha` prop to SceneColumn
   - Preview now uses alpha for opacity
   - Added visual overlay showing alpha percentage when < 100%

5. **`src/components/ScenesArea/ScenesArea.tsx`**
   - Passes alpha value to each SceneColumn from parameter store

### Phase 2: Preview Updates ✅ PARTIAL (Scene Previews Done)

**Goal:** Make previews reflect alpha values.

**Completed:**

1. **`src/components/SceneColumn/SceneColumn.tsx`** ✅
   - Added `alpha` prop (default: 1)
   - Preview passes alpha as opacity to SketchComponent
   - Added visual overlay with alpha percentage when < 100%

2. **`src/components/SceneColumn/SceneColumn.module.css`** ✅
   - Added `.alphaOverlay` and `.alphaValue` styles

**Note:** RendererPreview was fully updated in Phase 4, item 7. It now uses multi-slot rendering identical to the main renderer.

### Phase 3: Crossfade as Convenience Tool

**Goal:** Keep crossfade as a quick way to transition between two slots.

**Behavior:**

- When crossfade is triggered (e.g., via macropad):
  - Current active slot's alpha animates from current → 0
  - Target slot's alpha animates from current → 1
  - Crossfade parameter controls the blend during transition
- After transition completes, both slots have their new alpha values

**Alternative simpler approach:**

- Crossfade just controls the blend between active and "next" slot
- Alpha values remain independent and user-controlled
- This is the current behavior, just with all slots rendered

**Recommendation:** Start with the simpler approach (Phase 1 alone may be sufficient).

### Phase 4: MIDI Output ✅ COMPLETE

**Goal:** Send values back to Midimix for visual feedback.

**Implementation completed:**

1. **`src-tauri/src/midi.rs`**
   - Added `MidiOutput` and `MidiOutputConnection` support from `midir`
   - Added `MidiOutputDeviceInfo` struct for output device enumeration
   - Added `MidiOutputConfig` struct for feedback configuration
   - Added output connection management (`open_output_device`, `close_output_device`)
   - Added `send_cc()`, `send_note_on()`, `send_note_off()` functions
   - Added `send_parameter_feedback()` to send CC based on parameter mappings
   - Added CC value caching to avoid redundant sends
   - Auto-reconnect support for output devices
   - Hot-plug detection for output devices

2. **`src-tauri/src/lib.rs`**
   - Registered new Tauri commands for MIDI output

3. **`src/inputs/midi.ts`**
   - Added `MidiOutputDeviceInfo` and `MidiOutputConfig` types
   - Added API functions: `listMidiOutputDevices`, `openMidiOutputDevice`, etc.
   - Added `sendMidiCc`, `sendMidiNoteOn`, `sendMidiNoteOff` functions
   - Added `triggerMidiFeedback` function
   - Added hooks: `useMidiOutputDevices`, `useMidiOutputConfig`, `useMidiOutput`

4. **`src/components/MidiPanel/MidiPanel.tsx`**
   - Added output device management (later unified in Phase 6)
   - Added feedback toggle configuration

5. **`src/components/MidiPanel/MidiPanel.module.css`**
   - Added `.configSection` and `.configHint` styles

6. **`src-tauri/src/lib.rs`**
   - Added `midi::send_parameter_feedback()` call to `set_parameter` command
   - Parameters changed from UI now send MIDI feedback to connected controllers

7. **`src/components/RendererPreview/RendererPreview.tsx`**
   - Rewrote to use multi-slot rendering like main renderer
   - Now receives `allSlots`, `activeSlotIndex`, `crossfadeTargetIndex`, `getParam`
   - Renders all slots with alpha > 0, not just active/next

8. **`src/App.tsx`**
   - Updated RendererPreview usage to pass new multi-slot props

**Midimix specifics:**

- Faders: Not motorized, so CC output won't move them (but good for LED controllers)
- LEDs: Mute/Solo/Rec Arm buttons have LEDs, can be controlled via Note On/Off

## Data Flow (After Implementation)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Midimix    │────▶│   Backend    │────▶│   Renderer   │
│  (Faders)    │     │  (Params)    │     │  (All Slots) │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │  UI Preview  │
                     │  (Reflects   │
                     │   alpha)     │
                     └──────────────┘
```

## Testing Checklist

- [x] All slots with alpha > 0 render in the main renderer
- [x] Slots render in index order (0 behind, 5 in front)
- [x] Crossfade still works for transitioning active slot
- [x] Scene previews show alpha-adjusted opacity
- [x] Live preview shows all visible slots
- [x] MIDI-mapped alpha faders control each slot independently
- [x] Performance is acceptable with 6 slots at alpha > 0
- [x] MIDI output devices can be connected
- [x] CC feedback can be sent to controllers
- [x] Note On/Off can be sent for LED control
- [x] Midimix auto-connects (both input and output)
- [x] Midimix faders auto-mapped to slot alphas
- [x] Midimix LED startup animation on connect

## Notes

- Slot index order for z-layering (slot 0 = back, slot 5 = front)
- May need render-to-texture approach if true alpha blending is needed
- Current additive rendering may need adjustment for proper transparency
- Consider adding a "solo" mode that sets all other slots' alpha to 0

## Quick Start for Next Agent

**Phases 1-6 are complete!** Multi-layer alpha rendering, MIDI I/O, and enhanced Midimix controls are working.

**To test:**

1. Start the app with `npm run tauri dev`
2. Add multiple slots
3. Connect Midimix (auto-connects both input and output)
4. Use Midimix faders to control each slot's Alpha parameter
5. Use Midimix knobs to control the first 3 parameters of each slot's sketch
6. Use the master fader (rightmost) to fade all slots at once
7. All slots with alpha > 0 should be visible simultaneously in both Renderer AND Live Preview
8. LEDs indicate which slots exist (Mute + Rec Arm rows)
9. Crossfade still works for smooth transitions

**Key features:**

- **Unified MIDI Panel**: Single "Devices" section connects both input and output at once
- **Per-device feedback toggle**: Each connected device has its own feedback checkbox
- **Auto knob mapping**: Top 3 knobs per column map to first 3 sketch parameters
- **Master fader**: CC 62 controls all alphas (smart fade-down respects lower values)

**Key files:**

- `src-tauri/src/midi.rs` - MIDI input/output engine
- `src/inputs/midi.ts` - TypeScript types, API functions, and hooks
- `src/components/MidiPanel/` - Unified device list with feedback toggles

### Phase 5: Midimix Auto-Setup ✅ COMPLETE

**Goal:** Provide seamless Midimix experience with automatic setup.

**Implementation completed:**

1. **Coupled input/output connection**
   - When Midimix input is connected, output auto-connects
   - When Midimix output is connected, input auto-connects
   - Device pairing uses name matching ("MIDI Mix" pattern)

2. **Auto-connect at startup**
   - Midimix is detected and connected automatically on app start
   - Also auto-reconnects when device is plugged in

3. **Default fader mappings**
   - Faders 1-6 (CC 19, 23, 27, 31, 49, 53) auto-map to slot 0-5 alpha
   - Existing user mappings are preserved (not overwritten)

4. **LED startup animation**
   - Staggered cascade animation: each row (Mute, Solo, Rec Arm) lights up left-to-right then turns off
   - Creates a pleasing wave effect across the controller
   - Final state: Mute + Rec Arm LEDs lit only for slots that have an active sketch
   - If no slots have sketches yet (app just started), all LEDs stay off until `set_all_slots` is called

5. **LED shutdown animation**
   - When disconnecting via UI, LEDs turn off in reverse order (right-to-left, Rec Arm → Solo → Mute)
   - Creates a satisfying "powering down" effect
   - Note: Physical unplugging skips animation (device already gone)

6. **Dynamic LED feedback**
   - LEDs update automatically when slots are added/removed
   - Mute + Rec Arm rows indicate which slots exist (slot count)
   - Solo row reserved for future feedback (e.g., crossfade target)

**Midimix CC/Note reference:**

- Faders: CC 19, 23, 27, 31, 49, 53, 57, 61 (columns 1-8)
- Mute LEDs: Notes 1, 4, 7, 10, 13, 16, 19, 22
- Solo LEDs: Notes 2, 5, 8, 11, 14, 17, 20, 23
- Rec Arm LEDs: Notes 3, 6, 9, 12, 15, 18, 21, 24

**LED state meaning:**

- Mute + Rec Arm ON: Slot exists (index is within current slot count)
- All OFF: Slot index beyond current count (e.g., if 3 slots, LEDs 4-6 are off)
- Solo: Reserved for future use (crossfade target indicator, etc.)

**Important MIDI note:** Midimix LEDs require "Note On with velocity 0" to turn off, not actual Note Off (0x80) messages. The `send_note_off` function was updated to use this approach for compatibility.

### Phase 6: Enhanced MIDI Control ✅ COMPLETE

**Goal:** Improve MIDI panel UX and add advanced Midimix controls.

**Implementation completed:**

1. **Unified MIDI Panel**
   - Merged Input/Output device selectors into single "Devices" section
   - When connecting a device, both input and output are connected if available
   - Per-device "Feedback" checkbox shown when device is connected and has output
   - Cleaner UI with device status indicators ("In/Out", "Input only", etc.)

2. **Automatic Knob Mappings**
   - Top 3 knobs of each column auto-map to first 3 parameters of that slot's sketch
   - Mappings update dynamically when sketches are loaded/changed
   - User mappings are preserved (not overwritten by auto-mappings)
   - Knob CCs per column:
     - Col 1: CC 16, 17, 18 (top to bottom)
     - Col 2: CC 20, 21, 22
     - Col 3: CC 24, 25, 26
     - Col 4: CC 28, 29, 30
     - Col 5: CC 46, 47, 48
     - Col 6: CC 50, 51, 52

3. **Master Fader Control**
   - Master fader (CC 62) controls all slot alphas simultaneously
   - Smart fade-out behavior: when fading down, only affects slots with alpha > master value
   - When fading up, brings all slots up to the master value uniformly
   - Direction detection based on last master fader position

**Key files modified:**

- `src-tauri/src/midi.rs` - Added knob constants, master fader handling, dynamic knob mappings
- `src/inputs/midi.ts` - Added `MidiCombinedDeviceInfo` type and `useMidiCombinedDevices` hook
- `src/components/MidiPanel/MidiPanel.tsx` - Unified device list with per-device feedback toggle
- `src/components/MidiPanel/MidiPanel.module.css` - Updated styles for new layout

**Testing checklist:**

- [x] Unified device list shows all MIDI devices
- [x] Connecting a bidirectional device connects both input and output
- [x] Per-device feedback toggle works
- [x] Knobs auto-map to sketch parameters when loaded
- [x] Master fader fades all slots down (respecting lower alphas)
- [x] Master fader brings all slots up together
- [x] LED startup animation flashes correctly (on then off)
- [x] LEDs indicate slot existence (slot count)

### Phase 7: Slot System Rework ⏳ TODO

**Goal:** Make all slots visible and accessible from the start, with empty slots showing "Add Sketch" CTA.

**Current behavior:**

- Slots are created dynamically via "Add Slot" button
- Empty state is hidden
- User must explicitly add slots before choosing sketches

**Proposed behavior:**

- All slots (4 or 8, see Phase 9) are always visible in the UI
- Empty slots show a prominent "Add Sketch" CTA / SketchBrowser trigger
- User clicks on any empty slot to open SketchBrowser for that slot
- Removing a sketch returns the slot to empty state (not deleted)

**Implementation:**

1. **`src/scenes/useSceneSlots.ts`**
   - Initialize with fixed number of slots (all with `sketchId: null`)
   - Change `addSlot` to `setSketch(slotIndex, sketchId)`
   - Change `removeSlot` to `clearSlot(slotIndex)` (sets sketchId to null)

2. **`src/components/SceneColumn/SceneColumn.tsx`**
   - Handle `sketchId: null` state
   - Show "Add Sketch" button/overlay when empty
   - Click triggers SketchBrowser positioned for that slot

3. **`src/components/ScenesArea/ScenesArea.tsx`**
   - Remove dynamic "Add Slot" panel at the end
   - Render fixed number of SceneColumns
   - Pass slot index to SketchBrowser for correct assignment

4. **`src/components/SketchBrowser/`**
   - Accept `targetSlotIndex` prop
   - On sketch selection, call `setSketch(targetSlotIndex, sketchId)`

5. **Backend sync:**
   - `set_all_slots` should handle null sketchIds gracefully
   - Renderer skips slots with null sketchId (same as alpha = 0)

**UI considerations:**

- Empty slots should be visually distinct but not distracting
- Preserve slot order and numbering (Slot 1-8 always exist)
- "Copy from Slot" option should still work

**Testing checklist:**

- [ ] All slots visible on app start
- [ ] Empty slots show "Add Sketch" CTA
- [ ] Clicking CTA opens SketchBrowser for that slot
- [ ] Sketch loads into correct slot
- [ ] Clearing a sketch returns to empty state
- [ ] Midimix column correspondence is clear (slot N = column N)

---

### Phase 8: Midimix Column Harmonization ✅ COMPLETE

**Goal:** Align slot count with Midimix's 8-column layout.

**Previous mismatch:**

- Midimix has 8 columns (fader + 3 knobs + mute/solo/rec arm each)
- App previously supported 6 slots
- Columns 7-8 were underutilized

**Implemented: Option A (8 slots, 1 column per slot)**

**Options:**

#### Option A: 8 Slots (1 column per slot)

```
Col 1    Col 2    Col 3    Col 4    Col 5    Col 6    Col 7    Col 8    Master
┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
│Knob1│  │Knob1│  │Knob1│  │Knob1│  │Knob1│  │Knob1│  │Knob1│  │Knob1│  │     │
│Knob2│  │Knob2│  │Knob2│  │Knob2│  │Knob2│  │Knob2│  │Knob2│  │Knob2│  │     │
│Knob3│  │Knob3│  │Knob3│  │Knob3│  │Knob3│  │Knob3│  │Knob3│  │Knob3│  │     │
│Mute │  │Mute │  │Mute │  │Mute │  │Mute │  │Mute │  │Mute │  │Mute │  │     │
│Solo │  │Solo │  │Solo │  │Solo │  │Solo │  │Solo │  │Solo │  │Solo │  │     │
│Rec  │  │Rec  │  │Rec  │  │Rec  │  │Rec  │  │Rec  │  │Rec  │  │Rec  │  │     │
│Fader│  │Fader│  │Fader│  │Fader│  │Fader│  │Fader│  │Fader│  │Fader│  │Fader│
└─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘  └─────┘
Slot 1   Slot 2   Slot 3   Slot 4   Slot 5   Slot 6   Slot 7   Slot 8   All

Per slot: Fader=Alpha, Knobs=Params 1-3, Mute=Toggle, Solo=Solo, Rec=???
```

**Pros:**

- 1:1 mapping, intuitive
- More visual layers available
- Simple mental model

**Cons:**

- Only 3 controllable parameters per slot
- May be too many slots for typical use

#### Option B: 4 Slots (2 columns per slot)

```
Col 1-2 (Slot 1)    Col 3-4 (Slot 2)    Col 5-6 (Slot 3)    Col 7-8 (Slot 4)    Master
┌─────┬─────┐       ┌─────┬─────┐       ┌─────┬─────┐       ┌─────┬─────┐       ┌─────┐
│Knob1│Knob4│       │Knob1│Knob4│       │Knob1│Knob4│       │Knob1│Knob4│       │     │
│Knob2│Knob5│       │Knob2│Knob5│       │Knob2│Knob5│       │Knob2│Knob5│       │     │
│Knob3│Knob6│       │Knob3│Knob6│       │Knob3│Knob6│       │Knob3│Knob6│       │     │
│Mute │CtlA │       │Mute │CtlA │       │Mute │CtlA │       │Mute │CtlA │       │     │
│Solo │CtlB │       │Solo │CtlB │       │Solo │CtlB │       │Solo │CtlB │       │     │
│Rec  │CtlC │       │Rec  │CtlC │       │Rec  │CtlC │       │Rec  │CtlC │       │     │
│Alpha│React│       │Alpha│React│       │Alpha│React│       │Alpha│React│       │Fader│
└─────┴─────┘       └─────┴─────┘       └─────┴─────┘       └─────┴─────┘       └─────┘
  Slot 1              Slot 2              Slot 3              Slot 4              All

Per slot:
- Fader 1: Alpha
- Fader 2: Audio Reactivity (Phase 7)
- Knobs 1-6: Params 1-6
- Mute: Toggle visibility
- Solo: Solo mode
- Rec: ???
- CtlA/B/C: Additional controls (crossfade target, preset, etc.)
```

**Pros:**

- 6 controllable parameters per slot
- Dedicated Audio Reactivity fader
- More control per layer
- Extra buttons for advanced features

**Cons:**

- Only 4 simultaneous layers
- Slightly more complex mental model

**Recommendation:** Option A (8 slots) chosen for simplicity. The 1:1 mapping is more intuitive for live performance. If 3 parameters feels limiting, bank switching can be added later (Knobs 1-3 = params 1-3, hold button → params 4-6).

**Implementation completed:**

1. **`src/scenes/useSceneSlots.ts`** ✅
   - Changed `DEFAULT_MAX_SLOTS` from 6 to 8

2. **`src/App.tsx`** ✅
   - Updated `maxSlots: 8` in useSceneSlots config

3. **`src/scenes/sceneTypes.ts`** ✅
   - Updated `maxSlots` in `getAllParameterIds` from 6 to 8

4. **`src/inputs/hid.ts`** ✅
   - Updated `maxSlots` default from 4 to 8 in MacropadConfig

5. **`src-tauri/src/midi.rs`** ✅
   - Updated `setup_midimix_default_mappings` to map all 8 faders to slot alphas
   - Updated `update_midimix_knob_mappings` slot limit from 6 to 8
   - Updated LED startup animation to cover all 8 columns
   - Updated LED shutdown animation to cover all 8 columns
   - Updated `update_midimix_leds` to update all 8 columns

6. **Renderer**
   - Already supports arbitrary slot count (no changes needed)

**Testing checklist:**

- [x] 8 slots can be created in UI
- [x] All 8 Midimix faders map to slot alphas (CC 19, 23, 27, 31, 49, 53, 57, 61)
- [x] All 8 Midimix knob columns map to sketch parameters
- [x] LED startup animation covers all 8 columns
- [x] LED shutdown animation covers all 8 columns
- [x] `update_midimix_leds` reflects 8-slot state
- [ ] Performance acceptable with 8 active sketches (to verify)
- [ ] UI scrolls/scales appropriately for 8 slots (to verify)

---

## Future Enhancements

Potential additions for future phases:

1. **Audio Reactivity Master**
   - Per-slot `audio_reactivity` parameter (0.0–1.0) as a multiplier for all audio mappings
   - Smoothly fade audio effects in/out during performance via knob or fader

2. **Button Controls**
   - Mute buttons to toggle slot visibility (alpha 0/1)
   - Solo button to solo a single slot (set others to 0)
   - Bank buttons to switch between parameter pages (params 1-3, 4-6, etc.)

3. **Advanced Feedback**
   - Map Solo LEDs to crossfade target indicator
   - Pulse LEDs on audio reactivity
   - Color-coded LED states

4. **Preset System**
   - Save/load slot configurations via buttons
   - Scene snapshots with smooth transitions

5. **Additional Controller Profiles**
   - Launchpad auto-setup
   - APC Mini support
   - Generic template for custom controllers
