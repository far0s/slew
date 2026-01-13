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

## osgrep – your code search tool

**osgrep** is your main codebase exploration tool. It's a local, private semantic search that helps you navigate the codebase using natural language queries.

### Basic usage

```bash
cd /path/to/slew
osgrep "query in natural language" -m <number>
```

### Essential parameters

| Parameter        | Description                                   |
| ---------------- | --------------------------------------------- |
| `-m <n>`         | Max total results (default: 25)               |
| `--per-file <n>` | Max matches per file (default: 1)             |
| `-s, --sync`     | Force re-index changed files before searching |
| `--scores`       | Show relevance scores (0-1) for each result   |

### Adjust `-m` according to complexity

| Request type                           | suggested `-m` |
| -------------------------------------- | -------------- |
| Simple question (1-2 files)            | 10             |
| Average question (flow, feature)       | 20-30          |
| Complex question (debug, architecture) | 30-50          |

### Strategy for complex queries

If the query touches **multiple parts of the codebase**, launch several osgrep in parallel rather than a single overloaded query:

```bash
# Example: understand the parameter system
osgrep "how does the parameter server interpolate values" -m 20
osgrep "how do MIDI mappings update parameters" -m 20
osgrep "how does the frontend subscribe to parameter changes" -m 20
```

### Additional useful commands

```bash
osgrep trace "function_name"   # See call graph (who calls what)
osgrep skeleton src/file.ts    # Show compressed file structure
osgrep symbols                 # List all symbols in codebase
osgrep index --sync            # Re-index after major changes
```

### Rules

- **MANDATORY**: Use osgrep for ALL code search. NEVER use grep, Grep tool, or Glob.
- **Local & Private**: 100% local embeddings, no cloud dependency.
- **Auto-Isolated**: Each repository gets its own index automatically (no `--store` needed).
- **Natural Language**: osgrep understands concepts, not just strings. Talk to it naturally.
  - ❌ `"architecture block icon color complete status"` (robotic keywords)
  - ✅ `"What is the color of the icon for completed architecture blocks?"` (natural question)

---

## Questions to Ask

When starting a new task, consider:

1. **What's the current state?** Check CHANGELOG for related features.
2. **What's the plan?** Look in `docs/working/` for task-specific docs.
3. **What are the constraints?** Review ARCHITECTURE for system design decisions.
4. **Are there related pieces?** Check BACKLOG for connected work items.

---

## MCP Gemini Design

**Gemini is your frontend developer.** For all UI/design work, use this MCP. Tool descriptions contain all necessary instructions.

### Before writing any UI code, ask yourself:

- Is it a NEW visual component (popup, card, section, etc.)? → `snippet_frontend` or `create_frontend`
- Is it a REDESIGN of an existing element? → `modify_frontend`
- Is it just text/logic, or a trivial change? → Do it yourself

### Critical rules:

1. **If UI already exists and you need to redesign/restyle it** → use `modify_frontend`, NOT snippet_frontend.

2. **Tasks can be mixed** (logic + UI). Mentally separate them. Do the logic yourself, delegate the UI to Gemini.
