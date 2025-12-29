# Backlog

Prioritized list of potential work items for sebcat-vj.

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

### 🔴 Video Output Optimization `feature`

Improve 1080p@60fps performance for professional use.

**Context**: Current implementation uses base64-encoded frames which adds overhead. Zero-copy approaches would significantly improve performance.

**Subtasks**:

- [ ] Zero-copy IOSurface sharing for Syphon (macOS)
- [ ] Binary IPC instead of base64 encoding
- [ ] PBOs for async GPU readback
- [ ] Spout implementation for Windows

---

### 🔴 Prepare repo for first public release `chore`

Have the repo ready for first public release (that includes download links and documentation).

**Context**: Some collaborators (some technical and some non-technical) have asked to play with the app.

**Subtasks**: (non-exhaustive list)

- [ ] Figure out a proper name + icon and logo -> update throughout the app
- [ ] Set up automated release process (GitHub Actions) -> every time a new tag is pushed to the main branch, create a release with the tag name as the version number and upload the built binaries
- [ ] Update README.md with download links and documentation

---

## Medium Priority

### 🟡 Sketch Presets `feature`

Save/load parameter configurations per sketch.

**Context**: Users often find good parameter combinations they want to recall. Per-sketch presets would enable quick switching between looks.

**Subtasks**:

- [ ] "Save Preset" button in slot controls
- [ ] Preset dropdown to load saved configurations
- [ ] Persist to JSON files (`presets/{sketchId}/{presetName}.json`)
- [ ] Default preset per sketch type
- [ ] Preset management UI (rename, delete)

---

## Low Priority / Future

### 🟢 Expand Test Coverage `chore`

Add more tests for remaining untested areas.

**Context**: Codebase cleanup (Phase 4) established testing infrastructure with 52 Rust tests and 33 frontend tests. Core utilities are tested but some areas remain.

**Current coverage**:

- `modulation.rs` - 18 tests for LFO waveforms, phase, depth, offset, BPM sync
- `midi/message_handler.rs` - 26 tests for MIDI parsing, CC normalization, range mapping
- `video_out.rs` - 6 tests for pixel formats, frame validation, base64 decoding
- `slotTypes.ts` - 33 tests for parameter ID utilities

**Subtasks**:

- [ ] Add tests for beat detection (`audio/buffer.rs`) - extract pure functions first
- [ ] Add tests for mapping persistence (JSON load/save)
- [ ] Add tests for `useParameterStore` hook
- [ ] Add tests for `useSlots` hook
- [ ] Add component tests for key UI components

---

### 🟢 More Shader Sketches `feature`

Expand the visual library with new procedural sketches.

**Context**: Currently have basic geometry sketches and two shader sketches (TslText3D, TslNoiseBlob). More variety would improve creative options.

**Subtasks**:

- [ ] **Feedback/Tunnel**: Infinite zoom with color cycling
- [ ] **Particles**: GPU-driven particle system with audio reactivity
- [ ] **Kaleidoscope**: Mirror/reflection patterns
- [ ] **Waveform**: Audio-reactive visualization
- [ ] **Plasma**: Classic demoscene effect with modern twist

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

Add bloom, feedback, color grading effects.

**Context**: Post-processing can add polish and visual interest to any sketch.

**Subtasks**:

- [ ] Bloom effect
- [ ] Feedback/delay buffer
- [ ] Color grading (LUT support)
- [ ] Effect chain ordering

---

### 🟢 WebGPU Upgrade `chore`

Switch to WebGPU renderer when r3f support matures.

**Context**: WebGPU offers better performance and modern GPU features. Currently blocked by r3f ecosystem readiness.

**Subtasks**:

- [ ] Monitor r3f WebGPU support progress
- [ ] Test WebGPU renderer when available
- [ ] Migrate shaders to WGSL if needed
- [ ] Performance comparison

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

### 🟢 Windows Packaging `chore`

Complete Windows distribution pipeline.

**Context**: macOS packaging is mostly done; Windows needs testing.

**Subtasks**:

- [ ] Test NSIS/MSI installers
- [ ] Windows code signing setup
- [ ] Spout implementation (for Windows video output)

---

## Completed Items

Completed items are tracked in `CHANGELOG.md`. Task documents are archived in `docs/finished/`.

---

## Notes

- When picking up an item, create a task doc in `docs/working/` with a detailed plan
- Update this file as items are started, completed, or re-prioritized
- Items may be split into smaller chunks as needed
