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

### 🔴 OscPanel UI — Beat Input, Output & UX Improvements `feature`

Update the OscPanel to surface the new beat/BPM OSC features and make the overall panel clearer for users who are new to OSC.

**Context**: The current panel is functional but assumes OSC knowledge. With beat input and output added, the panel needs new sections and better orientation copy. Goal: a user who has never used OSC should understand within 30 seconds what port to send to and what addresses to use.

**Sections to add / change**:

1. **Server section** — add a small info line: *"Send OSC UDP to `127.0.0.1:<port>`"* when running. Existing start/stop + port controls stay.

2. **Beat Input section** (new, collapsed by default):
   - Read-only reference card showing the reserved addresses:
     - `/slew/beat` — trigger a beat pulse
     - `/slew/bpm <float>` — set BPM (20–300)
   - Live beat indicator dot (pulses on each received `/slew/beat`) — reuses existing `BeatIndicator`-style component from AudioPanel
   - Current BPM readout (sourced from `useOscBeat()`)
   - Small copy: *"Send from Ableton (Max4Live), TouchOSC, or any OSC app."*

3. **Output section** (new, collapsed by default):
   - Enable toggle
   - Host input (default `127.0.0.1`)
   - Port input (default `9001`)
   - "Forward beat" checkbox → sends `/slew/beat` on each detected beat
   - "Forward BPM" checkbox → sends `/slew/bpm` on BPM change
   - Activity dot (pulses on each sent message)
   - Small copy: *"Forward beat to other apps or devices on the network."*

4. **Mappings section** — add a subtle header note: *"Map any OSC address to a parameter. Reserved `/slew/*` addresses are handled automatically."*

5. **Recent Messages section** — no structural change, but add a note when a `/slew/*` message is received: tag it visually (e.g. dim purple highlight) so users can confirm their beat sender is working.

**Subtasks**:
- [ ] Add info line to Server section
- [ ] `BeatInputSection` component with reserved address reference + live beat indicator
- [ ] `OutputSection` component with config form + activity dot (driven by `useOscOutput()`)
- [ ] Highlight `/slew/*` messages in Recent Messages list
- [ ] Mappings section header note about reserved addresses
- [ ] CSS additions to `OscPanel.module.css`

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

### 🔴 Keyboard Shortcuts Reference Panel `feature`

Add in-app keyboard shortcuts reference.

**Context**: Shortcuts exist (Cmd+Shift+F, Cmd+Shift+C/R) but are undiscoverable. No in-app help for keyboard controls.

**Subtasks**:

- [ ] Create shortcuts reference modal/panel
- [ ] Add "?" or "Keyboard Shortcuts" button in Settings
- [ ] Document all existing shortcuts
- [ ] Consider making shortcuts customizable (future enhancement)

---

### 🔴 Full size Slot editor overlay `feature`

Add a full-size slot editor overlay, allowing users to focus on editing one slot at a time.

**Context**: The slot preview is currently limited to a small area within the UI. If the visual output is key, it would be useful to be able to focus on one slot at a time.

**Subtasks**:

- [ ] Slot preview click handler to open full-size editor
- [ ] Full-size editor UI design and implementation: slot preview takes as much space as possible, slot parameters are put into a sidebar.
- [ ] ...Make implementation as comprehensive as possible before starting the work.

---

## Medium Priority

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

### 🟡 Audio Waveform/Spectrum Visualizer `feature`

Add visual feedback for audio input levels and frequency content.

**Context**: Audio input exists but no visual feedback. Helps troubleshoot audio mappings and provides performance feedback.

**Subtasks**:

- [ ] Add compact spectrum analyzer to Audio Panel
- [ ] Show live FFT bins as bars
- [ ] Beat detection indicator (flash on beat)
- [ ] Optional waveform view (time domain)

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

### 🟡 Undo/Redo for Parameter Changes `feature`

Add undo/redo capability for parameter changes.

**Context**: Creative workflows benefit from experimentation without fear. Currently no way to revert parameter changes during setup.

**Subtasks**:

- [ ] Implement command pattern for reversible actions
- [ ] History stack (limit to N entries, e.g., 50)
- [ ] Undo/redo buttons in UI
- [ ] Keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
- [ ] Scope: limit to "setup" actions (not realtime parameter changes during performance)

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

### 🟡 Tap Tempo for BPM `feature`

Add tap tempo input for modulation BPM sync.

**Context**: Modulation engine supports BPM sync but manual input is cumbersome.

**Subtasks**:

- [ ] "Tap Tempo" button in Modulation Panel
- [ ] Calculate BPM from tap intervals (use weighted average of last 4-8 taps)
- [ ] Visual feedback (metronome pulse)
- [ ] Auto-detect if tapping stops (reset after 3 seconds)

---

### 🟡 New Sketch Group: "Effects" `feature`

Create post-processing/effects sketch group.

**Context**: Current sketches are generative. VJs also need post-processing effects. Sketch-based approach is more flexible than global post-processing pipeline (can layer effects in slots).

**Ideas**:

- [ ] Mirror/Symmetry: Reflect parts of output
- [ ] Pixelation: Animated mosaic effect
- [ ] RGB Split: Chromatic aberration with displacement
- [ ] Datamosh: Glitch aesthetic (frame buffer feedback)
- [ ] Trails/Feedback: Feedback delay with decay
- [ ] Edge Detection: Sobel/Canny edge highlighting

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

**Context**: Users will struggle with Syphon/NDI/Spout setup. Need comprehensive guide.

**Subtasks**:

- [ ] Create `docs/VIDEO_OUTPUT_TROUBLESHOOTING.md`
- [ ] How to verify output is working (test patterns, receiver apps)
- [ ] Common issues: permissions, firewall, SDK installation
- [ ] Platform-specific notes
- [ ] Screenshots of receiver apps

---

## Low Priority / Future

---

### 🟢 App Icon `chore`

Design and implement proper app icon for Slew.

**Context**: App name is now "Slew" with tagline "VJ software for creative coders". Currently using 🎛️ emoji as a placeholder symbol. Need a proper icon before public release.

**Subtasks**:

- [ ] Design app icon concept
- [ ] Export all required sizes (32x32, 128x128, 128x128@2x, .icns, .ico)
- [ ] Replace placeholder icons in `src-tauri/icons/`
- [ ] Test icon appearance on all platforms

---

### 🟢 Accessibility Audit `a11y` `chore`

Comprehensive accessibility improvements.

**Context**: Keyboard navigation exists but incomplete. Screen reader support minimal.

**Subtasks**:

- [ ] Test full keyboard-only navigation
- [ ] Verify Radix Slider arrow key support works
- [ ] Add aria-live regions for status updates (device connections, slot state)
- [ ] Run automated contrast checker (WCAG AA)
- [ ] Add high-contrast theme option
- [ ] Ensure all animations respect `prefers-reduced-motion`

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

### 🟢 Auto-Update Mechanism `feature`

Add in-app update notifications.

**Context**: Users must manually check GitHub for updates.

**Subtasks**:

- [x] Integrate Tauri updater plugin
- [x] Check for updates on startup (background)
- [x] Notification when update available
- [x] One-click download & install
- [x] Release notes display (first line of body shown in banner)

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

### 🟢 Parameter Grouping/Folding `feature`

Add collapsible parameter groups for sketches with many parameters.

**Context**: Aura has 12 parameters - long scrollable list. ParameterTemplate has optional `group` field (unused).

**Subtasks**:

- [ ] Respect `group` field in SlotParameterControls
- [ ] Render collapsible sections per group
- [ ] Persist collapsed state per sketch
- [ ] Design: group header with chevron

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

### 🟢 Rust Unwrap/Expect Audit `issue` `chore`

Audit and fix unwrap/expect usage in Rust code.

**Context**: 117 unwrap/expect calls - potential production panics.

**Subtasks**:

- [ ] Audit each usage
- [ ] Keep unwraps in initialization code (acceptable)
- [ ] Replace with proper error handling in hot paths
- [ ] Add comments explaining why unwrap is safe (when kept)

---

### 🟢 CI Test Job `chore`

Add automated testing to CI pipeline.

**Context**: GitHub Actions builds but doesn't run tests.

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

**Context**: For live performance, users need to save entire setups including all slots, parameters, and mappings.

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

### 🟢 Post-Processing Pipeline `feature`

Add grain, bloom, feedback, color grading effects, etc.

**Context**: Post-processing can add polish and visual interest to any sketch. Right now the Aura sketch does have grain (and tone mapping modes, but that needs to stay separate I believe) baked in, but it would be useful to have more control over these effects at a more global level.

**Subtasks**:

- [ ] Add Post-processing pipeline
- [ ] Sidebar: add post-processing controls tab
- [ ] Allow to add independent post-processing effects
- [ ] Allow post-processing effects to be chained, re-ordered
- [ ] Effects: Grain, Chromatic Aberration, Bloom, CRT Scanlines, Dither, Halftone, Pixellation, Vignette, LED, Bulge Distortion, Swirl distortion, Wave Distortion... These effects can be ported over from Phobon's Fragments Boilerplate https://github.com/phobon/fragments-boilerplate

---

### 🟢 IOSurface Zero-Copy (macOS) `feature`

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

**Context**: macOS packaging is done (unsigned); Windows needs verification.

**Subtasks**:

- [ ] Test NSIS/MSI installers on Windows 10/11
- [ ] Verify all features work on Windows
- [ ] Document Windows-specific setup

---

### 🟢 Code Signing `chore`

Sign builds for smoother user experience (removes Gatekeeper/SmartScreen warnings).

**Context**: Currently releasing unsigned builds with documented workarounds. Signing is optional but improves UX for non-technical users.

**Subtasks**:

- [ ] macOS: Apple Developer Program ($99/year), code signing + notarization
- [ ] Windows: EV Code Signing certificate ($200-500/year)
- [ ] Update GitHub Actions workflow with signing steps

---

## Future Consideration / Inspiration

These are more speculative ideas that could differentiate Slew from other VJ software. Not prioritized but worth documenting for future exploration.

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
