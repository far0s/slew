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

### 🔴 Button Controls (Mute/Solo via Midimix) `feature`

Leverage existing Midimix integration for quick slot control.

**Context**: Midimix has Mute, Solo, and Rec Arm buttons per column that aren't fully utilized yet. Adding quick toggle controls would improve live performance workflow.

**Subtasks**:

- [ ] Mute buttons → toggle slot visibility (alpha 0 ↔ 1)
- [ ] Solo button → solo a single slot (set all others to 0)
- [ ] LED feedback for mute/solo state
- [ ] Bank buttons for parameter page switching (params 1-3 → 4-6)
- [ ] Audio reactivity master → per-slot `audio_reactivity` parameter (0–1) as multiplier for all audio mappings, controlled via a Midimix knob or master column
- [ ] Look up Midimix master column button note numbers (SEND ALL, BANK LEFT/RIGHT, SOLO)

---

### 🔴 Video Output Optimization `feature`

Improve 1080p@60fps performance for professional use.

**Context**: Current implementation uses base64-encoded frames which adds overhead. Zero-copy approaches would significantly improve performance.

**Subtasks**:

- [ ] Zero-copy IOSurface sharing for Syphon (macOS)
- [ ] Binary IPC instead of base64 encoding
- [ ] PBOs for async GPU readback
- [ ] Spout implementation for Windows

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

### 🟡 More Shader Sketches `feature`

Expand the visual library with new procedural sketches.

**Context**: Currently have basic geometry sketches and two shader sketches (TslText3D, TslNoiseBlob). More variety would improve creative options.

**Subtasks**:

- [ ] **Feedback/Tunnel**: Infinite zoom with color cycling
- [ ] **Particles**: GPU-driven particle system with audio reactivity
- [ ] **Kaleidoscope**: Mirror/reflection patterns
- [ ] **Waveform**: Audio-reactive visualization
- [ ] **Plasma**: Classic demoscene effect with modern twist

---

### 🟡 Presets & Projects (Full Session Management) `feature`

Save/load complete project state.

**Context**: For live performance, users need to save entire setups including all slots, parameters, and mappings.

**Subtasks**:

- [ ] Save/load complete project state (slots, parameters, mappings)
- [ ] Quick snapshot for A/B comparison
- [ ] Export/import for sharing
- [ ] Auto-save / recovery

---

### 🟡 Performance Testing `chore`

Validate performance characteristics with full workload.

**Context**: Need to confirm the system handles demanding scenarios smoothly.

**Subtasks**:

- [ ] Test with 8 active sketches at 1080p@60
- [ ] Profile CPU/GPU usage with all inputs active
- [ ] Verify UI scrolls/scales appropriately for 8 slots on smaller screens

---

## Low Priority / Future

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

Items that have been finished are tracked in `CHANGELOG.md` rather than here.

---

## Notes

- When picking up an item, create a task doc in `docs/working/` with a detailed plan
- Update this file as items are started, completed, or re-prioritized
- Items may be split into smaller chunks as needed
