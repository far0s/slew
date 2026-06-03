# Creating Sketches

A sketch is a React Three Fiber component paired with a descriptor that defines its parameters. This guide walks through creating a sketch from scratch, using BlueCube as the reference example.

---

## File Structure

Each sketch lives in its own folder under `src/sketches/<Group>/<SketchName>/`:

```
src/sketches/Examples/BlueCube/
├── descriptor.ts   ← metadata + parameter definitions
└── index.tsx       ← React component
```

---

## Step 1: Write the Descriptor

The descriptor is the single source of truth for a sketch's identity and parameters.

```ts
// src/sketches/Examples/MySketch/descriptor.ts
import type { SketchDescriptor } from "@/sketches/types";

export const descriptor: SketchDescriptor = {
  id: "mySketch",           // camelCase, unique across all sketches
  label: "My Sketch",       // shown in the picker
  shortLabel: "My",         // shown in small slot headers
  description: "What it does, one sentence.",
  parameters: [
    {
      templateId: "speed",  // snake_case — becomes props.params.speed
      label: "Speed",
      group: "sketch",      // "sketch" | "transition" | "global"
      orderHint: 10,        // display order in UI (lower = higher up)
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1,
      color: "indigo",      // slider accent colour
      description: "Animation speed.",
    },
  ],
};
```

### Parameter Types

The default `inputType` is `"slider"`. Other options:

| `inputType` | Description |
|-------------|-------------|
| `"slider"` | Standard numeric slider (default) |
| `"color"` | RGB colour picker — use `defaultColorValue: [r, g, b]` (0–255) |
| `"select"` | Dropdown — requires `options: [{ value, label }, ...]` |
| `"toggle"` | Boolean on/off — value is 0 or 1 |
| `"integer"` | Whole-number slider |
| `"image"` | Image input (e.g. texture upload) |

### Slider Colours

`color` sets the accent on the knob/slider in the UI. Available: `"emerald"` `"indigo"` `"cyan"` `"amber"` `"rose"` `"violet"` `"lime"` `"orange"` `"sky"` `"fuchsia"`.

### Units

Add `unit: "%"` or `unit: "°"` to parameters where it aids readability.

---

## Step 2: Write the Component

The component receives `opacity`, `params`, and optional `setOpacityOverride` via `SketchProps`.

```tsx
// src/sketches/Examples/MySketch/index.tsx
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

export { descriptor };

export function MySketch({ opacity, params }: SketchProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Read params with defaults — templateId "speed" → camelCase "speed"
  const speed = params?.speed ?? 1;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const dt = Math.min(delta, 1 / 30); // clamp to avoid jumps on tab focus
    meshRef.current.rotation.y += speed * dt;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#38bdf8"
        transparent
        opacity={opacity}   // always wire up — controls crossfade
      />
    </mesh>
  );
}

export default MySketch;
```

### `SketchProps` reference

| Prop | Type | Description |
|------|------|-------------|
| `opacity` | `number` | Current crossfade/alpha value (0–1). Wire into material `opacity`. |
| `params` | `Partial<Record<string, number>>` | Parameter values keyed by camelCase templateId. |
| `colors` | `{ startColor?, midColor?, endColor?, background? }` | Optional palette from descriptor `colorPalette`. |
| `setOpacityOverride` | `(fn) => void` | Call once on mount if you need direct opacity override for preview capture. |

### `templateId` → props key conversion

`templateId` is `snake_case`. Slew converts it to `camelCase` automatically when passing into `params`:

| `templateId` | `params` key |
|---|---|
| `speed` | `params.speed` |
| `rotation_speed` | `params.rotationSpeed` |
| `color_bg` | `params.colorBg` |

---

## Step 3: Register the Sketch

### 3a. Add to group `index.ts`

```ts
// src/sketches/Examples/index.ts
import { descriptor as mySketchDescriptor } from "./MySketch/descriptor";

export const examplesGroup: SketchGroup = {
  id: "examples",
  label: "Examples",
  sketches: [
    blueCubeDescriptor,
    // ...
    mySketchDescriptor,  // ← add here
  ],
};
```

### 3b. Add lazy component to `LazySketchRegistry.tsx`

```ts
// src/sketches/LazySketchRegistry.tsx

const LazyMySketch = lazy(() =>
  import("./Examples/MySketch").then((m) => ({ default: m.MySketch })),
);

// In LAZY_SKETCH_REGISTRY object:
export const LAZY_SKETCH_REGISTRY = {
  // ...existing entries...
  mySketch: LazyMySketch,
};
```

The registry key must exactly match the descriptor `id`.

---

## Step 4: Add a Thumbnail

Thumbnails show in the sketch picker. Place a PNG at:

```
src/assets/sketches/my-sketch-thumb.png
```

Recommended size: **200×150px**. Import it in the descriptor:

```ts
import thumbnail from "@/assets/sketches/my-sketch-thumb.png";

export const descriptor: SketchDescriptor = {
  thumbnail,
  // ...
};
```

---

## Using TSL (Three Shading Language)

For GPU shaders, use Three.js TSL — it compiles to WebGPU (WGSL) with WebGL2 fallback.

```tsx
import {
  Fn, uniform, positionLocal, vec3, float, time, mix, color,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

// Create uniforms that update from params:
const uSpeed = uniform(1.0);

// In component, update uniforms in useFrame:
useFrame((_, delta) => {
  uSpeed.value = speed;
});
```

See `TslNoiseBlob` and `TslText3D` in `src/sketches/Examples/` for full TSL examples.

**TSL tips:**
- Always use `MeshBasicNodeMaterial` or `MeshStandardNodeMaterial` (not the legacy materials)
- Wire `opacity` via a `uniform` if using TSL — `materialRef.current.opacity` won't work
- `time` is a built-in TSL node — no need to pass elapsed time manually

---

## Color Palettes

To add palette support (start/mid/end colour pickers in the slot):

```ts
// In descriptor.ts
colorPalette: {
  startColor: [56, 189, 248],   // RGB 0-255, shown as default
  midColor: [99, 102, 241],
  endColor: [34, 197, 94],
  background: [0, 0, 0, 255],   // RGBA
},
```

Access in component via `colors` prop:

```tsx
export function MySketch({ opacity, params, colors }: SketchProps) {
  const startColor = colors?.startColor ?? [56, 189, 248];
  // Convert 0-255 to 0-1 for Three.js:
  const threeColor = new THREE.Color(
    startColor[0] / 255,
    startColor[1] / 255,
    startColor[2] / 255,
  );
}
```

---

## Dynamic Color Ranges

If your sketch supports a variable number of colored items (e.g. N bars, each with its own color):

```ts
// In descriptor.ts
dynamicColorRange: {
  linkedParam: "count",      // parameter that controls the count
  itemPrefix: "color_item_", // items are "color_item_1", "color_item_2", etc.
},
```

The UI will show/hide color pickers based on the current `count` value.

---

## Checklist

- [ ] `id` is unique and matches the `LAZY_SKETCH_REGISTRY` key exactly
- [ ] `shortLabel` fits in ~6 characters
- [ ] `opacity` is wired into the material
- [ ] `delta` is clamped in `useFrame` (prevents jumps on tab focus)
- [ ] All `params` have fallback defaults (`params?.foo ?? defaultValue`)
- [ ] Thumbnail added at `src/assets/sketches/`
- [ ] Sketch added to group `index.ts`
- [ ] Lazy entry added to `LazySketchRegistry.tsx`
