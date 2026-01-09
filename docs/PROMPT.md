# Agent Prompt – Slew 🎛️

Welcome! This document is your starting point for understanding the **Slew** project.

---

## Quick Orientation

1. **Read the architecture**: Start with `docs/ARCHITECTURE.md` for the full system design, technology stack, and code conventions.
2. **Check current status**: See `docs/CHANGELOG.md` for what's been built, recent changes, and key decisions.
3. **Review the backlog**: See `docs/BACKLOG.md` for prioritized work items and future plans.
4. **Active work**: Check `docs/working/` for any in-progress task documentation.

---

## Project Summary

**Slew** is VJ software for creative coders, built with:

- **Tauri v2** (Rust backend + WebView frontend)
- **Dual-window architecture**: Renderer (high-performance 3D visuals) + Controls (UI dashboard)
- **React + Three.js/r3f** for rendering
- **Multiple input systems**: MIDI, OSC, Audio FFT, HID (macropads)
- **Video output**: Syphon (macOS), NDI (cross-platform)

Key concepts:

- **Sketches**: Self-contained visual programs (shaders, 3D scenes)
- **Slots**: 8 fixed containers that hold sketches with independent parameters
- **Parameter Server**: Rust backend managing all parameters with smooth transitions
- **Crossfade**: Blend between slots with configurable curves

---

## Key Directories

| Path              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| `src/sketches/`   | Visual programs (each sketch is a self-contained module)     |
| `src/components/` | React UI components                                          |
| `src/renderer/`   | Renderer window (r3f, video output capture)                  |
| `src/controls/`   | Parameter store hook                                         |
| `src/inputs/`     | MIDI, OSC, Audio, HID hooks (with `shared/` infrastructure)  |
| `src/slots/`      | Slot system utilities (slotTypes, useSlots)                  |
| `src-tauri/src/`  | Rust backend (modular: `midi/`, `audio/`, `hid/`, `common/`) |
| `docs/`           | Project documentation                                        |
| `docs/working/`   | Active task documents                                        |
| `docs/finished/`  | Archived completed task documents                            |
| `scripts/`        | Build and setup scripts                                      |

---

## Running the App

```bash
# Install dependencies
npm install

# Start development (with hot reload)
npm run tauri dev

# Start without NDI (no SDK required)
npm run tauri:no-ndi
```

---

## Documentation Index

| Document               | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `docs/ARCHITECTURE.md` | System design, window architecture, core systems, code style |
| `docs/CHANGELOG.md`    | Feature status, recent changes, decisions                    |
| `docs/BACKLOG.md`      | Prioritized work items with context                          |
| `docs/PACKAGING.md`    | Build, sign, and distribute instructions                     |
| `docs/CONTROLLERS.md`  | Hardware controller layouts and mappings                     |
| `docs/working/`        | Task-specific documentation for active work                  |
| `docs/finished/`       | Archived completed task documentation                        |

---

## Getting Up to Speed

### For a quick overview

1. Read this file
2. Skim `docs/ARCHITECTURE.md` (especially Overview, Windows, Slot System)
3. Check `docs/CHANGELOG.md` section 1 (High-Level Status)

### For understanding a specific system

1. Find the relevant section in `docs/ARCHITECTURE.md`
2. Look at the corresponding Rust module in `src-tauri/src/`
3. Check the TypeScript hooks in `src/inputs/` or `src/controls/`

### For contributing

1. Read the Code Style section in `docs/ARCHITECTURE.md`
2. Check `docs/BACKLOG.md` for available work items
3. Look for any active task docs in `docs/working/`

---

## Current Focus

Check `docs/CHANGELOG.md` for the latest completed work and `docs/BACKLOG.md` for what's next. If there are files in `docs/working/`, those represent active task documentation with detailed plans and progress.

---

## mgrep – your code search tool

**mgrep** is your main codebase exploration tool. It will help you navigate it using natural language queries.

### Basic usage

```bash
mgrep "query in natural language" --store "slew" -a -m <number>
```

### Essential parameters

| Parameter        | Description                              |
| ---------------- | ---------------------------------------- |
| `--store "slew"` | **Mandatory** - Specify the project name |
| `-a`             | enable natural language search           |
| `-m <n>`         | Results total (min 10)                   |

### Adjust `-m` according to complexity

| Request type                           | suggested `-m` |
| -------------------------------------- | -------------- |
| Simple question (1-2 files)            | 10             |
| Average question (flow, feature)       | 20-30          |
| Complex question (debug, architecture) | 30-50          |

### Strategy for complex queries

If the query touches **multiple parts of the codebase**, launch several mgrep in parallel rather than a single overloaded query:

```bash
# Example: understand the complete authentication system
mgrep "how does LinkedIn frontend authentication work" --store "project-name" -a -m <n>
mgrep "how is the LinkedIn token managed on Convex" --store "project-name" -a -m <n>
mgrep "how does the background script manage sessions" --store "project-name" -a -m <n>
```

### Rules

- **MANDATORY** : Use mgrep for ALL code search. NEVER use grep, Grep tool, or Glob.
- **Natural Language** : mgrep is an AI agent like you. Talk to it like a colleague, not like a search engine.
  - ❌ `"architecture block icon color complete status"` (robotic keywords)
  - ✅ `"What is the color of the icon for completed architecture blocks?"` (question naturelle)

---

## Questions to Ask

When starting a new task, consider:

1. **What's the current state?** Check CHANGELOG for related features.
2. **What's the plan?** Look in `docs/working/` for task-specific docs.
3. **What are the constraints?** Review ARCHITECTURE for system design decisions.
4. **Are there related pieces?** Check BACKLOG for connected work items.
