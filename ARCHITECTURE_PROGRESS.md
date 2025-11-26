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
| Scene System      | ✅     | Slot-based (1-6), auto-generated controls                     |
| Crossfade         | ✅     | Smooth blending with correct scene pairing                    |
| MIDI Input        | ✅     | Device enumeration, Learn workflow, per-slider integration    |
| OSC Input         | ✅     | UDP server (port 9000), default mappings                      |
| Audio Input       | ✅     | FFT analysis, beat detection, BPM, level meters               |
| Audio → Parameter | ✅     | Full mapping system with modes (continuous/trigger/add)       |
| HID Input         | ✅     | DOIO Megalodon macropad with encoders                         |
| Modulation Engine | ✅     | Backend LFOs, modulation matrix, audio→LFO, slider indicators |
| Video Output      | ✅     | Syphon + NDI working, 1080p@60 optimization backlogged        |

---

## 2. Core Architecture

### Windows

- **Renderer** (`/renderer`): React + `@react-three/fiber` for 3D scenes
- **Controls** (`/`): React UI for parameters, scenes, and input devices

Both windows share the same frontend bundle; `src/main.tsx` dispatches based on path.

### Parameter Server (Rust)

- `Parameter` struct: `id`, `value`, `target`, `transition_speed`, `curve`
- Global `ParameterStore` with ~60Hz tick loop for smooth transitions
- Persistence to `parameters.json`
- Events: `parameter_changed`, `parameters_cleared`

### Scene System

- **Scene Descriptors** (`src/scenes/sceneTypes.ts`): Single source of truth for parameters
- **Slot-based UI**: 1-6 numbered slots, add/remove dynamically
- **Auto-generated controls**: `SceneParameterControls` reads from descriptors
- **Parameter store**: `useParameterStore` hook with Map-based state

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
| `src/scenes/sceneTypes.ts`            | Scene/parameter descriptors (source of truth)      |
| `src/controls/useParameterStore.ts`   | Map-based parameter state                          |
| `src/renderer/VideoOutputCapture.tsx` | Frame capture component (inside r3f Canvas)        |

---

## 7. Decisions & Assumptions

1. **Rendering**: WebGL via Three.js/r3f (WebGPU planned for future)
2. **State**: Backend Parameter Server is canonical source
3. **Messaging**: Event-based (`parameter_changed`, `*_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior
7. **Video Output**: NDI enabled by default (requires SDK)

---

## 8. Next Actions

### Prioritized

1. **Scene System Expansion**
   - Add more scenes with different visual styles
   - Scene library/browser UI
   - Scene presets (save parameter values per scene)

2. **UX Polish**
   - MIDI/OSC binding indicators on sliders
   - Mapping import/export (JSON)
   - Better device hot-plug handling

3. **Video Output Optimization**
   - 1080p@60fps performance (zero-copy IOSurface, binary IPC)
   - Spout implementation for Windows

### Future Phases

- **Multi-Instance Scenes**: Allow same scene in multiple slots with independent parameters
- **Presets & Projects**: Save/load parameter snapshots, scene selections, mappings
- **Multi-display**: Multiple renderer windows
- **Recording**: GPU-based capture or frame export
- **Packaging**: macOS/Windows builds with code signing

---

## 9. Housekeeping

- Run `npx tsc --noEmit` and `cargo check` after changes
- Keep this document updated as features land
- Follow JSDoc conventions in `ARCHITECTURE.md`
