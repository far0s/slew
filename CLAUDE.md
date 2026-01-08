# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ READ THE DOCS FOLDER FIRST

**The `/docs` folder contains critical context you MUST read before making changes:**

1. **START HERE**: `docs/PROMPT.md` - Agent orientation guide
2. **ARCHITECTURE**: `docs/ARCHITECTURE.md` - System design, technology stack, code conventions
3. **STATUS**: `docs/CHANGELOG.md` - Feature status and recent changes (all features ✅ complete)
4. **FUTURE WORK**: `docs/BACKLOG.md` - Prioritized work items
5. **REFERENCE**: `docs/finished/` - Completed task documentation with implementation details
6. **PACKAGING**: `docs/PACKAGING.md` - Build and distribution guide
7. **HARDWARE**: `docs/CONTROLLERS.md` - MIDI/HID controller reference

## Quick Start

**Slew** is VJ software for creative coders built with Tauri v2 (Rust + WebView), React, and Three.js. It uses a dual-window architecture with separate Renderer (high-performance 3D visuals) and Controls (UI dashboard) windows.

**This is a mature project** - all core features are complete. Check BACKLOG before proposing new features.

## Development Commands

```bash
# Install dependencies
npm install

# Install Syphon framework (macOS only, required for video output)
./scripts/install-syphon.sh

# Start development with hot reload
npm run tauri dev

# Start without NDI (no SDK required)
npm run tauri:no-ndi

# Run tests
npm test           # Watch mode
npm run test:run   # Single run
npm run test:coverage

# Build for production
npm run tauri:build
npm run tauri:build:no-ndi

# Package for distribution (see docs/PACKAGING.md)
npm run package
npm run package:release
```

## Architecture Overview

### Dual-Window System

**Renderer Window** (`/renderer`):
- Full-screen high-performance visuals at 60fps
- Receives parameter updates from backend via Tauri events
- Renders all active slots (alpha > 0) simultaneously with compositing
- Exports frames via Syphon (macOS) and NDI for VJ integration
- Streams previews back to Controls window via `frame_distribution.rs`

**Controls Window** (`/`):
- VJ dashboard with slot management and parameter controls
- Receives streamed preview frames from Renderer window
- Falls back to local rendering when streaming unavailable

Both windows share the same bundle; `src/main.tsx` dispatches based on path.

### Core Concepts

**Slots**: 8 fixed containers (0-7) that hold sketches with independent parameters. Parameter IDs follow the pattern `slot_{index}_{templateId}` (e.g., `slot_0_brightness`).

**Sketches**: Self-contained visual programs organized in groups (Examples, AdvancedExamples, Aura). Each sketch is a React component with a `SketchDescriptor` defining its parameters, labels, and color palette.

**Parameter Server** (`src-tauri/src/lib.rs`): Rust-based central authority running at ~60Hz. Parameters have `value`, `target`, `transition_speed`, and `curve` for smooth interpolation. All parameters persist to `parameters.json`.

**Input Systems**: MIDI, OSC, Audio (FFT/beat detection), and HID all follow the same pattern:
1. Rust module in `src-tauri/src/{system}/`
2. Tauri commands for CRUD operations
3. TypeScript hooks in `src/inputs/{system}.ts`
4. UI panel in `src/components/{System}Panel/`

**Video Output**: WebGPU/WebGL renders to `readRenderTargetPixelsAsync()` → binary IPC protocol → Rust (`video_out.rs`) → Syphon/NDI backends. Optimized with pre-allocated buffers and async readback for stable 60fps at 1080p.

## Project Structure

```
/src
  /sketches/              # Visual programs (grouped modules)
    /{GroupName}/
      index.ts            # SketchGroup definition + re-exports
      /{SketchName}/
        index.tsx         # Component + SketchDescriptor
    types.ts              # Core types
    index.ts              # SKETCH_GROUPS, SKETCH_REGISTRY
  /renderer/              # Renderer window
    RendererRoot.tsx      # Multi-slot rendering loop
    VideoOutputCapture.tsx   # Frame capture for Syphon/NDI
    SlotPreviewCapture.tsx   # Per-slot frame capture
  /components/            # React UI components
    /StreamedPreview/     # Streamed frame display
    /SlotColumn/          # Slot UI with inline sketch browser
  /controls/              # useParameterStore hook
  /inputs/                # Input system hooks
    /shared/              # Reusable hook infrastructure
  /slots/                 # Slot utilities (slotTypes, useSlots)

/src-tauri/src/
  lib.rs                  # Parameter Server, tick loop, command registration
  window_manager.rs       # Window lifecycle, heartbeat, native menu
  /common/                # Shared utilities (persistence, events)
  /midi/                  # 13 modules: engine, devices, mappings, learn, output
  /audio/                 # 11 modules: capture, FFT, beat detection, mappings
  /hid/                   # 11 modules: device management, macropad support
  osc.rs                  # OSC server (port 9000)
  modulation.rs           # LFO engine, modulation matrix
  video_out.rs            # Video output backends (Syphon, NDI)
  frame_distribution.rs   # Preview streaming to Controls window
  syphon.rs              # Native Syphon bindings (macOS)
```

## Recent Important Changes

### ⚠️ Tailwind Removed (v0.8.0)
**DO NOT suggest or use Tailwind CSS classes.** The project migrated to plain CSS:
- **Use CSS Modules**: All component styles use `.module.css` files
- **Use CSS Variables**: Theme colors and design tokens in `src/globals.css`
- **Theme variables inspired by Tailwind** - see `globals.css` header for reference link
- Bundle size reduced 55% (15.85 KB → 7.07 KB)

### Preview Streaming Architecture
Renderer window streams pixel-perfect frames to Controls window previews:
- **Composited preview**: Shows actual rendered pixels from Renderer
- **Per-slot previews**: Isolated slot renders via visibility toggling
- **Binary IPC**: Base64-encoded RGBA frames via Tauri events
- **Automatic fallback**: Local rendering if streaming unavailable
- See `docs/finished/PREVIEW_STREAMING.md` for details

### WebGPU Migration Complete
All sketches now use WebGPU with WebGL2 fallback:
- **TSL shaders**: Three.js Shading Language for WebGPU
- **Async readback**: Non-blocking GPU→CPU transfer for video output
- **Metal backend**: Native acceleration on macOS

## Code Style

### TypeScript

- **No JSDoc** - Types are self-documenting. Avoid redundant documentation.
- **CSS Modules + CSS Variables** - NEVER use Tailwind classes (removed in v0.8.0)
  - Component styles: `.module.css` files with local class names
  - Theme tokens: CSS variables in `src/globals.css`
  - Color system: `--color-{name}-{shade}` pattern (e.g., `--color-slate-700`)
- **Strict TypeScript** - `strict: true` in tsconfig, enforce type safety
- **Sketch Organization**: Each sketch is a folder with `index.tsx` containing both the component and `SketchDescriptor`

### Rust

- **Modular organization**: Large modules split into focused submodules (<200 lines each)
- **Pattern**: `mod.rs` (public API), `types.rs`, `engine.rs`, `commands.rs`, etc.
- **Persistence**: Use `common/persistence.rs` helpers for JSON I/O
- **Events**: Use `common/events.rs` helpers for Tauri event emission

## Common Patterns

### Adding a New Sketch
1. Create folder in `src/sketches/{GroupName}/{SketchName}/`
2. Create `index.tsx` with component and `SketchDescriptor`
3. Add to group in `src/sketches/{GroupName}/index.ts`
4. Register component in `SKETCH_COMPONENT_REGISTRY` in `src/sketches/index.ts`
5. Parameters auto-generate UI via `SlotParameterControls`

### Adding a New Input System
1. Create Rust module in `src-tauri/src/{system}/` with submodules (types, engine, commands, etc.)
2. Create TypeScript hook in `src/inputs/{system}.ts` using `shared/` infrastructure
3. Create UI panel in `src/components/{System}Panel/`
4. Register Tauri commands in `src-tauri/src/lib.rs`
5. Follow existing patterns from MIDI/OSC/Audio/HID

### Parameter Flow
1. UI/Input → Tauri command → `set_parameter_target()` in `lib.rs`
2. Parameter Server tick loop (~60Hz) interpolates `value` toward `target`
3. Backend emits `parameter_changed` event
4. Frontend hooks update (useParameterStore)
5. Renderer receives updates and re-renders

## Feature Status

**All core features are complete (✅):**
- Dual-window architecture (Renderer + Controls)
- Parameter Server with smooth transitions
- 8-slot system with inline sketch browser
- Crossfade with correct scene pairing
- Preview streaming (pixel-perfect, Renderer → Controls)
- MIDI input (hot-plug, auto-reconnect, learn mode, soft takeover)
- OSC input (UDP port 9000)
- Audio input (FFT, beat detection, audio→parameter mappings)
- HID input (DOIO Megalodon macropad support)
- Modulation Engine (LFOs, modulation matrix, audio→LFO)
- Video Output (Syphon + NDI, WebGPU async readback)
- Shader Sketches (Aura with 8 presets, Examples, Advanced Examples)
- WebGPU Renderer (all sketches compatible)
- Window Manager (native menu, heartbeat monitoring)
- Packaging (macOS/Windows/Linux, automated releases via GitHub Actions)

**Current Priority** (see `docs/BACKLOG.md`):
- 🔴 App icon design and implementation

## Testing

Tests use Vitest with jsdom environment:
- Test files: `*.test.ts` or `*.test.tsx` in `src/`
- Setup: `src/test/setup.ts`
- Run: `npm test` (watch) or `npm run test:run` (single run)
- Coverage: 238 tests (93 Rust, 145 frontend)
- Example: `src/slots/slotTypes.test.ts`, `src/components/Button/Button.test.tsx`

## Key Files Reference

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Parameter Server, ~60Hz tick loop, command registration |
| `src-tauri/src/window_manager.rs` | Window lifecycle, heartbeat monitoring |
| `src-tauri/src/frame_distribution.rs` | Preview streaming from Renderer to Controls |
| `src/sketches/types.ts` | SketchDescriptor, ParameterTemplate types |
| `src/sketches/index.ts` | SKETCH_GROUPS, SKETCH_REGISTRY, lookup functions |
| `src/slots/slotTypes.ts` | Parameter ID utilities (getSlotParameterId, etc.) |
| `src/slots/useSlots.ts` | Slot management hook |
| `src/controls/useParameterStore.ts` | Parameter state management |
| `src/renderer/RendererRoot.tsx` | Multi-slot rendering with compositing |
| `src/components/StreamedPreview/` | Streamed frame display in Controls |

## Important Constraints

- **Parameter IDs**: Always use `slot_{index}_{templateId}` format for slot-specific parameters
- **Video Output**: WebGPU async readback path preferred; WebGL2 PBO fallback exists
- **Window Communication**: Use Tauri events, not direct DOM access between windows
- **Preview Streaming**: Round-robin slot capture (one per frame) to minimize GPU overhead
- **Rust Profiles**: `dev` optimizes dependencies (faster linking), `release` uses thin LTO
- **NDI**: Optional feature requiring SDK installation; use `--no-default-features` to disable
- **No `window.confirm()`**: WebView blocks modal dialogs; use native Tauri dialogs instead

## Implementation Reference

The `docs/finished/` folder contains detailed documentation of completed features:
- `PREVIEW_STREAMING.md` - Frame distribution architecture
- `VIDEO_OUTPUT_OPTIMIZATION.md` - WebGPU async readback, binary IPC protocol
- `WEBGPU_MIGRATION.md` - TSL shader migration details
- `BETTER_COLOR_PICKER.md` - React Aria color picker implementation
- `TEST_COVERAGE.md` - Testing infrastructure and examples
- `AURA_SHADER.md` - Complex shader implementation reference
- `IOSURFACE_FEASIBILITY.md` - Zero-copy video output research

**When working on similar features, read the relevant finished docs first.**

## Platform-Specific Notes

**macOS**:
- Syphon framework required: `./scripts/install-syphon.sh`
- Uses Metal via WebGPU backend
- Native Syphon bindings via objc2

**NDI (optional)**:
- Requires NDI SDK installation
- Cross-platform support
- Use `npm run tauri:no-ndi` to skip NDI feature
