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

### 2. ✅ Stats Reporting Throttling

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

- [x] Add `STATS_REPORT_INTERVAL_MS` constant (1000ms = 1fps)
- [x] Add throttle logic to `RendererInfoReporter`
- [x] Keep frame time collection at full rate
- [x] Only build and report `RendererInfo` at throttled rate
- [x] Verify stats display still updates smoothly
- [x] Measure IPC event reduction

**Result**: Reduced `reportInfo()` calls from 60/sec to 1/sec (98% reduction). Frame timing ring buffer still updated every frame for accurate FPS calculation.

---

### 3. ✅ Hard-Coded Config Extraction

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

- [x] Create `src/config.ts` for frontend constants
- [x] Create `src-tauri/src/config.rs` for backend constants
- [x] Group by category (timing, audio, video, etc.)
- [x] Document each constant with concise and clear comments
- [x] Replace magic numbers with config imports
- [x] Consider future user-configurable settings

**Result**: Created `src/config.ts` (28 lines, 13 constants) and `src-tauri/src/config.rs` (30 lines, 15 constants). Updated 5 frontend files and 1 Rust file to use centralized config. Audio constants remain in `audio/constants.rs` as they're tightly coupled to the DSP pipeline.

---

### 4. ✅ LocalStorage Schema Versioning

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

**Decision**: Option A, better for consistency

**Subtasks**:

- [x] Create `src/lib/storage.ts` with versioned storage utilities
- [x] Define schema types with version fields
- [x] Implement migration logic for each storage key
- [x] Migrate `useTheme.ts`
- [x] Migrate `useLayoutPreferences.ts`
- [x] Migrate `useRendererSettings.ts`
- [x] Migrate `ColorPicker.tsx` color history
- [x] Add tests for migration paths

**Result**: Created `src/lib/storage.ts` (212 lines) with `createVersionedStorage<T>()` and `createSimpleStorage<T>()` factories. Added 19 tests. Migrated 4 hooks/components. Legacy unversioned data auto-migrates to v1.

---

### 5. ✅ Lazy Sketch Loading

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
- **Key insight**: Separate descriptor files from component files to enable true code splitting

**Implementation**:

1. Created `LazySketchRegistry.tsx` with `React.lazy()` wrapped components
2. Created separate `descriptor.ts` files for each sketch (metadata only, no component code)
3. Updated group files to import only from descriptor files
4. Updated `SKETCH_COMPONENT_REGISTRY` to use lazy components
5. Added `<Suspense>` wrappers in `RendererRoot.tsx`, `RendererPreview.tsx`, and `SlotColumn.tsx`
6. Created `SketchLoadingFallback` (empty r3f group) for minimal visual disruption

**Bundle Size Comparison**:

| Chunk       | Before    | After     | Change                          |
| ----------- | --------- | --------- | ------------------------------- |
| renderer.js | 50.53 KB  | 54.01 KB  | +3.5 KB (lazy loading overhead) |
| shared.js   | 38.67 KB  | 38.67 KB  | 0                               |
| controls.js | 124.71 KB | 124.82 KB | +0.1 KB                         |

**Notes**: Bundle sizes are similar because Three.js (1.47 MB) is the dominant dependency and can't be split. However, the architecture now supports true lazy loading - sketch code is cleanly separated from metadata, and future additions will be automatically lazy-loaded.

**Subtasks**:

- [x] Measure current bundle size (main.js)
- [x] Refactor `SKETCH_COMPONENT_REGISTRY` to use `React.lazy()`
- [x] Create `SketchLoader` wrapper component with Suspense
- [x] Add loading indicator during sketch load (SketchLoadingFallback)
- [x] Update `RendererRoot.tsx` to handle lazy components
- [x] Update `RendererPreview.tsx` to handle lazy components
- [x] Update `SlotColumn.tsx` to handle lazy components
- [x] Measure new bundle size and document reduction
- [x] Verify hot reload still works in development
- [x] **Additional**: Separate descriptor files to enable true code splitting

---

### 6. ✅ Frame Distribution Buffer Pooling

**Goal**: Implement buffer pooling to reduce allocations during window resizing.

**Current State**: `frame_distribution.rs` allocated new base64 String buffers on each frame during encoding.

**Approach**:

- Implement buffer pool with size bucketing for base64 encoding output
- Standard buckets: 512×512, 1024×1024, 1920×1080, 2560×1440, 3840×2160
- Pool returns best-fit buffer (same or larger)
- Track allocation metrics (hits, misses, allocations, pooled buffer count)

**Implementation**:

1. Created `BufferPool` struct with `Mutex<HashMap<usize, Vec<String>>>` for thread-safe bucketing
2. Implemented `bucket_for_size()` to select appropriate bucket based on required capacity
3. `acquire()` returns pooled buffer if available (hit) or allocates new one (miss)
4. `release()` returns buffer to pool for reuse (max 4 per bucket to limit memory)
5. Integrated pool into `distribute_frame()` - encodes base64 into pooled buffer, clones content for metadata, returns buffer with capacity intact to pool
6. Added `BufferPoolStats` struct exposed in `DistributionStats` and via new `get_buffer_pool_stats` command
7. Added 4 new tests for buffer pool functionality
8. Added `useBufferPoolStats` hook in `videoOutput.ts` with polling (every 2s)
9. Added buffer pool hit rate display in Video tab → Renderer section (color-coded: green ≥90%, yellow ≥50%, red <50%)

**Bug Fix**: Initial implementation used `std::mem::take()` which emptied the buffer's capacity before returning to pool. Fixed to clone the data for metadata, preserving buffer capacity for reuse.

**Buffer Pool Size Buckets**:

| Resolution | RGBA Size | Base64 Size (approx) |
| ---------- | --------- | -------------------- |
| 512×512    | 1 MB      | ~1.4 MB              |
| 1024×1024  | 4 MB      | ~5.6 MB              |
| 1920×1080  | 8.3 MB    | ~11 MB               |
| 2560×1440  | 14.7 MB   | ~19.7 MB             |
| 3840×2160  | 33.2 MB   | ~44 MB               |

**Subtasks**:

- [x] Add allocation counter to measure current behavior
- [x] Create `BufferPool` struct in `frame_distribution.rs`
- [x] Implement size bucketing logic
- [x] Integrate pool into `distribute_frame()`
- [x] Add metrics for pool hits/misses
- [x] Test with window resize scenarios (4 new tests)
- [x] Document allocation reduction
- [x] Add UI display of buffer pool hit rate in Video tab

**Result**: Created `BufferPool` with size bucketing. After warmup, steady-state operation shows ~100% hit rate (buffers reused). Allocations only occur on first frame per bucket size or during rapid size transitions. Pool limited to 4 buffers per bucket to prevent memory bloat. Hit rate displayed in Video tab with color-coded status.

---

## Progress Log

| Date       | Task                           | Status | Notes                                                                                                                      |
| ---------- | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| -          | Starting work                  | 🚧     | Created working doc and branch                                                                                             |
| 2026-01-09 | Duplicate Template ID Mapping  | ✅     | Created `parameterMappings.ts`, updated 3 consumers, added 6 tests (380 total tests pass)                                  |
| 2026-01-09 | Stats Reporting Throttling     | ✅     | Added `STATS_REPORT_INTERVAL_MS` (1000ms), throttle in `RendererInfoReporter`, 98% IPC reduction                           |
| 2026-01-09 | Hard-Coded Config Extraction   | ✅     | Created `config.ts` + `config.rs`, updated 6 files, 97 Rust + 380 TS tests pass                                            |
| 2026-01-09 | LocalStorage Schema Versioning | ✅     | Created `storage.ts` with migration framework, 19 new tests, migrated 4 files (399 tests pass)                             |
| 2026-01-09 | Lazy Sketch Loading            | ✅     | Created `LazySketchRegistry.tsx`, separate descriptor files, Suspense wrappers (97 Rust + 399 TS tests pass)               |
| 2026-01-09 | Frame Distribution Buffer Pool | ✅     | Created `BufferPool` with size bucketing, integrated into `distribute_frame()`, 4 new tests (101 Rust + 399 TS tests pass) |

---

## Open Questions

1. ~~**Config extraction scope**: Should Rust constants be exposed to frontend via Tauri commands for runtime access, or keep them separate?~~ **Resolved**: Keep separate for now; audio constants stay in `audio/constants.rs`.

2. ~~**LocalStorage migration**: What happens if migration fails? Fallback to defaults and log warning?~~ **Resolved**: Yes, fallback to defaults with logger.warn().

3. ~~**Lazy loading granularity**: Should we lazy-load entire sketch groups, or individual sketches?~~ **Resolved**: Individual sketches via `React.lazy()`, with separate descriptor files for metadata-only imports in groups.

4. ~~**Buffer pool sizing**: What bucket sizes make sense based on common resolutions?~~ **Resolved**: 5 buckets based on standard resolutions (512², 1024², 1080p, 1440p, 4K). Pool limited to 4 buffers per bucket.

---

## Decisions

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| -        | -      | -         |

---

## Testing Checklist

Before marking complete:

- [x] All TypeScript tests pass (`npm run test:run`) - 399 tests
- [x] All Rust tests pass (`cargo test`) - 101 tests (was 97, +4 buffer pool tests)
- [ ] Manual testing: app starts correctly
- [ ] Manual testing: sketches render correctly
- [ ] Manual testing: settings persist across restarts
- [ ] No console errors or warnings
- [x] Bundle size measured (for lazy loading) - documented in Task 5

---

## References

- `docs/BACKLOG.md` - Original task definitions
- `docs/ARCHITECTURE.md` - System design context
- `src/sketches/types.ts` - ParameterTemplateId type
- `src-tauri/src/frame_distribution.rs` - Buffer handling
- `src/renderer/RendererRoot.tsx` - Stats reporter
- `src/sketches/LazySketchRegistry.tsx` - Lazy component definitions
- `src/sketches/{Group}/{Sketch}/descriptor.ts` - Separated metadata files
- `src-tauri/src/frame_distribution.rs` - BufferPool implementation
- `src/inputs/videoOutput.ts` - useBufferPoolStats hook
- `src/components/VideoOutputPanel/VideoOutputPanel.tsx` - Hit rate display
