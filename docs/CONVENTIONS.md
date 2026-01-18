# Code Conventions

## TypeScript

- **CSS Modules + CSS Variables** — never Tailwind (removed in v0.8.0)
- **No JSDoc** — types are self-documenting
- **Strict mode** — `strict: true` in tsconfig

Styles: `.module.css` files, theme tokens in `src/globals.css`, colors as `--color-{name}-{shade}`.

## Rust

- **Modular** — split large modules into submodules (<200 lines each)
- **Pattern**: `mod.rs` (API), `types.rs`, `engine.rs`, `commands.rs`
- **Persistence**: use `common/persistence.rs` helpers
- **Events**: use `common/events.rs` helpers

## Adding a Sketch

1. Create `src/sketches/{Group}/{Name}/index.tsx`
2. Export component + `SketchDescriptor`
3. Add to group's `index.ts`
4. Register in `SKETCH_COMPONENT_REGISTRY` in `src/sketches/index.ts`

Parameters auto-generate UI via `SlotParameterControls`.

## Adding an Input System

1. Rust module: `src-tauri/src/{system}/` with submodules
2. TypeScript hook: `src/inputs/{system}.ts` using `shared/` infra
3. UI panel: `src/components/{System}Panel/`
4. Register commands in `src-tauri/src/lib.rs`

Follow MIDI/OSC/Audio/HID patterns.

## Testing

Vitest + jsdom. Files: `*.test.ts(x)` in `src/`.

```bash
npm test              # watch
npm run test:run      # single run
npm run test:coverage
```

## Platform Notes

**macOS**: Syphon required — `./scripts/install-syphon.sh`

**NDI**: Optional, requires SDK. Use `npm run tauri:no-ndi` to skip.

## Constraints

- Parameter IDs: `slot_{index}_{templateId}` format
- Window communication: Tauri events only (no direct DOM access)
- No `window.confirm()`: WebView blocks modals — use native Tauri dialogs
- Video output: prefer WebGPU async readback; WebGL2 PBO fallback exists
