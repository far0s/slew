# Architecture

System design and conventions for sebcat-vj.

---

## Overview

A modular VJ engine built on **Tauri v2**, using a dual-window architecture:

- **Renderer Window**: High-performance visual output (React + Three.js/r3f)
- **Controls Window**: UI dashboard for parameters, scenes, and input devices

The Rust backend handles input processing (OSC, MIDI, Audio, HID), state management, modulation, transitions, and inter-window messaging.

---

## Technology Stack

| Layer             | Technology                                                     |
| ----------------- | -------------------------------------------------------------- |
| Application Shell | Tauri v2 (Rust + WebView)                                      |
| Frontend          | React + TypeScript + Vite                                      |
| 3D Rendering      | Three.js via react-three-fiber                                 |
| Shaders           | Custom GLSL (TSL-style patterns)                               |
| Video Output      | Syphon (macOS), NDI (cross-platform)                           |
| Input             | MIDI (midir), OSC (rosc), Audio (cpal + rustfft), HID (hidapi) |

---

## Window Architecture

### Renderer Window (`/renderer`)

**Purpose**: Display visuals at high FPS with no UI overhead.

- Runs full-screen or borderless
- Dedicated render loop using r3f
- Receives parameter updates from backend via events
- Renders all slots with alpha > 0 simultaneously
- Exposes frames via Syphon/NDI for VJ software integration

**Constraints**:

- No React DevTools or inspector
- No blocking async operations
- Isolated from UI to prevent frame drops

### Controls Window (`/`)

**Purpose**: VJ dashboard for live control.

- Slot management with inline sketch browser
- Parameter sliders (auto-generated from sketch descriptors)
- MIDI Learn UI for knob/pad mapping
- Audio input configuration
- Crossfade controls
- Device status panels

Both windows share the same frontend bundle; `src/main.tsx` dispatches based on path.

---

## Core Systems

### Parameter Server

Central authority managing all visual parameters.

- Located in `src-tauri/src/lib.rs`
- ~60Hz tick loop for smooth transitions
- Parameters have `value`, `target`, `transition_speed`, and `curve`
- Persistence to `parameters.json`
- Events: `parameter_changed`, `parameters_cleared`

Parameter flow: **Controls UI → Backend → Renderer**

### Slot System

**Terminology**:

- **Slot**: Numbered container (0-7) that holds a sketch
- **Sketch**: Visual program (e.g., `BlueCube`, `TslNoiseBlob`)

Key characteristics:

- 8 fixed slots always visible in UI
- Empty slots show inline sketch browser
- Same sketch can exist in multiple slots with independent parameters
- Parameter IDs: `slot_{index}_{templateId}` (e.g., `slot_0_brightness`)
- Slots layer in index order (slot 0 = back, slot 7 = front)
- Persistence to `slots.json`

### Input Systems

All inputs follow the same pattern:

1. Rust module with device management
2. Tauri commands for CRUD
3. TypeScript hooks
4. UI panel in Controls sidebar

| System | Module     | Key Features                                                       |
| ------ | ---------- | ------------------------------------------------------------------ |
| MIDI   | `midi.rs`  | Learn mode, mappings persisted, Midimix integration, soft takeover |
| OSC    | `osc.rs`   | UDP server (port 9000), address → parameter mappings               |
| Audio  | `audio.rs` | FFT, beat detection, audio → parameter mappings                    |
| HID    | `hid.rs`   | Macropad support (DOIO Megalodon)                                  |

### Modulation Engine

Backend-driven modulation for deterministic behavior (`modulation.rs`):

- LFO sources: Sine, Triangle, Saw, Square, Random
- BPM sync option
- Any LFO can target any parameter
- Audio can modulate LFO properties

### Video Output

Frame capture from WebGL sent to Rust backends (`video_out.rs`):

- **Syphon** (macOS): Native bindings via `objc2` + CGL
- **NDI** (cross-platform): `grafton-ndi` crate
- **Spout** (Windows): Stub implementation

---

## Project Structure

```
/project
  /src
    /sketches/              # Visual programs (self-contained modules)
      /{SketchName}/
        index.tsx           # Component + SketchDescriptor
      index.ts              # SKETCH_REGISTRY
      types.ts              # SketchDescriptor, SketchProps
    /components/            # React UI components
      /SceneColumn/         # Slot column with inline browser
    /controls/              # useParameterStore hook
    /inputs/                # MIDI, OSC, Audio, HID hooks
    /renderer/              # Renderer window (RendererRoot, VideoOutputCapture)
    /scenes/                # Slot system utilities
      sceneTypes.ts         # Parameter ID utilities
      useSceneSlots.ts      # Slot state management
    /hooks/                 # Shared React hooks
  /src-tauri/               # Rust backend
    /src/
      lib.rs                # Parameter server, tick loop, commands
      window_manager.rs     # Window lifecycle, heartbeat, native menu
      midi.rs               # MIDI device management
      osc.rs                # OSC server
      audio.rs              # Audio capture, FFT, beat detection
      hid.rs                # HID/macropad support
      modulation.rs         # LFO engine, modulation matrix
      video_out.rs          # Video output backends
      syphon.rs             # Native Syphon bindings (macOS)
  /docs/                    # Documentation
  /scripts/                 # Build and setup scripts
```

---

## Code Style

### TypeScript JSDoc Conventions

Use a **consolidated JSDoc block** before interfaces:

```ts
/**
 * Brief description of the interface.
 *
 * @property propertyA - Description of property A
 * @property propertyB - Description of property B
 */
export interface MyComponentProps {
  propertyA: string;
  propertyB: number;
}
```

**Avoid** inline comments on each property:

```ts
// ❌ Don't do this
export interface MyComponentProps {
  /** Description of property A */
  propertyA: string;
}
```

### Component Documentation

```ts
/**
 * ScenesArea
 *
 * Horizontally scrollable container for slot columns.
 *
 * Features:
 * - Horizontal scroll for 8 slots
 * - AnimatePresence for enter/exit animations
 */
export function ScenesArea({ ... }: ScenesAreaProps) {
```

### Hook Documentation

```ts
/**
 * Hook for managing numbered slots with multi-instance support.
 *
 * Key concepts:
 * - Each slot has an index (0-7) and a sketchId
 * - Same sketch type can exist in multiple slots
 * - Each slot has independent parameters (slot-prefixed IDs)
 */
export function useSceneSlots(): SlotsState {
```

---

## Key Files Reference

| File                                | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `src-tauri/src/lib.rs`              | Parameter Server, tick loop, command registration   |
| `src-tauri/src/window_manager.rs`   | Window lifecycle, heartbeat monitoring, native menu |
| `src-tauri/src/midi.rs`             | MIDI device management, Midimix integration         |
| `src-tauri/src/audio.rs`            | Audio capture, FFT, beat detection                  |
| `src-tauri/src/modulation.rs`       | LFO engine, modulation matrix                       |
| `src-tauri/src/video_out.rs`        | Video output backends                               |
| `src/sketches/`                     | Self-contained sketch modules                       |
| `src/scenes/useSceneSlots.ts`       | Slot management hook                                |
| `src/controls/useParameterStore.ts` | Parameter state                                     |
| `src/renderer/RendererRoot.tsx`     | Multi-slot rendering loop                           |
| `src/components/SceneColumn/`       | Slot UI with inline sketch browser                  |

---

## Extensibility

The architecture supports future additions:

- More sketches and effects
- Additional controllers (Launchpad, APC Mini)
- Post-processing pipeline (bloom, feedback)
- Multi-display support
- Recording
- DMX lighting control
- WebGPU upgrade when r3f support matures
