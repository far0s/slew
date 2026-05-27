# Backlog

Prioritized list of potential work items for Slew.

---

## Priority Labels

- 🔴 **Blocker**: Must ship before v1 public release
- 🟡 **Target**: v1 feature; defer only if time-constrained
- 🎨 **Future**: Inspiration, speculative, no timeline

## Tags

- `feature`: New capability
- `chore`: Maintenance, refactoring, documentation
- `issue`: Bug fix or problem resolution

---

## v1 Public Release

> **Scope freeze:** Everything below is in scope for v1. 🔴 items must ship; 🟡 items should ship and are only deferred under serious time pressure. Nothing outside this file's v1 section should be picked up until v1 ships.

---

### Release Blockers

#### 🔴 App Icon `chore`

Design and implement proper app icon for Slew.

**Context**: App name is now "Slew" with tagline "VJ software for creative coders". Currently using 🎛️ emoji as a placeholder. Needs a proper icon before public release.

**Subtasks**:

- [ ] Design app icon concept
- [ ] Export all required sizes (32x32, 128x128, 128x128@2x, .icns, .ico)
- [ ] Replace placeholder icons in `src-tauri/icons/`
- [ ] Test icon appearance on all platforms

---

#### 🔴 Onboarding / First-Run Experience `feature`

Guide new users on first launch.

**Context**: Currently a new user sees 8 empty slots with no hints. No tutorial, no "get started" guidance. Required before wide release.

**Subtasks**:

- [ ] Identify the 3–4 key actions a new user needs to discover (load sketch, map MIDI, enable output)
- [ ] Design: tooltip hints, empty-state copy, or a dismissable welcome card
- [ ] Implement and make dismissable/skippable
- [ ] Persist dismissed state (don't show again after first use)

---

#### 🔴 Selling Strategy & Pricing Model `research`

Define how Slew will be sold before public launch: pricing tiers, trial/free model, and feature gating strategy.

**Context**: Slew targets creative coders and VJs — a niche with high willingness to pay for tools that respect their workflow, but also a strong open-source/free-tool culture (Hydra, TouchDesigner free tier, etc.). Getting this wrong at launch is hard to undo.

**Competitor research** (at minimum):

| App | Model | Price | Notes |
|---|---|---|---|
| TouchDesigner | Free tier + Commercial | $600 one-time (Commercial) | Free is watermarked, limited res |
| Resolume Avenue | One-time | ~€350–450 | No free tier, demo mode |
| VDMX | One-time | $399 | 30-day trial |
| CoGe | One-time | €99 | Cheap, niche |
| Hydra | Free / open-source | $0 | Web-based, community-funded |
| MadMapper | Subscription or one-time | €$99–399 | Projection-focused |
| Millumin | One-time | €$299 | Event/installation focus |
| Modulaser | Free tier + One-time tiers | Free / €179 Standard / €499 Pro (20% early-access discount active) | Laser-focused; indie, macOS/Win/Linux; free tier is 15-min sessions, gates recording & output count — very close model to where Slew might land |

**Questions to answer**:

- One-time purchase vs subscription vs perpetual + upgrade pricing?
- Free tier (feature-limited) vs time-limited trial vs no free tier?
- Which Slew features are strong enough to gate? (e.g. output resolution, sketch count, MIDI/OSC, recording)
- Is there a meaningful "hobbyist" tier vs "professional" tier split?
- App Store vs direct download vs both? (App Store takes 30%, limits some APIs)
- Early adopter / launch pricing strategy?

**Subtasks**:

- [ ] Complete competitor pricing research table
- [ ] Survey potential users (VJ communities) on price sensitivity
- [ ] Draft 2–3 pricing model options with pros/cons
- [ ] Decide on free/trial approach and what is gated
- [ ] Decide on distribution channel (direct, Gumroad, App Store, etc.)
- [ ] Document final decision and rationale

---

#### 🔴 CI Test Job `chore`

Add automated testing to CI pipeline.

**Context**: GitHub Actions builds but doesn't run tests. Needed as a quality gate before public release.

**Subtasks**:

- [ ] Add `test` job to `release.yml`
- [ ] Run `npm run test:run` (frontend)
- [ ] Run `cargo test` (backend)
- [ ] Fail build if tests fail

---

#### 🔴 Video Output Troubleshooting Guide `chore`

Create troubleshooting guide for video output setup.

**Context**: Users will struggle with Syphon/NDI/Spout setup. Write after Spout is done so the Windows section is complete.

**Subtasks**:

- [ ] Create `docs/VIDEO_OUTPUT_TROUBLESHOOTING.md`
- [ ] How to verify output is working (test patterns, receiver apps)
- [ ] Common issues: permissions, firewall, SDK installation
- [ ] Platform-specific notes
- [ ] Screenshots of receiver apps

---

### Core UX

#### 🟡 Full Size Slot Editor Overlay `feature`

Add a full-size slot editor overlay, allowing users to focus on editing one slot at a time.

**Context**: Slot preview is currently limited to a small area within the UI. Focusing on one slot at a time is a core UX improvement for visual work.

**Subtasks**:

- [ ] Slot preview click handler to open full-size editor
- [ ] Full-size editor UI: slot preview takes as much space as possible, slot parameters in a sidebar
- [ ] Make implementation as comprehensive as possible before starting the work

---

#### 🟡 Sketch Presets `feature`

Save/load parameter configurations per sketch.

**Context**: VJs need to recall good parameter combinations quickly. Per-sketch presets are a workflow essential for live performance.

**Enhancement**: Combine with sketch browser — show preset thumbnails, allow preset preview before loading.

**Subtasks**:

- [ ] "Save Preset" button in slot controls
- [ ] Preset dropdown to load saved configurations
- [ ] Persist to JSON files (`presets/{sketchId}/{presetName}.json`)
- [ ] Default preset per sketch type
- [ ] Preset management UI (rename, delete)
- [ ] Preset thumbnails in browser
- [ ] Preset preview before loading

---

#### 🟡 App Launch Sequence & Preloader `polish`

Improve the cold-start experience with a polished launch animation and soft preloader.

**Context**: App currently opens abruptly with no transition.

**Subtasks**:

- [ ] Design a minimal splash/preloader overlay (logo mark + subtle progress indicator)
- [ ] Animate the preloader out once the control window is ready (fade/slide)
- [ ] Add entrance animations for key UI regions on first paint
- [ ] Ensure the output window opens without a visible flash or blank frame
- [ ] Keep total perceived launch time the same or shorter
- [ ] Respect `prefers-reduced-motion`

---

### Control & Mapping

#### 🟡 MIDI Panel — Device Schematic & Clock UI `feature` `design`

Overhaul the Mappings section of the MIDI Panel to be visually useful and scalable.

**Context**: Flat list of `CC X @ Ch Y → parameter_id` rows becomes unwieldy fast. **Secondary to the Inputs/Outputs Rework** — the design pass for that item should inform how the schematic modal integrates into the new unified model. Pick this up after the Inputs/Outputs data model is settled.

**Part 1 — Device Schematic Modal**

Replace the list with a compact summary line (e.g. "8 mappings active") and a **"View Device"** button that opens a modal showing a top-down schematic of the connected controller:

- Knobs, faders, pads, buttons rendered in physical layout
- Each control highlighted green/grey for whether it has a mapping
- Clicking a control opens an inline popover to assign/clear mapping
- Support for multiple connected devices

*Approach*:
1. Define a `DeviceLayout` data format (JSON: control type, position, CC number, label)
2. Build a generic `<DeviceSchematic>` renderer consuming that format
3. Ship definitions for initially-supported models (Akai APC mini, Novation Launch Control, generic 8-knob template)
4. Unknown devices fall back to an auto-generated grid from emitted CC numbers

*Creative option*: Allow community-contributed layout files (`~/.slew/device-layouts/`) so users can add controllers without a code change.

**Part 2 — MIDI Clock UI**

A dedicated sub-section for MIDI Clock signals:

- **Clock source indicator**: which device is sending clock (or "Internal")
- **Live BPM display**: large numeric readout from inter-pulse timing, tap-tempo fallback
- **Sync status badge**: Locked / Drifting / No Signal, colour coded
- **Phase offset control**: nudge slider to align beat grid to external clock
- Future: allow Slew to *send* MIDI Clock (master mode)

**Acceptance criteria:**
- [ ] Mappings list replaced by schematic modal trigger
- [ ] Modal renders correct physical layout for at least 2 real device models
- [ ] Unknown devices render auto-generated grid layout
- [ ] Mapping assign/clear works inside the modal (no regression on learn flow)
- [ ] MIDI Clock strip shows BPM and sync status when a clock source is present
- [ ] All existing `MidiPanel` tests updated / extended

---

#### 🟡 Additional Controller Support `feature`

Support more hardware controllers.

**Context**: Different VJs use different gear. Expanding controller support broadens the user base. Pairs with the Device Schematic work above.

**Subtasks**:

- [ ] Launchpad support
- [ ] APC Mini support
- [ ] Generic MIDI template system
- [ ] MIDI mapping import/export

---

#### 🟡 DMX Lighting Control `feature`

OSC → DMX integration for lighting.

**Context**: Some VJs control lighting alongside visuals. Parameter → DMX output would enable synchronized light shows.

**Subtasks**:

- [ ] Research DMX interfaces/protocols
- [ ] OSC → DMX plugin design
- [ ] Fixture mapping system

---

### Visuals & Effects

#### 🟡 Post-Processing Effects Panel `feature`

A dedicated effects panel operating on the composited output, with an ordered stack of effects that can be added, removed, and reordered.

**Context**: Per-slot effects via the slot system are too limiting — global effects (grain, bloom, etc.) shouldn't consume a slot, and chaining order matters. A first-class Effects Panel is the right model.

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

#### 🟡 Domain Warping, Mirroring & Display Cutting `feature` `design`

Transform and slice the visual output — domain warping, mirror symmetry, and cutting the canvas across one or multiple displays.

**Context**: VJs want to take their generated output and twist it — fold it into kaleidoscopic mirrors, warp the UV space so patterns flow into themselves, or carve the canvas up and route different regions to different outputs or display zones. Closely related to the Post-Processing Effects Panel (domain warp and mirror could live there as effects) and the display-cutting aspect depends on Multi-Display Support.

**Capabilities to cover**:
- **Domain warping**: offset UV lookup by a secondary noise or pattern, causing visuals to warp through themselves (fbm-style, rotation-based, etc.)
- **Mirror / symmetry modes**: horizontal, vertical, 4-way, radial/kaleidoscope (N segments), point symmetry
- **Canvas cutting**: define regions of the composited output and route them independently — e.g. top-left quadrant to output A, bottom-right to output B, or stitch across two displays
- **Tile / repeat**: repeat the output across a grid with optional alternating-mirror per cell

**Design questions to resolve**:
- Mirror and domain warp as effects in the Effects Panel stack vs dedicated "Transform" layer?
- Display cutting UI — drag-to-draw regions on a canvas thumbnail, or numeric grid config?
- How does cutting interact with Multi-Display Support? (likely a dependency)

**Sizing**: Medium–Large. Mirror/warp as effects = smaller slice. Full display cutting = needs Multi-Display Support first.

**Subtasks**:

- [ ] Design pass: where these transforms sit in the pipeline and UX model
- [ ] Implement mirror / symmetry effect modes
- [ ] Implement domain warp effect (at least fbm and rotation-based)
- [ ] Canvas cutting / output region UI
- [ ] Wire cut regions to multi-display output routing

---

#### 🟡 External Texture Input `feature`

Support external images/videos as input textures for sketches.

**Context**: Current sketches are purely generative. Adding texture inputs unlocks a whole new category — mix camera feeds, video files, image sequences with shaders. Huge VJ use case.

**Subtasks**:

- [ ] Add `texture` parameter type to `ParameterTemplate`
- [ ] File picker UI for images/videos
- [ ] WebRTC camera capture support
- [ ] Texture management in renderer (cache, resize, format conversion)
- [ ] Create example sketch using external texture (e.g., "Image Feedback", "Video Distortion")

**Reference**: Look at how Hydra.video handles texture sources.

---

#### 🟡 Multi-Display Support `feature`

Multiple renderer windows for different outputs.

**Context**: Some VJ setups use multiple projectors or preview monitors. Also a prerequisite for the display-cutting feature in Domain Warping / Mirroring.

**Subtasks**:

- [ ] Spawn additional renderer windows
- [ ] Per-window slot assignment
- [ ] Independent resolution/output settings

---

#### 🟡 Projection Mapping `feature`

Warp/mask output for projection on non-flat surfaces.

**Context**: Architectural projection, 3D object mapping, irregular screens. Needed by VJs doing installation work.

**Subtasks**:

- [ ] Corner-pin warping
- [ ] Mesh warping with control points
- [ ] Per-projector output (multi-display integration)
- [ ] Masking tools (polygon, bezier)
- [ ] Camera calibration for auto-alignment
- [ ] Save/load mapping configurations

---

### Project & Workflow

#### 🟡 Presets & Projects (Full Session Management) `feature`

Save/load complete project state.

**Context**: For live performance, users need to save entire setups including all slots, parameters, and mappings. Sketch Presets (see Core UX) is a natural prerequisite.

**Subtasks**:

- [ ] Save/load complete project state (slots, parameters, mappings)
- [ ] Quick snapshot for A/B comparison
- [ ] Export/import for sharing
- [ ] Auto-save / recovery

---

#### 🟡 Recording `feature`

GPU-based capture or frame export.

**Context**: Users may want to record performances for later use or sharing.

**Subtasks**:

- [ ] Define recording format (MP4, image sequence)
- [ ] Implement GPU-based capture
- [ ] Recording controls (start/stop/pause)
- [ ] Export settings

---

### Distribution & Platform

#### 🟡 Marketing Site — Monorepo Setup `chore`

Scaffold a `site/` workspace inside the repo for the Slew marketing/landing page.

**Approach**:
- Configure npm/pnpm workspaces so `site/` is a first-class package
- Create `site/package.json` with its own framework choice (Astro recommended)
- Extract shared design tokens into `packages/tokens` or inline in `site/` initially
- Set up a deploy target (Vercel/Netlify) triggered only on changes to `site/`
- Document workspace structure in `docs/ARCHITECTURE.md`

**Subtasks**:

- [ ] Decide: pnpm workspaces or npm workspaces
- [ ] Scaffold `site/` with Astro (or chosen framework)
- [ ] Wire up shared tokens/styles from app
- [ ] Configure CI deploy (Vercel/Netlify) scoped to `site/`
- [ ] Update `ARCHITECTURE.md` with monorepo structure

---

#### 🟡 Marketing Site — Landing Page `feature` `design`

Build the public-facing landing page to present and sell Slew ahead of its public release.

**Sections to include**:
- Hero — tagline, short description, download CTA
- Feature highlights — dual-window output, MIDI/OSC control, live shader sketches
- Screenshot / demo reel — video or animated screenshots of the app in action
- Sketch gallery — showcase of what's possible
- Changelog / release history (pulled from `CHANGELOG.md`)
- Download / pricing section (if applicable)
- Footer with links (GitHub, docs, contact)

**Subtasks**:

- [ ] Write copy: tagline, feature descriptions, about section
- [ ] Capture screenshots and/or a demo video
- [ ] Design hero section
- [ ] Build feature highlights grid
- [ ] Integrate changelog feed from `CHANGELOG.md`
- [ ] SEO metadata, Open Graph tags
- [ ] Analytics (privacy-respecting, e.g. Plausible)
- [ ] Mobile-responsive layout

---

#### 🟡 Spout Video Output (Windows) `feature`

Implement Spout backend for Windows video output.

**Context**: Windows VJs need Spout to route output to Resolume, MadMapper, etc. The `spout.rs` module and `SpoutBackend` in `video_out.rs` are already wired up correctly — stub compiles and Windows exe ships. Blocked on the Rust/Spout2 crate ecosystem.

**Blocker (May 2026)**: Both available crates fail in CI:
- `spout-rs` v0.1.3 — link-only wrapper; requires `SPOUT2_LIB_DIR` pointing at a pre-built SDK.
- `rust-spout2` v0.1.3 — builds Spout2 from source via cmake (works!), but `autocxx-bindgen` 0.65.1 panics on `_Float16` complex types emitted by LLVM 20 headers on `windows-2025` runners.

**To unblock**: uncomment `rust-spout2` in `Cargo.toml` and replace the no-ops in `spout.rs` once `autocxx-bindgen` is updated or a new Spout crate appears.

**Subtasks**:

- [x] Research Rust Spout bindings
- [x] Implement SpoutBackend (mirror SyphonBackend pattern)
- [x] Update documentation
- [ ] Unblock: wait for `autocxx-bindgen` fix or new Spout crate, then replace stub
- [ ] Test with Spout receivers on Windows

---

#### 🟡 Windows Packaging Testing `chore`

Complete Windows distribution pipeline testing.

**Context**: Dependent on Spout being complete first.

**Subtasks**:

- [ ] Test NSIS/MSI installers on Windows 10/11
- [ ] Verify all features work on Windows
- [ ] Document Windows-specific setup

---

#### 🟡 Linux Packaging Testing `issue` `chore`

Verify Linux builds work correctly.

**Context**: CI builds Linux artifacts (.deb, .rpm, .AppImage) but no verification they work.

**Subtasks**:

- [ ] Test .deb installer on Ubuntu/Debian
- [ ] Test .rpm installer on Fedora/RHEL
- [ ] Test .AppImage on various distros
- [ ] Document Linux-specific setup (dependencies, permissions)
- [ ] Community testing call

---

### Quality & Documentation

#### 🟡 API Documentation for Sketch Developers `chore`

Create developer guide for building custom sketches.

**Context**: Enables community contributions and future-proofs onboarding. `SketchDescriptor` and `ParameterTemplate` types exist but lack usage examples.

**Subtasks**:

- [ ] Create `docs/CREATING_SKETCHES.md`
- [ ] Step-by-step tutorial (start from BlueCube)
- [ ] Explain `SketchDescriptor`, `ParameterTemplate`, `SketchProps`
- [ ] Document parameter types (number, color, enum)
- [ ] Example: create a custom sketch from scratch
- [ ] Link to TSL shader resources

---

#### 🟡 Integration Tests `chore`

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

#### 🟡 Crash Reporting & Analytics `feature`

Add optional telemetry for debugging and product insights.

**Context**: No visibility into production issues or feature usage.

**Subtasks**:

- [ ] Add optional crash reporting (Sentry, user consent required)
- [ ] Privacy-respecting usage analytics (opt-in)
- [ ] Track: sketch popularity, input device usage, feature adoption
- [ ] Use data to prioritize future development

---

#### 🟡 Memory Leak Testing `chore`

Add long-running stability testing.

**Context**: App runs for hours during live performances — leaks will crash it.

**Subtasks**:

- [ ] Create long-running stability test (4+ hours)
- [ ] Monitor memory usage over time
- [ ] Profile with Chrome DevTools (heap snapshots)
- [ ] Document memory profiling workflow

---

#### 🟡 Architecture Diagrams `chore`

Add visual diagrams to architecture documentation.

**Context**: `ARCHITECTURE.md` is text-only. Complex flows are hard to visualize.

**Subtasks**:

- [ ] Add Mermaid diagrams for:
  - Parameter flow (UI → Backend → Renderer)
  - Window communication (Events, IPC)
  - Video output pipeline (WebGPU → Syphon/NDI)
  - Slot system (lifecycle, crossfade)

---

## Future / Inspiration

No timeline. Revisit after v1 ships.

---

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
- [ ] Save favourite variations as presets
- [ ] Interpolate between variations
- [ ] Integration with modulation engine (animate between variations)

---

## Completed Items

Completed items are tracked in `CHANGELOG.md`. Task documents are archived in `docs/finished/`.

---

## Notes

- When picking up an item, create a task doc in `docs/working/` with a detailed plan
- When done, move the task document to `docs/finished/`, remove the task from the backlog, and update `CHANGELOG.md`
- Update this file as items are started, completed, or re-prioritized
- Items may be split into smaller chunks as needed
