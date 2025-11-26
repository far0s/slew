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

| System            | Status | Notes                                                      |
| ----------------- | ------ | ---------------------------------------------------------- |
| Tauri + React app | ✅     | Dual-window (Renderer + Controls)                          |
| Parameter Server  | ✅     | Rust backend with ~60Hz transitions                        |
| Scene System      | ✅     | Slot-based (1-6), auto-generated controls                  |
| Crossfade         | ✅     | Smooth blending with correct scene pairing                 |
| MIDI Input        | ✅     | Device enumeration, Learn workflow, per-slider integration |
| OSC Input         | ✅     | UDP server (port 9000), default mappings                   |
| Audio Input       | ✅     | FFT analysis, beat detection, BPM, level meters            |
| Audio → Parameter | ✅     | Full mapping system with modes (continuous/trigger/add)    |
| HID Input         | ✅     | DOIO Megalodon macropad with encoders                      |
| Modulation Engine | ✅     | Backend LFOs, modulation matrix, audio→LFO                 |
| Video Output      | ⏳     | Syphon/Spout/NDI planned                                   |

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
- Recent messages display in UI

### Audio (`src-tauri/src/audio.rs`)

- Capture via `cpal`, FFT via `rustfft`
- Outputs: RMS, Peak, frequency bands (bass/low-mid/high-mid/treble), beat detection
- Audio → Parameter mappings with modes:
  - **Continuous**: Direct value mapping
  - **Trigger**: Set value on beat
  - **Add**: Additive to current value
- Per-mapping smoothing, enable/disable, output range
- BPM calculation from beat intervals
- Color-coded level meters in UI

### HID (`src-tauri/src/hid.rs`)

- `hidapi` crate for cross-platform HID access
- Supported: DOIO Megalodon (16 keys + 3 encoders)
- Auto-connect with periodic polling
- Macropad integration:
  - Keys 1-4: Select scene slot
  - Action key: Trigger crossfade
  - Encoders: Control parameters of selected scene

---

## 4. Modulation Engine

**Backend module**: `src-tauri/src/modulation.rs`

### LFO Sources

- Waveforms: Sine, Triangle, Saw, Square, Random
- Configurable: rate (Hz), phase, depth, offset
- BPM sync option (1/4 beat to 8 beats division)
- Real-time value emission for UI visualization

### Modulation Targets

- Route any LFO to any parameter
- Configurable depth with bipolar (±) or unipolar mode
- Base value caching prevents UI slider conflicts

### Audio → LFO Modulation

- Any audio source can modulate LFO properties (rate, depth, phase)
- Creates audio-reactive modulation chains
- Example: Bass → LFO Rate → Brightness (pulsing speed follows bass)

### Frontend

- Types and hooks in `src/inputs/modulation.ts`
- `ModulationPanel` component with:
  - LFO list with waveform visualization
  - Modulation targets matrix
  - Audio → LFO routing

---

## 5. Crossfade Implementation

**Key insight**: Scene pairing must be set BEFORE crossfade value changes.

1. User clicks crossfade button
2. Backend receives `set_scene_pairing(activeId, nextId)`
3. Renderer updates scene components
4. Backend receives `set_parameter("crossfade", targetValue)`
5. Tick loop smoothly interpolates `value` → `target`
6. `parameter_changed` events update UI and Renderer

**Special handling**:

- Backend emits current `value` (not `target`) for crossfade → smooth animation
- Controls use `value` for crossfade display, `target` for other parameters

---

## 6. Key Files

| File                                | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `src-tauri/src/lib.rs`              | Parameter Server, tick loop, command registration  |
| `src-tauri/src/audio.rs`            | Audio capture, FFT, beat detection, audio mappings |
| `src-tauri/src/modulation.rs`       | LFO engine, modulation matrix                      |
| `src-tauri/src/midi.rs`             | MIDI device management and mappings                |
| `src-tauri/src/osc.rs`              | OSC server and mappings                            |
| `src-tauri/src/hid.rs`              | HID device management (macropads)                  |
| `src/scenes/sceneTypes.ts`          | Scene/parameter descriptors (source of truth)      |
| `src/controls/useParameterStore.ts` | Map-based parameter state                          |
| `src/inputs/audio.ts`               | Audio types, hooks, helpers                        |
| `src/inputs/modulation.ts`          | Modulation types, hooks, helpers                   |
| `src/components/ModulationPanel/`   | LFO and modulation UI                              |
| `src/components/AudioPanel/`        | Audio device, levels, mappings UI                  |
| `src/components/ScenesArea/`        | Scene slots container                              |
| `src/components/ParameterSlider/`   | Slider with MIDI learn and indicators              |

---

## 7. Decisions & Assumptions

1. **Rendering**: WebGL via Three.js/r3f (WebGPU planned for future)
2. **State**: Backend Parameter Server is canonical source
3. **Messaging**: Event-based (`parameter_changed`, `*_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior

---

## 8. Next Actions

### Prioritized

1. **Modulation Indicator on Sliders**
   - Show when a parameter is being modulated by an LFO
   - Query `is_parameter_modulated` for each slider
   - Add indigo-colored indicator badge (like audio indicator)

2. **Video Output Prototype**
   - Define interface for Syphon/Spout/NDI
   - Create no-op backend that logs calls
   - macOS: Begin Syphon integration

3. **Scene System Expansion**
   - Add more scenes with different visual styles
   - Scene library/browser UI
   - Scene presets (save parameter values per scene)

4. **UX Polish**
   - MIDI/OSC binding indicators on sliders
   - Mapping import/export (JSON)
   - Better device hot-plug handling

### Future Phases

- **Presets & Projects**: Save/load parameter snapshots, scene selections, mappings
- **Multi-display**: Multiple renderer windows
- **Recording**: GPU-based capture or frame export
- **Packaging**: macOS/Windows builds with code signing

---

## 9. Code Style Reference

See `ARCHITECTURE.md` → **Code Style** section for full details.

**JSDoc pattern**: Use consolidated `@property` blocks before interfaces:

```ts
/**
 * Props for the ScenesArea component.
 *
 * @property slots - Array of scene slots to render
 * @property activeIndex - Index of the active (output) slot
 */
export interface ScenesAreaProps {
  slots: SceneSlot[];
  activeIndex: number;
}
```

**Component docs**: One-liner + feature bullets

**Hook docs**: Purpose, key concepts, return type

---

## 10. Housekeeping

- Run `npx tsc --noEmit` and `cargo check` after changes
- Keep this document updated as features land
- Follow JSDoc conventions in `ARCHITECTURE.md`
