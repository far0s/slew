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

- Status: 🧪 Backend implemented (in-memory + persistence + transition tick loop)
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
    - Snapshot of all parameters stored to disk as `parameters.json` under the app config directory
    - On app startup, parameters are loaded from disk into the in-memory store
  - Background transition tick:
    - A backend thread runs at ~60 Hz
    - For each parameter where `value != target`, advances `value` toward `target` according to `transition_speed` and `curve` (currently treated as linear)
    - Emits `parameter_changed` events for parameters whose `value` changed during a tick
    - Persists the updated parameter list to disk after emitting
    - Per-parameter transition defaults via `default_parameter_for_id`:
      - `crossfade` → `transition_speed ≈ 0.8`
      - `scene_a_brightness` → `transition_speed ≈ 0.3`
      - `scene_a_wobble` → `transition_speed ≈ 0.4`
      - Others (e.g. `rotationSpeed`) → `transition_speed ≈ 0.4`
  - Commands exposed to frontends:
    - `get_parameters()` → full list of parameters
    - `get_parameter(id)` → single parameter or `null`
    - `set_parameter(id, value)`:
      - Interprets `value` as the **target**
      - Upserts the parameter (using per-ID defaults) and updates `target` only
      - Does not emit `parameter_changed` directly; tick loop emits as `value` moves
    - `clear_parameters()` → clears in-memory store and deletes persisted file
  - Events:
    - `parameter_changed` → emitted from the tick loop with full `Parameter` payload when `value` changes
    - `parameters_cleared` → emitted on `clear_parameters` with empty payload

- Requirements:
  - Live transitions (smoothed changes from `value` → `target`) ✅ basic linear implementation in place
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

**Current highlight:**  
We now have a basic multi-parameter Scene A exercising backend transitions (`crossfade`, `rotationSpeed`, `scene_a_brightness`, `scene_a_wobble`), a reset-to-defaults path in the Controls UI, and a parameter inspector grouped by scene vs global parameters.

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

**Status:** 🧪 (Parameter Server with transitions implemented; modulation engine still pending)

Implementation status:

1. **Parameter model (MVP)**
   - ✅ Struct exists in Rust backend as:
     - `id: string`
     - `value: number`
     - `target: number`
     - `transition_speed: number`
     - `curve: "linear" | "ease" | "exp"`

   - ⏳ Optional metadata fields (`label`, `group`, `min`, `max`, `default`) are **not** implemented yet.
   - ✅ `curve` enum is present but the backend currently treats all curves as **linear**. This is sufficient for the first transition pass.

2. **Parameter Server responsibilities**
   - ✅ Canonical parameter storage in backend:
     - Implemented as a global in-memory `ParameterStore` keyed by `id`.
     - Backed by JSON persistence (`parameters.json`) on disk.
   - ✅ Apply transitions on a periodic tick:
     - **Current behavior:**
       - A backend timer loop (~60 Hz) runs in a background thread:
         - Iterates parameters in `ParameterStore`.
         - For each parameter where `value != target`, moves `value` toward `target` according to `transition_speed` using a simple linear interpolation.
         - Emits `parameter_changed` events only when `value` actually changes (with an epsilon to avoid noise near the target).
       - This applies to all numeric parameters, including:
         - `crossfade`
         - `scene_a_brightness`
         - `scene_a_wobble`
         - `rotationSpeed` (and any future parameters, via the default branch).
     - ✅ `set_parameter` now updates **`target` only**, and the tick loop is the sole owner of changing `value`.
   - ✅ Provide subscription / snapshot API for:
     - Renderer:
       - Uses `get_parameters` initially to hydrate values for:
         - `crossfade`
         - `rotationSpeed` (if present)
         - `scene_a_brightness`
         - `scene_a_wobble`
       - Subscribes to:
         - Backend `parameter_changed` events to follow smoothed values for these parameters.
         - Direct `renderer:crossfade` and `renderer:scene_a_brightness` events as a fallback / low-latency UI path.
       - Behavior for `rotationSpeed`:
         - If a backend `rotationSpeed` parameter is present (via `get_parameters` or `parameter_changed`), the renderer treats it as the **authoritative** value and stops deriving rotation from `crossfade`.
         - If no backend `rotationSpeed` parameter exists, the renderer derives a local `rotationSpeed` from the current `crossfade` value as a documented fallback.
     - Control UI:
       - Uses `get_parameters` on mount + explicit "Refresh".
       - Subscribes to `parameter_changed` and updates the inspector live.
       - Uses `set_parameter` for:
         - `crossfade`
         - `scene_a_brightness`
         - `rotationSpeed`
         - `scene_a_wobble`
   - ✅ Accept changes from:
     - UI actions:
       - `set_parameter(id, value)` is called from Controls for:
         - `crossfade`
         - `scene_a_brightness`
         - `rotationSpeed`
         - `scene_a_wobble`
       - Controls also call `forward_controls_event` as a UI fallback path for:
         - `crossfade` → `renderer:crossfade`
         - `scene_a_brightness` → `renderer:scene_a_brightness`
     - ⏳ Modulation engine:
       - Not implemented yet; future modulators will likely write to parameter `target` or to dedicated modulation slots.
     - ⏳ Input engines:
       - OSC/MIDI/audio paths are not wired yet.

3. **Transition wiring (current focus: Scene A parameters)**
   - **Contract:**
     - Controls:
       - `set_parameter("<id>", next)` sets `target = next` and lets the backend tick interpolate `value`.
       - For `crossfade` and `scene_a_brightness`, Controls also send `forward_controls_event` so the renderer can respond quickly even if the backend event stream is temporarily unavailable.
       - A “Reset to defaults” action:
         - Calls `set_parameter` for:
           - `"crossfade"`
           - `"scene_a_brightness"`
           - `"rotationSpeed"`
           - `"scene_a_wobble"`
         - Synchronizes local slider state to these defaults.
       - A “Clear” action:
         - Calls `clear_parameters`
         - Resets sliders to defaults.
     - Renderer:
       - On startup, `get_parameters` returns the current runtime `value` for:
         - `crossfade`
         - `rotationSpeed`
         - `scene_a_brightness`
         - `scene_a_wobble`
       - Subscribes to:
         - `parameter_changed` and, when `id` matches one of the above, updates its local `RendererParameters` accordingly.
         - `renderer:crossfade` and `renderer:scene_a_brightness` as a UI fallback path.
       - `rotationSpeed` handling:
         - If a backend `rotationSpeed` parameter is observed (via hydration or `parameter_changed`), the renderer sets a `useBackendRotationSpeed` flag and treats backend values as authoritative.
         - If no backend `rotationSpeed` parameter is observed, the renderer derives `rotationSpeed` from `crossfade` locally:
           - Base speed ≈ `0.6`
           - Slight variation based on how far `crossfade` is from 0.5.
   - **Scene coverage:**
     - We now exercise transitions on a **multi-parameter Scene A**:
       - `crossfade`
       - `rotationSpeed`
       - `scene_a_brightness`
       - `scene_a_wobble`
     - Scene A cube:
       - Uses backend-smoothed `rotationSpeed` (or derived fallback).
       - Uses backend-smoothed `scene_a_brightness` to drive emissive intensity.
       - Uses backend-smoothed `scene_a_wobble` to drive sinusoidal position wobble.
       - Uses backend-smoothed `crossfade` for opacity.

4. **Modulation engine (v1)**
   - ❌ Not started yet; no LFO/random/envelope followers implemented.
   - **Design (unchanged):**
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
   - **Near-term dependency:**
     - Tick loop for parameters will likely also serve as the timing source for basic modulators.

**Open questions (Phase 3):**

- ❓ Tick source:
  - Prefer a central backend timer with a fixed update step (e.g. ~60 Hz) so:
    - Transitions continue even if renderer window is minimized or closed.
    - Modulation and parameter evolution are not tied to renderer FPS.
  - Renderer frame time may still be used for purely visual-only transitions (e.g. shader-only effects not backed by the Parameter Server).
- ❓ Where should modulation math live predominantly (backend vs renderer)?
  - Leaning toward **backend** for:
    - Deterministic behavior across multiple renderers.
    - Single source of truth for stateful modulators.
  - Renderer may still host:
    - Purely visual micro-animations that don't need to be shared or persisted.

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

Short-term, concrete steps building on the current Parameter Server + Scene A:

1. **Tighten Parameter Server ↔ renderer integration**
   - Clarify and enforce `rotationSpeed` semantics:
     - Keep the existing behavior where:
       - If a backend `rotationSpeed` parameter exists (via `get_parameters` or `parameter_changed`), the renderer uses it exclusively (`useBackendRotationSpeed = true`).
       - If it does not exist, the renderer derives `rotationSpeed` from `crossfade` as a fallback.
     - Add or refine inline comments in the renderer code to:
       - Explicitly document this behavior.
       - Make it clear that any future scene or input that wants authoritative control over rotation should create/set the `rotationSpeed` parameter via `set_parameter`.
   - Keep the dual-path crossfade behavior:
     - Backend-smoothed `parameter_changed` is preferred when available.
     - `renderer:crossfade` remains as a UI fallback (do not break existing sliders).

2. **Add one more visual parameter to validate transitions further**
   - Introduce a simple additional visual parameter for Scene A or B, for example:
     - `scene_a_tint` (color tint intensity) or
     - A boolean-ish “FX toggle” represented as a numeric parameter (0 or 1) such as `scene_a_fx_intensity`.
   - Wire it end-to-end:
     - Add backend default and transition behavior (similar to `scene_a_brightness`).
     - Add a slider in Controls (with defaults, reset-to-defaults, inspector entry).
     - Use the parameter in the renderer material (e.g., blending between two colors or enabling a subtle effect).
   - Use this to further exercise:
     - Parameter Server tick behavior.
     - Persistence.
     - Inspector grouping and live updates.

3. **Start sketching the Scene System**
   - In TypeScript (frontend), introduce early scaffolding (types / placeholders) for a future Scene System, without breaking the current dual-scene setup:
     - Define a minimal scene descriptor type, e.g.:
       - `SceneId`
       - `registeredParameters: string[]`
       - Optional labels / ordering.
     - Add comments describing how scenes will:
       - Register their parameters with the Parameter Server (or at least declare which IDs they care about).
       - Allow the Controls UI to show scene-scoped parameter groups automatically.
   - In this document and code comments:
     - Note that Scene A currently drives and consumes:
       - `crossfade`
       - `rotationSpeed`
       - `scene_a_brightness`
       - `scene_a_wobble`
     - Outline how additional scenes (beyond A/B) could be added while:
       - Reusing the existing Parameter Server.
       - Sharing or reusing parameter IDs where appropriate (e.g. global crossfade).
       - Keeping the current dual-window behavior, sliders, and persistence stable.

4. **Housekeeping**
   - After each incremental change (especially when adding new parameters or scene scaffolding), run TypeScript/Rust diagnostics to keep the codebase green.
   - Keep this document updated as:
     - Additional Scene A/B parameters are added and exercised.
     - Scene System scaffolding lands (mark relevant parts of Phase 3 “Scene System integration” as 🧪/✅ once started).
