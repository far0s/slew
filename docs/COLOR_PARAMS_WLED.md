# Color Parameters, OSC Color Forwarding & WLED Integration

## Overview

Three-phase feature that promotes color from a static sketch config into a live, mappable parameter — then pipelines that live color state outward over OSC and, optionally, directly to WLED-controlled LED strips.

```
Sketch color param
      │
      ├─► Parameter store (R/G/B numeric values)
      │         │
      │         ├─► UI ColorPicker + MIDI-learn per channel
      │         ├─► Mod/LFO target (same as any numeric param)
      │         └─► Controller mapping (same slot)
      │
      ├─► OSC output  /slew/slot/{n}/color/{id}  r g b   (0–255 ints)
      │
      └─► WLED backend  HTTP JSON  →  ESP32  →  LED strips
```

---

## Phase 1 — Color Parameters in the Parameter System

### 1.1 Type changes (`src/sketches/types.ts`)

Add `"color"` to the `inputType` union on `ParameterTemplate`:

```ts
inputType?: "slider" | "select" | "color";
```

Color parameters carry no `min/max/step` themselves — those are implicit (0–255 per channel). Store the three channels as separate numeric parameters using a suffix convention:

| Logical param id        | Stored param ids                                    |
| ----------------------- | --------------------------------------------------- |
| `slot_0_color_primary`  | `slot_0_color_primary_r`, `_g`, `_b`               |

Add common color template IDs to `ParameterTemplateId`:

```ts
| "color_primary"
| "color_secondary"
| "color_bg"
```

### 1.2 Parameter store expansion (`src/slots/slotTypes.ts`)

`buildSlotDefaultParameters` and `buildSlotParameterDescriptors` need to detect `inputType === "color"` and expand each color template into three `SlotParameterDescriptor` entries (one per channel, 0–255, step 1).

`SlotParameterDescriptor` gains an optional `colorChannel?: "r" | "g" | "b"` and `colorGroup?: string` field so the UI can re-group R/G/B back into one row.

### 1.3 SketchProps wiring

`SketchProps.params` gains typed color entries (as `[r, g, b]` tuples):

```ts
color_primary?: [number, number, number];
color_secondary?: [number, number, number];
color_bg?: [number, number, number];
```

The slot runner reads the three numeric sub-params and packs them into the tuple before passing to the sketch component.

### 1.4 Sketch descriptor updates

Migrate `colorPalette` entries on existing sketches (Aura presets, etc.) to proper `color` parameters in their `descriptor.ts`. The static `colorPalette` field can remain for backward compat but should be treated as default values only.

### 1.5 UI — ColorPicker in parameter list

The slot parameter column currently renders `ParameterSlider` for every `SlotParameterDescriptor`. Add a branch:

- If `colorChannel === "r"` and it's the first channel of its group → render a single `ColorPicker` row that reads all three sub-params and writes all three on change.
- If `colorChannel === "g" | "b"` within a group → skip (already consumed by the picker above).

MIDI-learn: attach three separate `MidiLearnButton` instances (one per channel) in an expanded view, or support one "MIDI → H" mapping that drives hue when the user assigns a single knob.

---

## Phase 2 — OSC Color Forwarding

### 2.1 OscOutputConfig extension (`src/inputs/osc.ts` + `src-tauri/src/osc.rs`)

```ts
// TypeScript
interface OscOutputConfig {
  // ... existing fields ...
  forward_colors: boolean;   // emit RGB values for all color params
}
```

```rust
// Rust
pub struct OscOutputConfig {
    // ... existing fields ...
    pub forward_colors: bool,
}
```

### 2.2 Emit path

Address scheme:

```
/slew/slot/{slot_index}/color/{template_id}   r:Int  g:Int  b:Int
```

Examples:
```
/slew/slot/0/color/color_primary   255 80 0
/slew/slot/1/color/color_bg        0 0 20
```

**When to send**: Emit whenever a color sub-param changes (debounced, max 30 Hz) — not on every frame. Hook into the existing parameter-change event pipeline in the Rust backend.

New Rust function `send_osc_color(slot: usize, template_id: &str, r: u8, g: u8, b: u8)` mirrors the existing `send_osc_beat` / `send_osc_bpm` pattern.

### 2.3 UI

Add a "Forward colors" toggle to the OSC Output section of `OscPanel` alongside the existing beat/BPM toggles.

---

## Phase 3 — WLED Direct Control (Bonus)

### 3.1 WLED primer

WLED runs on an ESP32 and exposes a JSON HTTP API:

```
POST http://{ip}/json/state
Content-Type: application/json

{
  "seg": [
    { "id": 0, "col": [[255, 80, 0]] },
    { "id": 1, "col": [[0, 200, 150]] }
  ]
}
```

`col` is a list of up to three colors per segment (primary, secondary, tertiary).  
Rate limit: WLED recommends ≤ 25 updates/s.

### 3.2 Rust backend (`src-tauri/src/wled.rs`)

New module. Key items:

```rust
pub struct WledConfig {
    pub enabled: bool,
    pub ip: String,           // e.g. "192.168.1.42"
    pub port: u16,            // default 80
    pub mappings: Vec<WledSegmentMapping>,
}

pub struct WledSegmentMapping {
    pub segment_id: u8,
    pub slot_index: usize,
    pub template_id: String,   // e.g. "color_primary"
    pub color_index: u8,       // 0 = primary, 1 = secondary, 2 = tertiary
}
```

The backend:
1. Holds current per-segment color state.
2. On color param change: recompute the diff, batch-send a single JSON payload.
3. Uses `reqwest` (already a Tauri dep) for the HTTP POST.
4. Throttles to 25 Hz with a `Debouncer`.

Tauri commands: `set_wled_config`, `get_wled_config`, `test_wled_connection`.

### 3.3 UI — WLED Settings Panel

New collapsible section in Settings (or a dedicated WLED tab):

```
WLED
  ☑ Enabled
  IP Address: [ 192.168.1.42    ]  Port: [ 80 ]
  [ Test Connection ]  ● Connected

  Segment Mappings
  ┌──────────┬──────────────┬──────────────────┬─────────────┐
  │ Segment  │ Slot         │ Color param      │ Color index │
  ├──────────┼──────────────┼──────────────────┼─────────────┤
  │   0      │  Slot 1      │  color_primary   │  Primary    │
  │   1      │  Slot 1      │  color_secondary │  Primary    │
  └──────────┴──────────────┴──────────────────┴─────────────┘
  [ + Add mapping ]
```

### 3.4 TouchDesigner interop note

Since the setup currently routes WLED through TouchDesigner via E1.31, Phase 2 (OSC) already covers that path — TD can consume `/slew/slot/*/color/*` messages and forward to WLED or any other sink. Phase 3 (direct WLED) bypasses TD entirely. Both can coexist.

---

## Implementation Order

| Phase | Effort | Value                             |
| ----- | ------ | --------------------------------- |
| 1     | Large  | Unblocks everything else          |
| 2     | Small  | Immediate payoff, minimal new code|
| 3     | Medium | Replaces TD for LED routing       |

Recommended order: **1 → 2 → 3**.

Phase 1 is the largest chunk and the prerequisite. Phase 2 can be shipped independently of Phase 3. Phase 3 is the bonus / nice-to-have.

---

## Key Files

| File | Change |
|------|--------|
| `src/sketches/types.ts` | Add `"color"` to `inputType`, add color `ParameterTemplateId`s |
| `src/slots/slotTypes.ts` | Expand color params into R/G/B sub-params in build functions |
| `src/components/SlotColumn/` | Render `ColorPicker` for color-type params |
| `src/inputs/osc.ts` | Add `forward_colors` to `OscOutputConfig` |
| `src-tauri/src/osc.rs` | `send_osc_color`, update `OscOutputConfig` struct |
| `src-tauri/src/wled.rs` | New module — WLED HTTP client + config |
| `src-tauri/src/main.rs` | Register WLED Tauri commands |
| `src/components/OscPanel/` | Forward colors toggle |
| `src/components/Settings/` | WLED configuration panel |
| Sketch `descriptor.ts` files | Migrate `colorPalette` → color `ParameterTemplate` entries |
