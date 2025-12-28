# Changelog

Status overview and key decisions for sebcat-vj.

---

## Feature Status

| System             | Status | Notes                                                         |
| ------------------ | ------ | ------------------------------------------------------------- |
| Tauri + React app  | ✅     | Dual-window (Renderer + Controls)                             |
| Parameter Server   | ✅     | Rust backend with ~60Hz transitions                           |
| Sketch/Slot System | ✅     | Slot-based (1-8), multi-instance, auto-generated controls     |
| Sketch Browser UI  | ✅     | Inline browser in empty slots, no extra click needed          |
| Crossfade          | ✅     | Smooth blending with correct scene pairing                    |
| MIDI Input         | ✅     | Hot-plug detection, auto-reconnect, Learn workflow            |
| OSC Input          | ✅     | UDP server (port 9000), default mappings                      |
| Audio Input        | ✅     | Hot-plug detection, auto-reconnect, FFT, beat detection       |
| Audio → Parameter  | ✅     | Full mapping system with modes (continuous/trigger/add)       |
| HID Input          | ✅     | DOIO Megalodon macropad with encoders, auto-connect           |
| Modulation Engine  | ✅     | Backend LFOs, modulation matrix, audio→LFO, slider indicators |
| Video Output       | ✅     | Syphon + NDI working, 1080p@60 optimization backlogged        |
| Shader Sketches    | ✅     | TslText3D (3D text), TslNoiseBlob (procedural noise)          |
| Window Manager     | ✅     | Native menu, heartbeat monitoring, emergency recovery overlay |
| Packaging          | 🧪     | macOS bundle config, entitlements, scripts; signing untested  |

---

## Recent Changes

### 8-Slot Harmonization

Slot count increased from 6 to 8 to match Midimix columns for 1:1 hardware mapping.

### Slot System Rework

- Fixed slots always visible in UI (no add/remove, just load/unload sketches)
- Empty slots show inline sketch browser directly
- Removing a sketch returns slot to empty state
- Copy-from-slot feature for duplicating configurations

### Multi-Slot Rendering

- Renderer displays ALL slots with alpha > 0 simultaneously
- Slots layer in index order (slot 0 = back, slot 7 = front)
- Each slot's opacity equals its alpha parameter value

### Midimix Integration

- Faders 1-8 control slot alpha (visibility)
- Knobs 1-3 per column control first 3 sketch parameters
- Master fader fades all slots simultaneously
- LEDs indicate which slots have sketches loaded
- Auto-connect on startup with LED animation

### MIDI Output

- Bidirectional Midimix connection (input + output)
- Per-device feedback toggle
- CC value caching to avoid redundant sends

### Window Manager

- `window_manager.rs` module for window lifecycle management
- Native macOS menu bar with Window menu (⌘⇧C restart Controls, ⌘⇧R restart Renderer)
- Heartbeat monitoring: windows send periodic pings, backend detects frozen windows
- Slot state persistence to `slots.json`
- Parameter state persistence to `parameters.json`
- Window position/size persistence via `tauri-plugin-window-state`
- Controls window hydrates state from backend on restart

### Device Hot-Plug

- Background device watcher threads for MIDI and Audio (2s polling interval)
- Auto-reconnect for MIDI (remembers connected devices)
- Auto-reconnect for Audio (reconnects to last active)
- `audio_devices_changed` and `midi_devices_changed` events for real-time UI updates
- Auto-reconnect toggles in MIDI and Audio panels

---

## Key Decisions

1. **Rendering**: WebGL via Three.js/r3f with custom GLSL shaders
2. **State**: Backend Parameter Server is canonical source of truth
3. **Messaging**: Event-based (`parameter_changed`, `slot_pairing_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior
7. **Video Output**: NDI enabled by default (requires SDK)
8. **Multi-instance**: Slot-prefixed parameter IDs (`slot_0_brightness` format)
9. **Parameter persistence**: Backend keeps parameters when slots are removed (for re-use)
10. **Terminology**: Use `SketchId`, `sketchId`, import from `/src/sketches`

---

## Input Systems Summary

| System | Polling Interval | Auto-Reconnect                   | Events                                          |
| ------ | ---------------- | -------------------------------- | ----------------------------------------------- |
| MIDI   | 2s               | ✅ (remembers connected devices) | `midi_devices_changed`                          |
| Audio  | 2s               | ✅ (reconnects to last active)   | `audio_devices_changed`, `audio_status_changed` |
| HID    | 500ms            | ✅ (auto-connect thread)         | `hid_status_changed`                            |

---

## Version History

### v0.2.0 (Current Development)

- 8-slot system with fixed layout
- Full Midimix integration
- Multi-slot simultaneous rendering
- Window manager with recovery

### v0.1.0 (Initial Prototype)

- Dual-window architecture
- Basic sketches (BlueCube, OrangeCube, GreenPulse)
- Shader sketches (TslText3D, TslNoiseBlob)
- Parameter server with transitions
- Crossfade system
- MIDI, OSC, Audio, HID input
- Syphon and NDI output
- Modulation engine with LFOs
