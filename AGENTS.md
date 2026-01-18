# Slew

VJ software for creative coders — Tauri v2 (Rust + WebView), React, Three.js, dual-window architecture.

**Mature project** — all core features complete. Check BACKLOG before proposing new work.

## Commands

```bash
npm install
npm run tauri dev          # Development with hot reload
npm run tauri:no-ndi       # Without NDI SDK
npm test                   # Watch mode
npm run test:run           # Single run
```

## osgrep (MANDATORY)

Use osgrep for ALL code search. Never use grep or glob.

```bash
osgrep "natural language query" -m 20
```

| Complexity             | `-m` value |
| ---------------------- | ---------- |
| Simple (1-2 files)     | 10         |
| Normal (feature, flow) | 20-30      |
| Complex (debug, arch)  | 30-50      |

For multi-part questions, run parallel osgrep calls instead of one overloaded query.

Other commands: `osgrep trace "fn"`, `osgrep skeleton file.ts`, `osgrep symbols`

## Documentation

| Document               | Purpose                                          |
| ---------------------- | ------------------------------------------------ |
| `docs/ARCHITECTURE.md` | System design, window architecture, core systems |
| `docs/CHANGELOG.md`    | Feature status, recent changes                   |
| `docs/BACKLOG.md`      | Prioritized work items                           |
| `docs/CONVENTIONS.md`  | Code style, patterns (read when writing code)    |
| `docs/PACKAGING.md`    | Build and distribution                           |
| `docs/CONTROLLERS.md`  | Hardware controller reference                    |
| `docs/finished/`       | Completed task documentation                     |

## MCP Gemini Design

For UI/design work, delegate to Gemini MCP tools:

- **New visual component** → `snippet_frontend` or `create_frontend`
- **Redesign existing UI** → `modify_frontend`
- **Just logic or trivial changes** → Do it yourself
