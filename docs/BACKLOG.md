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

### 🟡 Integer Step Input Component `feature`

Replace knob/slider with a purpose-built integer stepper for parameters that only take whole-number values (e.g. Line Count, Ray Steps, segment counts, iteration counts).

**Context**: A continuous knob or slider has no value for integer-only parameters — there's nothing to sweep between steps. A compact `<StepInput>` cell with a centred number and ±1 buttons above/below is clearer, faster, and more accurate. These parameters are typically set once before a sketch goes live, so no MIDI/beat/LFO wiring is needed.

**Component spec**:

- Fits in the same 3-column knob grid cell (`width: 100%`)
- Centred display: current integer value in a click-to-edit `<input type="number">`
- `+` button above the value, `−` button below (or flanking, TBD during design)
- Keyboard: `↑`/`↓` increment/decrement; `Shift` for ×10 coarse step; clamp at `min`/`max`
- Use number-flow lib (https://github.com/barvian/number-flow) for an easy drop-in animated number input solution
- No scroll-adjust, no MIDI learn, no beat/LFO CTAs
- Same label-at-bottom convention as `KnobInput`
- `onCommit(after, before)` for undo history, same as other controls

**Integration**:

- Add `inputType: "integer"` (or reuse existing `"number"` + detect `step === 1 && Number.isInteger(min) && Number.isInteger(max)`) to `ParameterTemplate`
- In `SlotParameterControls.renderParameter`, route integer params to `<StepInput>` instead of `<KnobInput>`

**Subtasks**:

- [ ] Build `<StepInput>` component (`src/components/StepInput/`)
- [ ] Add tests (render, keyboard, click-to-edit, clamp)
- [ ] Add `inputType: "integer"` to `ParameterTemplate` type (or decide on auto-detection)
- [ ] Wire into `SlotParameterControls` render path
- [ ] Audit all existing sketches and update parameters that should use `StepInput` — candidates include any param with `step >= 1` and a small integer range (Line Count, Ray Steps, segment counts, octave counts, iteration limits, etc.)

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
