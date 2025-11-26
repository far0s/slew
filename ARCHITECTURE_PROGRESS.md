# sebcat-vj – Architecture Progress Log

Short, task-focused status log for this project.  
For detailed design, see `ARCHITECTURE.md`.

---

## 0. Meta

- Project: **sebcat-vj**
- Goal: Dual-window Tauri VJ tool
  - **Renderer window**: React + `@react-three/fiber` scenes
  - **Controls window**: React SPA for parameters, scenes, and inputs

Legend:

- ✅ Done
- 🧪 Prototype / partial
- 🧩 Designed
- ⏳ Not started

---

## 1. High-level status

- ✅ Tauri app bootstrapped (React + Vite + TypeScript)
- ✅ Two windows configured:
  - `renderer` → `/renderer`
  - `controls` → `/`
- ✅ Single frontend bundle with path-based dispatch in `src/main.tsx`
- ✅ Basic scene system and parameter wiring (Scene A, B, C)
- ✅ Scene Control UI with numbered slots (1-4), crossfade buttons, and progress indicators
- ✅ Live scene previews (per-scene columns and global renderer preview with crossfade blending)
- ✅ Flexible scene slot system (add/remove scenes, 1-4 max)
- ✅ Auto-generated parameter controls from scene descriptors
- 🧩 Modulation engine designed (simple renderer-side LFO implemented for Scene A tint)
- ✅ Input engines fully implemented:
  - MIDI: device enumeration, Learn workflow, per-slider integration
  - OSC: UDP server (port 9000), default mappings, recent messages display
  - Audio: FFT analysis, frequency bands, beat detection, level meters
  - HID: Macropad/encoder support (DOIO Megalodon), multi-interface connection
- ⏳ Audio → parameter binding (display works, routing pending)
- ⏳ Video-output layer (Syphon/Spout/NDI)

---

## 2. Core systems (condensed)

### 2.1 Windows

**Renderer window (Window A)** – ✅

- Renders Three.js scenes via `@react-three/fiber`
- Scenes implemented:
  - Scene A – blue cube with:
    - `rotationSpeed`
    - `scene_a_brightness`
    - `scene_a_wobble`
    - `scene_a_tint`
    - `scene_a_tint_lfo_depth`
  - Scene B – orange cube with:
    - `scene_b_brightness`
    - `scene_b_rotation_speed`
    - `scene_b_tint` (shifts between red and yellow)
    - `scene_b_scale`
  - Scene C – green pulsing cube with:
    - `scene_c_brightness`
    - `scene_c_pulse_speed`
    - `scene_c_rotation_speed`
    - `scene_c_tint` (shifts between cyan and lime)
- Uses a simple linear crossfade between two scenes:
  - `activeWeight = 1 - crossfade`
  - `nextWeight = crossfade`

**Controls window (Window B)** – ✅

- Single-page layout:
  - Global header with scene list and phase label
  - Scene pairing controls (Active / Next)
  - Primary controls section:
    - Sliders for:
      - `crossfade`
      - `scene_a_brightness`
      - `rotationSpeed`
      - `scene_a_wobble`
      - `scene_a_tint`
      - `scene_a_tint_lfo_depth`
    - “Reset to defaults” and “Clear parameters”
  - Inspector:
    - Lists known backend parameters, grouped by:
      - Scene A parameters
      - “Global/other” parameters

---

### 2.2 Parameter Server (Rust) – ✅ (v1)

- `Parameter` struct:
  - `id: String`
  - `value: f64`
  - `target: f64`
  - `transition_speed: f64`
  - `curve: ParameterCurve` (`Linear | Ease | Exp`, all treated as linear for now)
- `ParameterStore`:
  - In-memory `HashMap<ParameterId, Parameter>`
  - Global static via `Lazy<Arc<Mutex<ParameterStore>>>`
- Persistence:
  - Snapshot to `parameters.json` under app config dir
  - Load on startup into `ParameterStore`
- Tick loop:
  - ~60 Hz background thread
  - For each param where `value != target`, moves value toward target using `transition_speed`
  - Emits `parameter_changed` events when `value` changes
  - Saves snapshot after non-empty ticks
- Commands:
  - `get_parameters() -> Vec<Parameter>`
  - `get_parameter(id) -> Option<Parameter>`
  - `set_parameter(app, id, value)`:
    - Creates or updates parameter
    - Treats `value` as **target** and lets tick loop drive `value`
  - `clear_parameters(app)`:
    - Clears store and deletes `parameters.json`
    - Emits `parameters_cleared`
- Scene-related:
  - Per-ID defaults on first create:
    - `"crossfade"` → slower transition
    - `"scene_a_brightness"` / `"scene_a_wobble"` / `"scene_a_tint"` → faster

---

### 2.3 Scene System (TS side) – ✅ (v1)

**Types (`src/scenes/sceneTypes.ts`):**

- `SceneId = "sceneA" | "sceneB" | "sceneC"`
- `ParameterId` (aligned with backend):
  - `"crossfade"`
  - `"scene_a_brightness"`
  - `"scene_a_wobble"`
  - `"scene_a_tint"`
  - `"scene_a_tint_lfo_depth"`
  - `"rotationSpeed"`
- `SceneParameterDescriptor`:
  - `id`, optional `label`, `group`, `orderHint`, `min`, `max`, `defaultValue`
- `SceneDescriptor`:
  - `id`, `label`, optional `description`
  - `parameters: SceneParameterDescriptor[]`
- `SCENE_REGISTRY`:
  - Scene A:
    - `crossfade`, `scene_a_brightness`, `scene_a_wobble`, `scene_a_tint`, `scene_a_tint_lfo_depth`, `rotationSpeed`
  - Scene B:
    - `crossfade`
  - Scene C:
    - `crossfade`

Helpers:

- `getSceneDescriptor(id)`
- `getScenesUsingParameter(parameterId)`

**Scene components (`src/scenes/components/*.tsx`):**

- Shared `SceneProps`:
  - `opacity: number`
  - `params?: { rotationSpeed; sceneABrightness; sceneAWobble; sceneATint }`
- `SCENE_COMPONENT_REGISTRY` (`sceneComponents.ts`):
  - `sceneA` → `SceneA`
  - `sceneB` → `SceneB`
  - `sceneC` → `SceneC`

**Scene manager (`src/scenes/useSceneManager.ts`):**

- `useSceneManager(selection?: { activeSceneId; nextSceneId })`:
  - Defaults to `sceneA` → `sceneB`
  - Returns:
    - `activeSceneId`, `nextSceneId`
    - `crossfadeParameterId: "crossfade"`
    - `mapCrossfadeToSceneWeights(crossfade)` → `{ activeWeight, nextWeight }`

---

### 2.4 Renderer <→ backend wiring – ✅ (v1)

**Renderer (`src/main.tsx`, `RendererRoot`):**

- Local `RendererParameters`:
  - `crossfade`, `rotationSpeed`, `sceneABrightness`, `sceneAWobble`, `sceneATint`, `sceneATintLfoDepth`
- Hydration:
  - On mount, `get_parameters` → set local params with clamping
  - If backend `rotationSpeed` exists:
    - `useBackendRotationSpeed = true`
  - Else:
    - Derive `rotationSpeed` from `crossfade`
- Live updates:
  - Listens to:
    - `renderer:crossfade` (fallback / low-latency)
    - `renderer:scene_a_brightness` (fallback)
    - `parameter_changed` (canonical, smoothed values)
    - `scene_pairing_changed` (active/next scene IDs)
- Crossfade:
  - Uses `useSceneManager` to map `crossfade` to weights
  - Looks up Scene components from `SCENE_COMPONENT_REGISTRY`
  - Mounts Active + Next scenes with corresponding `opacity` and `params` (for Scene A)

**Tint LFO (renderer-side prototype):**

- Additional parameter: `scene_a_tint_lfo_depth`
  - Exposed in Controls + backend
  - Hydrated into `sceneATintLfoDepth`
- `TintLfoDriver` component inside `<Canvas>`:
  - Uses `useFrame` to advance `tintLfoPhase` when depth > 0
- `tintModulated`:
  - `sceneATint` + sinusoidal offset scaled by `sceneATintLfoDepth`
  - Clamped to `[0, 1]`
  - Passed to Scene A via `params.sceneATint`

---

### 2.5 Controls <→ backend wiring – ✅ (v1)

- Global `reset.css` wired via the React entry point so both Controls and Renderer share consistent base styles across windows.
- Window placement (runtime, Rust side):
  - Controls window: moves to the primary display and is sized to occupy the full monitor area.
  - Renderer window: moves to the largest secondary display (by pixel area) if available, otherwise falls back to the primary; also sized to occupy that monitor.
  - Dev builds: windows are positioned/sized as above but are _not_ forced into fullscreen (system chrome and dev tools remain usable).
  - Production builds: both windows are additionally set to fullscreen on their target monitors; Renderer runs borderless with no decorations.
- Renderer UI:
  - React renderer window is now effectively “canvas-only”: no textual HUD or header UI, just the r3f `<Canvas>` filling the viewport with a dark blue background.
  - High-level layout styling (full-viewport container, background color, font family) is handled via a small CSS module (`RendererRoot.module.css`).

**Parameters (Controls → backend):**

- Global sliders:
  - `crossfade`
- Scene A sliders:
  - `scene_a_brightness`
  - `rotationSpeed`
  - `scene_a_wobble`
  - `scene_a_tint`
  - `scene_a_tint_lfo_depth`
- Scene B sliders:
  - `scene_b_brightness`
  - `scene_b_rotation_speed`
  - `scene_b_tint`
  - `scene_b_scale`
- Scene C sliders:
  - `scene_c_brightness`
  - `scene_c_pulse_speed`
  - `scene_c_rotation_speed`
  - `scene_c_tint`
- Each slider:
  - Updates local UI state
  - Calls `set_parameter(id, value, app: undefined)`
  - For brightness parameters (`crossfade`, `scene_a_brightness`, `scene_b_brightness`, `scene_c_brightness`), also forwards `forward_controls_event` to renderer (`renderer:{event}`)

**Hydration / sync:**

- On mount:
  - `get_parameters` → `applyBackendParamsToSliders`
- Subscribes to `parameter_changed`:
  - Updates sliders and local `backendParameters` list
- “Reset to defaults”:
  - Predefined `DEFAULTS` object
  - Batch `set_parameter` with default values
  - Updates local slider state
- “Clear”:
  - `clear_parameters`
  - Resets sliders to defaults

**Scene Control strip (Controls layout):**

- Controls window now uses a 5-column, 2-row rigid grid:
  - Row 1:
    - Columns 1–4: **Scene Control strip**
    - Column 5: **Global Renderer Preview + Debug/Parameters panel**
  - Row 2:
    - Columns 1–2: **Active scene panel** (dynamically renders controls for whichever scene is active)
    - Columns 3–4: **Next scene panel** (dynamically renders controls for whichever scene is next)
    - Column 5: continues Debug/Parameters
- Scene Control strip:
  - Shows **Active** and **Next** scene combos:
    - Each combo is a stacked pill:
      - Top: Radix Select (`@radix-ui/react-select`) for scene choice.
      - Bottom: button to “Crossfade to Active” / “Crossfade to Next”.
    - Selects and buttons are disabled while crossfade is in motion (mid-range) to avoid mid-transition pairing changes.
    - Additional lock rules:
      - When `crossfade` is ~0 (active scene fully visible), the **Active** combo is disabled.
      - When `crossfade` is ~1 (next scene fully visible), the **Next** combo is disabled.
  - Crossfade:
    - Default value (Controls-side) is now **0**, so the active scene starts fully visible.
    - The header shows crossfade as a **Radix Progress** bar (`@radix-ui/react-progress`) with the percentage rendered inside.
    - Button actions:
      - "Crossfade to Active" → target crossfade 0 via `set_parameter("crossfade", 0, app: undefined)`.
      - "Crossfade to Next" → target crossfade 1 via `set_parameter("crossfade", 1, app: undefined)`.
- Scene previews:
  - Each scene column (Active/Next) includes a live 3D preview next to the controls
  - Implementation:
    - `ScenePreview` component renders an embedded `@react-three/fiber` Canvas
    - Shows the scene at full opacity (1.0) with current parameter values
    - Fixed 16:9 aspect ratio, optimized for performance (reduced DPR, low-power GPU preference)
  - Previews respond to parameter changes in real-time
- Global Renderer Preview:
  - Located in the right column (column 5) above the Debug panel
  - **Mirrors the actual Renderer output** with accurate crossfade blending
  - Implementation:
    - `RendererPreview` component renders both Active and Next scenes simultaneously
    - Uses the same `mapCrossfadeToSceneWeights` logic as the main renderer:
      - `activeWeight = 1 - crossfade`
      - `nextWeight = crossfade`
    - Includes `TintLfoDriver` for Scene A tint modulation (0.1 Hz oscillation)
    - Receives scene params from Controls state for real-time updates
    - Fixed 16:9 aspect ratio, "Live Preview" label overlay
    - Performance optimized: reduced DPR (1–1.5), `powerPreference: "low-power"`
  - Purpose: Gives operator an accurate preview of the blended output before/during crossfades
- Dynamic scene panels:
  - **Active scene panel** (left, cols 1–2):
    - Shows controls for whichever scene is currently active
    - Header displays scene name + "(Active)" role indicator
    - Renders appropriate control component based on `activeSceneId`
  - **Next scene panel** (right, cols 3–4):
    - Shows controls for whichever scene is set as next
    - Header displays scene name + "(Next)" role indicator
    - Renders appropriate control component based on `nextSceneId`
  - When scene selection changes, the panels dynamically swap to show the correct controls
- Scene-specific control components:
  - `SceneAControls`: brightness, rotation speed, wobble, tint LFO depth, tint
  - `SceneBControls`: brightness, rotation speed, tint, scale
  - `SceneCControls`: brightness, pulse speed, rotation speed, tint
  - Each component:
    - Renders Radix Sliders for its parameters
    - Updates local state from `useControlsParameters`
    - Invokes `set_parameter` with the appropriate ID and value
    - For brightness parameters, also fires `forward_controls_event` to the renderer
- Debug panel:
  - Right-most column (column 5) shows a tabbed "Debug" panel using **Radix Tabs** (`@radix-ui/react-tabs`):
    - **Parameters** tab embeds `BackendInspector` (view of backend Parameter Server state).
    - **Logs** tab shows a rolling list of recent `parameter_changed` events:
      - Each entry displays timestamp, parameter ID, value, target, transition speed, and curve.
      - Capped at 100 entries (oldest discarded).
      - Event count badge on tab, Clear button to reset.
    - **Metrics** tab shows counters and statistics:
      - Summary cards: total parameter updates, crossfade transitions, time since last event, session duration.
      - Per-parameter update counts (top 8 most active).
      - Auto-refreshes every second for time-based displays.
      - Reset button to clear all counters.
  - Implementation:
    - `DebugPanel.tsx` wraps the three tabs.
    - `DebugLogs.tsx` renders the scrollable event log.
    - `DebugMetrics.tsx` renders counters and statistics.
    - `App.tsx` maintains `logs: LogEntry[]` and `metrics: DebugMetricsData` state, updated on each `parameter_changed` event via `addLogEntry` and `updateMetrics` callbacks.

**Scene Pairing UI:**

- Active/Next scene selection:
  - Implemented via Radix Selects (`SceneId` options: `sceneA`, `sceneB`, `sceneC`).
  - When a selection changes:
    - Calls `set_scene_pairing(activeSceneId, nextSceneId)` through the existing `setScenePairingOnBackend` helper.
    - Maintains the previous logic that prevents invalid “same scene for both” pairings (handled in the helper).
- Backend:
  - On any change, invokes `set_scene_pairing(activeSceneId, nextSceneId)`.
- Renderer:
  - Listens to `scene_pairing_changed` and updates `useSceneManager` selection.

---

## 3. Roadmap-based view (very brief)

### Phase 1 – Foundations

- ✅ Tauri + React app scaffold
- ✅ Dual-window setup (Renderer/Controls)
- ✅ Basic r3f renderer with Scene A/B/C
- ✅ Crossfade prototype via opacity, backed by `crossfade` parameter
- ✅ Simple renderer-side modulation prototype (tint LFO)

### Phase 2 – Input Layer

- ✅ MIDI input with Learn workflow and per-slider integration
- ✅ OSC input with default mappings, recent messages display, auto-setup
- ✅ Audio input with FFT analysis, band extraction, beat detection
- ✅ HID input with multi-interface support for macropads/encoders

### Phase 3 – Parameter & Modulation

- ✅ Parameter Server with transitions
- ✅ End-to-end parameter wiring for Scene A and basic scene pairing
- 🧩 Modulation engine (proper backend-side modulators) still to come

### Phase 4+ – Control UI, Video Output, Ecosystem

- ⏳ MIDI/OSC/audio UIs
- ⏳ Video output (Syphon/Spout/NDI)
- ⏳ Scene library, presets, multi-display, packaging

---

## 4. Decisions & assumptions (condensed)

- Rendering:
  - WebGPU-first, but current implementation is WebGL via Three.js / r3f.
- State:
  - Backend Parameter Server is the canonical source for shared parameters.
- Messaging:
  - Event-based (`parameter_changed`, `parameters_cleared`, `renderer:*`, `scene_pairing_changed`).
- Platforms:
  - macOS-first, with Windows/Linux considered later if effort is reasonable.

---

## 5. Next actions (for future work)

1. **Backend modulation engine**
   - Implement LFOs as backend modulators writing to parameter targets.
   - Mirror the current renderer-side tint LFO behavior for `scene_a_tint` as a first backend-driven modulation.

2. **Input engines**
   - Add minimal OSC/MIDI/audio backends.
   - Expose a handful of input signals as parameters or modulators.

3. **Scene & UI polish**
   - Clean up Controls and Renderer UIs:
     - Shared layout primitives
     - Fewer inline styles, clearer grouping
   - Add a small “status HUD” in the renderer showing:
     - Active/Next scenes
     - Key parameter values (`crossfade`, `rotationSpeed`, etc.).

4. **Video output (prototype)**
   - No-op video-output backend with logging.
   - Define shape for exposing rendered frames/textures.

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

**Status:** 🧪 (Foundations in place; r3f renderer live with basic dual-scene setup, WebGPU/TSL still pending)

Planned breakdown:

1. **Project bootstrap**
   - ✅ Initialize Tauri project (TypeScript + Vite + React) using create-tauri-app
   - ✅ Flatten project so the Tauri app lives at the repo root
   - ✅ Configure 2 windows (renderer + controls) in Tauri config:
     - `renderer` → URL `/renderer`, borderless-style placeholder
     - `controls` → URL `/`, standard window
   - ✅ Entrypoints:
     - Single React entry at `src/main.tsx` dispatches between renderer/controls based on `window.location.pathname`
   - ✅ Platform and stack focus:
     - WebGPU-first design for the renderer, with a WebGL fallback considered later (not required for the initial prototype).
     - macOS-first for development and testing in early phases, with Windows support to follow as the renderer and video-output stack mature.

2. **Inter-window messaging (minimal)**
   - ✅ Define backend command `forward_controls_event(app, event, payload)` in Rust:
     - Forwards events from Controls to Renderer as `renderer:{event}`
   - ✅ Implement a proof-of-concept:
     - Slider in Window B (“Crossfade”) updates a numeric value in Window A via:
       - Controls → `forward_controls_event("crossfade", "{ value: number }")`
       - Renderer window listens for `renderer:crossfade` and updates local state / visualization

3. **Renderer bootstrap**
   - ✅ Install and wire up `react-three-fiber` (currently using the default WebGL renderer; WebGPU backend still pending).
   - 🧪 WebGPU + TSL integration:
     - Planned:
       - Switch Scene A/B rendering to a WebGPU-capable Three.js renderer once browser/driver support is acceptable on the primary target platform (macOS first).
       - Introduce Three Shader Language (TSL) for authoring modular shader graphs used by scenes.
       - Keep the r3f component model and parameter wiring identical so WebGPU/TSL are mostly a drop-in change for rendering internals.
     - Current:
       - Scene A and B are implemented with standard `meshStandardMaterial` and Three.js primitives in a single `<Canvas>`.
       - No TSL-based materials are in use yet; Scene A/B are intentionally simple to stabilize the Parameter Server and messaging layer first.
   - ✅ Implement **Scene A**:
     - Rotating cube
     - Parameters (hydrated from backend on startup, smoothed by the Parameter Server):
       - `rotationSpeed` (backend-driven when present, otherwise derived from `crossfade` as a documented fallback)
       - `sceneABrightness` (emissive intensity)
       - `sceneAWobble` (sinusoidal wobble on position)
       - `sceneATint` (color/emissive tint between base blue and cyan)
   - ✅ Current state:
     - Renderer window shows:
       - A multi-parameter Scene A cube and a larger Scene B cube
       - A visual crossfade between scenes using material opacity:
         - Scene A opacity: `1 - crossfade`
         - Scene B opacity: `crossfade`
       - At 0%/100% only one scene is rendered to avoid depth artifacts
     - On startup, renderer:
       - Calls `get_parameters()` once to hydrate from backend Parameter Server
       - Maps `crossfade`, `rotationSpeed` (if present), `scene_a_brightness`, `scene_a_wobble`, and `scene_a_tint` into local renderer parameters
       - Derives `rotationSpeed` from `crossfade` if no backend `rotationSpeed` parameter exists
       - Falls back to defaults if the backend store is empty or persistence file is missing

4. **Crossfade prototype**
   - ✅ Add **Scene B**:
     - Different visual (e.g. color pulsing cube or simple TSL shader)
   - ✅ Render both scenes to separate render targets
   - ✅ Implement crossfade uniform `u_crossfade` in post-pass
   - ✅ Current approximation:
     - Both scenes are rendered in a single Canvas and crossfaded via opacity:
       - Scene A opacity: `1 - crossfade`
       - Scene B opacity: `crossfade`
       - Scene A is hidden when crossfade ≈ 1; Scene B is hidden when crossfade ≈ 0
   - ✅ Control of crossfade from Window B via events is in place:
     - Controls → backend (`forward_controls_event` + `set_parameter`) → renderer (`renderer:crossfade`)
     - Uniform binding to real render targets is still pending

**Open questions (Phase 1):**

- ✅ WebGPU-only vs WebGL fallback:
  - Decision for the prototype: prioritize WebGPU support and design the renderer with WebGPU/TSL in mind, but allow the current WebGL-based r3f renderer to remain as a functional fallback for environments without WebGPU. A dedicated WebGL fallback strategy can be formalized later.
- ✅ Scene organization:
  - No strict filesystem or ID scheme required up front; scenes should be designed so they can be created dynamically and registered into a scene registry. The Scene System will evolve around:
    - Simple string `SceneId`s.
    - Declarative parameter lists per scene.
    - The ability to add/remove scenes without tightly coupling them to the core app layout.

---

### Phase 2 — Input Layer

> - Integrate Rust OSC module
> - Integrate Rust MIDI module
> - Integrate Rust audio capture + FFT
> - Expose input data to Parameter Server

**Status:** ✅ (All input engines implemented: MIDI, OSC, Audio)

---

#### 2.1 MIDI Input — ✅ Implemented

**Backend (Rust):**

- Added `midir` crate (v0.10) for cross-platform MIDI I/O
- Created `src-tauri/src/midi.rs` module with:
  - Device enumeration (`list_midi_devices`)
  - Connection management (`open_midi_device`, `close_midi_device`)
  - Message parsing (CC, Note On/Off, Pitch Bend)
  - MIDI Learn state machine (`start_midi_learn`, `cancel_midi_learn`)
  - Mapping storage and persistence (`midi_mappings.json`)
  - Direct Parameter Server integration (CC values → `set_target`)

**Tauri Commands:**

- `list_midi_devices` — List available MIDI input devices
- `open_midi_device(device_id)` — Open a device for input
- `close_midi_device(device_id)` — Close a device
- `start_midi_learn(parameter_id)` — Enter learn mode for a parameter
- `cancel_midi_learn` — Cancel learn mode
- `get_midi_learn_state` — Get current learn state
- `get_midi_mappings` — Get all mappings
- `set_midi_mapping(mapping)` — Add/update a mapping
- `remove_midi_mapping(parameter_id)` — Remove a mapping
- `clear_midi_mappings` — Clear all mappings

**Events Emitted:**

- `midi_message` — Raw MIDI for activity indicators
- `midi_devices_changed` — Device connect/disconnect
- `midi_learn_state_changed` — Learn mode changes
- `midi_learn_complete` — Mapping captured

**Frontend (React):**

- Created `src/inputs/midi.ts` with:
  - TypeScript types matching Rust structs
  - API wrapper functions for all Tauri commands
  - React hooks:
    - `useMidiDevices()` — Device listing and connection
    - `useMidiLearn()` — Learn mode management
    - `useMidiMappings()` — Mapping CRUD
    - `useMidiActivity()` — Activity monitoring

- Created UI components:
  - `MidiPanel` — Full MIDI management panel with:
    - Activity indicator (pulses on input)
    - Collapsible device list with connect/disconnect buttons
    - Collapsible mappings list with remove buttons
  - `MidiLearnButton` — Per-parameter Learn button showing:
    - "Learn" when no mapping
    - Current mapping (e.g., "CC1@1") when mapped
    - "Waiting…" with pulse animation when learning

- Integrated into Debug panel as first tab ("MIDI")

- Integrated `MidiLearnButton` into all scene control sliders:
  - `ParameterSlider` component extended with optional `midiParameterId` prop
  - When provided, displays a compact Learn button next to the slider label
  - All Scene A parameters (5 sliders): brightness, rotation, wobble, tint LFO, tint
  - All Scene B parameters (4 sliders): brightness, rotation, tint, scale
  - All Scene C parameters (4 sliders): brightness, pulse speed, rotation, tint

**Files Created/Modified:**

- `src-tauri/Cargo.toml` — Added `midir` and `log` crates
- `src-tauri/src/lib.rs` — Added midi module import, init, and command registration
- `src-tauri/src/midi.rs` — NEW: Complete MIDI engine
- `src/inputs/midi.ts` — NEW: TypeScript types and hooks
- `src/components/controls/MidiPanel.tsx` — NEW: MIDI management UI
- `src/components/controls/MidiPanel.module.css` — NEW: Panel styles
- `src/components/controls/MidiLearnButton.tsx` — NEW: Learn button component
- `src/components/controls/MidiLearnButton.module.css` — NEW: Button styles
- `src/components/controls/index.ts` — Added exports
- `src/components/debug/DebugPanel.tsx` — Added MIDI tab
- `src/components/ui/ParameterSlider.tsx` — Added `midiParameterId` prop and Learn button
- `src/components/ui/ParameterSlider.module.css` — Updated label row layout for button
- `src/components/controls/SceneAControls.tsx` — Added midiParameterId to all sliders
- `src/components/controls/SceneBControls.tsx` — Added midiParameterId to all sliders
- `src/components/controls/SceneCControls.tsx` — Added midiParameterId to all sliders

---

#### 2.2 OSC Input — ✅ Implemented

**Backend (Rust):**

- Added `rosc` crate (v0.10) for OSC message parsing
- Created `src-tauri/src/osc.rs` module with:
  - UDP server management (`start_osc_server`, `stop_osc_server`)
  - OSC packet/message parsing (Float, Double, Int, Long, Bool)
  - Address pattern matching (exact and wildcard with `*`)
  - Input→output value scaling with configurable ranges
  - Mapping storage and persistence (`osc_mappings.json`)
  - Direct Parameter Server integration

**Tauri Commands:**

- `start_osc_server(port)` — Start UDP listener on specified port
- `stop_osc_server` — Stop the server
- `get_osc_status` — Get current server status
- `get_osc_mappings` — Get all mappings
- `add_osc_mapping(mapping)` — Add/update a mapping
- `remove_osc_mapping(address)` — Remove a mapping
- `clear_osc_mappings` — Clear all mappings

**Events Emitted:**

- `osc_message` — Raw OSC for activity indicators
- `osc_status_changed` — Server start/stop events

**Frontend (React):**

- Created `src/inputs/osc.ts` with:
  - TypeScript types matching Rust structs
  - API wrapper functions for all Tauri commands
  - Default port: **9000** (standard for TouchOSC, Lemur, etc.)
  - `DEFAULT_OSC_MAPPINGS` — Pre-configured mappings for all parameters
  - `setupDefaultMappings()` — One-click setup of all default mappings
  - React hooks:
    - `useOscServer()` — Server start/stop management
    - `useOscMappings()` — Mapping CRUD
    - `useOscActivity()` — Activity monitoring
    - `useOscRecentMessages()` — Recent message history (last 20 messages)

- Created UI components:
  - `OscPanel` — Full OSC management panel with:
    - Activity indicator (purple, pulses on input)
    - Server controls (port config, start/stop button)
    - **Recent Messages** section — Real-time display of incoming OSC messages (address + args)
    - Mapping add form (address → parameter)
    - Mappings list with remove buttons
    - **"Setup Default Mappings"** button — Auto-creates mappings for all parameters
    - **"Reset to Defaults"** button — Restores default mappings

- Default OSC address mappings:
  - `/crossfade` → `crossfade`
  - `/scene_a/brightness` → `scene_a_brightness`
  - `/scene_a/wobble` → `scene_a_wobble`
  - `/scene_a/tint` → `scene_a_tint`
  - `/scene_a/tint_lfo_depth` → `scene_a_tint_lfo_depth`
  - `/scene_a/rotation_speed` → `rotationSpeed`
  - `/scene_b/brightness` → `scene_b_brightness`
  - `/scene_b/rotation_speed` → `scene_b_rotation_speed`
  - `/scene_b/tint` → `scene_b_tint`
  - `/scene_b/scale` → `scene_b_scale`
  - `/scene_c/brightness` → `scene_c_brightness`
  - `/scene_c/pulse_speed` → `scene_c_pulse_speed`
  - `/scene_c/rotation_speed` → `scene_c_rotation_speed`
  - `/scene_c/tint` → `scene_c_tint`

- Integrated into Debug panel as "OSC" tab (after MIDI)

**Testing OSC locally:**

```bash
# Install liblo (includes oscsend)
brew install liblo

# Send test messages (default port 9000)
oscsend localhost 9000 /scene_a/brightness f 0.8
oscsend localhost 9000 /crossfade f 0.5
```

**Files Created/Modified:**

- `src-tauri/Cargo.toml` — Added `rosc` crate
- `src-tauri/src/lib.rs` — Added osc module import, init, and command registration
- `src-tauri/src/osc.rs` — NEW: Complete OSC engine
- `src/inputs/osc.ts` — NEW: TypeScript types, hooks, default mappings
- `src/components/controls/OscPanel.tsx` — NEW: OSC management UI with recent messages
- `src/components/controls/OscPanel.module.css` — NEW: Panel styles
- `src/components/controls/index.ts` — Added export
- `src/components/debug/DebugPanel.tsx` — Added OSC tab

---

#### 2.3 Audio Input — ✅ Implemented

**Backend (Rust):**

- Added `cpal` crate (v0.15) for cross-platform audio I/O
- Added `rustfft` crate (v6.2) for FFT processing
- Created `src-tauri/src/audio.rs` module with:
  - Device enumeration (`list_audio_devices`)
  - Capture management (`start_audio_capture`, `stop_audio_capture`)
  - FFT analysis pipeline:
    - Hann windowing on 2048-sample buffer
    - Real FFT for magnitude spectrum
    - Frequency band extraction (bass, low-mid, high-mid, treble)
    - RMS and peak amplitude calculation
    - Beat detection with adaptive threshold and cooldown
  - Background analysis loop emitting levels at 60Hz

**Tauri Commands:**

- `list_audio_devices` — List available input devices
- `start_audio_capture(device_name)` — Start capture (optional device name)
- `stop_audio_capture` — Stop capture
- `get_audio_status` — Get current capture status

**Events Emitted:**

- `audio_levels` — Periodic levels with RMS, peak, bands, beat flag (60Hz)
- `audio_status_changed` — Capture start/stop events

**Frontend (React):**

- Created `src/inputs/audio.ts` with:
  - TypeScript types matching Rust structs
  - API wrapper functions for all Tauri commands
  - React hooks:
    - `useAudioCapture()` — Device list, start/stop management
    - `useAudioLevels()` — Real-time level monitoring

- Created UI components:
  - `AudioPanel` — Full audio input panel with:
    - Device selector dropdown with refresh button
    - Start/stop capture button
    - Real-time level meters (RMS, Peak)
    - Frequency band bars (Bass, Low-Mid, High-Mid, Treble)
    - Beat indicator with pulse animation and count

- Integrated into Debug panel as "Audio" tab

**Files Created/Modified:**

- `src-tauri/Cargo.toml` — Added `cpal` and `rustfft` crates
- `src-tauri/src/lib.rs` — Added audio module import, init, and command registration
- `src-tauri/src/audio.rs` — NEW: Complete audio engine with FFT
- `src/inputs/audio.ts` — NEW: TypeScript types and hooks
- `src/components/controls/AudioPanel.tsx` — NEW: Audio management UI
- `src/components/controls/AudioPanel.module.css` — NEW: Panel styles with level meters
- `src/components/controls/index.ts` — Added export
- `src/components/debug/DebugPanel.tsx` — Added Audio tab

---

#### 2.4 HID Input — ✅ Implemented

**Backend (Rust):**

- Added `hidapi` crate (v2.6) for cross-platform HID device access
- Created `src-tauri/src/hid.rs` module with:
  - Device enumeration with usage page/usage info (`list_hid_devices`, `list_supported_hid_devices`)
  - Multi-interface connection for devices like DOIO Megalodon
  - Raw HID report parsing tuned for DOIO encoder patterns
  - Encoder event detection (Consumer Control + Keyboard NKRO interfaces)
  - Parameter mapping with sensitivity and invert options
  - Mapping persistence (`hid_mappings.json`)
  - Direct Parameter Server integration

**Supported Devices:**

- DOIO Megalodon Triple Knob Macropad (Vendor: 0xD010, Product: 0x1601)
  - Left Knob: Consumer Control (Next/Prev Track → encoder 0)
  - Middle Knob: Consumer Control (Volume Up/Down → encoder 1)
  - Right Knob: Keyboard NKRO (custom keycodes → encoder 2)

**Tauri Commands:**

- `list_hid_devices` — List all HID devices with interface info
- `list_supported_hid_devices` — List only known/supported devices
- `connect_hid_device(path)` — Connect to specific interface
- `connect_hid_megalodon` — Auto-connect to all DOIO interfaces
- `disconnect_hid_device` — Disconnect all interfaces
- `get_hid_status` — Get connection status
- `get_hid_mappings` — Get all encoder mappings
- `add_hid_mapping(mapping)` — Add/update mapping
- `remove_hid_mapping(encoder_index)` — Remove mapping
- `clear_hid_mappings` — Clear all mappings
- `setup_default_hid_mappings` — Set up default mappings

**Events Emitted:**

- `hid_status_changed` — Connection state changes
- `hid_encoder` — Encoder turn events (index, delta, timestamp)
- `hid_raw_report` — Raw HID reports for debugging

**Frontend (React):**

- Created `src/inputs/hid.ts` with:
  - TypeScript types matching Rust structs
  - API wrapper functions for all Tauri commands
  - React hooks:
    - `useHidDevice()` — Device listing, connection management
    - `useHidMappings()` — Mapping CRUD
    - `useHidEncoderEvents()` — Encoder event monitoring
    - `useHidRawReports()` — Raw report debugging

- Created UI components:
  - `HidPanel` — Full HID management panel with:
    - Activity indicator (green, pulses on encoder turn)
    - Device section with interface list and "Connect All" button
    - Encoder mappings editor (3 encoders with parameter, sensitivity, invert)
    - Recent events display
    - Raw reports debug section

- Default encoder mappings:
  - Encoder 0 (Left) → `crossfade` (sensitivity: 0.02)
  - Encoder 1 (Middle) → `scene_a_brightness` (sensitivity: 0.05)
  - Encoder 2 (Right) → `scene_a_tint` (sensitivity: 0.02)

- Integrated into Debug panel as "HID" tab

**Files Created/Modified:**

- `src-tauri/Cargo.toml` — Added `hidapi` crate
- `src-tauri/src/lib.rs` — Added hid module import, init, and command registration
- `src-tauri/src/hid.rs` — NEW: Complete HID engine with DOIO support
- `src/inputs/hid.ts` — NEW: TypeScript types and hooks
- `src/components/controls/HidPanel.tsx` — NEW: HID management UI
- `src/components/controls/HidPanel.module.css` — NEW: Panel styles
- `src/components/controls/index.ts` — Added export
- `src/components/debug/DebugPanel.tsx` — Added HID tab

---

**Resolved questions (Phase 2):**

- ✅ Preferred Rust crates: `midir` for MIDI (confirmed working), `rosc` for OSC, `cpal`+`rustfft` for audio
- ✅ OS priority: macOS first (cross-platform support via chosen crates)

---

### Phase 3 — Parameter & Modulation Systems (incl. early Scene System wiring)

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
   - **Interaction with Scene System (future):**
     - Scene descriptors and `ParameterId` unions provide a typed surface for:
       - Discovering which scenes use a parameter before attaching modulators.
       - Building scene-aware modulation UIs (e.g., “modulate all Scene A parameters” vs global).
     - No runtime coupling yet; modulators will continue to work against plain parameter IDs and can later be made scene-aware via the registry.

**Open questions (Phase 3):**

- ❓ Tick source:
  - ☑️ Prefer a central backend timer with a fixed update step (e.g. ~60 Hz) so:
    - Transitions continue even if renderer window is minimized or closed.
    - Modulation and parameter evolution are not tied to renderer FPS.
  - Renderer frame time may still be used for purely visual-only transitions (e.g. shader-only effects not backed by the Parameter Server).
- ❓ Where should modulation math live predominantly (backend vs renderer)?
  - ☑️ Leaning toward **backend** for:
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

**Status:** 🧪 (Scene Control strip + Scene A/B/C panels + Debug Panel + Live Previews in place)

Planned minimal features:

1. **Layout & navigation**
   - 🧪 Scene switching UI:
     - Top-row **Scene Control strip** spanning columns 1–4:
       - Active/Next scene selection via Radix Select.
       - Per-side “Crossfade to Active/Next” buttons.
       - Crossfade progress indicator using Radix Progress.
       - Lock rules:
         - While crossfade is mid-range, both combos and buttons are disabled.
         - At crossfade ≈ 0, Active combo+CTA are disabled (scene is fully live).
         - At crossfade ≈ 1, Next combo+CTA are disabled.
   - ✅ Parameter inspector:
     - Scene A panel with Scene A–specific sliders (brightness, wobble, rotation, tint, tint LFO depth) wired to the Parameter Server.
     - Scene B panel with Scene B–specific sliders (brightness, rotation speed, tint, scale) wired to the Parameter Server.
     - Scene C panel with Scene C–specific sliders (brightness, pulse speed, rotation speed, tint) wired to the Parameter Server.
   - ✅ Debug / backend inspector:
     - Right-hand column Debug panel with **Radix Tabs** (`@radix-ui/react-tabs`):
       - **Parameters tab:** Embeds `BackendInspector` for a live view of backend state.
       - **Logs tab:** Rolling list of recent `parameter_changed` events with timestamp, value, target, and transition info. Capped at 100 entries. Includes event count badge and clear button.
       - **Metrics tab:** Summary cards (total updates, crossfade transitions, time since last event, session duration) plus per-parameter update counts. Auto-refreshes every second for time-based displays.
     - Implementation:
       - `DebugPanel.tsx` wraps the three tabs using Radix Tabs.
       - `DebugLogs.tsx` renders the scrollable event log.
       - `DebugMetrics.tsx` renders counters and statistics.
       - `App.tsx` maintains `logs` and `metrics` state, updating on each `parameter_changed` event.
   - ✅ Scene previews:
     - Live 3D previews next to each scene control panel (Active and Next)
     - Active scene preview shows current scene with real-time parameter updates
     - Next scene preview shows upcoming scene for crossfade planning
   - ✅ Global Renderer Preview:
     - Mirrors the actual Renderer window output with crossfade blending
     - Shows both scenes blended according to crossfade value
     - Includes Scene A tint LFO modulation
     - Located in right column above Debug panel
   - ⏳ Input monitor (future):
     - Simple visualization of MIDI/OSC/audio activity

2. **Parameter editing**
   - ✅ Bi-directional updates with Parameter Server for Scene A, B, C parameters and `crossfade`.
   - ⏳ Validation and clamping to min/max (some clamping already occurs in `applyBackendParamsToSliders`).
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
     - `renderer` (`/renderer`) — dedicated to visuals (full scene rendering with crossfade blending).
     - `controls` (`/`) — control UI with scene control strip, parameter panels, live previews, and debug tools.
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

### Completed ✅

1. **~~Tighten Parameter Server ↔ renderer integration~~** ✅ DONE
2. **~~Add one more visual parameter to validate transitions further~~** ✅ DONE
3. **~~Scene Previews~~** ✅ DONE
4. **~~MIDI Input~~** ✅ DONE
5. **~~OSC Input~~** ✅ DONE (including default port 9000, recent messages display, auto-setup mappings)
6. **~~Audio Input~~** ✅ DONE
7. **~~HID Input~~** ✅ DONE (DOIO Megalodon macropad with multi-interface support)

---

### Next Up (Prioritized)

#### 1. Audio → Parameter Binding

- Currently audio analysis (RMS, bands, beats) is displayed but not connected to parameters
- Add a simple binding UI to map audio outputs to parameters:
  - `rms` → any parameter (e.g., `scene_a_brightness`)
  - `bass` → any parameter (e.g., `scene_a_wobble`)
  - `beat` → trigger actions (e.g., crossfade, parameter pulse)
- Consider exposing audio levels as virtual parameters in the Parameter Server

#### 2. Backend Modulation Engine

- Implement LFOs as backend modulators (not just renderer-side)
- Move Scene A tint LFO to backend for consistency
- Add modulation sources: sine, triangle, random/noise
- Add modulation matrix UI (source → parameter with depth/mode)

#### 3. Video Output (Prototype)

- No-op Syphon/Spout backend that logs calls
- Define interface for publishing rendered frames
- macOS: Start with Syphon integration

#### 4. Scene System Expansion

- Add more scenes with different visual styles
- Scene library/browser UI
- Scene-aware parameter grouping in Controls

#### 5. UX Polish

- Mapping tooltips on sliders (show current MIDI/OSC binding)
- Mapping import/export for preset sharing
- Device hot-plug handling improvements
- Error recovery and user feedback

---

### Future Phases

- **Presets & Projects** — Save/load parameter snapshots, scene selections, mappings
- **Multi-display** — Support for multiple renderer windows
- **Recording** — GPU-based capture or frame export
- **Packaging** — macOS/Windows builds with code signing

---

## 8. Scene Management Refactor (Latest)

**Date:** November 2024

### Summary

Major refactor of the Controls window scene management system:

1. **Slot-Based System** — Replaced "Active/Next" paradigm with numbered scene slots (1-4)
2. **Single Source of Truth** — Scene descriptors in `sceneTypes.ts` now drive all UI controls
3. **Auto-Generated Controls** — New `SceneParameterControls` component reads from descriptors
4. **Map-Based Parameter Store** — Replaced individual `useState` calls with `useParameterStore` hook
5. **Scroll Edge Fades** — ScenesArea shows fade gradients when content overflows

### New Files

- `src/scenes/useSceneSlots.ts` — Slot management hook (add/remove/reorder/crossfade)
- `src/controls/useParameterStore.ts` — Map-based parameter state with backend sync
- `src/components/SceneParameterControls/` — Auto-generated sliders from scene descriptors
- `src/components/SceneColumn/` — Single scene column (preview + header + controls)
- `src/components/ScenesArea/` — Horizontally scrollable container for columns with edge fade gradients

### Removed Files

- `src/components/SceneAControls/` — Replaced by auto-generated controls
- `src/components/SceneBControls/` — Replaced by auto-generated controls
- `src/components/SceneCControls/` — Replaced by auto-generated controls
- `src/components/SceneControlStrip/` — Replaced by ScenesArea
- `src/components/ScenePreview/` — Preview now embedded in SceneColumn
- `src/controls/controlsParameters.ts` — Replaced by useParameterStore
- `src/controls/scenePairing.ts` — No longer needed

### Updated Files

- `src/scenes/sceneTypes.ts` — Enhanced `SceneParameterDescriptor` with `step`, `color`, `description`
- `src/App.tsx` — New layout using slot-based system
- `src/App.module.css` — 4/5 + 1/5 two-column responsive layout
- `src/components/ParameterSlider/` — Extended color variants (rose, violet, lime, orange, fuchsia)
- `src/components/index.ts` — Updated exports

### UI Changes

- **Layout:** Main area (4/5) with horizontal scroll, sidebar (1/5) for preview + debug
- **Scene Columns:** Each shows preview canvas, scene selector, status badge, crossfade button, controls
- **Responsive:** Columns have max-width 420px, fit ~3.5 columns on desktop
- **Add/Remove:** "Add Scene" button when < 4 slots; remove button on non-active slots
- **Scroll Fades:** Left/right gradient overlays appear when list is scrollable and not at edge

### Key Design Decisions

- Crossfade uses backend transition (option B) — no frontend animation
- Parameter store uses Map pattern for cleaner state management
- Scene descriptors are the single source of truth for controls
- Each column has its own embedded 3D preview (not shared)
- JSDoc uses consolidated `@property` blocks before interfaces (see `ARCHITECTURE.md` Code Style section)

---

## 9. Housekeeping Notes

- After each incremental change, run TypeScript/Rust diagnostics to keep the codebase green.
- Keep this document updated as features land.
- Mark relevant roadmap items as 🧪/✅ when work begins or completes.
- Follow the JSDoc conventions documented in `ARCHITECTURE.md` (Code Style section).

---

## 10. Code Style Reference

See `ARCHITECTURE.md` → **Code Style** section for:

- **JSDoc pattern:** Use consolidated `@property` blocks before interfaces, not inline comments
- **Component docs:** One-liner + feature bullets
- **Hook docs:** Purpose, key concepts, return type

Example:

```ts
/**
 * Props for the ScenesArea component.
 *
 * @property slots - Array of scene slots to render
 * @property activeIndex - Index of the active (output) slot
 * @property onAddSlot - Callback to add a new slot
 */
export interface ScenesAreaProps {
  slots: SceneSlot[];
  activeIndex: number;
  onAddSlot: () => void;
}
```
