# sebcat-vj – Architecture Progress Log

This document tracks implementation progress relative to `ARCHITECTURE.md`.  
It is meant to be **LLM-friendly**: concise, structured, and easy to rehydrate in new sessions.

_Last updated: Phase 1 dual-window bootstrap and initial event wiring._

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

- Status: 🧪 (window created, basic event listeners + r3f scene stubbed)
- Goal:
  - Borderless/fullscreen window
  - Dedicated r3f + WebGPU render loop
  - Receives parameter/uniform updates from backend
  - Supports Scene A/B layering and crossfade
- Current state:
  - Created as a separate Tauri window with label `renderer` and URL `/renderer`
  - Renders a simple React-based scene using `@react-three/fiber`:
    - Scene A: rotating cube whose rotation speed and brightness are driven by parameters
    - Scene B: larger warm-colored cube
  - Listens for:
    - `renderer:crossfade` events and uses the value to:
      - Update a local `crossfade` parameter
      - Approximate a dual-scene crossfade by fading Scene A out and Scene B in
    - `renderer:scene_a_brightness` events and uses the value to update Scene A brightness
- Notes:
  - Must avoid heavy devtools/inspection to protect FPS
  - Needs a clean subscription to Parameter Server and integration with WebGPU + real render targets

#### Window B — Control UI

- Status: 🧪 (basic layout + initial parameter controls implemented)
- Goal:
  - SPA dashboard for scenes, parameters, inputs, transitions
  - Drives backend/Parameter Server and indirectly Window A
- Current state:
  - Uses the default React entrypoint (`/`) as the **Controls** window
  - Implements a basic but accessible layout with:
    - “Crossfade” slider (0–100%) → drives scene blend in renderer
    - “Scene A Brightness” slider (0–2) → drives Scene A emissive intensity in renderer
  - Forwards updates to the backend via `forward_controls_event`:
    - `event: "crossfade", payload: { value }`
    - `event: "scene_a_brightness", payload: { value }`
- Notes:
  - Needs initial routing and richer layout for scenes/parameters
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

- Status: 🧪 Backend stub implemented (in-memory + simple persistence)
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

- Current implementation:
  - Rust-side `Parameter` struct with fields: `id`, `value`, `target`, `transition_speed`, `curve`
  - In-memory `ParameterStore` backed by a global mutex
  - JSON-based persistence:
    - Snapshot of all parameters stored at app startup/shutdown points (currently on `set_parameter`) under the app config directory as `parameters.json`
    - On app startup, parameters are loaded from disk into the in-memory store
  - Commands exposed to frontends:
    - `get_parameters()` → full list of parameters
    - `get_parameter(id)` → single parameter or `null`
    - `set_parameter(id, value)` → upserts parameter and emits a change event
    - `clear_parameters()` → clears in-memory store and deletes persisted file
  - Events:
    - `parameter_changed` → emitted on `set_parameter` with full `Parameter` payload
    - `parameters_cleared` → emitted on `clear_parameters` with empty payload

- Requirements:
  - Live transitions (smoothed changes from `value` → `target`)
  - Integration with modulators (LFO, random, audio followers, etc.)
  - Integration with external inputs (OSC/MIDI/audio)
  - Sync-safe between windows
  - Persist and restore parameter state across restarts

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

**Status:** 🧪 (Tauri + dual windows + basic event wiring done; rendering still placeholder)

Planned breakdown:

1. **Project bootstrap**
   - ✅ Initialize Tauri project (TypeScript + Vite + React) using create-tauri-app
   - ✅ Flatten project so the Tauri app lives at the repo root
   - ✅ Configure 2 windows (renderer + controls) in Tauri config:
     - `renderer` → URL `/renderer`, borderless-style placeholder
     - `controls` → URL `/`, standard window
   - 🧪 Entrypoints:
     - Single React entry at `src/main.tsx` dispatches between renderer/controls based on `window.location.pathname`

2. **Inter-window messaging (minimal)**
   - ✅ Define backend command `forward_controls_event(app, event, payload)` in Rust:
     - Forwards events from Controls to Renderer as `renderer:{event}`
   - ✅ Implement a proof-of-concept:
     - Slider in Window B (“Crossfade”) updates a numeric value in Window A via:
       - Controls → `forward_controls_event("crossfade", "{ value: number }")`
       - Renderer window listens for `renderer:crossfade` and updates local state / visualization

3. **Renderer bootstrap**
   - 🧪 Install and wire up `react-three-fiber` (WebGPU backend still pending)
   - 🧪 Implement **Scene A**:
     - Rotating cube
     - Parameters (local to renderer for now, but hydrated from backend on startup):
       - `rotationSpeed` (derived from crossfade)
       - `sceneABrightness` (driven independently from Controls)
   - 🧪 Current state:
     - Renderer window shows:
       - A rotating Scene A cube and a larger Scene B cube
       - A visual crossfade between scenes using material opacity:
         - Scene A opacity: `1 - crossfade`
         - Scene B opacity: `crossfade`
       - At 0%/100% only one scene is rendered to avoid depth artifacts
     - On startup, renderer:
       - Calls `get_parameters()` once to hydrate from backend Parameter Server
       - Maps `crossfade` and `scene_a_brightness` parameter values into local renderer parameters
       - Falls back to defaults if the backend store is empty or persistence file is missing

4. **Crossfade prototype**
   - ⏳ Add **Scene B**:
     - Different visual (e.g. color pulsing cube or simple TSL shader)
   - ⏳ Render both scenes to separate render targets
   - ⏳ Implement crossfade uniform `u_crossfade` in post-pass
   - 🧪 Current approximation:
     - Both scenes are rendered in a single Canvas and crossfaded via opacity:
       - Scene A opacity: `1 - crossfade`
       - Scene B opacity: `crossfade`
       - Scene A is hidden when crossfade ≈ 1; Scene B is hidden when crossfade ≈ 0
   - 🧪 Control of crossfade from Window B via events is in place:
     - Controls → backend (`forward_controls_event` + `set_parameter`) → renderer (`renderer:crossfade`)
     - Uniform binding to real render targets is still pending

**Open questions (Phase 1):**

- ❓ WebGPU-only vs WebGL fallback: what is the desired behavior for machines without WebGPU? -> WebGL fallback would be nice, but we should prioritize WebGPU support, for now. Maybe at a future point.
- ❓ Any initial preference for scene organization? (filesystem naming, IDs, etc.) -> No preference, whatever works best and fits the VJing philosophy best. I do wonder if we should be able to create scenes dynamically, allowing for more flexibility and adaptability in the VJing experience.

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
   - Implemented so far:
     - A generic `forward_controls_event` Rust command that re-emits events as `renderer:{event}` to all windows.
     - Controls window uses this to send:
       - Crossfade updates (`event: "crossfade"`, handled as `renderer:crossfade`)
       - Scene A brightness updates (`event: "scene_a_brightness"`, handled as `renderer:scene_a_brightness`)
     - Renderer subscribes to both event streams and updates its local parameter model accordingly.
     - Backend Parameter Server emits:
       - `parameter_changed` events with full `Parameter` payloads on `set_parameter`
       - `parameters_cleared` events when all parameters are cleared
     - Controls window subscribes to `parameter_changed` to keep its backend inspector in sync without polling.
4. **TypeScript**
   - Frontend: TypeScript everywhere.
   - Backend: idiomatic Rust.
5. **Window model**
   - Chosen: Two logical Tauri windows configured in `tauri.conf.json`:
     - `renderer` (`/renderer`) — dedicated to visuals (currently a placeholder with crossfade bar).
     - `controls` (`/`) — control UI (currently a basic layout with a crossfade slider).
   - Both windows share the same bundled frontend and dispatch to different React roots based on `window.location.pathname`.

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

Short-term, concrete steps to move from 🧪 to ✅ for Phase 1:

1. **Renderer integration**
   - Install and configure `react-three-fiber` with a WebGPU-first (with fallback) renderer.
   - Replace the current renderer placeholder with:
     - A `<Canvas>`-based scene.
     - A simple rotating cube (Scene A) whose parameters can be driven by the Parameter Server later.

2. **Crossfade rendering**
   - Introduce a second scene (Scene B) and render to separate render targets.
   - Bind the existing crossfade value (currently just visualized in UI) to a real uniform `u_crossfade` that blends Scene A/B.
   - Keep the current event wiring (controls → backend → renderer) as the source of truth for the crossfade value.

3. **Parameter plumbing preparation**
   - Define a minimal in-memory parameter model in the renderer that can later be replaced by the true backend Parameter Server.
   - Ensure the crossfade event updates both:
     - The visual blend in the render pipeline.
     - A parameter representation that can be swapped out.

4. **Housekeeping**
   - Keep validating that `npm run tauri dev` from the repo root works after each change.
   - Update this document as:
     - r3f/WebGPU integration lands (mark parts of Phase 1 “Renderer bootstrap” as 🧪/✅).
     - Scene A/B and real crossfade rendering are implemented.
