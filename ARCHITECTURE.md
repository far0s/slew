# VJ Tool Architecture (Draft)

## Overview

A custom, modular VJ engine built on **Tauri (v2.x)**, using a dual-window architecture:

- **Window A**: High-performance visual renderer (r3f + WebGPU + TSL).
- **Window B**: Control UI (React).

Backend services handle input (OSC, MIDI, audio), state management, modulation, transitions, and inter-window messaging.

---

## Technology Stack

### Application Shell

- **Tauri** (Rust backend + WebView frontend)
  - Lightweight
  - Native plugin layer for Syphon/Spout/NDI, OSC, MIDI
  - Event-driven communication between windows

### Frontend Tech

- **React** (SPA)
- **Vite** for build tooling
- **react-three-fiber (r3f)** for scene graph
- **Three.js + WebGPU backend**
- **TSL (Three Shader Language)** for modular shader authoring

---

## Window Architecture

### Window A — Renderer

**Purpose:** Display visuals at high FPS, no UI.

**Characteristics**:

- Runs full-screen or as a borderless window
- Dedicated render loop using r3f + WebGPU
- Receives parameters/uniform updates from backend
- Supports layering (Scene A/B blending)
- Exposes rendered frames via:
  - Syphon (macOS)
  - Spout (Windows)
  - NDI (cross-platform)

**Constraints**:

- No React Devtools
- No inspector
- No blocking/async UI operations
- Isolated from UI to avoid frame drops

### Window B — Control UI

**Purpose:** VJ dashboard for live control.

**Features**:

- Scene selection & switching
- Parameter panels (Leva-like)
- Color/FX presets
- MIDI Learn UI for knob/pad mapping
- OSC endpoint management
- Audio input configuration
- Transition controls (crossfade, interpolation curves)

**Behavior**:

- Sends updates to Window A via Tauri events
- Maintains global app state
- Loads/saves presets and projects

---

## Core Architecture

### 1. Message Backbone

Bidirectional communication between:

- Rust backend ↔ Window A
- Rust backend ↔ Window B

Mechanisms:

- Tauri emit/listen events
- Optional WebSocket layer for real-time streams

### 2. Parameter Server

Central authority managing:

- Visual parameters
- Scene state
- MIDI/OSC mappings
- Modulation sources

All parameters are **transitionable signals**, not raw numbers.

**Parameter structure example**:

```ts
interface Parameter {
  value: number;
  target: number;
  transitionSpeed: number;
  curve: "linear" | "ease" | "exp";
}
```

Parameter updates flow: Window B → Backend → Window A.

### 3. Scene System

Each visual scene is:

- A React component
- A set of parameters
- A shader pipeline

Scene switching uses:

- Preloading both scenes
- Crossfading render targets
- Maintaining state during transitions

### 4. Modulation Engine

Non-user-driven changes ("animation logic"):

- LFOs
- Beat followers
- Random walkers
- Envelopes
- Step sequencers

Each modulator can target any parameter.

### 5. Input Engines

#### OSC Input

- Implemented via Rust OSC crate
- Mappable to any parameter
- Optional namespaces for devices

#### MIDI Input

- Rust `midir` for stable MIDI
- Device identification
- MIDI learn flow
- Filtering + smoothing

#### Audio Input

- Rust audio capture → FFT → amplitude & frequency bands
- Local mp3 decoding for testing
- Virtual audio input support (BlackHole, VB-Cable)

Audio produces:

- Beat triggers
- Band energy envelopes
- Overall loudness

### 6. Renderer Architecture (Window A)

Visual pipeline:

1. Render Scene A → RenderTargetA
2. Render Scene B → RenderTargetB (optional)
3. Blend using crossfade uniform
4. Postprocess pipeline (Bloom, feedback, distortions)

All uniforms come from Parameter Server.

Shaders use TSL for extendability.

### 7. Video Output

Platform-dependent plugins:

- macOS → Syphon
- Windows → Spout
- Cross-platform → NDI

These plugins read directly from Window A’s GPU texture.

---

## Project Structure (High-Level)

```
/project
  /src
    /windows
      /renderer        # Window A
      /controls        # Window B
    /core
      /parameters
      /modulation
      /inputs
        /midi
        /osc
        /audio
      /scenes
      /transitions
      /video-out
    /lib
      /shaders
      /utils
  /rust
    /plugins
      /osc
      /midi
      /audio
      /syphon_spout
      /ndi
```

---

## Code Style

### TypeScript JSDoc Conventions

When documenting TypeScript interfaces and types, use a **consolidated JSDoc block** before the interface rather than inline comments on each property. This keeps interfaces clean and scannable while preserving full documentation.

**Pattern:**

```ts
/**
 * Brief description of the interface.
 *
 * @property propertyA - Description of property A
 * @property propertyB - Description of property B
 * @property onSomething - Callback when something happens
 */
export interface MyComponentProps {
  propertyA: string;
  propertyB: number;
  onSomething: () => void;
}
```

**Why:**

- Interfaces remain concise and easy to scan
- All documentation is co-located in one block
- Works well with IDE tooltips (shows full JSDoc on hover)
- Follows JSDoc `@property` convention for object shapes

**Avoid:**

```ts
// ❌ Don't use inline comments on every property
export interface MyComponentProps {
  /** Description of property A */
  propertyA: string;
  /** Description of property B */
  propertyB: number;
}
```

### Component Documentation

Each React component should have a JSDoc block describing:

1. What the component does (one-liner)
2. Key features or behaviors (bullet list if needed)

```ts
/**
 * ScenesArea
 *
 * Horizontally scrollable container for scene columns.
 * Designed to show ~3.5 columns at once with the 4th peeking in.
 *
 * Features:
 * - Horizontal scroll for 4+ scenes
 * - Add scene button when < maxSlots
 * - AnimatePresence for enter/exit animations
 */
export function ScenesArea({ ... }: ScenesAreaProps) {
```

### Hook Documentation

Custom hooks should document:

1. Purpose
2. Key concepts or state it manages
3. Return type (via the interface JSDoc)

```ts
/**
 * Hook for managing numbered scene slots.
 *
 * Replaces the old "Active/Next" paradigm with a flexible
 * system supporting 1-4 numbered slots.
 *
 * Key concepts:
 * - Each slot has an index (0-3) and a scene ID
 * - One slot is "active" (being rendered to output)
 * - Crossfading transitions from active to a target slot
 */
export function useSceneSlots(config?: Partial<SceneSlotsConfig>): SceneSlotsState {
```

---

## Extensibility

Future additions:

- More scenes, FX, TSL utilities
- Dynamic patching (visual node graph)
- Network sync between multiple machines
- Recording
- DMX lighting control (OSC → DMX plugin)
- Multi-display setups

---

## Project Name

Working name: **sebcat-vj** (can be revised later).

---

## First-Prompt Instructions (For Bootstrapping LLM)

This section is intended to be given to another LLM starting from zero context. Its job is to generate the initial codebase and core scaffolding.

### Instructions for the LLM

You are tasked with generating the initial codebase for a modular VJ application called **sebcat-vj**. Your goals:

1. **Create a Tauri app** with two windows:
   - **Window A (renderer)**: fullscreen or borderless, runs a high-performance React + react-three-fiber + WebGPU + TSL renderer. No UI. Listens for parameter updates.
   - **Window B (control UI)**: standard React SPA with routing handled by Vite. UI for scenes, parameters, MIDI mapping, OSC config.

2. **Implement a communication layer** between the two windows via Tauri events.

3. **Stub the core systems**:
   - Parameter Server (with transitionable parameters)
   - Scene Manager with two demo scenes
   - Modulation engine (placeholder LFO + random)
   - Input engines (empty functions for OSC, MIDI, audio)
   - Basic video-out plugin interface (Rust-side, unimplemented)

4. **Generate a clean project structure** matching the architecture above.

5. **Provide minimal demo functionality**:
   - A rotating cube or shader as Scene A
   - A color-changing uniform as Scene B
   - Crossfade slider in Window B controlling blend in Window A
   - A couple of adjustable parameters (speed, color, distortion)

6. **Follow the user's Prettier preferences**.

7. **Use TypeScript everywhere possible**.

Output should include:

- Directory structure
- All source files
- README
- Setup instructions

The final output should be a fully runnable minimal prototype.

---

## Roadmap

A rough sequence for implementation:

### Phase 1 — Foundations

- Set up Tauri project
- Create Window A + Window B
- Basic inter-window messaging
- Basic react-three-fiber WebGPU renderer
- One demo scene
- Crossfade uniform proof-of-concept

### Phase 2 — Input Layer

- Integrate Rust OSC module
- Integrate Rust MIDI module
- Integrate Rust audio capture + FFT
- Expose input data to Parameter Server

### Phase 3 — Parameter & Modulation Systems

- Implement Parameter Server with transitions
- Add LFO, random, envelope followers
- Build a simple modulation matrix

### Phase 4 — Control UI

- Scene switching UI
- Parameter panels (Leva-like or custom)
- MIDI Learn UI
- OSC routing UI
- Audio input UI

### Phase 5 — Video Output

- Implement Syphon/Spout/NDI plugin
- Allow Window A to be used as input inside Resolume/VDMX

### Phase 6 — Scene/Ecosystem Expansion

- Add more scenes using TSL utilities
- Add more input modalities
- Add recording, multi-display, presets, project saving

### Phase 7 — Polishing & Distribution

- Packaging for macOS + Windows
- UX cleanup
- Error handling

---

## Similar Open-Source Projects (Inspiration)

A few projects you can study:

- **Lumen** (macOS, open-source-ish via releases — Quartz Composer style, great UI patterns) - https://lumen-app.com/
- **Cables.gl** (node-based WebGL editor — excellent real-time UI inspiration) - https://cables.gl/
- **Hydra** (browser-based, live-coding visuals) - https://github.com/hydra-synth/hydra
- **OpenFrameworks addons for VJing** (many VJ apps are built this way) - https://openframeworks.cc/addons/
- **VDMX community plugins** (for UI + modularity inspiration) - https://docs.vidvox.net/vdmx/vdmx_plugins.html
- **TouchDesigner toe files** (non-open-source engine, but thousands of shared projects) - https://derivative.ca/UserGuide/.toe
- **synesthesia.live (open-source client)**: browser VJ tool with WebGL engine - https://synesthesia.live/

If needed, we can break down what each of these does well.

---

## Summary

This architecture gives:

- A clean separation of UI and rendering
- High-performance WebGPU-based visuals
- Interoperability with real VJ ecosystems (OSC, MIDI, Syphon/Spout/NDI)
- Smooth transitions
- Hardware control
- Extendable shader/effect system

Ready for prototyping when you are.
