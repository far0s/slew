# Slew

VJ software for creative coders — Tauri v2 (Rust + WebView), React, Three.js, dual-window architecture.

**Mature project** — all core features complete. Check BACKLOG before proposing new work.

## Commands

```bash
npm install
npm run tauri:dev         # Development with hot reload
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
| `docs/BACKLOG.md`      | Prioritized work items                           |
| `docs/CONVENTIONS.md`  | Code style, patterns (read when writing code)    |
| `docs/PACKAGING.md`    | Build and distribution                           |
| `docs/CONTROLLERS.md`  | Hardware controller reference                    |
| `docs/finished/`       | Completed task documentation                     |

## Releasing a Version

**Files to update** (all three must match):

- `package.json` → `"version": "X.Y.Z",` (comma required — it's not the last key)
- `src-tauri/Cargo.toml` → `version = "X.Y.Z"`
- `src-tauri/tauri.conf.json` → `"version": "X.Y.Z",` (comma required — it's not the last key)

After editing, always validate JSON before committing:

```bash
python3 -c "import json; json.load(open('package.json')); json.load(open('src-tauri/tauri.conf.json')); print('OK')"
```

Update `Cargo.lock` too:

```bash
cargo update --manifest-path src-tauri/Cargo.toml --package slew
```

**Tagging** — tags use bare version numbers, no `v` prefix:

```bash
git tag 0.11.8        # correct
git tag v0.11.8       # WRONG
```

Verify with `git tag | sort -V | tail -5` before pushing.

## MCP Gemini Design

For UI/design work, delegate to Gemini MCP tools:

- **New visual component** → `snippet_frontend` or `create_frontend`
- **Redesign existing UI** → `modify_frontend`
- **Just logic or trivial changes** → Do it yourself
