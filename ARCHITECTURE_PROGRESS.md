# sebcat-vj – Architecture Progress Log

This document tracks implementation progress relative to `ARCHITECTURE.md`.  
It is meant to be **LLM-friendly**: concise, structured, and easy to rehydrate in new sessions.

---

## 0. Meta

- Project: **sebcat-vj** (working name)
- High-level goal: Modular VJ tool using Tauri with dual windows:
  - **Window A**: Fullscreen renderer (React + react-three-fiber + WebGPU + TSL)
  - **Window B**: Control UI (React SPA)
- Reference architecture: see `ARCHITECTURE.md`

### Document conventions

- ✅ Implemented & working
- 🧪 Implemented as stub / placeholder / prototype
- 🧩 Designed but not implemented
- ⏳ Not started
- ❓ Open question / decision needed

---

## 1. Overall Architecture Status

### 1.1 Windows

#### Window A — Renderer

- Status: ⏳
- Goal:
  - Borderless/fullscreen window
  - Dedicated r3f + WebGPU render loop
  - Receives parameter/uniform updates from backend
  - Supports Scene A/B layering and crossfade
- Notes:
  - Must avoid heavy devtools/inspection to protect FPS
  - Needs a clean subscription to Parameter Server

#### Window B — Control UI

- Status: ⏳
- Goal:
  - SPA dashboard for scenes, parameters, inputs, transitions
  - Drives backend/Parameter Server and indirectly Window A
- Notes:
  - Needs initial routing and layout
  - Must follow your accessibility/performance rules (keyboard, focus, no dead zones, etc.)

---

## 2. Core Systems

### 2.1 Message Backbone

- Status: ⏳
- Role: Bidirectional communication between:
  - Rust backend ↔ Window A
  - Rust backend ↔ Window B
- Planned mechanisms:
  - Event-based messaging
- Planned event families (to refine):
  - `parameters:update` (B → backend → A)
  - `scene:switch`
  - `modulation:update`
  - `input:status` (backend → B)
  - `transport:tick` or equivalent for timing (TBD)

### 2.2 Parameter Server

- Status: 🧩 Designed, not implemented
- Central responsibilities:
  - Manage canonical parameter state for:
    - Visual parameters
    - Scene state
    - MIDI/OSC mappings
    - Modulation sources
  - Ensure all parameters are **transitionable signals** (not raw numbers)
- Target base structure:

  - For each parameter:
    - `id: string`
    - `value: number`
    - `target: number`
    - `transitionSpeed: number`
    - `curve: "linear" | "ease" | "exp"`

- Requirements:
  - Live transitions (smoothed changes from `value` → `target`)
  - Integration with modulators (LFO, random, audio followers, etc.)
  - Integration with external inputs (OSC/MIDI/audio)
  - Sync-safe between windows

### 2.3 Scene System

- Status: 🧩 Designed
- Concept:
  - Each scene is:
    - A React component
    - A set of parameters
    - A shader pipeline
  - Scene switching:
    - Preload scenes
    - Render Scene A/B to separate render targets
    - Crossfade via uniform
- Needs:
  - Scene registry / manager
  - Simple API for:
    - `setActiveScene(id)`
    - `setNextScene(id)`
    - Crossfade progress uniform

### 2.4 Modulation Engine

- Status: 🧩 Designed
- Purpose:
  - Non-user-driven parameter changes:
    - LFOs
    - Beat followers
    - Random walkers
    - Envelopes
    - Step sequencers
- v1 Scope:
  - LFO (sine/triangle)
  - Simple random/Noise
  - Basic mapping (additive/multiplicative) to parameters

### 2.5 Input Engines

#### OSC Input

- Status: 🧩 Designed
- Requirements:
  - Device/namespace support
  - Map incoming OSC paths to parameters
  - Smoothing/filtering options

#### MIDI Input

- Status: 🧩 Designed
- Requirements:
  - Device identification
  - MIDI Learn workflow (bind control → parameter)
  - Event filtering and basic smoothing

#### Audio Input

- Status: 🧩 Designed
- Pipeline:
  - Capture → FFT → amplitude & frequency bands
- Outputs:
  - Beat triggers
  - Band energy envelopes
  - Overall loudness
- Additional:
  - Support for virtual devices (BlackHole, VB-Cable, etc.)

### 2.6 Renderer Architecture (Window A)

- Status: 🧩 Designed
- Visual pipeline:
  1. Render Scene A → RenderTargetA
  2. Render Scene B → RenderTargetB (optional)
  3. Blend using crossfade uniform
  4. Post-process (Bloom, feedback, distortions)
- Shaders:
  - Use TSL for modular, composable shader authoring
- All uniforms:
  - Driven by Parameter Server

### 2.7 Video Output

- Status: 🧩 Designed
- Goal:
  - Platform-dependent video output:
    - macOS → Syphon
    - Windows → Spout
    - Cross-platform → NDI
- Integration:
  - Plugins read directly from renderer’s GPU texture
  - Unified interface for publish/shutdown

---

## 3. Roadmap-Based Progress

Mapped from `ARCHITECTURE.md` roadmap.  
Initially all items are ⏳; update to 🧪 or ✅ as we implement.

### Phase 1 — Foundations

> - Set up Tauri project  
> - Create Window A + Window B  
> - Basic inter-window messaging  
> - Basic react-three-fiber WebGPU renderer  
> - One demo scene  
> - Crossfade uniform proof-of-concept  

**Status:** ⏳

Planned breakdown:

1. **Project bootstrap**
   - ⏳ Initialize Tauri project (TypeScript + Vite + React)
   - ⏳ Configure 2 windows (renderer + controls) in Tauri config
   - ⏳ Entrypoints:
     - `/src/windows/renderer/main.tsx`
     - `/src/windows/controls/main.tsx`

2. **Inter-window messaging (minimal)**
   - ⏳ Define event for parameter updates (e.g. slider value)
   - ⏳ Implement a proof-of-concept:
     - Slider in Window B updates a numeric value in Window A (even if only logged to console)

3. **Renderer bootstrap**
   - ⏳ Install and wire up `react-three-fiber` and WebGPU backend (with fallback strategy if needed)
   - 🧪 Implement **Scene A**:
     - Rotating cube
     - Expose parameters: `rotationSpeed`, `color`

4. **Crossfade prototype**
   - ⏳ Add **Scene B**:
     - Different visual (e.g. color pulsing cube or simple TSL shader)
   - ⏳ Render both scenes to separate render targets
   - ⏳ Implement crossfade uniform `u_crossfade` in post-pass
   - ⏳ Control `u_crossfade` from a slider in Window B via events

**Open questions (Phase 1):**

- ❓ WebGPU-only vs WebGL fallback: what is the desired behavior for machines without WebGPU?
- ❓ Any initial preference for scene organization? (filesystem naming, IDs, etc.)

---

### Phase 2 — Input Layer

> - Integrate Rust OSC module  
> - Integrate Rust MIDI module  
> - Integrate Rust audio capture + FFT  
> - Expose input data to Parameter Server  

**Status:** ⏳

Planned steps:

1. **Backend stubs**
   - ⏳ Create modules:
     - `/rust/plugins/osc`
     - `/rust/plugins/midi`
     - `/rust/plugins/audio`
   - 🧪 Provide minimal functions:
     - `start_*`, `stop_*`
     - Dummy events to prove wiring to frontend

2. **Real input integration**
   - ⏳ Wire OSC:
     - Bind port
     - Map OSC addresses to internal channels
   - ⏳ Wire MIDI:
     - Enumerate devices
     - Receive CC/Note events
   - ⏳ Wire audio:
     - Capture device input
     - Run FFT to extract bands and loudness

3. **Expose to Parameter Server**
   - ⏳ Define internal data structures for:
     - OSC channels
     - MIDI controllers
     - Audio bands
   - ⏳ Allow these to act as modulation sources for parameters

**Open questions (Phase 2):**

- ❓ Preferred Rust crates for OSC and audio? (If you have strong preferences.)
- ❓ OS development priority (e.g., macOS-first)?

---

### Phase 3 — Parameter & Modulation Systems

> - Implement Parameter Server with transitions  
> - Add LFO, random, envelope followers  
> - Build a simple modulation matrix  

**Status:** ⏳

Design notes:

1. **Parameter model (MVP)**
   - For each parameter:
     - `id: string`
     - `label?: string`
     - `group?: string` (for UI grouping)
     - `value: number`
     - `target: number`
     - `transitionSpeed: number`
     - `curve: "linear" | "ease" | "exp"`
     - `min?: number`
     - `max?: number`
     - `default?: number`

2. **Parameter Server responsibilities**
   - ⏳ Canonical parameter storage in backend
   - ⏳ Apply transitions on a periodic tick
   - ⏳ Provide subscription / snapshot API for:
     - Renderer
     - Control UI
   - ⏳ Accept changes from:
     - UI actions
     - Modulation engine
     - Input engines

3. **Modulation engine (v1)**
   - LFO:
     - Types: `sine`, `triangle` (initially)
     - Params: `rate`, `depth`, `phase`, `offset`
   - Random:
     - Smoothed random or noise
   - Envelope followers:
     - From audio amplitude / bands
   - Modulation matrix:
     - Map: `modulatorId → parameterId` with:
       - `mode: "add" | "mul"`
       - `scale: number`

**Open questions (Phase 3):**

- ❓ Tick source:
  - Use renderer frame time for updates?
  - Or central backend timer with deltaTime?
- ❓ Where should modulation math live predominantly (backend vs renderer)?

---

### Phase 4 — Control UI

> - Scene switching UI  
> - Parameter panels (Leva-like or custom)  
> - MIDI Learn UI  
> - OSC routing UI  
> - Audio input UI  

**Status:** ⏳

Planned minimal features:

1. **Layout & navigation**
   - ⏳ Scene browser:
     - List of scenes with current/next indicators
   - ⏳ Parameter inspector:
     - Grouped sliders, color pickers, toggles
   - ⏳ Input monitor:
     - Simple visualization of MIDI/OSC/audio activity

2. **Parameter editing**
   - ⏳ Bi-directional updates with Parameter Server
   - ⏳ Validation and clamping to min/max
   - Accessibility:
     - Full keyboard support, visible focus, proper labels
     - Inline error messages and focus-on-error behavior

3. **MIDI Learn (MVP)**
   - ⏳ Toggle to put a parameter in “learn” mode
   - ⏳ Bind next incoming MIDI message to that parameter
   - ⏳ Simple overview of mappings

4. **Routing UIs**
   - OSC:
     - ⏳ Configure IP/port, namespaces, and mapping presets
   - Audio:
     - ⏳ Device selection
     - ⏳ Level meters and band energy display

**Accessibility/UX anchors from your rules:**

- Full keyboard support with `:focus-visible` and `:focus-within` styling
- No disabled zoom; correct mobile font sizes and hit targets
- Errors inline next to fields; on submit, focus first error
- Links vs buttons semantics preserved
- Live feedback via polite `aria-live` regions where appropriate

---

### Phase 5 — Video Output

> - Implement Syphon/Spout/NDI plugin  
> - Allow Window A to be used as input inside Resolume/VDMX  

**Status:** ⏳

Planned approach:

1. **Common interface**
   - 🧩 Define a backend interface, e.g.:
     - `init(config)`
     - `publish_frame(texture_handle_or_descriptor)`
     - `shutdown()`
   - Abstract over Syphon/Spout/NDI specifics

2. **Platform backends**
   - ⏳ macOS: Syphon backend
   - ⏳ Windows: Spout backend
   - ⏳ Cross-platform: NDI backend
   - Start with no-op implementation that compiles and logs calls.

3. **Renderer integration**
   - ⏳ Expose a stable texture or framebuffer for plugins to read.

---

### Phase 6 — Scene/Ecosystem Expansion

> - Add more scenes using TSL utilities  
> - Add more input modalities  
> - Add recording, multi-display, presets, project saving  

**Status:** ⏳

Early tracking ideas:

- Scene library:
  - Catalog scenes by:
    - ID, category, complexity
    - Inputs used (audio, MIDI, OSC)
- Presets & projects:
  - Define a JSON schema for:
    - Selected scene(s)
    - Parameter values
    - Modulation mappings
    - Input routing
- Recording:
  - GPU-based capture or copy to CPU (TBD)
- Multi-display:
  - Support for multiple renderer windows or multi-monitor spanning

---

### Phase 7 — Polishing & Distribution

> - Packaging for macOS + Windows  
> - UX cleanup  
> - Error handling  

**Status:** ⏳

Future tasks:

- Packaging:
  - Build pipelines for macOS and Windows
  - Code signing and notarization strategy (especially macOS)
- UX:
  - Refine layout, themes, motion (respecting `prefers-reduced-motion`)
  - Improve empty/error/loading states (skeletons mirror final content)
- Error handling:
  - Centralized logging and user-facing error notifications
  - Recovery paths (no dead ends)

---

## 4. Decisions & Assumptions (Running Log)

This section records key decisions for future reference.  
Currently mostly baseline assumptions; update as choices are made.

1. **Rendering stack**
   - Assumption: WebGPU-first design; consider WebGL fallback if needed.
2. **State ownership**
   - Assumption: Parameter Server lives in the backend to prevent drift between windows.
3. **Messaging**
   - Assumption: Event-based messaging is the primary backbone for all state sync.
4. **TypeScript**
   - Frontend: TypeScript everywhere.
   - Backend: idiomatic Rust.

As decisions are made, add them here with timestamps/short notes.

---

## 5. Open Questions for the Maintainer

Update and answer these over time; future LLM sessions will rely on them.

1. WebGPU vs WebGL:
   - How important is graceful fallback to WebGL for the initial prototype?
2. Platform priority:
   - Should implementation and testing focus on macOS first?
3. UI stack:
   - Preference for a component system (Radix UI, Headless UI, custom, etc.)?
4. React state:
   - Preferred approach (Zustand, Jotai, Redux, Recoil, or just context/hooks)?
5. Tooling:
   - Specific Prettier/ESLint rules you want enforced?
6. Non-negotiable UX:
   - Beyond your Vercel-style rules, any additional must-haves for the control UI?

---

## 6. Next Actions (for LLM or human dev)

Short-term, concrete steps to move from ⏳ to 🧪/✅:

1. Bootstrap Tauri + Vite + React + TypeScript project.
2. Configure 2 windows (renderer + controls) and wire basic HTML roots.
3. Implement:
   - Minimal renderer window with a placeholder r3f canvas.
   - Minimal control window with a single slider.
4. Wire a single event:
   - Slider in controls updates a value in renderer (log it).
5. Revisit this document:
   - Mark completed items ✅
   - Add any architectural deviations or new decisions to section 4.
