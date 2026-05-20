# Backlog

Prioritized list of potential work items for Slew.

---

## Priority Labels

- 🔴 **High**: Important for core functionality or blocking other work
- 🟡 **Medium**: Valuable improvement, not urgent
- 🟢 **Low**: Nice to have, future consideration

## Tags

- `feature`: New capability
- `chore`: Maintenance, refactoring, documentation
- `issue`: Bug fix or problem resolution

---

## Active / High Priority

### 🔴 App Icon `chore`

Design and implement proper app icon for Slew.

**Context**: App name is now "Slew" with tagline "VJ software for creative coders". Currently using 🎛️ emoji as a placeholder symbol. Needs a proper icon before public release.

**Subtasks**:

- [ ] Design app icon concept
- [ ] Export all required sizes (32x32, 128x128, 128x128@2x, .icns, .ico)
- [ ] Replace placeholder icons in `src-tauri/icons/`
- [ ] Test icon appearance on all platforms

---

### 🔴 Spout Video Output (Windows) `feature`

Implement Spout backend for Windows video output.

**Context**: Currently blocks professional Windows deployment. Syphon works on macOS, NDI works cross-platform, but Windows-native Spout is stubbed out (`video_out.rs:369` has TODO). Windows VJs need Spout to route output to Resolume, MadMapper, etc.

**Subtasks**:

- [ ] Research Rust Spout bindings (check if `spout-rs` or similar exists)
- [ ] Implement SpoutBackend (mirror SyphonBackend pattern)
- [ ] Test with Spout receivers on Windows
- [ ] Update documentation

---

## Medium Priority

### 🟡 Color Parameters `feature`

Promote color from a static sketch config value into a live, MIDI-learnable, LFO-targetable parameter. This is the prerequisite for OSC color forwarding and WLED color control.

**Context**: Sketches currently accept color via a static `colorPalette` preset array. There is no `"color"` `inputType` in the parameter system, so colors cannot be MIDI-mapped, modulated, or changed live without switching presets.

**Subtasks:**

- [ ] Add `"color"` to the `inputType` union on `ParameterTemplate` (`src/sketches/types.ts`)
- [ ] Expand color params into R/G/B sub-params in `buildSlotDefaultParameters` / `buildSlotParameterDescriptors` using a `slot_{n}_{id}_r/g/b` suffix convention; add `colorChannel?: "r"|"g"|"b"` and `colorGroup?: string` to `SlotParameterDescriptor`
- [ ] Add `color_primary`, `color_secondary`, `color_bg` to `ParameterTemplateId`
- [ ] Pack the three sub-params into `[r, g, b]` tuples in `SketchProps.params` so sketches receive a typed color value
- [ ] `SlotParameterControls`: render a single `ColorPicker` row for the first channel of each color group; skip the `_g` / `_b` rows (already consumed)
- [ ] Migrate existing sketches (`Aura` presets, etc.) from static `colorPalette` entries to proper `color` parameter descriptors; keep `colorPalette` as a source of default values only
- [ ] MIDI-learn: support per-channel CC assignment (three `MidiLearnButton` instances in expanded view)

**Sizing**: Large (~2 days). Prerequisite for OSC Color Forwarding and WLED Color Control.

---

### 🟡 OSC Color Forwarding `feature`

Emit live color parameter values over OSC whenever a color param changes, so downstream tools (TouchDesigner, Resolume, etc.) can consume them without polling.

**Depends on**: Color Parameters (above).

**Subtasks:**

- [ ] Add `forward_colors: bool` to `OscOutputConfig` in `src/inputs/osc.ts` and `src-tauri/src/osc.rs`
- [ ] Add `send_osc_color(slot, template_id, r, g, b)` to the Rust OSC backend, following the `send_osc_beat` / `send_osc_bpm` pattern; address scheme: `/slew/slot/{n}/color/{template_id}  r:Int  g:Int  b:Int`
- [ ] Hook into the parameter-change event pipeline to emit on color sub-param change, debounced to 30 Hz max
- [ ] Add a "Forward colors" toggle to the OSC Output section of `OscPanel`

**Sizing**: Small (~half a day) once Color Parameters is done.

---

### 🟡 WLED Color Control `feature`

Map slot color parameters directly to WLED LED strip segments via HTTP, bypassing TouchDesigner for LED routing.

**Context**: The WLED HTTP backend (`src-tauri/src/wled.rs`) already exists with config persistence, `test_wled_connection`, and a `do_post` helper. What's missing is the color-parameter → segment mapping layer.

**Depends on**: Color Parameters (above). Independent of OSC Color Forwarding.

**Subtasks:**

- [ ] Add `WledSegmentMapping { segment_id, slot_index, template_id, color_index }` to `WledState` and persist it
- [ ] On color sub-param change: recompute diff, batch into a single WLED JSON payload (`seg[].col`), post at ≤25 Hz
- [ ] Fix `do_post` to reuse a persistent `reqwest::Client` (see Stabilisation → Tier 2) rather than constructing one per call
- [ ] `WledPanel`: add a Segment Mappings table (segment ID, slot, color param, color index) with Add / Remove rows

**Sizing**: Medium (~1 day) once Color Parameters is done.

---

### 🟡 MIDI Panel — Device Schematic & Clock UI `feature` `design`

Overhaul the Mappings section of the MIDI Panel to be visually useful and scalable.

**Current problem:** The Mappings section is a flat list of `CC X @ Ch Y → parameter_id` rows. It conveys almost no spatial or contextual information about the device, and becomes unwieldy once more than a handful of mappings exist.

---

**Part 1 — Device Schematic Modal** (main effort)

Replace the list with a compact summary line (e.g. "8 mappings active") and a **"View Device" button** that opens a modal showing a top-down schematic of the connected MIDI controller:

- Knobs, faders, pads, buttons rendered in their physical layout
- Each control highlighted green/grey to indicate whether it has a mapping
- Clicking a control opens an inline popover to assign/clear its mapping (replaces the current learn flow)
- Support for multiple connected devices — tabs or a device switcher at the top of the modal

*Effort estimate:* High. Each supported hardware model requires a schematic definition (layout data + SVG or CSS component). Suggested approach:
  1. Define a `DeviceLayout` data format (JSON: control type, position, CC number, label)
  2. Build a generic `<DeviceSchematic>` renderer that consumes the format
  3. Ship definitions for the initially-supported models (e.g. Akai APC mini, Novation Launch Control, generic 8-knob template)
  4. Unknown devices fall back to a grid auto-generated from the CC numbers they've emitted

*Creative option:* Allow community-contributed layout files (plain JSON in `~/.slew/device-layouts/`) so users can add their own controllers without a code change.

---

**Part 2 — MIDI Clock UI** (separate, lower coupling)

MIDI Clock is a different kind of signal (timing pulses, not CC messages) and deserves its own dedicated sub-section in the MIDI Panel rather than appearing in the mappings list:

- **Clock source indicator:** shows which device is sending clock (or "Internal" if Slew is the master)
- **Live BPM display:** large numeric readout derived from inter-pulse timing, with a tap-tempo fallback
- **Sync status badge:** Locked / Drifting / No Signal, with colour coding
- **Phase offset control:** nudge slider to align Slew's beat grid to external clock
- Future: allow Slew to *send* MIDI Clock to downstream devices (master mode)

This section should be visually distinct from the device/mappings section — consider a horizontal "clock strip" at the top of the panel.

---

**Acceptance criteria:**
- [ ] Mappings list removed; replaced by schematic modal trigger
- [ ] Modal renders correct physical layout for at least 2 real device models
- [ ] Unknown devices render an auto-generated grid layout
- [ ] Mapping assign/clear works inside the modal (no regression on learn flow)
- [ ] MIDI Clock strip shows BPM and sync status when a clock source is present
- [ ] All existing `MidiPanel` tests updated / extended

**Sizing:** Large (split into Part 1 and Part 2 as separate PRs). Part 1 alone is likely 2–3 days of design + implementation.

---

### 🟡 Full Size Slot Editor Overlay `feature`

Add a full-size slot editor overlay, allowing users to focus on editing one slot at a time.

**Context**: The slot preview is currently limited to a small area within the UI. If the visual output is key, it would be useful to be able to focus on one slot at a time.

**Subtasks**:

- [ ] Slot preview click handler to open full-size editor
- [ ] Full-size editor UI design and implementation: slot preview takes as much space as possible, slot parameters are put into a sidebar.
- [ ] Make implementation as comprehensive as possible before starting the work.

---

### 🟡 External Texture Input `feature`

Support external images/videos as input textures for sketches.

**Context**: Current sketches are purely generative. Adding texture inputs unlocks whole new category - mix camera feeds, video files, image sequences with shaders. Huge VJ use case.

**Subtasks**:

- [ ] Add `texture` parameter type to ParameterTemplate
- [ ] File picker UI for images/videos
- [ ] WebRTC camera capture support
- [ ] Texture management in renderer (cache, resize, format conversion)
- [ ] Create example sketch using external texture (e.g., "Image Feedback", "Video Distortion")

**Reference**: Look at how Hydra.video handles texture sources

---

### 🟡 Parameter Randomization `feature`

Add parameter randomization for experimentation.

**Context**: VJs love "happy accidents" - randomization helps discover new looks. Common in TouchDesigner, Resolume, etc.

**Subtasks**:

- [ ] "Randomize" button per slot
- [ ] Randomize all parameters (exclude alpha, respect min/max)
- [ ] Optional: weighted randomization favoring interesting ranges
- [ ] Optional: "lock" certain parameters from randomization

---

### 🟡 Sketch Presets `feature`

Save/load parameter configurations per sketch.

**Context**: Users often find good parameter combinations they want to recall. Per-sketch presets would enable quick switching between looks.

**Enhancement**: Combine with sketch browser - show preset thumbnails, allow preset preview before loading.

**Subtasks**:

- [ ] "Save Preset" button in slot controls
- [ ] Preset dropdown to load saved configurations
- [ ] Persist to JSON files (`presets/{sketchId}/{presetName}.json`)
- [ ] Default preset per sketch type
- [ ] Preset management UI (rename, delete)
- [ ] Preset thumbnails in browser
- [ ] Preset preview before loading

---

### 🟡 LFO UX Overhaul `feature` `polish`

The LFO creation flow and depth/offset defaults create friction and clipping issues in live use. This task covers a set of tightly related improvements.

**Problems to solve:**

1. **Beat vs LFO CTAs are unclear** — the ♩ and ~ buttons on `KnobInput`/`ParameterSlider` are not self-explanatory. "Beat" triggers a one-shot audio-reactive pulse on transients; "LFO" creates a continuous oscillator. This distinction needs better labelling or a tooltip that explains the difference on first encounter. Consider a small popover on long-press/hover that says "Pulses on detected beat" vs "Continuous oscillation".

2. **New LFOs default to free-running (no BPM sync)** — `DEFAULT_LFO` has `sync_to_bpm: false`. For a VJ tool where everything should lock to tempo, this should default to `sync_to_bpm: true` with a sensible `bpm_division` (e.g. 4 beats). The current flow forces the user to manually enable sync after creation.

3. **Depth defaults to 1.0 (full range) causing clipping/blocking** — When an LFO is quick-linked to a parameter, `handleQuickLfo` hardcodes `depth: 0.5, bipolar: true`. But "bipolar" with depth 0.5 means the parameter swings ±50% of the normalised range, which still maxes out many parameters whose interesting range is much narrower. Depth and offset should be initialised relative to the parameter's actual min/max range:
   - **Depth** should default to ~25% of `(max - min)` so the oscillation stays within a comfortable range.
   - **Offset** should default to the parameter's *current value* (not 0), so the LFO oscillates around where the knob already is rather than around the bottom of the range.
   - The LFO panel editor should show depth in parameter units (e.g. `±0.12`) in addition to or instead of a 0–1 normalised value.

4. **Phase has no obvious musical meaning in the UI** — "Phase" shown as 0–1 is confusing. Consider labelling it "Phase offset" and showing `0°–360°` or beats offset.

**Acceptance criteria:**
- [ ] `DEFAULT_LFO.sync_to_bpm` set to `true`, `bpm_division` defaults to `4.0` (one full cycle per 4 beats)
- [ ] `handleQuickLfo` passes `offset` = current param value and `depth` = 25% of `(max - min)`
- [ ] Beat and LFO CTAs have descriptive tooltips / aria labels distinguishing the two
- [ ] LFO panel editor shows depth in native parameter units alongside normalised value
- [ ] Phase control labelled as degrees or musical offset
- [ ] Existing modulation tests updated to reflect new defaults

**Notes:**
- The Beat CTA appears functional end-to-end (wired correctly through `SlotsArea → SlotParameterControls → KnobInput`). If it appears to "do nothing", it may be that the beat trigger fires correctly but the visual change is too brief to notice, or the audio beat detector isn't firing (threshold too high). Worth a focused test session before assuming it's broken — but improve the tooltip to set expectations.
- Changing `DEFAULT_LFO` will be a small breaking change: existing saved LFOs are unaffected (they have their own persisted values), but newly created ones will behave differently. Document in CHANGELOG.

**Sizing:** Medium (1 day). Mostly frontend changes to defaults and the LFO creation path; no Rust changes needed for the core improvements.

---

### 🟡 MIDI Note Velocity Support `feature`

Extend MIDI mappings to support note velocity.

**Context**: Some controllers (pads, keyboards) use velocity for expression. Current MIDI implementation only handles CC messages.

**Subtasks**:

- [ ] Extend MidiMapping to include note/velocity mappings
- [ ] UI for mapping pads to parameters (note number + velocity)
- [ ] Learn mode support for notes
- [ ] Trigger vs. continuous modes

---

### 🟡 API Documentation for Sketch Developers `chore`

Create developer guide for building custom sketches.

**Context**: Enables community contributions, future-proofs onboarding. SketchDescriptor and ParameterTemplate types exist but lack usage examples.

**Subtasks**:

- [ ] Create `docs/CREATING_SKETCHES.md`
- [ ] Step-by-step tutorial (start from BlueCube)
- [ ] Explain SketchDescriptor, ParameterTemplate, SketchProps
- [ ] Document parameter types (number, color, enum)
- [ ] Example: create a custom sketch from scratch
- [ ] Link to TSL shader resources

---

### 🟡 Video Output Troubleshooting Guide `chore`

Create troubleshooting guide for video output setup.

**Context**: Users will struggle with Syphon/NDI/Spout setup. Need comprehensive guide. Write after Spout is done so the Windows section is complete.

**Subtasks**:

- [ ] Create `docs/VIDEO_OUTPUT_TROUBLESHOOTING.md`
- [ ] How to verify output is working (test patterns, receiver apps)
- [ ] Common issues: permissions, firewall, SDK installation
- [ ] Platform-specific notes
- [ ] Screenshots of receiver apps

---

## Low Priority / Future

### 🟢 App Launch Sequence & Preloader `polish`

Improve the cold-start experience with a polished launch animation and soft preloader.

**Context**: The app currently opens abruptly with no transition. A short branded preloader and entrance animation would make the app feel more professional and mask any initial asset-loading latency.

**Subtasks**:

- [ ] Design a minimal splash/preloader overlay (logo mark + subtle progress indicator)
- [ ] Animate the preloader out once the control window is ready (fade/slide)
- [ ] Add entrance animations for key UI regions (toolbar, deck panels, sidebar) on first paint
- [ ] Ensure the output window opens without a visible flash or blank frame
- [ ] Keep total perceived launch time the same or shorter (animation should not add wall-clock delay)
- [ ] Respect `prefers-reduced-motion`

---

### 🟢 Crash Reporting & Analytics `feature`

Add optional telemetry for debugging and product insights.

**Context**: No visibility into production issues or feature usage.

**Subtasks**:

- [ ] Add optional crash reporting (Sentry, user consent required)
- [ ] Privacy-respecting usage analytics (opt-in)
- [ ] Track: sketch popularity, input device usage, feature adoption
- [ ] Use data to prioritize future development

---

### 🟢 Parameter Locking `feature`

Lock parameters to prevent accidental changes.

**Context**: Prevents accidental changes during performance.

**Subtasks**:

- [ ] Lock icon on each slider
- [ ] Locked state disables all input (MIDI, OSC, UI)
- [ ] Visual indication (dimmed, lock icon)
- [ ] Global "lock all" option

---

### 🟢 Integration Tests `chore`

Add end-to-end testing for critical workflows.

**Context**: No E2E tests covering full workflows.

**Subtasks**:

- [ ] Set up Playwright or Tauri's testing framework
- [ ] Test: Load sketch → set parameters → crossfade
- [ ] Test: MIDI learn workflow
- [ ] Test: Audio mapping creation → trigger
- [ ] Test: Video output activation
- [ ] Run in CI

---

### 🟢 CI Test Job `chore`

Add automated testing to CI pipeline.

**Context**: GitHub Actions builds but doesn't run tests. Can be partially done now (existing unit tests) without waiting for integration tests.

**Subtasks**:

- [ ] Add `test` job to `release.yml`
- [ ] Run `npm run test:run` (frontend)
- [ ] Run `cargo test` (backend)
- [ ] Fail build if tests fail

---

### 🟢 Architecture Diagrams `chore`

Add visual diagrams to architecture documentation.

**Context**: ARCHITECTURE.md is text-only. Complex flows hard to visualize.

**Subtasks**:

- [ ] Add Mermaid diagrams for:
  - Parameter flow (UI → Backend → Renderer)
  - Window communication (Events, IPC)
  - Video output pipeline (WebGPU → Syphon/NDI)
  - Slot system (lifecycle, crossfade)

---

### 🟢 Memory Leak Testing `chore`

Add long-running stability testing.

**Context**: App runs for hours during live performances - leaks will crash it.

**Subtasks**:

- [ ] Create long-running stability test (4+ hours)
- [ ] Monitor memory usage over time
- [ ] Profile with Chrome DevTools (heap snapshots)
- [ ] Document memory profiling workflow

---

### 🟢 Presets & Projects (Full Session Management) `feature`

Save/load complete project state.

**Context**: For live performance, users need to save entire setups including all slots, parameters, and mappings. Sketch Presets (🟡) is a natural prerequisite.

**Subtasks**:

- [ ] Save/load complete project state (slots, parameters, mappings)
- [ ] Quick snapshot for A/B comparison
- [ ] Export/import for sharing
- [ ] Auto-save / recovery

---

### 🟢 Multi-Display Support `feature`

Multiple renderer windows for different outputs.

**Context**: Some VJ setups use multiple projectors or preview monitors.

**Subtasks**:

- [ ] Spawn additional renderer windows
- [ ] Per-window slot assignment
- [ ] Independent resolution/output settings

---

### 🟢 Recording `feature`

GPU-based capture or frame export.

**Context**: Users may want to record performances for later use or sharing.

**Subtasks**:

- [ ] Define recording format (MP4, image sequence)
- [ ] Implement GPU-based capture
- [ ] Recording controls (start/stop/pause)
- [ ] Export settings

---

### 🟢 Post-Processing Effects Panel `feature`

A dedicated effects panel operating on the composited output, with an ordered stack of effects that can be added, removed, and reordered.

**Context**: Merged from "New Sketch Group: Effects" and the previous "Post-Processing Pipeline" item. Per-slot effects via the slot system are too limiting — global effects (grain, bloom, etc.) shouldn't consume a slot, and chaining order matters. A first-class Effects Panel is the right model.

**Architecture notes** (design pass needed before implementation):
- Effects run on the composited output, after slot blending but before Syphon/NDI output — natural seam in `VideoOutputCapture.tsx`
- Effects are descriptor-based like sketches (same `ParameterTemplate` system, same auto-generated sliders)
- UI: separate panel with add/remove/drag-to-reorder stack

**Effect ideas** (from Phobon's Fragments Boilerplate and beyond):
- Grain
- Bloom
- Chromatic Aberration / RGB Split
- CRT Scanlines
- Dither / Halftone
- Pixelation
- Vignette
- Feedback / Trails (frame buffer decay)
- Mirror / Symmetry
- Bulge / Swirl / Wave Distortion
- Edge Detection
- Datamosh (glitch)

**Subtasks**:

- [ ] Design pass: pipeline integration, descriptor schema for effects, panel UX
- [ ] Implement effects render pass in `VideoOutputCapture.tsx`
- [ ] Effects Panel UI (add, remove, reorder, per-effect parameters)
- [ ] Implement initial set of effects
- [ ] Persist effects stack and parameters

---

### 🟢 Additional Controller Support `feature`

Support more hardware controllers.

**Context**: Different VJs use different gear. Supporting more controllers expands the user base.

**Subtasks**:

- [ ] Launchpad support
- [ ] APC Mini support
- [ ] Generic MIDI template system
- [ ] MIDI mapping import/export

---

### 🟢 DMX Lighting Control `feature`

OSC → DMX integration for lighting.

**Context**: Some VJs control lighting alongside visuals. Parameter → DMX output would enable synchronized light shows.

**Subtasks**:

- [ ] Research DMX interfaces/protocols
- [ ] OSC → DMX plugin design
- [ ] Fixture mapping system

---

### 🟢 Onboarding / First-Run Experience `feature`

Guide new users on first launch.

**Context**: Currently a new user sees 8 empty slots with no hints. No tutorial, no "get started" guidance. Worth at least a lightweight first-run hint system before wide release.

**Subtasks**:

- [ ] Identify the 3-4 key actions a new user needs to discover (load sketch, map MIDI, enable output)
- [ ] Design: tooltip hints, empty-state copy, or a dismissable welcome card
- [ ] Implement and make dismissable/skippable
- [ ] Don't show again after first use (persist dismissed state)

---

### 🟢 Linux Packaging Testing `issue` `chore`

Verify Linux builds work correctly.

**Context**: CI builds Linux artifacts (.deb, .rpm, .AppImage) but no verification they work correctly.

**Subtasks**:

- [ ] Test .deb installer on Ubuntu/Debian
- [ ] Test .rpm installer on Fedora/RHEL
- [ ] Test .AppImage on various distros
- [ ] Document Linux-specific setup (dependencies, permissions)
- [ ] Community testing call

---

### 🟢 Windows Packaging Testing `chore`

Complete Windows distribution pipeline testing.

**Context**: Dependent on Spout (🔴) being complete first.

**Subtasks**:

- [ ] Test NSIS/MSI installers on Windows 10/11
- [ ] Verify all features work on Windows
- [ ] Document Windows-specific setup

---

## Future Consideration / Inspiration

### 🎨 IOSurface Zero-Copy (macOS) `feature`

Bypass CPU entirely for ultimate video output performance.

**Context**: Current WebGPU async readback + binary IPC achieves **stable 60fps at 1080p**. IOSurface would provide ~10-20% additional improvement by eliminating CPU copies entirely, but requires significant effort and possibly private APIs. **Not a priority** given current performance meets requirements.

**Reference**: See `docs/finished/IOSURFACE_FEASIBILITY.md` for detailed research (updated June 2025).

**Key findings from research**:

- WebGPU uses Metal internally on macOS, but no public API exposes Metal textures
- SyphonMetalServer can publish directly from Metal textures with GPU blit
- CALayer private API (`_contentsIOSurface`) is high risk (App Store rejection)
- Current ~5-8ms per frame is well within 16.67ms budget for 60fps

**When to revisit**:

- Performance requirements increase (4K output, multiple simultaneous outputs)
- Apple provides new public APIs for WebGPU texture access
- VJ performance becomes a key differentiator worth major investment

**Subtasks** (deferred):

- [ ] Monitor WebGPU native extensions for Metal handle access
- [ ] Prototype CALayer IOSurface capture (test feasibility outside App Store)
- [ ] Evaluate SyphonMetalServer migration (even with CPU upload)

---

### 🎨 Sketch Sequencer `feature`

Auto-transition between sketches on a timeline or trigger pattern.

**Use case**: Pre-programmed visual sets, sync to song structure.

**Ideas**:

- [ ] Timeline-based sketch sequencing
- [ ] Trigger patterns (e.g., switch every 8 beats)
- [ ] Cue list with manual/auto advance
- [ ] Integration with audio analysis (switch on song structure changes)
- [ ] MIDI clock sync for timing

---

### 🎨 Shader Code Live Editor `feature`

Hot-reload TSL/GLSL shaders during performance.

**Use case**: Creative coders want to code live. Think Hydra.video meets Slew.

**Ideas**:

- [ ] Integrated code editor with syntax highlighting
- [ ] Hot-reload shaders without restarting
- [ ] Error display with line numbers
- [ ] Shader snippet library
- [ ] Record coding session for replay
- [ ] Share shaders with community

---

### 🎨 Networked Multi-Instance `feature`

Multiple Slew instances controlled from one "director" instance.

**Use case**: Multi-projector installations, VJ collectives, collaborative performances.

**Ideas**:

- [ ] OSC/WebSocket sync protocol
- [ ] Director instance sends parameter updates to clients
- [ ] Per-client slot assignment
- [ ] Network discovery (zero-conf)
- [ ] Latency compensation
- [ ] Fallback to local control if network drops

---

### 🎨 Sketch Remix Engine `feature`

AI/procedural generation of parameter variations.

**Use case**: Generate N variations of a look, let VJ pick best.

**Ideas**:

- [ ] Generate parameter variations using genetic algorithms
- [ ] "More like this" button to refine
- [ ] Save favorite variations as presets
- [ ] Interpolate between variations
- [ ] Integration with modulation engine (animate between variations)

---

### 🎨 Projection Mapping `feature`

Warp/mask output for projection on non-flat surfaces.

**Use case**: Architectural projection, 3D object mapping, irregular screens.

**Ideas**:

- [ ] Corner-pin warping
- [ ] Mesh warping with control points
- [ ] Per-projector output (multi-display integration)
- [ ] Masking tools (polygon, bezier)
- [ ] Camera calibration for auto-alignment
- [ ] Save/load mapping configurations

---

## Completed Items

Completed items are tracked in `CHANGELOG.md`. Task documents are archived in `docs/finished/`.

---

## Notes

- When picking up an item, create a task doc in `docs/working/` with a detailed plan
- When done, move the task document to `docs/finished/`, remove the task from the backlog, and update `CHANGELOG.md`
- Update this file as items are started, completed, or re-prioritized
- Items may be split into smaller chunks as needed
