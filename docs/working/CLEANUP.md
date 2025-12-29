# Codebase Cleanup Task

Comprehensive plan for cleaning up and refactoring the sebcat-vj codebase.

---

## ⚠️ CRITICAL: Before You Start

**This task requires deep knowledge of the entire codebase.**

Before making ANY changes, you MUST thoroughly understand:

1. **The dual-window architecture** - Renderer (3D visuals) + Controls (UI dashboard)
2. **The Rust backend** - Parameter server, input engines (MIDI, Audio, OSC, HID), modulation, video output
3. **The slot system** - 8 fixed slots, each holding a sketch with independent parameters
4. **The event flow** - Backend → Frontend via Tauri events, parameter interpolation at 60Hz
5. **The input system patterns** - How MIDI, Audio, OSC, HID all follow similar patterns

**Required reading before starting**:

- `docs/ARCHITECTURE.md` - Full system design
- `docs/CHANGELOG.md` - Feature status and decisions
- `src-tauri/src/lib.rs` - Parameter server core
- `src-tauri/src/midi.rs` - Largest module, understand the patterns
- `src/App.tsx` - Main controls component
- `src/renderer/RendererRoot.tsx` - Renderer state management
- `src/sketches/types.ts` - Sketch system types

**Do NOT start refactoring until you can answer**:

- How does a parameter change flow from UI to Renderer?
- How does the slot system work with crossfading?
- What shared patterns exist across MIDI/Audio/OSC/HID?
- How does the Midimix integration work?

---

## Decisions Made

### 1. ✅ JSDoc: Remove

**Decision**: Remove JSDoc comments, rely on TypeScript types alone.

**Rationale**: Simpler codebase, less maintenance overhead. TypeScript provides sufficient type information.

**Action**: Strip JSDoc comments from all TypeScript files. Keep only essential inline comments that explain _why_, not _what_.

### 2. ✅ Legacy Scene Terminology: Full Migration

**Decision**: Fully migrate from "scene" to "sketch" terminology now.

**Rationale**: Clean break, no deprecation complexity.

**Action**:

- Rename `sceneTypes.ts` → `slotTypes.ts`
- Rename `useSceneSlots.ts` → `useSlots.ts`
- Rename `SceneColumn` → `SlotColumn`
- Rename `SceneParameterControls` → `SlotParameterControls`
- Rename `ScenesArea` → `SlotsArea`
- Remove `LEGACY_SKETCH_ID_MAP` from `sketches/index.ts`
- Remove legacy scene ID mappings from `lib.rs` (`sceneA`, `sceneB`, `sceneC`)
- Rename Rust functions/events: `set_scene_pairing` → `set_slot_pairing`, `scene_pairing_changed` → `slot_pairing_changed`
- Update all variable names, comments, and references

### 3. ✅ Rust Refactoring Approach: Shared Infrastructure First

**Decision**: Create shared infrastructure first, then split large modules.

**Rationale**: Establishing patterns first makes the splits cleaner and more consistent.

**Order of operations**:

1. Create `common/` module with shared utilities
2. Split `midi.rs` using the new infrastructure
3. Apply patterns to other modules as beneficial

---

## Analysis Summary

### Codebase Size

| Area                | Files | Lines    | Notes                                |
| ------------------- | ----- | -------- | ------------------------------------ |
| Rust Backend        | 10    | ~9,058   | midi.rs alone is 2,733 lines         |
| TypeScript Frontend | ~40+  | ~9,300+  | Significant duplication across hooks |
| Total               | ~50+  | ~18,300+ |                                      |

### Largest Files (Rust)

| File            | Lines | Concern                                   |
| --------------- | ----- | ----------------------------------------- |
| `midi.rs`       | 2,733 | Way too large - multiple responsibilities |
| `hid.rs`        | 1,258 | Large but more focused                    |
| `audio.rs`      | 1,254 | Similar structure to midi                 |
| `video_out.rs`  | 1,092 | Contains 3 backends + manager             |
| `modulation.rs` | 995   | Manageable                                |
| `lib.rs`        | 927   | Parameter server + commands               |

### Largest Files (TypeScript)

| File                   | Lines | Concern                       |
| ---------------------- | ----- | ----------------------------- |
| `midi.ts`              | 1,016 | 6 hooks with similar patterns |
| `modulation.ts`        | 752   | Multiple hooks                |
| `RendererRoot.tsx`     | 684   | Complex state management      |
| `useParameterStore.ts` | 681   | Core state hook               |
| `App.tsx`              | 644   | Main controls component       |
| `sceneTypes.ts`        | 572   | Utility functions + types     |

---

## Issues Identified

### 1. 🔴 Large Files Need Splitting

**midi.rs (2,733 lines)** handles too many concerns:

- Device enumeration & hot-plug detection
- Input connection management
- Output connection management
- Message parsing & routing
- MIDI Learn workflow
- Midimix-specific logic (LEDs, buttons, mappings)
- Soft takeover / pickup state
- Mute/Solo slot logic
- CC feedback caching
- Mapping persistence

**Recommendation**: Split into submodules:

- `midi/mod.rs` - Public API, re-exports
- `midi/engine.rs` - Core engine state, init
- `midi/devices.rs` - Device enumeration, hot-plug
- `midi/connections.rs` - Input/output connections
- `midi/messages.rs` - Message parsing, routing
- `midi/learn.rs` - MIDI Learn workflow
- `midi/midimix.rs` - Midimix-specific logic
- `midi/mappings.rs` - Mapping management, persistence
- `midi/commands.rs` - Tauri command wrappers

### 2. 🔴 Duplicate Patterns Across Input Modules

Each Rust input module (midi, audio, osc, hid, modulation) follows identical patterns:

```rust
// Pattern 1: Singleton state
static ENGINE: Lazy<Arc<Mutex<EngineState>>> = Lazy::new(...);

fn with_engine<T, F: FnOnce(&mut EngineState) -> T>(f: F) -> T { ... }

// Pattern 2: Initialization
pub fn init_engine(app_handle: AppHandle) { ... }

// Pattern 3: Device watcher thread
fn start_device_watcher_thread() {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(POLL_INTERVAL));
            // check for device changes
        }
    });
}

// Pattern 4: Mapping CRUD + persistence
pub fn get_mappings() -> Vec<Mapping> { ... }
pub fn add_mapping(mapping: Mapping) { ... }
pub fn remove_mapping(id: &str) { ... }
fn load_mappings_from_disk() { ... }
fn save_mappings_to_disk() { ... }

// Pattern 5: Event emission
fn emit_status_changed(app: &AppHandle, status: &Status) { ... }
fn emit_mappings_changed(app: &AppHandle, mappings: &[Mapping]) { ... }

// Pattern 6: Tauri command wrappers
#[tauri::command]
pub fn get_*_status() -> Status { get_status() }
```

**Recommendation**: Create shared infrastructure:

- `common/engine.rs` - Generic engine trait/pattern
- `common/device_watcher.rs` - Reusable device polling
- `common/mappings.rs` - Generic mapping CRUD trait
- `common/persistence.rs` - JSON file I/O helpers
- `common/events.rs` - Event emission helpers

### 3. 🔴 TypeScript Hook Duplication

Each input hook file follows identical patterns:

```typescript
// Pattern 1: Type definitions matching Rust
interface DeviceInfo { ... }
interface Mapping { ... }
interface Status { ... }

// Pattern 2: Invoke wrappers
async function getStatus(): Promise<Status> {
  return invoke<Status>("get_*_status");
}

// Pattern 3: Device hook
function useDevices() {
  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { /* fetch initial */ }, []);
  useEffect(() => { /* subscribe to events */ }, []);

  const connect = useCallback(async (id) => { ... }, []);
  const disconnect = useCallback(async (id) => { ... }, []);

  return { devices, isLoading, connect, disconnect };
}

// Pattern 4: Mappings hook
function useMappings() {
  const [mappings, setMappings] = useState([]);
  // ... identical structure
}
```

**Recommendation**: Create hook factory:

```typescript
// src/inputs/shared/createInputHook.ts
function createDeviceHook<T>(config: DeviceHookConfig<T>) { ... }
function createMappingHook<T>(config: MappingHookConfig<T>) { ... }
```

### 4. 🟡 Minimal Test Coverage

**Current tests (Rust)**:

- `lib.rs`: 2 tests (`extract_slot_index` validation)
- `syphon.rs`: 1 test (NSRect layout verification)
- `video_out.rs`: 5 tests (pixel format, base64, manager)

**Missing tests**:

- `midi.rs` - Complex logic, no tests
- `audio.rs` - FFT, beat detection, no tests
- `hid.rs` - Report parsing, no tests
- `modulation.rs` - LFO math, no tests
- `osc.rs` - Address matching, no tests

**Frontend tests**: None

**Recommendation**:

- Add vitest for React component/hook tests
- Add unit tests for pure functions
- Focus on: LFO calculations, beat detection, parameter interpolation

### 5. 🟢 Dead Code to Remove

**Rust `#[allow(dead_code)]` markers**:

```rust
// midi.rs - remove if unused
const MIDIMIX_SEND_ALL_NOTE: u8 = 25;
const MIDIMIX_BANK_LEFT_NOTE: u8 = 26;
const MIDIMIX_BANK_RIGHT_NOTE: u8 = 27;
```

**Legacy ID mappings to remove**:

```rust
// lib.rs - get_sketch_defaults() - REMOVE these:
"sceneA" => vec![...],
"sceneB" => vec![...],
"sceneC" => vec![...],
```

```typescript
// sketches/index.ts - REMOVE this:
export const LEGACY_SKETCH_ID_MAP: Record<string, SketchId> = {
  sceneA: "blueCube",
  sceneB: "orangeCube",
  sceneC: "greenPulse",
};
```

### 6. 🟢 Memory & Performance Opportunities

**Excessive `.clone()` in Rust**:

- Many functions clone entire vectors/hashmaps
- `with_*_engine` pattern always locks, could use read locks

**Potential optimizations**:

- Use `RwLock` instead of `Mutex` for read-heavy state
- Avoid cloning mappings on every access
- Consider `Arc<str>` for frequently-cloned strings

---

## Cleanup Plan

### Phase 1: JSDoc Removal & Terminology Migration (Low-Medium Risk)

**Estimated effort**: 3-4 hours

#### 1.1 Remove JSDoc from TypeScript

- [ ] Remove JSDoc comments from all `src/inputs/*.ts` files
- [ ] Remove JSDoc comments from all `src/components/**/*.tsx` files
- [ ] Remove JSDoc comments from all `src/scenes/*.ts` files
- [ ] Remove JSDoc comments from `src/controls/useParameterStore.ts`
- [ ] Remove JSDoc comments from `src/sketches/*.ts` files
- [ ] Keep only essential inline comments (explain _why_, not _what_)

#### 1.2 Migrate "Scene" → "Sketch/Slot" terminology

**TypeScript renames**:

- [ ] `src/scenes/sceneTypes.ts` → `src/slots/slotTypes.ts`
- [ ] `src/scenes/useSceneSlots.ts` → `src/slots/useSlots.ts`
- [ ] Update all imports referencing these files
- [ ] Rename component folder: `src/components/SceneColumn` → `src/components/SlotColumn`
- [ ] Rename component folder: `src/components/SceneParameterControls` → `src/components/SlotParameterControls`
- [ ] Rename component folder: `src/components/ScenesArea` → `src/components/SlotsArea`
- [ ] Update `src/components/index.ts` exports
- [ ] Update all component usages in `App.tsx`

**Rust renames**:

- [ ] Rename function `set_scene_pairing` → remove (use `set_slot_pairing` only)
- [ ] Remove event `scene_pairing_changed` (use `slot_pairing_changed` only)
- [ ] Update `lib.rs` function parameter names (`scene_id` → `sketch_id`)
- [ ] Remove legacy mappings in `get_sketch_defaults()` (`sceneA`, `sceneB`, `sceneC`)

**TypeScript cleanup**:

- [ ] Remove `LEGACY_SKETCH_ID_MAP` from `src/sketches/index.ts`
- [ ] Remove `resolveSketchId()` function if only used for legacy
- [ ] Search for any remaining "scene" references and update

### Phase 2: TypeScript Refactoring (Medium Risk)

**Estimated effort**: 4-6 hours

#### 2.1 Create shared hook infrastructure

- [ ] Create `src/inputs/shared/types.ts` - Common types
- [ ] Create `src/inputs/shared/useDevices.ts` - Generic device hook factory
- [ ] Create `src/inputs/shared/useMappings.ts` - Generic mapping hook factory
- [ ] Create `src/inputs/shared/index.ts` - Re-exports

#### 2.2 Refactor existing hooks to use shared infrastructure

- [ ] Refactor `midi.ts` to use shared patterns
- [ ] Refactor `audio.ts` to use shared patterns
- [ ] Refactor `osc.ts` to use shared patterns
- [ ] Refactor `hid.ts` to use shared patterns
- [ ] Refactor `modulation.ts` to use shared patterns

### Phase 3: Rust Module Refactoring (Higher Risk)

**Estimated effort**: 8-12 hours

#### 3.1 Create shared module infrastructure

- [ ] Create `src-tauri/src/common/mod.rs`
- [ ] Create `src-tauri/src/common/persistence.rs` - JSON I/O helpers
- [ ] Create `src-tauri/src/common/events.rs` - Event emission helpers
- [ ] Create `src-tauri/src/common/device_watcher.rs` - Polling helpers
- [ ] Update `src-tauri/src/lib.rs` to include `mod common`

#### 3.2 Split midi.rs into submodules

- [ ] Create `src-tauri/src/midi/` directory
- [ ] Create `src-tauri/src/midi/mod.rs` - Public API, re-exports
- [ ] Extract constants → `midi/constants.rs`
- [ ] Extract types/structs → `midi/types.rs`
- [ ] Extract device management → `midi/devices.rs`
- [ ] Extract connections → `midi/connections.rs`
- [ ] Extract Midimix logic → `midi/midimix.rs`
- [ ] Extract MIDI Learn → `midi/learn.rs`
- [ ] Extract mappings → `midi/mappings.rs`
- [ ] Keep core engine in `midi/engine.rs`
- [ ] Move Tauri commands to `midi/commands.rs`
- [ ] Update `lib.rs` to use `mod midi` instead of single file
- [ ] Verify all public exports work correctly

#### 3.3 Apply similar structure to other large modules (if beneficial)

- [ ] Evaluate `audio.rs` for splitting
- [ ] Evaluate `hid.rs` for splitting
- [ ] Apply common utilities where helpful

### Phase 4: Testing Infrastructure (Medium Risk)

**Estimated effort**: 6-8 hours

#### 4.1 Rust tests

- [ ] Add tests for LFO calculations (`modulation.rs`)
- [ ] Add tests for beat detection (`audio.rs`)
- [ ] Add tests for MIDI message parsing (`midi.rs`)
- [ ] Add tests for parameter interpolation (`lib.rs`)
- [ ] Add tests for mapping persistence

#### 4.2 Frontend tests

- [ ] Set up vitest configuration
- [ ] Add tests for `useParameterStore`
- [ ] Add tests for `useSlots` (renamed from useSceneSlots)
- [ ] Add tests for utility functions in `slotTypes.ts`
- [ ] Add component tests for key UI components

### Phase 5: Performance & Memory (Lower Priority)

**Estimated effort**: 4-6 hours

- [ ] Audit and reduce `.clone()` usage in Rust
- [ ] Consider `RwLock` for read-heavy state
- [ ] Profile hot paths (parameter tick loop)
- [ ] Review allocations in audio analysis

---

## Detailed File Changes

### Phase 1 Changes

#### Files to rename:

```
src/scenes/sceneTypes.ts → src/slots/slotTypes.ts
src/scenes/useSceneSlots.ts → src/slots/useSlots.ts
src/components/SceneColumn/ → src/components/SlotColumn/
src/components/SceneParameterControls/ → src/components/SlotParameterControls/
src/components/ScenesArea/ → src/components/SlotsArea/
```

#### Rust code to remove in `lib.rs`:

```rust
// Remove from get_sketch_defaults():
"sceneA" => vec![...],
"sceneB" => vec![...],
"sceneC" => vec![...],

// Remove function if redundant:
fn set_scene_pairing(...) // Keep only set_slot_pairing
```

#### TypeScript code to remove in `sketches/index.ts`:

```typescript
// Remove:
export const LEGACY_SKETCH_ID_MAP: Record<string, SketchId> = {
  sceneA: "blueCube",
  sceneB: "orangeCube",
  sceneC: "greenPulse",
};

export function resolveSketchId(idOrLegacy: string): SketchId | undefined {
  // Remove if only used for legacy
}
```

### Phase 2 Changes

#### New file: `src/inputs/shared/types.ts`

```typescript
export interface DeviceHookConfig<TDevice> {
  listDevicesCommand: string;
  connectCommand: string;
  disconnectCommand: string;
  devicesChangedEvent: string;
}

export interface DeviceHookResult<TDevice> {
  devices: TDevice[];
  isLoading: boolean;
  error: string | null;
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface MappingHookConfig<TMapping> {
  getMappingsCommand: string;
  addMappingCommand: string;
  removeMappingCommand: string;
  mappingsChangedEvent: string;
}
```

### Phase 3 Changes

#### New file: `src-tauri/src/common/mod.rs`

```rust
//! Common utilities shared across input modules.

pub mod events;
pub mod persistence;
```

#### New file: `src-tauri/src/common/persistence.rs`

```rust
//! JSON file persistence helpers.

use std::path::PathBuf;
use serde::{Serialize, de::DeserializeOwned};

pub fn config_path(filename: &str) -> Option<PathBuf> { ... }
pub fn load_json<T: DeserializeOwned>(filename: &str) -> Option<T> { ... }
pub fn save_json<T: Serialize>(filename: &str, data: &T) -> Result<(), String> { ... }
```

#### Refactored: `src-tauri/src/midi/mod.rs`

```rust
//! MIDI Input/Output Engine

mod commands;
mod connections;
mod constants;
mod devices;
mod engine;
mod learn;
mod mappings;
mod midimix;
mod types;

pub use commands::*;
pub use engine::{init_midi_engine, cleanup_midi};
pub use types::*;
```

---

## Success Criteria

After cleanup, the codebase should:

1. **No file exceeds 500-700 lines** (from current 2,733 max)
2. **No JSDoc comments** - rely on TypeScript types
3. **Consistent terminology** - "sketch" for visual programs, "slot" for containers
4. **No legacy code** - removed scene mappings
5. **Reduced duplication** - shared patterns extracted
6. **Test coverage** for critical paths:
   - LFO calculations
   - Beat detection
   - Parameter interpolation
   - Mapping persistence
7. **Cleaner imports** - shared types from common locations

---

## Progress Tracking

### Phase 1: JSDoc Removal & Terminology Migration

- [ ] Remove JSDoc from TypeScript files
- [ ] Rename scene → slot/sketch
- [ ] Remove legacy mappings
- [ ] Update all imports and references

### Phase 2: TypeScript Refactoring

- [ ] Shared hook infrastructure
- [ ] Hook refactoring
- [ ] File organization

### Phase 3: Rust Module Refactoring

- [ ] Common utilities
- [ ] midi.rs split
- [ ] Other module cleanup

### Phase 4: Testing

- [ ] Rust unit tests
- [ ] Frontend tests
- [ ] Test infrastructure

### Phase 5: Performance

- [ ] Clone audit
- [ ] Lock optimization
- [ ] Profiling

---

## Testing Your Changes

After each phase, verify:

1. **App starts correctly**: `npm run tauri dev`
2. **Both windows work**: Controls and Renderer
3. **Slots work**: Load sketches, crossfade between them
4. **MIDI works**: Connect a device, mappings apply
5. **Audio works**: Select input, see levels
6. **No console errors**: Check both windows

For Rust changes specifically:

```bash
cd src-tauri
cargo check      # Compile check
cargo test       # Run tests
cargo clippy     # Lint check
```

---

## Notes

- Each phase can be done independently
- Phase 1 is lowest risk, good starting point
- Phase 3 (Rust refactoring) requires careful testing
- Consider creating feature branches for larger changes
- Run the app frequently to catch regressions early
