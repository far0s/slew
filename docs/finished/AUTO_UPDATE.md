# Auto-Update Mechanism

**Status**: Complete  
**Date**: 2025

## What was built

In-app update notifications using the Tauri updater plugin (`tauri-plugin-updater`).

## Architecture

### Rust (`src-tauri/src/updater.rs`)

- `init_updater(app)` — spawns a background thread, waits 3s, checks GitHub releases, emits `update_available` event if a newer version is found
- `check_for_update` — Tauri command for on-demand checks (invoked from frontend or menu)
- `install_update` — Tauri command: downloads + installs update, then calls `app.restart()`

The updater is wired into `lib.rs`:
- Plugin registered: `tauri_plugin_updater::Builder::new().build()`
- `init_updater` called in `setup()` after all engines initialize
- Commands registered in `invoke_handler`

### Update endpoint

```
https://github.com/far0s/slew/releases/latest/download/latest.json
```

This is the standard Tauri updater JSON format. GitHub Actions must generate `latest.json` as part of the release workflow (see Release Notes below).

### Frontend

- **`src/hooks/useUpdater.ts`** — hook managing update state machine:
  - `idle` → `available` (via startup event or manual check)
  - `available` → `installing` (on user action)
  - any → `error` (on failure)
  - any → `idle` (on dismiss)

- **`src/components/UpdateBanner/`** — slim banner rendered at root of App:
  - Hidden when `state.type === "idle"`
  - Shows version + first line of release notes when available
  - "Install & Restart" button triggers `install_update` command
  - Dismiss button resets to idle
  - Installing state shows spinner
  - Error state shows message + dismiss

### Native menu

"Check for Updates…" added to the Help menu (`window_manager.rs`). Clicking it re-runs the background check and emits `update_available` if an update is found.

## Release workflow requirements

To make updates work end-to-end, the GitHub Actions release workflow must:

1. Build the app with `npm run tauri build`
2. Generate `latest.json` with Tauri's built-in tooling or `tauri-action`
3. Sign the updater payload — a `pubkey` must be set in `tauri.conf.json` (currently `""`)
4. Upload `latest.json` and the installer artifacts to the GitHub release

### Generating a signing keypair

```bash
npm run tauri signer generate -- -w ~/.tauri/slew.key
```

Then set `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub Actions secrets, and add the public key to `tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<your-public-key-here>",
    ...
  }
}
```

## Files changed

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Added `tauri-plugin-updater = "2.10.1"` |
| `src-tauri/Cargo.lock` | Updated (wry 0.54.2→0.55.0, tauri-runtime-wry 2.10.1→2.11.0) |
| `src-tauri/tauri.conf.json` | Added `plugins.updater` config block |
| `src-tauri/capabilities/default.json` | Added `updater:default` permission |
| `src-tauri/src/updater.rs` | New module: background check + commands |
| `src-tauri/src/lib.rs` | Plugin registration, module declaration, init call, command registration |
| `src-tauri/src/window_manager.rs` | "Check for Updates…" menu item + handler |
| `src/hooks/useUpdater.ts` | New hook: update state machine |
| `src/components/UpdateBanner/` | New component: slim update banner |
| `src/components/index.ts` | Exported UpdateBanner |
| `src/App.tsx` | Wired useUpdater + UpdateBanner |
