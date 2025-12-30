# Changelog

Status overview and key decisions for sebcat-vj.

---

## Feature Status

| System             | Status | Notes                                                            |
| ------------------ | ------ | ---------------------------------------------------------------- |
| Tauri + React app  | ✅     | Dual-window (Renderer + Controls)                                |
| Parameter Server   | ✅     | Rust backend with ~60Hz transitions                              |
| Sketch/Slot System | ✅     | Slot-based (1-8), multi-instance, auto-generated controls        |
| Sketch Browser UI  | ✅     | Inline browser in empty slots, no extra click needed             |
| Crossfade          | ✅     | Smooth blending with correct scene pairing                       |
| MIDI Input         | ✅     | Hot-plug detection, auto-reconnect, Learn workflow               |
| OSC Input          | ✅     | UDP server (port 9000), default mappings                         |
| Audio Input        | ✅     | Hot-plug detection, auto-reconnect, FFT, beat detection          |
| Audio → Parameter  | ✅     | Full mapping system with modes (continuous/trigger/add)          |
| HID Input          | ✅     | DOIO Megalodon macropad with encoders, auto-connect              |
| Modulation Engine  | ✅     | Backend LFOs, modulation matrix, audio→LFO, slider indicators    |
| Video Output       | ✅     | Syphon + NDI working, WebGPU async readback implemented          |
| Shader Sketches    | ✅     | TslText3D (3D text), TslNoiseBlob (TSL noise blob)               |
| WebGPU Renderer    | ✅     | Full WebGPU support, all sketches compatible                     |
| Window Manager     | ✅     | Native menu, heartbeat monitoring, emergency recovery overlay    |
| Packaging          | ✅     | macOS/Windows/Linux builds ready; unsigned for initial release   |
| Automated Releases | ✅     | GitHub Actions CI/CD builds all platforms, creates draft release |

---

## Recent Changes

### Automated GitHub Releases

- **GitHub Actions workflow**: `.github/workflows/release.yml` triggers on version tags (`v*`)
- **Multi-platform builds**: macOS (aarch64 + x64), Windows (exe + msi), Linux (AppImage, deb, rpm)
- **macOS code signing fix**: Removes invalid Tauri signature, re-signs ad-hoc, recreates DMG
- **Draft release creation**: All 7 artifacts uploaded to GitHub Release for review before publishing
- **Syphon in CI**: `install-syphon.sh` builds universal framework on macOS runners
- **Documentation**: See `docs/finished/AUTOMATED_RELEASES.md` for full details

### Window Sizing Fixes

- **Renderer window in dev mode**: Fixed small window size when opening on secondary monitor
  - Now explicitly sets size to 1920×1080 (scaled for monitor DPI) before positioning
- **Preview canvas sizing**: Fixed canvas not filling container width until resize event
  - Added CSS rule to force r3f Canvas container to use absolute positioning
  - PreviewContainer triggers resize event after 1 second delay to ensure proper sizing

### Global UI Cleanup

- **Scroll behavior**: Added `overscroll-behavior: contain` to disable Apple's springy/bouncy scroll effect
- **Settings tab first**: Moved Settings to first position in sidebar tabs, now shown by default
- **Footer moved to Settings**: Restart buttons and keyboard shortcuts moved into unified "Actions" section
- **Theme toggle**: Added dark/light theme toggle with `useTheme` hook and CSS custom properties
- **Light theme**: Created light theme color palette with CSS variables applied throughout
- **MIDI panel consistency**: Moved "Clear All Mappings" to section header (matches Audio pattern)
- **Video panel simplified**: Removed unnecessary Collapsible wrapper, content shows directly
- **Even tab distribution**: Tabs use CSS grid for even spread (no lonely Video tab on second row)
- **Condensed parameters**: Reduced vertical spacing in parameter sliders with subtle separators
- **Info popovers**: Parameter descriptions shown on hover (not click), stay when focused/hovering
- **MIDI Learn fix**: Fixed layout shift when hovering mapped controls
- **Custom scrollbars**: Added consistent scrollbar styling across the app
- **Light mode contrast**: Converted all sidebar panels from hardcoded white rgba to theme-aware CSS variables; all panels now readable in light mode
- **Tab layout refinement**: Tabs use natural width with centered layout; active tab uses filled background
- **Border visibility**: Increased light-mode border contrast and slot column border thickness
- **Documentation**: See `docs/finished/GLOBAL_UI_CLEANUP.md` for full details

### Grouped Sketch Browser

- **Sketch groups**: Sketches are now organized into collapsible groups in the browser
  - File structure mirrors UI organization (`src/sketches/{GroupName}/{SketchName}/`)
  - Groups defined via `SketchGroup` type with `id`, `label`, `sketches`, and optional `orderHint`
  - Groups sorted by `orderHint` (lower = first)
- **Inline browser**: Empty slots show grouped sketch picker with expand/collapse
- **Sketch dropdown**: Filled slots show grouped selector with section headers
- **Future-ready**: Supports multiple presets per sketch (export multiple descriptors from one folder)

### Video Output Optimization Complete

- **WebGPU async readback**: `readRenderTargetPixelsAsync()` provides truly non-blocking GPU→CPU transfer
- **Binary IPC protocol**: Raw pixel data via custom URI scheme (`videoframe://`), eliminates ~30ms base64 overhead
- **PBO fallback**: Ping-pong Pixel Buffer Objects for WebGL2 async readback when WebGPU unavailable
- **Result**: Stable 60fps Syphon output at 1080p (previously capped at ~20fps)
- **Documentation**: See `docs/finished/VIDEO_OUTPUT_OPTIMIZATION.md` for full details
- **Cleanup**: Debug flags organized, stats log interval set to production value (300 frames)

### WebGPU Polish & Stats

- **Performance stats**: Replaced `r3f-perf` with `stats-gl` via `@react-three/drei`'s `<StatsGl />`
  - `r3f-perf` crashed on WebGPU (called WebGL-specific `gl.getExtension()`)
  - `stats-gl` is WebGPU-compatible, shows FPS/CPU/GPU metrics
  - Stats panel positioned in bottom-right corner (toggle with "D" key)
  - Removed `r3f-perf` dependency from package.json

- **TslNoiseBlob soft shading**: Fixed lighting to be non-reflective with soft shadows
  - Reverted from `MeshStandardNodeMaterial` (PBR/reflective) to `MeshBasicNodeMaterial`
  - Implemented custom half-lambert wrap lighting for soft diffuse shadows
  - Two-light setup: key light (top-right-front) + fill light (opposite side)
  - Subtle rim highlight with gentle falloff
  - Cleaned up redundant code comments

### Button Controls (Mute/Solo/Beat Indicator)

- **Mute buttons** (top row): Toggle audio reactivity per slot
  - Muted slots ignore audio mappings
  - LED indicates state (ON = audio active, OFF = muted)
  - Configurable fade time via Settings panel
- **Solo buttons** (middle row): Isolate a single slot
  - Sets target slot alpha to 1.0, all others to 0.0
  - Smooth transition with configurable fade time
- **Bank Left/Right LEDs**: Beat indicator
  - Both LEDs pulse together on detected audio beats
  - Provides visual tempo feedback on the controller
- **Settings panel**: New "Settings" tab in DebugPanel
  - Mute Fade slider (0-2 seconds)
  - Solo Fade slider (0-2 seconds)
- **UI improvements**:
  - Mute indicator in scene preview uses SVG icon (SpeakerOffIcon)

### State Persistence & Soft Takeover

- Slot configuration persisted to `slots.json`
- Parameter values persisted to `parameters.json`
- State restored on app startup / window reload
- LED states pushed on Midimix connect
- **Soft takeover (pickup)**: Faders/knobs must "cross" the current parameter value before taking effect
  - Prevents parameter jumps on sketch change, app restart, or MIDI reconnect
  - First CC after reconnect is ignored (handles controller state dump)
  - Master fader uses direction-based logic after pickup

### WebGPU/TSL Migration ✅ Complete

- **WebGPU Canvas Infrastructure** ✅
  - New `WebGPUCanvas.tsx` wrapper with feature detection
  - Always uses `WebGPURenderer` (required for TSL materials)
  - Falls back to WebGL2 backend via `forceWebGL` when native WebGPU unavailable
  - Console logging indicates which backend is active

- **Video Output Async Readback** ✅
  - `VideoOutputCapture.tsx` detects WebGPU vs WebGL renderer
  - WebGPU path uses `readRenderTargetPixelsAsync()` (non-blocking)
  - Separate render targets for proper type safety
  - Expected significant performance improvement for video capture

- **TSL Shader Migration** ✅
  - `TslNoiseBlob` migrated from GLSL `ShaderMaterial` to TSL `MeshBasicNodeMaterial`
  - Uses `mx_noise_float()` for procedural noise with `varying` to avoid double computation
  - TSL `positionNode` for vertex displacement, `colorNode` for fragment shading
  - Custom soft shading with half-lambert lighting (non-reflective, soft shadows)
  - Reduced geometry complexity (64 → 32 subdivisions) for performance
  - All 5 sketches now fully WebGPU compatible

- **Preview Components Updated** ✅
  - `RendererPreview.tsx` now uses `WebGPUCanvas`
  - `SlotColumn.tsx` preview now uses `WebGPUCanvas`
  - TSL materials render correctly in all preview contexts
  - See `docs/finished/WEBGPU_MIGRATION.md` for details

### Codebase Cleanup & Refactoring ✅ Complete

Major cleanup effort completed across 5 phases. See `docs/finished/CLEANUP.md` for full details.

**Phase 1: Terminology & JSDoc**

- Removed JSDoc from TypeScript (rely on types)
- Migrated scene→slot/sketch terminology throughout
- Removed legacy `LEGACY_SKETCH_ID_MAP` and `resolveSketchId`

**Phase 2: TypeScript Refactoring**

- Created shared hook infrastructure (`src/inputs/shared/`)
- Extracted reusable patterns: `useEventListener`, `useFetchOnMount`, `useMappings`
- Refactored MIDI, OSC, Audio, HID hooks to use shared infrastructure

**Phase 3: Rust Module Refactoring**

- Split large files into focused submodules:
  - `midi.rs` (2,733 lines) → `midi/` (13 modules)
  - `audio.rs` (1,254 lines) → `audio/` (11 modules)
  - `hid.rs` (1,258 lines) → `hid/` (11 modules)
- Created `common/` for shared utilities (persistence, events)
- Removed ~900 lines of redundant documentation

**Phase 4: Testing Infrastructure**

- Added 52 Rust tests (LFO, MIDI parsing, video output)
- Added 33 frontend tests (slotTypes utilities)
- Set up vitest configuration for React components

**Phase 5: Performance Optimizations**

- **Audio Analysis**: Pre-allocated scratch buffers eliminate ~720KB/s of allocations
  - Reusable buffers for FFT windowing, complex numbers, and magnitudes
  - Combined Hann windowing + RMS/peak calculation into single pass
- **Modulation Engine**: Reduced lock contention from 6+ to 1 per tick
  - Two-phase approach: collect data in single lock, apply changes outside
  - Avoids cloning targets/audio_modulations vectors each tick
- **Parameter Store**: Pre-allocated changed vector with estimated capacity
  - Reduces reallocation overhead in 60Hz tick loop

### 8-Slot Harmonization

Slot count increased from 6 to 8 to match Midimix columns for 1:1 hardware mapping.

### Slot System Rework

- Fixed slots always visible in UI (no add/remove, just load/unload sketches)
- Empty slots show inline sketch browser directly
- Removing a sketch returns slot to empty state
- Copy-from-slot feature for duplicating configurations

### Multi-Slot Rendering

- Renderer displays ALL slots with alpha > 0 simultaneously
- Slots layer in index order (slot 0 = back, slot 7 = front)
- Each slot's opacity equals its alpha parameter value

### Midimix Integration

- Faders 1-8 control slot alpha (visibility)
- Knobs 1-3 per column control first 3 sketch parameters
- Master fader fades all slots simultaneously
- LEDs indicate which slots have sketches loaded
- Auto-connect on startup with LED animation

### MIDI Output

- Bidirectional Midimix connection (input + output)
- Per-device feedback toggle
- CC value caching to avoid redundant sends

### Window Manager

- `window_manager.rs` module for window lifecycle management
- Native macOS menu bar with Window menu (⌘⇧C restart Controls, ⌘⇧R restart Renderer)
- Heartbeat monitoring: windows send periodic pings, backend detects frozen windows
- Slot state persistence to `slots.json`
- Parameter state persistence to `parameters.json`
- Window position/size persistence via `tauri-plugin-window-state`
- Controls window hydrates state from backend on restart

### Device Hot-Plug

- Background device watcher threads for MIDI and Audio (2s polling interval)
- Auto-reconnect for MIDI (remembers connected devices)
- Auto-reconnect for Audio (reconnects to last active)
- `audio_devices_changed` and `midi_devices_changed` events for real-time UI updates
- Auto-reconnect toggles in MIDI and Audio panels

---

## Key Decisions

1. **Rendering**: WebGL via Three.js/r3f with custom GLSL shaders
2. **State**: Backend Parameter Server is canonical source of truth
3. **Messaging**: Event-based (`parameter_changed`, `slot_pairing_changed` events)
4. **Platforms**: macOS-first, cross-platform via chosen Rust crates
5. **Tick source**: Backend ~60Hz timer (independent of renderer FPS)
6. **Modulation**: Backend-driven for deterministic behavior
7. **Video Output**: NDI enabled by default (requires SDK)
8. **Multi-instance**: Slot-prefixed parameter IDs (`slot_0_brightness` format)
9. **Parameter persistence**: Backend keeps parameters when slots are removed (for re-use)
10. **Terminology**: Use `SketchId`, `sketchId`, import from `/src/sketches`

---

## Input Systems Summary

| System | Polling Interval | Auto-Reconnect                   | Events                                          |
| ------ | ---------------- | -------------------------------- | ----------------------------------------------- |
| MIDI   | 2s               | ✅ (remembers connected devices) | `midi_devices_changed`                          |
| Audio  | 2s               | ✅ (reconnects to last active)   | `audio_devices_changed`, `audio_status_changed` |
| HID    | 500ms            | ✅ (auto-connect thread)         | `hid_status_changed`                            |

---

## Version History

### v0.5.0 (WebGPU migration / video output optimization)

- Full WebGPU renderer with TSL shader materials
- Video output optimization: stable 60fps at 1080p (vs ~20fps before)
- WebGPU async readback with `readRenderTargetPixelsAsync()`
- Binary IPC protocol for video frames (eliminates base64 overhead)
- PBO fallback for WebGL2 async readback
- Performance stats via `stats-gl` (WebGPU compatible)

### v0.3.0 (Midimix integration / multi-slot / window manager)

- 8-slot system with fixed layout
- Full Midimix integration
- Multi-slot simultaneous rendering
- Window manager with recovery

### v0.1.0 (Initial Prototype)

- Dual-window architecture
- Basic sketches (BlueCube, OrangeCube, GreenPulse)
- Shader sketches (TslText3D, TslNoiseBlob)
- Parameter server with transitions
- Crossfade system
- MIDI, OSC, Audio, HID input
- Syphon and NDI output
- Modulation engine with LFOs
