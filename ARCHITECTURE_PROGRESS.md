# sebcat-vj – Architecture Progress Log

Short, task-focused status log for this project.
For detailed design, see `ARCHITECTURE.md`.

---

## Legend

- ✅ Done
- 🧪 Prototype / partial
- ⏳ Not started

---

## 1. High-Level Status

| System            | Status | Notes                                                         |
| ----------------- | ------ | ------------------------------------------------------------- |
| Tauri + React app | ✅     | Dual-window (Renderer + Controls)                             |
| Parameter Server  | ✅     | Rust backend with ~60Hz transitions                           |
| Scene System      | ✅     | Slot-based (1-6), multi-instance, auto-generated controls     |
| Crossfade         | ✅     | Smooth blending with correct scene pairing                    |
| MIDI Input        | ✅     | Device enumeration, Learn workflow, per-slider integration    |
| OSC Input         | ✅     | UDP server (port 9000), default mappings                      |
| Audio Input       | ✅     | FFT analysis, beat detection, BPM, level meters               |
| Audio → Parameter | ✅     | Full mapping system with modes (continuous/trigger/add)       |
| HID Input         | ✅     | DOIO Megalodon macropad with encoders                         |
| Modulation Engine | ✅     | Backend LFOs, modulation matrix, audio→LFO, slider indicators |
| Video Output      | ✅     | Syphon + NDI working, 1080p@60 optimization backlogged        |
| Packaging         | 🧪     | macOS bundle config, entitlements, scripts; signing untested  |

---

## 2. Core Architecture

### Windows

- **Renderer** (`/renderer`): React + `@react-three/fiber` for 3D scenes
- **Controls** (`/`): React UI for parameters, scenes, and input devices

Both windows share the same frontend bundle; `src/main.tsx` dispatches based on path.

### Recent Changes (Multi-Instance Scenes)

- Refactored scene system from scene-type keyed parameters to slot-prefixed parameters
- Implemented "Add Scene" inline panel with direct options (New Scene / Copy from Slot)
- Added parameter migration for legacy `parameters.json` entries
- Fixed Add Scene button sizing and dropdown positioning issues

### Parameter Server (Rust)

- `Parameter` struct: `id`, `value`, `target`, `transition_speed`, `curve`
- Global `ParameterStore` with ~60Hz tick loop for smooth transitions
- Persistence to `parameters.json`
- Events: `parameter_changed`, `parameters_cleared`

### Scene System

- **Scene Descriptors** (`src/scenes/sceneTypes.ts`): Template-based parameter definitions
- **Slot-based UI**: 1-6 numbered slots, add/remove dynamically
- **Multi-instance support**: Same scene type can exist in multiple slots with independent parameters
- **Slot-prefixed parameters**: IDs use format `slot_{index}_{templateId}` (e.g., `slot_0_brightness`)
- **Auto-generated controls**: `SceneParameterControls` reads from descriptors
- **Parameter store**: `useParameterStore` hook with dynamic slot-based state
- **Add Scene panel**: Inline options panel showing "New Scene" (defaults) and "Copy from Slot" buttons directly
- **Renderer slot awareness**: Renders by slot index, listens for `slot_pairing_changed` events

### Input Layer

All inputs follow the same pattern:

1. Rust module with device management and mapping storage
2. Tauri commands for CRUD operations
3. TypeScript types and React hooks
4. UI panel in Debug sidebar

---

## 3. Input Systems

### MIDI (`src-tauri/src/midi.rs`)

- Device enumeration via `midir` crate
- Learn mode: bind CC/Note to parameter
- Mappings persisted to `midi_mappings.json`
- Per-slider `MidiLearnButton` component

### OSC (`src-tauri/src/osc.rs`)

- UDP server via `rosc` crate (default port 9000)
- Address → parameter mappings with value scaling
- Default mappings for all parameters (e.g., `/scene_a/brightness`)

### Audio (`src-tauri/src/audio.rs`)

- Capture via `cpal`, FFT via `rustfft`
- Outputs: RMS, Peak, frequency bands (bass/low-mid/high-mid/treble), beat detection
- Audio → Parameter mappings with modes: Continuous, Trigger, Add
- Per-mapping smoothing, enable/disable, output range
- BPM calculation from beat intervals

### HID (`src-tauri/src/hid.rs`)

- `hidapi` crate for cross-platform HID access
- Supported: DOIO Megalodon (16 keys + 3 encoders)
- Auto-connect with periodic polling
- Macropad integration: Keys 1-4 select slots, Action key triggers crossfade, Encoders control parameters

---

## 4. Modulation Engine

**Backend module**: `src-tauri/src/modulation.rs`

### LFO Sources

- Waveforms: Sine, Triangle, Saw, Square, Random
- Configurable: rate (Hz), phase, depth, offset
- BPM sync option (1/4 beat to 8 beats division)

### Modulation Targets

- Route any LFO to any parameter
- Configurable depth with bipolar (±) or unipolar mode
- Base value caching prevents UI slider conflicts

### Audio → LFO Modulation

- Any audio source can modulate LFO properties (rate, depth, phase)
- Creates audio-reactive modulation chains

---

## 5. Video Output

**Backend modules**: `src-tauri/src/video_out.rs`, `src-tauri/src/syphon.rs`

### Architecture

- `VideoOutputBackend` trait with pluggable implementations
- Frame capture from WebGL via `VideoOutputCapture.tsx`
- Base64-encoded frame data sent to Rust via Tauri command
- Video panel UI in Controls window for enabling/disabling backends

### Syphon (macOS) ✅

- Native bindings via `objc2` + CGL + OpenGL
- Universal Syphon.framework (arm64 + x86_64) built from source
- Runtime loading via dlopen (no static linking)
- Setup: `./scripts/install-syphon.sh`

### NDI (Cross-platform) ✅

- `grafton-ndi` crate integration (default feature)
- RGBA→BGRA conversion for NDI compatibility
- Auto rpath configuration in `build.rs` for macOS
- Setup: `./scripts/install-ndi.sh` to install SDK

### Spout (Windows) 🧪

- Interface defined, stub implementation only
- Full implementation pending Windows testing

### Backlogged Optimizations

- Zero-copy IOSurface sharing for Syphon
- Binary IPC instead of base64 encoding
- PBOs for async GPU readback

---

## 6. Key Files

| File                                  | Purpose                                            |
| ------------------------------------- | -------------------------------------------------- |
| `src-tauri/src/lib.rs`                | Parameter Server, tick loop, command registration  |
| `src-tauri/src/audio.rs`              | Audio capture, FFT, beat detection, audio mappings |
| `src-tauri/src/modulation.rs`         | LFO engine, modulation matrix                      |
| `src-tauri/src/midi.rs`               | MIDI device management and mappings                |
| `src-tauri/src/osc.rs`                | OSC server and mappings                            |
| `src-tauri/src/hid.rs`                | HID device management (macropads)                  |
| `src-tauri/src/video_out.rs`          | Video output backends (Syphon, Spout, NDI)         |
| `src-tauri/src/syphon.rs`             | Native Syphon bindings (macOS only)                |
| `src/scenes/sceneTypes.ts`            | Scene/parameter templates, slot ID generation      |
| `src/controls/useParameterStore.ts`   | Map-based parameter state                          |
| `src/renderer/VideoOutputCapture.tsx` | Frame capture component (inside r3f Canvas)        |
| `src/scenes/useSceneSlots.ts`         | Slot management hook with multi-instance support   |
| `src/scenes/sceneComponents.ts`       | Scene component registry and generic SceneProps    |

---

## 7. Decisions & Assumptions

1. **Rendering**: WebGL via Three.js/r3f (WebGPU planned for future)
2. **State**: Backend Parameter Server is canonical source
3. **Messaging**: Event-based (`parameter_changed`, `slot_pairing_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior
7. **Video Output**: NDI enabled by default (requires SDK)
8. **Multi-instance**: Slot-prefixed parameter IDs (`slot_0_brightness` format)
9. **Parameter persistence**: Backend keeps parameters when slots are removed (for re-use)
10. **Legacy migration**: Old scene-prefixed parameters auto-migrated to slot format

---

## 8. Next Actions

### Prioritized

1. **Scene System Expansion**
   - Add more scenes with different visual styles
   - Scene library/browser UI (scene type selector in Add Scene panel)
   - Scene presets (save parameter values per scene)

2. **UX Polish**
   - MIDI/OSC "follow active slot" mapping mode (knobs control active slot's parameters)
   - Mapping import/export (JSON)
   - Better device hot-plug handling
   - Auto-scroll to newly added slot

3. **Video Output Optimization**
   - 1080p@60fps performance (zero-copy IOSurface, binary IPC)
   - Spout implementation for Windows

### Future Phases

- **Presets & Projects**: Save/load parameter snapshots, scene selections, mappings
- **Multi-display**: Multiple renderer windows
- **Recording**: GPU-based capture or frame export
- **Packaging**: macOS/Windows builds with code signing

---

## 9. Housekeeping

- Run `npx tsc --noEmit` and `cargo check` after changes
- Keep this document updated as features land
- Follow JSDoc conventions in `ARCHITECTURE.md`
