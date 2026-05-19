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

## MIDI Hardware Controllers

These rules apply whenever writing MIDI input handling or hardware controller integration.

**Three-layer architecture (strict)**

1. **Input layer** — raw CC / note messages only, no business logic
2. **Intent layer** — normalised `0.0–1.0` values, canonical truth, owned by the parameter store
3. **Render / engine layer** — reads intent only; never receives raw MIDI

MIDI must never touch render state directly.

**Soft takeover (required for all absolute CCs)**

- Ignore CC input until it crosses the current intent value (pickup)
- Reset pickup state on: scene change, MIDI reconnect, mode change
- On reconnect, discard the first CC value per control

**Button LEDs = output, not mirror**

- Drive LEDs from canonical state only
- Never mirror raw MIDI input back to LEDs
- LEDs must reflect active mode, armed state, and active targets

**Failure handling (required)**

Handlers must survive: scene switch mid-gesture, MIDI disconnect / reconnect, app suspend / resume.
Recovery: re-arm pickup, re-sync LEDs, discard stale CCs.

**Forbidden patterns**

- Do not bind CCs directly to shader uniforms
- Do not trust absolute CC position as intent truth
- Do not use physical fader position as UI state
- Do not map faders to master opacity or safety-critical parameters

**Naming**

- MIDI terminology (`cc74`, `ch1`) belongs only in the input layer
- Intent names describe perceptual effect: `energy`, `presence` — not `noiseAmplitude`
