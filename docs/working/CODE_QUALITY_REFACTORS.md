# Code Quality Refactors

Working document for a batch of code quality and maintenance tasks.

**Branch**: `chore/code-quality-refactors`  
**Status**: 🚧 In Progress

---

## Overview

This document tracks 6 chore tasks from the backlog that improve code quality, reduce technical debt, and enhance maintainability.

---

## Tasks (in implementation order)

### 1. ✅ Duplicate Template ID Mapping Refactor

**Goal**: Extract duplicate `TEMPLATE_ID_TO_PROPS_KEY` mappings to a shared module.

**Current State**: Same mapping exists in 3 locations:

- `src/renderer/RendererRoot.tsx:82`
- `src/controls/useParameterStore.ts:613`
- `src/components/RendererPreview/RendererPreview.tsx:33`

This violates DRY and risks inconsistency.

**Subtasks**:

- [x] Create `src/sketches/parameterMappings.ts` with the canonical mapping
- [x] Import in `RendererRoot.tsx`
- [x] Import in `useParameterStore.ts`
- [x] Import in `RendererPreview.tsx`
- [x] Add test to ensure mapping is complete (all ParameterTemplateIds covered)

---

### 2. ⬜ Stats Reporting Throttling

**Goal**: Throttle renderer stats reporting to reduce event emission overhead.

**Current State**: `RendererInfoReporter` in `RendererRoot.tsx` runs every frame (60fps), collecting and reporting stats via `reportInfo()`.

The `useRendererSettings.ts` hook already throttles to 250ms (4fps), but the collection still happens every frame.

**Analysis**:

- FPS tracking needs per-frame data for accuracy (ring buffer of frame times)
- Stats reporting (draw calls, textures, etc.) can be throttled
- Current architecture: collect every frame → throttle in hook → emit

**Approach**:

- Keep frame timing collection at 60fps (for accurate FPS calculation)
- Move throttling into `RendererInfoReporter` itself
- Only call `reportInfo()` at 1fps (configurable)
- Add constant for reporting interval

**Subtasks**:

- [ ] Add `STATS_REPORT_INTERVAL_MS` constant (1000ms = 1fps)
- [ ] Add throttle logic to `RendererInfoReporter`
- [ ] Keep frame time collection at full rate
- [ ] Only build and report `RendererInfo` at throttled rate
- [ ] Verify stats display still updates smoothly
- [ ] Measure IPC event reduction

---

### 3. ⬜ Hard-Coded Config Extraction

**Goal**: Extract magic numbers to centralized configuration files.

**Current State**: Magic numbers scattered throughout:

| Location                | Value        | Purpose                      |
| ----------------------- | ------------ | ---------------------------- |
| `useWindowManager.ts`   | `5000`       | Heartbeat interval (ms)      |
| `useWindowManager.ts`   | `10000`      | Status polling interval (ms) |
| `audio/constants.rs`    | `2000`       | Device poll interval (ms)    |
| `audio/constants.rs`    | `60.0`       | Analysis rate (Hz)           |
| `audio/constants.rs`    | `2048`       | FFT size                     |
| `audio/constants.rs`    | `1.5`        | Beat detection threshold     |
| `audio/constants.rs`    | `8000`       | Beat cooldown samples        |
| `RendererRoot.tsx`      | `60`         | FPS sample count             |
| `frame_distribution.rs` | `30`         | Target preview FPS           |
| `frame_distribution.rs` | `0.5`        | Default resolution scale     |
| `audio.ts`              | `8`          | BPM history size             |
| `audio.ts`              | `60` / `200` | Min/max BPM                  |

**Subtasks**:

- [ ] Create `src/config.ts` for frontend constants
- [ ] Create `src-tauri/src/config.rs` for backend constants
- [ ] Group by category (timing, audio, video, etc.)
- [ ] Document each constant with comments
- [ ] Replace magic numbers with config imports
- [ ] Consider future user-configurable settings

---

### 4. ⬜ LocalStorage Schema Versioning

**Goal**: Add schema versioning to localStorage data to handle format changes gracefully.

**Current State**: 5 files use localStorage without versioning:

| File                      | Storage Key                             | Data Shape                  |
| ------------------------- | --------------------------------------- | --------------------------- |
| `useTheme.ts`             | `slew-theme-mode`, `slew-theme-accent`  | Simple strings              |
| `useLayoutPreferences.ts` | `slew-sidebar-position`, `slew-ui-zoom` | String + number             |
| `useRendererSettings.ts`  | `slew-renderer-settings`                | `{ dpr, previewStreamFps }` |
| `ColorPicker.tsx`         | `slew-color-history`                    | `string[]`                  |
| `VideoOutputCapture.tsx`  | reads `slew-renderer-settings`          | Same as above               |

**Approach Options**:

**Option A**: Centralized storage module with migration framework

- Single `src/lib/storage.ts` module
- Generic `createVersionedStorage<T>()` factory
- Migration functions per schema version

**Option B**: Per-hook versioning

- Add version field to each stored object
- Each hook handles its own migrations

**Decision**: TBD (Option A preferred for consistency)

**Subtasks**:

- [ ] Create `src/lib/storage.ts` with versioned storage utilities
- [ ] Define schema types with version fields
- [ ] Implement migration logic for each storage key
- [ ] Migrate `useTheme.ts`
- [ ] Migrate `useLayoutPreferences.ts`
- [ ] Migrate `useRendererSettings.ts`
- [ ] Migrate `ColorPicker.tsx` color history
- [ ] Add tests for migration paths

---

### 5. ⬜ Lazy Sketch Loading

**Goal**: Implement lazy loading for sketch components to reduce initial bundle size.

**Current State**: All 13 sketches load eagerly in `src/sketches/index.ts`:

```typescript
export const SKETCH_COMPONENT_REGISTRY: Record<SketchId, SketchComponent> = {
  blueCube: BlueCube,
  orangeCube: OrangeCube,
  // ... all sketches imported synchronously
};
```

**Approach**:

- Use `React.lazy()` for each sketch component
- Wrap sketch usage in `<Suspense>` with loading indicator
- Sketches load on-demand when added to slot

**Considerations**:

- Measure bundle size before/after
- Handle loading state gracefully (skeleton or spinner)
- Preload commonly-used sketches?

**Subtasks**:

- [ ] Measure current bundle size (main.js)
- [ ] Refactor `SKETCH_COMPONENT_REGISTRY` to use `React.lazy()`
- [ ] Create `SketchLoader` wrapper component with Suspense
- [ ] Add loading indicator during sketch load
- [ ] Update `RendererRoot.tsx` to handle lazy components
- [ ] Update `RendererPreview.tsx` to handle lazy components
- [ ] Update `SlotColumn.tsx` to handle lazy components
- [ ] Measure new bundle size and document reduction
- [ ] Verify hot reload still works in development

---

### 6. ⬜ Frame Distribution Buffer Pooling

**Goal**: Implement buffer pooling to reduce allocations during window resizing.

**Current State**: `frame_distribution.rs` allocates new buffers on each resize. Frame data is stored in `Vec<u8>` within the `Frame` struct.

**Approach**:

- Implement buffer pool with size bucketing
- Standard buckets: 512×512, 1024×1024, 1920×1080, 2560×1440, 3840×2160
- Pool returns best-fit buffer (same or larger)
- Track allocation metrics before/after

**Subtasks**:

- [ ] Add allocation counter to measure current behavior
- [ ] Create `BufferPool` struct in `frame_distribution.rs`
- [ ] Implement size bucketing logic
- [ ] Integrate pool into `distribute_frame()`
- [ ] Add metrics for pool hits/misses
- [ ] Test with window resize scenarios
- [ ] Document allocation reduction

---

## Progress Log

| Date       | Task                          | Status | Notes                                                                                     |
| ---------- | ----------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| -          | Starting work                 | 🚧     | Created working doc and branch                                                            |
| 2026-01-09 | Duplicate Template ID Mapping | ✅     | Created `parameterMappings.ts`, updated 3 consumers, added 6 tests (380 total tests pass) |

---

## Open Questions

1. **Config extraction scope**: Should Rust constants be exposed to frontend via Tauri commands for runtime access, or keep them separate?

2. **LocalStorage migration**: What happens if migration fails? Fallback to defaults and log warning?

3. **Lazy loading granularity**: Should we lazy-load entire sketch groups, or individual sketches?

4. **Buffer pool sizing**: What bucket sizes make sense based on common resolutions?

---

## Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| -        | -      | -         |

---

## Testing Checklist

Before marking complete:

- [ ] All TypeScript tests pass (`npm run test:run`)
- [ ] All Rust tests pass (`cargo test`)
- [ ] Manual testing: app starts correctly
- [ ] Manual testing: sketches render correctly
- [ ] Manual testing: settings persist across restarts
- [ ] No console errors or warnings
- [ ] Bundle size measured (for lazy loading)

---

## References

- `docs/BACKLOG.md` - Original task definitions
- `docs/ARCHITECTURE.md` - System design context
- `src/sketches/types.ts` - ParameterTemplateId type
- `src-tauri/src/frame_distribution.rs` - Buffer handling
- `src/renderer/RendererRoot.tsx` - Stats reporter
