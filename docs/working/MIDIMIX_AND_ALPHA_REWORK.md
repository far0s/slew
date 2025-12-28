# Midimix & Multi-Layer Alpha Rendering

Task documentation for the Midimix integration and multi-slot alpha rendering system.

---

## Goal

Render all slots simultaneously based on their alpha values, with 1:1 Midimix integration.

---

## Status Summary

| Phase | Description           | Status      |
| ----- | --------------------- | ----------- |
| 1     | Multi-Slot Rendering  | ✅ Complete |
| 2     | Preview Updates       | ✅ Complete |
| 3     | Crossfade Integration | ✅ Complete |
| 4     | MIDI Output           | ✅ Complete |
| 5     | Midimix Auto-Setup    | ✅ Complete |
| 6     | Enhanced MIDI Control | ✅ Complete |
| 7     | Slot System Rework    | ✅ Complete |
| 8     | 8-Slot Harmonization  | ✅ Complete |

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

---

## Remaining Tasks

- [ ] Look up Midimix master column button note numbers (SEND ALL, BANK LEFT/RIGHT, SOLO)
- [ ] Performance test with 8 active sketches at 1080p@60
- [ ] Verify UI scrolls/scales appropriately for 8 slots on smaller screens

---

## Future Enhancements

### Button Controls (Priority)

- Mute buttons → toggle slot visibility (alpha 0 ↔ 1)
- Solo button → solo a single slot
- Bank switching for additional parameters (params 4-6, etc.)

### Presets

- Save/load per-sketch parameter configurations
- Scene snapshots with smooth transitions

### Audio Reactivity Master

- Per-slot `audio_reactivity` parameter (0–1) as multiplier for all audio mappings
- Control via Midimix knob or fader

### Additional Controllers

- Launchpad, APC Mini, generic templates

---

## Key Files

| File                            | Purpose                                   |
| ------------------------------- | ----------------------------------------- |
| `src-tauri/src/midi.rs`         | MIDI I/O, Midimix mappings, LED control   |
| `src-tauri/src/hid.rs`          | HID device support (Megalodon)            |
| `src/renderer/RendererRoot.tsx` | Multi-slot rendering loop                 |
| `src/scenes/useSceneSlots.ts`   | 8-slot state management                   |
| `src/components/SceneColumn/`   | Slot UI with inline sketch browser        |
| `docs/CONTROLLERS.md`           | Controller layouts and MIDI/HID reference |

---

## Quick Test

1. `npm run tauri dev`
2. Connect Midimix (auto-connects with LED animation)
3. Click sketches in empty slots to load them
4. Use faders to control alpha, knobs for parameters
5. All slots with alpha > 0 render simultaneously
