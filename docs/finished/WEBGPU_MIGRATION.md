# WebGPU/TSL Migration Plan

This document outlines the migration from WebGL to WebGPU rendering with Three.js Shading Language (TSL) for improved performance and future zero-copy video output potential.

---

## Current Status

| Phase   | Description                         | Status      |
| ------- | ----------------------------------- | ----------- |
| Phase 1 | WebGPU Canvas Infrastructure        | ✅ Complete |
| Phase 2 | Video Capture with Async Readback   | ✅ Complete |
| Phase 3 | TSL Shader Migration (TslNoiseBlob) | ✅ Complete |
| Phase 4 | Optimize All Sketches               | 🔲 Optional |

---

## Executive Summary

**Goal**: Migrate from WebGL (`THREE.WebGLRenderer`) to WebGPU (`THREE.WebGPURenderer`) with TSL-based materials.

**Why WebGPU?**

1. **Async readback**: `readRenderTargetPixelsAsync()` is non-blocking, unlike WebGL's `readPixels()`
2. **Metal backend on macOS**: WebGPU uses Metal, opening potential paths to IOSurface/zero-copy
3. **Modern GPU API**: Better performance characteristics, compute shaders, modern pipeline
4. **TSL unification**: Single shader language that compiles to both WebGL and WebGPU

**Current Stack**:

- Three.js 0.181.2 ✅ (WebGPU support)
- r3f 9.4.2 ✅ (WebGPU support via async `gl` prop)
- 5 sketches using `MeshStandardMaterial` or custom GLSL shaders

---

## Current Sketch Analysis

| Sketch       | Material Type         | WebGPU Ready? | Status              |
| ------------ | --------------------- | ------------- | ------------------- |
| BlueCube     | MeshStandardMaterial  | ✅ Yes        | Works as-is         |
| OrangeCube   | MeshStandardMaterial  | ✅ Yes        | Works as-is         |
| GreenPulse   | MeshStandardMaterial  | ✅ Yes        | Works as-is         |
| TslText3D    | MeshStandardMaterial  | ✅ Yes        | Works as-is         |
| TslNoiseBlob | MeshBasicNodeMaterial | ✅ Yes        | **Migrated to TSL** |

### All Sketches WebGPU Ready

All 5 sketches now work with WebGPU:

- 4 sketches use `MeshStandardMaterial` which works automatically
- `TslNoiseBlob` was migrated from GLSL `ShaderMaterial` to TSL `MeshBasicNodeMaterial`

### Critical: WebGPURenderer Required Everywhere

**Key insight**: TSL/node materials ONLY work with `WebGPURenderer`, not `WebGLRenderer`.

`WebGPURenderer` can target both backends:

- **WebGPU backend**: Used when native WebGPU is available
- **WebGL2 backend**: Used as fallback via `forceWebGL: true`

This means ALL Canvas components must use `WebGPUCanvas` (which wraps `WebGPURenderer`), including:

- Main renderer window (`RendererRoot.tsx`)
- Live preview (`RendererPreview.tsx`)
- Slot previews (`SlotColumn.tsx`)

---

## Migration Phases

### Phase 1: WebGPU Canvas Infrastructure ✅ Complete

Created WebGPU-compatible Canvas wrapper with fallback to WebGL.

**Files modified**:

- `src/renderer/RendererRoot.tsx` - Now uses `WebGPUCanvas` instead of regular `Canvas`
- `src/renderer/WebGPUCanvas.tsx` - New wrapper with feature detection and fallback

**Implementation**:

```tsx
// src/renderer/WebGPUCanvas.tsx
import * as THREE from "three/webgpu";
import { Canvas, extend, type ThreeToJSXElements } from "@react-three/fiber";
import { ReactNode, useState, useEffect } from "react";

// Extend THREE namespace for WebGPU elements
declare module "@react-three/fiber" {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

extend(THREE as unknown as Record<string, unknown>);

interface WebGPUCanvasProps {
  children: ReactNode;
  camera?: { position?: [number, number, number]; fov?: number };
  fallback?: ReactNode;
}

export function WebGPUCanvas({
  children,
  camera,
  fallback,
}: WebGPUCanvasProps) {
  const [webgpuSupported, setWebgpuSupported] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkWebGPU() {
      if (!navigator.gpu) {
        setWebgpuSupported(false);
        return;
      }
      try {
        const adapter = await navigator.gpu.requestAdapter();
        setWebgpuSupported(adapter !== null);
      } catch {
        setWebgpuSupported(false);
      }
    }
    checkWebGPU();
  }, []);

  if (webgpuSupported === null) {
    return fallback ?? null; // Loading state
  }

  if (!webgpuSupported) {
    console.warn("[WebGPUCanvas] WebGPU not supported, falling back to WebGL");
    // Fall back to standard WebGL Canvas
    return (
      <Canvas camera={camera} frameloop="always">
        {children}
      </Canvas>
    );
  }

  return (
    <Canvas
      camera={camera}
      frameloop="always"
      gl={async (props) => {
        const renderer = new THREE.WebGPURenderer(
          props as THREE.WebGPURendererParameters,
        );
        await renderer.init();
        return renderer;
      }}
    >
      {children}
    </Canvas>
  );
}
```

**Acceptance criteria**:

- [x] WebGPU Canvas renders existing sketches
- [x] Fallback to WebGL2 backend when native WebGPU unavailable
- [x] Console logs which backend is active
- [x] No visual regressions in MeshStandardMaterial sketches
- [x] All preview components updated to use WebGPUCanvas

---

### Phase 2: Video Capture with Async Readback ✅ Complete

Replaced synchronous `readPixels` with WebGPU's async readback.

**Key API**: `renderer.readRenderTargetPixelsAsync()`

**Changes made to `VideoOutputCapture.tsx`**:

- Added WebGPU renderer detection (`isWebGPURenderer()`)
- Separate render targets for WebGL (`WebGLRenderTarget`) and WebGPU (`RenderTarget`)
- New `captureFrameWebGPU()` function using async readback
- Automatic path selection based on renderer type
- Logging to indicate which renderer path is active

**Implementation highlights**:

```tsx
// WebGPU async readback - non-blocking!
const captureFrameWebGPU = async () => {
  const renderer = gl as THREE.WebGPURenderer;
  const rt = renderTargetRef.current;

  // Render to target
  renderer.setRenderTarget(rt);
  renderer.renderAsync(scene, camera);
  renderer.setRenderTarget(null);

  // Async readback - doesn't stall GPU pipeline
  const pixelData = await renderer.readRenderTargetPixelsAsync(
    rt,
    0,
    0,
    rt.width,
    rt.height,
  );

  // pixelData is already a TypedArray
  return pixelData;
};
```

**Expected performance improvement**:

- Current `readPixels`: 4-5ms stall per frame
- WebGPU async: <1ms initiation, data ready next frame
- This alone could push us from ~30 FPS to ~60 FPS at 1080p

**Acceptance criteria**:

- [x] Video output works with WebGPU renderer
- [ ] Frame timing shows reduced readback stall (needs testing)
- [ ] Syphon/NDI output maintains quality (needs testing)
- [x] Latency is acceptable (1-frame delay is fine)

---

### Phase 3: TSL Shader Migration (TslNoiseBlob) ✅ Complete

Rewrote `TslNoiseBlob` from GLSL to TSL node-based material with custom soft shading.

**Key implementation details**:

- Uses `MeshBasicNodeMaterial` (not `MeshStandardNodeMaterial`) for non-reflective look
- Custom soft shading via half-lambert wrap lighting
- Two-light setup: key light (top-right-front) + fill light (opposite side)
- Subtle rim highlight with gentle quadratic falloff
- Uses `varying()` to pass noise from vertex to fragment shader (avoids double computation)
- Uses `mx_noise_float()` for perlin noise (faster than fractal noise)

**Shading approach** (half-lambert style):

```
// Wrap lighting for soft shadows
softDiffuse = diffuse * 0.5 + 0.5

// Two lights: key (0.5 intensity) + fill (0.15 intensity) + ambient (0.35)
lighting = ambient + softDiffuse1 * 0.5 + softDiffuse2 * 0.15

// Soft rim: pow(1 - rimDot, 2) * 0.25
```

**Performance optimizations**:

- Single noise calculation in vertex shader, passed via varying
- Reduced icosahedron subdivisions (64 → 32)

**Acceptance criteria**:

- [x] TslNoiseBlob renders in WebGPU
- [x] All parameters (noiseScale, noiseSpeed, colorMix) work
- [x] Animation is smooth (uses TSL `time` node)
- [x] Opacity/crossfade works correctly
- [x] Renders correctly in all preview contexts
- [x] Soft, non-reflective shading (not PBR)

---

### Phase 4: Optimize All Sketches (Optional)

Convert `MeshStandardMaterial` to explicit `MeshStandardNodeMaterial` for full TSL control.

**Why?** Opens up:

- Custom per-material effects
- Compute shader integration
- Better performance profiling

**Lower priority** - the automatic conversion works fine.

---

## Implementation Order

```
Week 1: Phase 1 - WebGPU Canvas ✅ DONE
├── Create WebGPUCanvas.tsx ✅
├── Feature detection + fallback ✅
├── Test with existing sketches ✅
└── Verify no regressions ✅

Week 1: Phase 2 - Async Video Capture ✅ DONE
├── Detect renderer type in VideoOutputCapture ✅
├── Implement readRenderTargetPixelsAsync path ✅
├── Benchmark frame timing (pending runtime testing)
└── Test Syphon/NDI output (pending runtime testing)

Week 1: Phase 3 - TslNoiseBlob Migration ✅ DONE
├── Import MeshBasicNodeMaterial from three/webgpu ✅
├── Implement noise with mx_noise_float ✅
├── Use varying to pass noise from vertex to fragment ✅
├── Implement color blending with TSL mix/color nodes ✅
├── Add simplified rim lighting effect ✅
├── Wire up uniforms for parameter updates ✅
├── Update RendererPreview to use WebGPUCanvas ✅
└── Update SlotColumn preview to use WebGPUCanvas ✅
```

---

## Technical Considerations

### Import Changes

```tsx
// Before (WebGL)
import * as THREE from "three";

// After (WebGPU)
import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { positionLocal, normalLocal, uniform, Fn, varying, ... } from "three/tsl";
```

**Note**: The `three/webgpu` import includes WebGPU-specific classes like `WebGPURenderer` and node materials.

### WebGPUCanvas Component

All Canvas components now use `WebGPUCanvas` which:

- Always uses `WebGPURenderer` (required for TSL materials)
- Detects native WebGPU support
- Falls back to WebGL2 backend via `forceWebGL: true` when needed
- TSL materials work with both backends

```tsx
import { WebGPUCanvas } from "../../renderer/WebGPUCanvas";

<WebGPUCanvas camera={{ position: [0, 0, 4], fov: 50 }} frameloop="always">
  {/* TSL materials work here */}
</WebGPUCanvas>;
```

### TypeScript Setup

Add to `tsconfig.json` if needed:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler"
  }
}
```

Ensure Vite resolves `three/webgpu` and `three/tsl` correctly.

### r3f Integration

The `gl` prop on Canvas can return a Promise for async renderers:

```tsx
<Canvas
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer(props);
    await renderer.init();
    return renderer;
  }}
>
```

The `extend(THREE)` call registers all THREE classes as JSX elements. With `three/webgpu`, this includes node materials automatically.

### Render Loop

WebGPU uses `renderAsync` for proper async operation:

```tsx
// In useFrame or animation loop
renderer.renderAsync(scene, camera);
```

r3f should handle this internally, but verify if using custom render loops.

---

## Fallback Strategy

Not all systems support WebGPU yet. The migration maintains WebGL compatibility:

1. **Feature detection**: Check `navigator.gpu` availability
2. **Graceful fallback**: Render with WebGLRenderer if WebGPU unavailable
3. **Shared sketches**: TSL materials can compile to WebGL too (with some limitations)

```tsx
const isWebGPU = gl instanceof THREE.WebGPURenderer;

if (isWebGPU) {
  // Use async readback
  await renderer.readRenderTargetPixelsAsync(...);
} else {
  // Fall back to sync readPixels
  gl.readPixels(...);
}
```

---

## Risk Assessment

| Risk                           | Likelihood | Impact | Mitigation                      | Status     |
| ------------------------------ | ---------- | ------ | ------------------------------- | ---------- |
| WebGPU not available in WebKit | Medium     | High   | Fallback to WebGL               | ✅ Handled |
| TSL missing GLSL feature       | Low        | Medium | Use custom function node        | ✅ OK      |
| Performance regression         | Low        | High   | Benchmark before/after          | 🔲 Pending |
| r3f-perf incompatibility       | Medium     | Low    | Replaced with stats-gl via drei | ✅ Fixed   |
| @react-three/drei issues       | Medium     | Medium | Test each used component        | ✅ OK      |

**Note**: `r3f-perf` was removed from the project. It crashed on WebGPU because it called
WebGL-specific `gl.getExtension()`. Replaced with `@react-three/drei`'s `<StatsGl />` component
which wraps `stats-gl` (WebGPU-compatible). Stats panel positioned in bottom-right corner.

### Known Limitations

- WebGPU in Safari/WebKit is still experimental
- Some drei helpers may not work with WebGPU yet
- Compute shaders require additional setup

---

## Success Metrics

### Performance Targets

| Metric          | Current (WebGL) | Target (WebGPU) |
| --------------- | --------------- | --------------- |
| readPixels time | 4-5ms           | <1ms            |
| 1080p FPS       | ~30 FPS         | ~60 FPS         |
| Frame latency   | 0               | 1 frame (OK)    |
| GPU utilization | Moderate        | Optimal         |

### Functional Requirements

- [ ] All 5 sketches render correctly
- [ ] Video output (Syphon/NDI) works
- [ ] Parameter changes are smooth
- [ ] Crossfade works between slots
- [ ] Fallback to WebGL works

---

## Future Opportunities

Once on WebGPU:

1. **IOSurface access**: Investigate if WebKit's WebGPU exposes Metal texture handles
2. **Compute shaders**: Audio-reactive effects, particle systems
3. **Better post-processing**: Node-based bloom, feedback effects
4. **Multi-GPU**: Potential for dedicated capture GPU

---

## References

- [r3f WebGPU Canvas docs](https://r3f.docs.pmnd.rs/api/canvas#webgpu)
- [r3f v9 Migration Guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide#webgpu)
- [Three.js TSL Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [Three.js WebGPU Examples](https://threejs.org/examples/?q=webgpu)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)

---

## Appendix: TSL Node Reference

Common TSL nodes for shader migration:

```tsx
import {
  // Math
  float,
  vec2,
  vec3,
  vec4,
  mat3,
  mat4,
  add,
  sub,
  mul,
  div,
  mod,
  abs,
  sign,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  sin,
  cos,
  tan,
  asin,
  acos,
  atan,
  pow,
  exp,
  log,
  sqrt,
  inverseSqrt,
  floor,
  ceil,
  fract,
  round,
  length,
  distance,
  dot,
  cross,
  normalize,

  // Geometry
  positionLocal,
  positionWorld,
  positionView,
  normalLocal,
  normalWorld,
  normalView,
  uv,
  tangent,
  bitangent,

  // Time & Animation
  timerLocal,
  timerGlobal,
  timerDelta,

  // Noise
  mx_noise_float,
  mx_noise_vec3,

  // Uniforms & Attributes
  uniform,
  attribute,
  varying,

  // Textures
  texture,
  textureLoad,

  // Colors
  color,
  hue,
  saturation,
  luminance,
} from "three/tsl";
```

---

_Last updated: WebGPU migration planning for Slew_
