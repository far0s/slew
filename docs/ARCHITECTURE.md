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
| Shaders           | TSL (Three.js Shading Language) for WebGPU                     |
| GPU Backend       | WebGPU (Metal on macOS), WebGL2 fallback                       |
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

| System | Module   | Key Features                                                       |
| ------ | -------- | ------------------------------------------------------------------ |
| MIDI   | `midi/`  | Learn mode, mappings persisted, Midimix integration, soft takeover |
| OSC    | `osc.rs` | UDP server (port 9000), address → parameter mappings               |
| Audio  | `audio/` | FFT, beat detection, audio → parameter mappings                    |
| HID    | `hid/`   | Macropad support (DOIO Megalodon)                                  |

### Modulation Engine

Backend-driven modulation for deterministic behavior (`modulation.rs`):

- LFO sources: Sine, Triangle, Saw, Square, Random
- BPM sync option
- Any LFO can target any parameter
- Audio can modulate LFO properties

### Video Output

High-performance frame capture from WebGPU/WebGL sent to Rust backends (`video_out.rs`):

**Backends:**

- **Syphon** (macOS): Native bindings via `objc2` + CGL
- **NDI** (cross-platform): `grafton-ndi` crate
- **Spout** (Windows): Stub implementation

**Optimizations (see `docs/finished/VIDEO_OUTPUT_OPTIMIZATION.md`):**

- **WebGPU async readback**: `readRenderTargetPixelsAsync()` for non-blocking GPU→CPU transfer
- **Binary IPC protocol**: Raw pixel data via custom URI scheme, bypasses JSON/base64
- **PBO fallback**: Ping-pong Pixel Buffer Objects for WebGL2 async readback
- **Pre-allocated buffers**: Reuses memory to avoid per-frame allocations

**Data flow:**

```
WebGPU: render → readRenderTargetPixelsAsync() → flip → binary IPC → Syphon/NDI
WebGL2: render → PBO ping-pong readPixels → flip → binary IPC → Syphon/NDI
```

**Performance:** Stable 60fps at 1080p with Syphon output.

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
      /SlotColumn/          # Slot column with inline browser
    /controls/              # useParameterStore hook
    /inputs/                # MIDI, OSC, Audio, HID hooks
      /shared/              # Reusable hook infrastructure
    /renderer/              # Renderer window (RendererRoot, VideoOutputCapture)
    /slots/                 # Slot system utilities
      slotTypes.ts          # Parameter ID utilities
      useSlots.ts           # Slot state management
    /hooks/                 # Shared React hooks
  /src-tauri/               # Rust backend
    /src/
      lib.rs                # Parameter server, tick loop, commands
      window_manager.rs     # Window lifecycle, heartbeat, native menu
      /common/              # Shared utilities
        persistence.rs      # JSON I/O helpers
        events.rs           # Event emission helpers
      /midi/                # MIDI device management (13 modules)
        mod.rs, engine.rs, devices.rs, connections.rs,
        mappings.rs, learn.rs, midimix.rs, message_handler.rs, ...
      /audio/               # Audio capture, FFT, beat detection (11 modules)
        mod.rs, engine.rs, capture.rs, analysis.rs, mappings.rs, ...
      /hid/                 # HID/macropad support (11 modules)
        mod.rs, engine.rs, connections.rs, parsing.rs, mappings.rs, ...
      osc.rs                # OSC server
      modulation.rs         # LFO engine, modulation matrix
      video_out.rs          # Video output backends
      syphon.rs             # Native Syphon bindings (macOS)
  /docs/                    # Documentation
    /finished/              # Archived task documents
    /working/               # Active task documents
  /scripts/                 # Build and setup scripts
```

---

## Code Style

### TypeScript Conventions

**No JSDoc** - rely on TypeScript types for documentation. Types are self-documenting.

```ts
// ✅ Good - types speak for themselves
export interface SlotInfo {
  index: number;
  sketchId: SketchId | null;
  label: string;
}

// ❌ Avoid - redundant JSDoc
/** Slot information */
export interface SlotInfo {
  /** The slot index */ index: number;
  ...
}
```

### Rust Module Organization

Large modules are split into focused submodules:

```
/midi/
  mod.rs          # Public API, re-exports
  types.rs        # Type definitions
  engine.rs       # State, initialization
  devices.rs      # Device enumeration
  connections.rs  # Connect/disconnect
  mappings.rs     # CRUD + persistence
  commands.rs     # Tauri command wrappers
  ...
```

Pattern: Each submodule is <200 lines, single responsibility.

---

## Key Files Reference

| File                                | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `src-tauri/src/lib.rs`              | Parameter Server, tick loop, command registration   |
| `src-tauri/src/window_manager.rs`   | Window lifecycle, heartbeat monitoring, native menu |
| `src-tauri/src/common/`             | Shared utilities (persistence, events)              |
| `src-tauri/src/midi/`               | MIDI device management, Midimix integration         |
| `src-tauri/src/audio/`              | Audio capture, FFT, beat detection                  |
| `src-tauri/src/hid/`                | HID/macropad support                                |
| `src-tauri/src/modulation.rs`       | LFO engine, modulation matrix                       |
| `src-tauri/src/video_out.rs`        | Video output backends                               |
| `src/sketches/`                     | Self-contained sketch modules                       |
| `src/slots/useSlots.ts`             | Slot management hook                                |
| `src/inputs/shared/`                | Reusable hook infrastructure                        |
| `src/controls/useParameterStore.ts` | Parameter state                                     |
| `src/renderer/RendererRoot.tsx`     | Multi-slot rendering loop                           |
| `src/components/SlotColumn/`        | Slot UI with inline sketch browser                  |

---

## Extensibility

The architecture supports future additions:

- More sketches and effects
- Additional controllers (Launchpad, APC Mini)
- Post-processing pipeline (bloom, feedback)
- Multi-display support
- Recording
- DMX lighting control
- IOSurface zero-copy (see `docs/finished/IOSURFACE_FEASIBILITY.md`)
