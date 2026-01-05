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

**Context**: App name is now "Slew" with tagline "VJ software for creative coders". Currently using 🎛️ emoji as a placeholder symbol. Need a proper icon before public release.

**Subtasks**:

- [ ] Design app icon concept
- [ ] Export all required sizes (32x32, 128x128, 128x128@2x, .icns, .ico)
- [ ] Replace placeholder icons in `src-tauri/icons/`
- [ ] Test icon appearance on all platforms

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

### 🟡 UI Appearance options `feature`

Add more UI appearance options.

**Context**: Users may prefer different color schemes or themes.

**Subtasks**:

- [ ] Sidebar: position left/right
- [ ] Settings: Improve light/dark themes, add "amber" mode (both themes can have orange/red accents to be easier on the eyes)
- [ ] Settings: Add custom CSS stylesheets for advanced users
- [ ] Settings: Allow users zoom +/-
- [ ] Settings: fix Actions buttons not working
- [ ] Windows: allow fullscreen toggle (native shortcut)
- [ ] [more TBD...]

---

### 🟡 Better Color Picker `feature`

Replace the current color picker with a more advanced and functional one.

**Context**: The current color picker has a limited choice of colors. It needs to be more flexible, accessible and playful.

**Subtasks**:

- [ ] Add a color wheel, sliders, and a color picker palette
- [ ] Add support for color formats (HEX, RGB, HSL, HSV)
- [ ] Add color history / swatches
- [ ] [more TBD...]

---

## Low Priority / Future

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

### 🟢 IOSurface Zero-Copy (macOS) `feature`

Bypass CPU entirely for ultimate video output performance.

**Context**: Current WebGPU async readback achieves stable 60fps. IOSurface would eliminate all CPU copies for sub-8ms latency, but requires significant effort and possibly private APIs.

**Reference**: See `docs/finished/IOSURFACE_FEASIBILITY.md` for research.

**Subtasks**:

- [ ] Prototype CALayer IOSurface capture (test feasibility)
- [ ] Investigate WebGPU Metal texture access
- [ ] Evaluate private API risks vs. performance gains

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

**Context**: macOS packaging is done (unsigned); Windows needs testing.

**Subtasks**:

- [ ] Test NSIS/MSI installers
- [ ] Spout implementation (for Windows video output)

---

### 🟢 Code Signing `chore`

Sign builds for smoother user experience (removes Gatekeeper/SmartScreen warnings).

**Context**: Currently releasing unsigned builds with documented workarounds. Signing is optional but improves UX for non-technical users.

**Subtasks**:

- [ ] macOS: Apple Developer Program ($99/year), code signing + notarization
- [ ] Windows: EV Code Signing certificate ($200-500/year)
- [ ] Update GitHub Actions workflow with signing steps

---

## Completed Items

Completed items are tracked in `CHANGELOG.md`. Task documents are archived in `docs/finished/`.

---

## Notes

- When picking up an item, create a task doc in `docs/working/` with a detailed plan
- When done, move the task document to `docs/finished/`, remove the task from the backlog, and update `CHANGELOG.md`
- Update this file as items are started, completed, or re-prioritized
- Items may be split into smaller chunks as needed
