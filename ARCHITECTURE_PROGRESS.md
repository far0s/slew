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

| System             | Status | Notes                                                         |
| ------------------ | ------ | ------------------------------------------------------------- |
| Tauri + React app  | ✅     | Dual-window (Renderer + Controls)                             |
| Parameter Server   | ✅     | Rust backend with ~60Hz transitions                           |
| Sketch/Slot System | ✅     | Slot-based (1-6), multi-instance, auto-generated controls     |
| Crossfade          | ✅     | Smooth blending with correct scene pairing                    |
| MIDI Input         | ✅     | Hot-plug detection, auto-reconnect, Learn workflow            |
| OSC Input          | ✅     | UDP server (port 9000), default mappings                      |
| Audio Input        | ✅     | Hot-plug detection, auto-reconnect, FFT, beat detection       |
| Audio → Parameter  | ✅     | Full mapping system with modes (continuous/trigger/add)       |
| HID Input          | ✅     | DOIO Megalodon macropad with encoders, auto-connect           |
| Modulation Engine  | ✅     | Backend LFOs, modulation matrix, audio→LFO, slider indicators |
| Video Output       | ✅     | Syphon + NDI working, 1080p@60 optimization backlogged        |
| Shader Sketches    | ✅     | TslText3D (3D text), TslNoiseBlob (procedural noise)          |
| Packaging          | 🧪     | macOS bundle config, entitlements, scripts; signing untested  |

---

## 2. Core Architecture

### Windows

- **Renderer** (`/renderer`): React + `@react-three/fiber` for 3D scenes
- **Controls** (`/`): React UI for parameters, scenes, and input devices

Both windows share the same frontend bundle; `src/main.tsx` dispatches based on path.

### Recent Changes (Device Hot-Plug)

- Added background device watcher threads for MIDI and Audio (2s polling interval)
- Implemented auto-reconnect for MIDI (remembers connected devices) and Audio (reconnects to last active)
- Added `audio_devices_changed` event for real-time UI updates
- UI panels now show devices automatically without manual refresh
- Added auto-reconnect toggles in MIDI and Audio panels

### Parameter Server (Rust)

- `Parameter` struct: `id`, `value`, `target`, `transition_speed`, `curve`
- Global `ParameterStore` with ~60Hz tick loop for smooth transitions
- Persistence to `parameters.json`
- Events: `parameter_changed`, `parameters_cleared`

### Sketch/Slot System

- **Sketches** (`/src/sketches/`): Self-contained visual programs with descriptors
  - Basic: `BlueCube`, `OrangeCube`, `GreenPulse`
  - Shader-based: `TslText3D` (3D text with hue/glow), `TslNoiseBlob` (procedural noise)
  - Each exports `descriptor: SketchDescriptor` + React component
  - Registry in `/src/sketches/index.ts`
- **Slots**: 1-6 numbered containers, add/remove dynamically
- **Multi-instance support**: Same sketch type can exist in multiple slots with independent parameters
- **Slot-prefixed parameters**: IDs use format `slot_{index}_{templateId}` (e.g., `slot_0_brightness`)
- **Auto-generated controls**: `SceneParameterControls` reads from sketch descriptors
- **Parameter store**: `useParameterStore` hook with dynamic slot-based state
- **Add Slot panel**: Inline options showing "New Slot" (defaults) and "Copy from Slot" buttons
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
- Default mappings for slot parameters (e.g., `/slot/0/brightness`)

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

### Device Hot-Plug Detection

All input systems now support automatic device detection:

| System | Polling Interval | Auto-Reconnect                   | Events                                          |
| ------ | ---------------- | -------------------------------- | ----------------------------------------------- |
| MIDI   | 2s               | ✅ (remembers connected devices) | `midi_devices_changed`                          |
| Audio  | 2s               | ✅ (reconnects to last active)   | `audio_devices_changed`, `audio_status_changed` |
| HID    | 500ms            | ✅ (auto-connect thread)         | `hid_status_changed`                            |

**MIDI Hot-Plug**:

- Background thread polls device list every 2 seconds
- Compares against known devices, emits events on change
- Tracks intentionally connected devices for auto-reconnect
- Gracefully handles disconnection of open devices

**Audio Hot-Plug**:

- Background thread polls device list every 2 seconds
- Detects when active capture device is disconnected
- Remembers last active device for auto-reconnect
- Shows error state with reconnect hint in UI

**Configuration**:

- Auto-reconnect toggle in MIDI and Audio panels
- `set_midi_auto_reconnect`, `set_audio_auto_reconnect` commands
- Devices auto-appear in UI when plugged in (no manual refresh needed)

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
| `src/sketches/`                       | Self-contained sketch modules (BlueCube, etc.)     |
| `src/scenes/sceneTypes.ts`            | Parameter utilities, slot ID generation            |
| `src/scenes/useSceneSlots.ts`         | Slot management hook with multi-instance support   |
| `src/controls/useParameterStore.ts`   | Map-based parameter state                          |
| `src/renderer/VideoOutputCapture.tsx` | Frame capture component (inside r3f Canvas)        |

---

## 7. Decisions & Assumptions

1. **Rendering**: WebGL via Three.js/r3f with custom GLSL shaders
2. **State**: Backend Parameter Server is canonical source
3. **Messaging**: Event-based (`parameter_changed`, `slot_pairing_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior
7. **Video Output**: NDI enabled by default (requires SDK)
8. **Multi-instance**: Slot-prefixed parameter IDs (`slot_0_brightness` format)
9. **Parameter persistence**: Backend keeps parameters when slots are removed (for re-use)
10. **Terminology**: Use `SketchId`, `sketchId`, import from `/src/sketches`

---

## 8. Next Actions

### Suggested Next Steps

#### 1. Sketch Browser UI (High Priority)

Add a sketch type selector in the Add Slot panel:

- Grid/list view of available sketches with thumbnails
- Preview on hover (optional)
- Filter/search by name or tags
- Shows sketch description from descriptor

#### 2. Sketch Presets

Save/load parameter values per sketch:

- "Save Preset" button in slot controls
- Preset dropdown to load saved configurations
- Persist to JSON files (`presets/{sketchId}/{presetName}.json`)
- Default preset per sketch type

#### 3. More Shader Sketches

Expand the visual library with new procedural sketches:

- **Feedback/Tunnel**: Infinite zoom with color cycling
- **Particles**: GPU-driven particle system with audio reactivity
- **Kaleidoscope**: Mirror/reflection patterns
- **Waveform**: Audio-reactive visualization

#### 4. MIDI/OSC "Follow Active Slot" Mode

Simplify live control:

- Toggle to make all MIDI/OSC mappings control active slot's parameters
- Auto-remap when slot changes
- Visual indicator in UI when mode is active

#### 5. Video Output Optimization

Improve 1080p@60fps performance:

- Zero-copy IOSurface sharing for Syphon (macOS)
- Binary IPC instead of base64 encoding
- PBOs for async GPU readback
- Spout implementation for Windows

#### 6. Presets & Projects

Full session management:

- Save/load complete project state (slots, parameters, mappings)
- Quick snapshot for A/B comparison
- Export/import for sharing

### Future Phases

- **Multi-display**: Multiple renderer windows
- **Recording**: GPU-based capture or frame export
- **Post-processing**: Bloom, feedback, color grading pipeline
- **WebGPU Upgrade**: Switch to WebGPU renderer when r3f support matures
- **Packaging**: macOS/Windows builds with code signing

---

## 9. Housekeeping

- Run `npx tsc --noEmit` and `cargo check` after changes
- Keep this document updated as features land
- Follow JSDoc conventions in `ARCHITECTURE.md`
