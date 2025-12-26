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
   - Added "Output / Feedback" collapsible section
   - Added `OutputDeviceList` component for output device management
   - Added `OutputConfig` component for feedback toggle

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

**Phases 1-4 are complete!** Multi-layer alpha rendering and MIDI output are working.

**To test:**

1. Start the app with `npm run tauri dev`
2. Add multiple slots
3. Use Midimix faders to control each slot's Alpha parameter
4. All slots with alpha > 0 should be visible simultaneously in both Renderer AND Live Preview
5. Crossfade still works for smooth transitions
6. Open Debug Panel → MIDI → Output / Feedback section
7. Connect a MIDI **output** device (e.g., Midimix appears as both input and output)
8. Ensure "Send CC feedback to controllers" is enabled (on by default)
9. Map a parameter via MIDI Learn
10. Change that parameter from the UI - the controller should receive the CC value

**Important notes:**

- You must connect BOTH the input AND output device separately
- Input device IDs are like "0", "1", output device IDs are like "out_0", "out_1"
- The mapping's device_id is for input filtering only; output goes to all connected outputs (or config-specified device)

**Testing MIDI output programmatically:**

```typescript
import { sendMidiCc, sendMidiNoteOn, useMidiOutput } from "./inputs/midi";

// Send a CC value (e.g., to set an LED ring level)
await sendMidiCc(null, 0, 16, 64); // channel 0, CC 16, value 64

// Send Note On (e.g., to light an LED)
await sendMidiNoteOn(null, 0, 1, 127); // channel 0, note 1, velocity 127
```

**Next priorities:**

All major features are complete! Potential future enhancements:

1. **More device profiles** - Add auto-setup for other controllers (Launchpad, etc.)
2. **Solo mode** - Button to solo a single slot (set all others to alpha 0)
3. **Advanced LED feedback** - Map slot states to Midimix button LEDs dynamically

**Key files:**

- `src-tauri/src/midi.rs` - MIDI input/output engine
- `src/inputs/midi.ts` - TypeScript types, API functions, and hooks
- `src/components/MidiPanel/` - UI for device and feedback management

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
   - Mute + Rec Arm rows indicate which slots have sketches loaded
   - Solo row reserved for future feedback (e.g., crossfade target)

**Midimix CC/Note reference:**

- Faders: CC 19, 23, 27, 31, 49, 53, 57, 61 (columns 1-8)
- Mute LEDs: Notes 1, 4, 7, 10, 13, 16, 19, 22
- Solo LEDs: Notes 2, 5, 8, 11, 14, 17, 20, 23
- Rec Arm LEDs: Notes 3, 6, 9, 12, 15, 18, 21, 24

**LED state meaning:**

- Mute + Rec Arm ON: Slot has an active sketch (can be controlled)
- All OFF: No sketch in that slot
- Solo: Reserved for future use (crossfade target indicator, etc.)
