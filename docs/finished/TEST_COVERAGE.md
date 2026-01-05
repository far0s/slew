# Test Coverage Expansion

Task document for expanding test coverage across Slew.

---

## Context

Codebase cleanup (Phase 4) established testing infrastructure with 52 Rust tests and 33 frontend tests. Core utilities are tested but some areas remain uncovered.

**Current coverage:**

- `modulation.rs` - 18 tests for LFO waveforms, phase, depth, offset, BPM sync
- `midi/message_handler.rs` - 26 tests for MIDI parsing, CC normalization, range mapping
- `video_out.rs` - 6 tests for pixel formats, frame validation, base64 decoding
- `slotTypes.ts` - 33 tests for parameter ID utilities

---

## Plan

### Phase 1: Rust Audio Module Tests ✅

Add tests for `audio/buffer.rs`:

- [x] `AudioBuffer` - push_samples, get_analysis_window behavior (6 tests)
- [x] `BeatDetector` - update function, adaptive threshold, cooldown (9 tests)

Add tests for `audio/analysis.rs`:

- [x] `band_energy` - pure function, edge cases (10 tests)

### Phase 2: Rust Persistence Tests ✅

Add tests for `common/persistence.rs`:

- [x] Add `tempfile` dev dependency
- [x] Test `load_json` / `save_json` round-trip (3 tests)
- [x] Test error handling (missing file, invalid JSON, wrong type) (4 tests)
- [x] Test directory creation, pretty printing (2 tests)
- [x] Test edge cases (special chars, large values, overwrite) (4 tests)

### Phase 3: Frontend Hook Tests ✅

Add tests for `useSlots.ts`:

- [x] Test initial state (9 tests)
- [x] Test slot operations (setSketch, clearSlot, copyToSlot) (14 tests)
- [x] Test crossfade operations (9 tests)
- [x] Test hydration from backend (4 tests)
- [x] Test helper functions (getSketchId, isActiveSlot, etc.) (9 tests)

Add tests for `useParameterStore.ts`:

- [ ] Test pure functions (clamp, getParameterRange, getParameterDefault) - internal functions
- [ ] Test buildSlotSceneParams - requires full store mock

### Phase 4: Component Tests ✅

Add tests for `Button` component:

- [x] Basic rendering (3 tests)
- [x] Variants (3 tests)
- [x] Sizes (2 tests)
- [x] Disabled state (3 tests)
- [x] Loading state (5 tests)
- [x] Click handling (2 tests)
- [x] Accessibility (3 tests)
- [x] HTML attributes passthrough (3 tests)

Add tests for `ParameterSlider` component:

- [x] Basic rendering (6 tests)
- [x] Slider attributes (3 tests)
- [x] Value changes (1 test)
- [x] Description / Info (2 tests)
- [x] MIDI Learn (2 tests)
- [x] Audio mapping indicator (2 tests)
- [x] Modulation indicator (2 tests)
- [x] MIDI controlled state (2 tests)
- [x] Pickup state / soft takeover (5 tests)
- [x] Color variants (4 tests)
- [x] Spacing (2 tests)
- [x] Accessibility (2 tests)

---

## Implementation Notes

### Rust Test Pattern

Tests live in the same file using `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_name() {
        // Arrange
        // Act
        // Assert
    }
}
```

### Frontend Test Pattern

Tests in separate `.test.ts` files using Vitest:

```typescript
import { describe, it, expect, vi } from "vitest";

describe("ModuleName", () => {
  it("does something specific", () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Mocking Tauri

For hooks that use Tauri's invoke:

```typescript
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
```

---

## Progress Log

### Session 1

- Created task document
- Added tests for `audio/buffer.rs` (AudioBuffer, BeatDetector) - 15 tests
- Added tests for `audio/analysis.rs` (band_energy) - 10 tests
- Added tests for `common/persistence.rs` (JSON load/save) - 15 tests
- Added `tempfile` dev dependency to Cargo.toml
- Added tests for `useSlots.ts` hook - 55 tests
- Fixed test setup to use valid sketch IDs (blueCube, orangeCube vs trippy, plasma)
- Added `@testing-library/jest-dom` for better component test assertions
- Added ResizeObserver and PointerEvent mocks for Radix UI component testing
- Added tests for `Button` component - 24 tests
- Added tests for `ParameterSlider` component - 33 tests

**Final test counts:**

- Rust: 93 tests (up from 52)
- Frontend: 145 tests (up from 33)
- Total: 238 tests

---

## Verification

Run Rust tests:

```bash
cd src-tauri && cargo test
```

Run frontend tests:

```bash
npm test
```

Run with coverage:

```bash
npm run test -- --coverage
```

---

## Summary

Test coverage significantly expanded:

| Area           | Before | After   | Added    |
| -------------- | ------ | ------- | -------- |
| Rust tests     | 52     | 93      | +41      |
| Frontend tests | 33     | 145     | +112     |
| **Total**      | **85** | **238** | **+153** |

**New test coverage:**

- `audio/buffer.rs` - AudioBuffer and BeatDetector (15 tests)
- `audio/analysis.rs` - band_energy FFT analysis (10 tests)
- `common/persistence.rs` - JSON load/save utilities (15 tests)
- `useSlots.ts` - Slot management hook (55 tests)
- `Button.tsx` - Button component (24 tests)
- `ParameterSlider.tsx` - ParameterSlider component (33 tests)

**Test infrastructure improvements:**

- Added `@testing-library/jest-dom` for better assertions
- Added mocks for ResizeObserver, PointerEvent (required by Radix UI)
- Added mocks for Element.prototype methods (scrollIntoView, pointer capture)
