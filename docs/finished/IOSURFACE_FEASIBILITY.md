# IOSurface Feasibility Research

## Executive Summary

**Verdict: High complexity, uncertain feasibility for the WebView/Tauri architecture**

IOSurface is Apple's cross-process GPU texture sharing mechanism on macOS. While Syphon is built on IOSurface and supports it natively, the challenge lies in **accessing WebGL textures from WKWebView as IOSurfaces** — which is not publicly supported.

| Aspect                         | Assessment                                     |
| ------------------------------ | ---------------------------------------------- |
| **Potential Performance Gain** | Very High (~10× improvement possible)          |
| **Technical Feasibility**      | Low-Medium (relies on undocumented behavior)   |
| **Implementation Complexity**  | Very High                                      |
| **Maintenance Risk**           | High (private APIs, macOS version sensitivity) |
| **Time Estimate**              | 2-4 weeks exploration + unknown unknowns       |

---

## What is IOSurface?

IOSurface is a macOS framework for sharing GPU-backed image buffers between processes without copying pixel data. Key characteristics:

- **Zero-copy**: Surfaces exist in GPU memory and are shared via Mach ports
- **Cross-process**: Can be shared between any processes on the system
- **GPU-native**: Metal, OpenGL, and Core Graphics can all work with IOSurfaces
- **Reference-counted**: Safe sharing with automatic cleanup

### How Syphon Uses IOSurface

Syphon is built entirely on IOSurface:

1. **Server** creates an IOSurface and renders/copies its texture content to it
2. **Server** publishes the IOSurface ID (a 32-bit integer) via distributed notifications
3. **Client** looks up the IOSurface by ID using `IOSurfaceLookup()`
4. **Client** binds the IOSurface to its own OpenGL/Metal texture
5. **Both** access the same GPU memory — zero copies

From `SyphonIOSurfaceImageCore.m`:

```objc
// Server side: create IOSurface-backed texture
IOSurfaceRef surface = IOSurfaceCreate(properties);
CVOpenGLTextureCacheCreateTextureFromImage(..., surface, &texture);

// Client side: look up by ID
IOSurfaceRef surface = IOSurfaceLookup(surfaceID);
```

---

## Current Architecture & Bottlenecks

### Current Pipeline

```
WebGL Canvas (GPU)
       │
       ▼
gl.readPixels() ─────────── 4-5ms (GPU→CPU sync stall)
       │
       ▼
Uint8Array (CPU)
       │
       ▼
Binary IPC ───────────────── 25-30ms (Tauri invoke, memcpy)
       │
       ▼
Rust Backend (CPU)
       │
       ▼
glTexSubImage2D() ─────────── 0.5ms (CPU→GPU upload)
       │
       ▼
Syphon publishFrameTexture ── 0.5ms
```

**Total: ~30-40ms per frame = ~25-30 FPS ceiling**

### Ideal IOSurface Pipeline

```
WebGL Canvas (GPU)
       │
       ▼
Get IOSurface handle ─────── 0.01ms (just retrieve a pointer)
       │
       ▼
invoke("publish_iosurface", {id}) ── 0.1ms (tiny IPC)
       │
       ▼
Syphon publish from IOSurface ─── 0.5ms (GPU→GPU, no copy)
```

**Total: ~0.6ms per frame = 1000+ FPS theoretically possible**

---

## Technical Analysis

### Challenge 1: Accessing WebGL Texture as IOSurface

**The core problem**: WebGL textures in WKWebView are managed internally by WebKit. There is no public API to get the underlying IOSurface.

#### What We Know

1. **WKWebView uses IOSurface internally**: WebKit's GPU process uses IOSurface for compositing layers. This is how Safari achieves efficient rendering.

2. **CALayer can expose IOSurface**: `CALayer` has a private property `_contentsIOSurface` that can return the backing IOSurface, but:
   - It's a private API (App Store rejection risk)
   - It gives you the **composited** layer, not individual WebGL textures
   - The IOSurface may be the entire WebView contents, not just the canvas

3. **No public WebGL→IOSurface bridge**: Unlike on iOS where `CVPixelBuffer` can back a WebGL texture in some contexts, macOS WebKit doesn't expose this.

#### Potential Approaches

**Approach A: CALayer Capture (Compositor Level)**

```objc
// PRIVATE API - would capture entire WebView
CALayer *webViewLayer = wkWebView.layer;
IOSurfaceRef surface = (__bridge IOSurfaceRef)[webViewLayer valueForKey:@"contentsIOSurface"];
```

**Pros:**

- Might work without modifying WebGL code
- Gets final composited output

**Cons:**

- Private API (App Store rejection)
- Captures entire WebView, not just the canvas
- May include UI elements, overlays
- Timing/synchronization unclear
- No control over when frame is "ready"

**Approach B: OffscreenCanvas + transferToImageBitmap**

WebGL2 `OffscreenCanvas` and `transferToImageBitmap()` are designed for efficient image transfer, but:

- Still requires `readPixels` or similar under the hood
- No direct IOSurface exposure
- Doesn't solve the fundamental problem

**Approach C: Native Metal Rendering (Replace WebGL)**

Abandon WebGL entirely and render directly with Metal:

```
Scene Data (JSON/binary) ──► Native Metal Renderer ──► IOSurface ──► Syphon
```

**Pros:**

- Full control over IOSurface
- Maximum performance possible
- Clean architecture

**Cons:**

- Massive rewrite (lose all Three.js/r3f benefits)
- Would need to reimplement all shaders in Metal
- Loses web dev velocity
- Different skill set required

**Approach D: WebGPU Future**

When react-three-fiber supports WebGPU:

- WebGPU on macOS uses Metal underneath
- `GPUTexture` might expose Metal texture handle
- Metal textures can be created from IOSurface
- Still speculative — no confirmed API for this

### Challenge 2: Rust/Tauri Integration

Even if we could get an IOSurface handle from WebView, we'd need to:

1. **Get the IOSurface ID from JavaScript**: No standard API; would need native bridge
2. **Pass it to Rust**: Just a 32-bit integer, trivial once we have it
3. **Create Metal/OpenGL texture from IOSurface in Rust**: Possible with `objc` crate and Metal bindings

```rust
// Hypothetical Rust code
extern "C" {
    fn IOSurfaceLookup(csid: u32) -> *mut c_void;
}

fn publish_from_iosurface(surface_id: u32) -> Result<(), String> {
    unsafe {
        let surface = IOSurfaceLookup(surface_id);
        if surface.is_null() {
            return Err("Failed to lookup IOSurface".into());
        }

        // Bind to OpenGL texture
        let texture = create_texture_from_iosurface(surface);

        // Publish to Syphon
        syphon_server.publish_frame_texture(texture, ...);
    }
}
```

### Challenge 3: SyphonMetalServer

Your current implementation uses `SyphonOpenGLServer`. There's also `SyphonMetalServer` which is more modern:

```objc
// Metal-based publishing (from Syphon-Framework)
- (void)publishFrameTexture:(id<MTLTexture>)texture
              commandBuffer:(id<MTLCommandBuffer>)commandBuffer
                imageRegion:(NSRect)region
                    flipped:(BOOL)isFlipped;

// Alternative: publish directly from IOSurface
- (void)publishSurface:(IOSurfaceRef)surface
```

Using `SyphonMetalServer` would be cleaner if we're working with IOSurface, since:

- Metal natively supports IOSurface-backed textures
- Avoids OpenGL deprecation concerns
- Better performance on Apple Silicon

---

## Alternative Approaches to Consider

Before investing in IOSurface, consider these intermediate optimizations:

### 1. Shared Memory IPC (Medium Complexity)

Instead of Tauri's binary invoke (which still copies), use true shared memory:

```
WebGL → readPixels → SharedArrayBuffer/mmap → Rust reads directly
```

**Benefits:**

- Eliminates IPC copy (~25ms savings)
- Well-documented approach
- No private APIs

**Implementation:**

- Create memory-mapped file in Rust
- Map it in JavaScript via WebAssembly or custom Tauri plugin
- Frontend writes pixels, signals Rust
- Rust reads directly from shared memory

### 2. PBO Async Readback (Lower Complexity)

Reduce `readPixels` stall with ping-pong buffers:

```javascript
// Frame N: Start async readback
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo1);
gl.readPixels(...); // Returns immediately, async DMA

// Frame N+1: Read from previous PBO (now complete)
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo0);
const data = gl.getBufferSubData(...); // Fast, no stall
```

**Benefits:**

- Hides GPU→CPU latency
- 1-frame latency, but smooth framerate
- Standard WebGL2 APIs

### 3. Resolution Scaling + Upscaling

Current capture at `scale=0.5` (~540p) performs reasonably well. Consider:

- Keep capture at 540p or 720p
- Use GPU upscaling on Syphon client side
- Most VJ apps (Resolume, VDMX) can upscale

---

## Estimated Implementation Effort

| Approach                        | Effort     | Risk      | Potential Gain |
| ------------------------------- | ---------- | --------- | -------------- |
| Shared Memory IPC               | 1-2 weeks  | Low       | 40-60%         |
| PBO Async Readback              | 3-5 days   | Low       | 20-30%         |
| CALayer IOSurface (private API) | 2-4 weeks  | Very High | 90%+           |
| Native Metal Renderer           | 2-3 months | Medium    | 95%+           |
| Wait for WebGPU                 | Unknown    | Low       | Unknown        |

---

## Recommendations

### Short-term (Next Sprint)

1. **Implement shared memory IPC** — eliminates the ~25ms IPC copy
2. **Add PBO async readback** — reduces readPixels stall
3. **Expected result**: ~60 FPS at 720p, ~45 FPS at 1080p

### Medium-term (If Still Needed)

4. **Prototype CALayer IOSurface capture** — test if it even works
   - Create a test app outside App Store constraints
   - Evaluate quality, timing, and reliability
   - If successful, decide if private API risk is acceptable

### Long-term

5. **Monitor WebGPU r3f support** — cleanest path to true zero-copy
6. **Consider native renderer** — only if VJ performance becomes critical selling point

---

## Research References

### Apple Documentation

- [IOSurface Framework](https://developer.apple.com/documentation/iosurface)
- [CVPixelBuffer and IOSurface](https://developer.apple.com/documentation/corevideo/cvpixelbuffer)
- [Metal and IOSurface](https://developer.apple.com/documentation/metal/mtltexture/1515598-iosurface)

### Syphon Source Code

- [SyphonMetalServer.m](https://github.com/Syphon/Syphon-Framework/blob/master/SyphonMetalServer.m)
- [SyphonIOSurfaceImageCore.m](https://github.com/Syphon/Syphon-Framework/blob/master/SyphonIOSurfaceImageCore.m)
- [SyphonServerBase.m](https://github.com/Syphon/Syphon-Framework/blob/master/SyphonServerBase.m)

### Related Projects

- [node-syphon](https://github.com/benoitlahoz/node-syphon) — Electron/Node.js Syphon bindings using IOSurface
- [Unity-VideoOutput](https://github.com/anome/Unity-VideoOutput) — Syphon/NDI from Unity with Metal

### WebKit Internals

- WebKit uses IOSurface for layer compositing
- No public API to access from JavaScript
- `_contentsIOSurface` is private but exists

---

## WebGPU + r3f Status (as of 2024)

React Three Fiber now has experimental WebGPU support. This is relevant because WebGPU on macOS uses Metal, which has native IOSurface integration.

### Current r3f WebGPU Usage

```typescript
import * as THREE from 'three/webgpu'
import * as TSL from 'three/tsl'
import { Canvas, extend } from '@react-three/fiber'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

extend(THREE as any)

export default () => (
  <Canvas
    gl={async (props) => {
      const renderer = new THREE.WebGPURenderer(props as any)
      await renderer.init()
      return renderer
    }}>
      <mesh>
        <meshBasicNodeMaterial />
        <boxGeometry />
      </mesh>
  </Canvas>
)
```

### What This Means for IOSurface

1. **WebGPU uses Metal on macOS** - Metal textures can be created from/to IOSurface
2. **Three.js TSL shaders** - Required for WebGPU, but many sketches are already TSL-based
3. **Potential path forward**:
   - Migrate to WebGPU renderer
   - Use `GPUTexture` which is backed by Metal
   - Access Metal texture → IOSurface (if Apple exposes this)
   - Publish to Syphon via `SyphonMetalServer`

### Blockers

- WebGPU renderer still experimental in Three.js
- No public API to get Metal texture handle from `GPUTexture`
- Would need to investigate WebKit's WebGPU implementation internals
- TSL shader migration effort for existing WebGL shaders

### Recommendation

When migrating to WebGPU for TSL sketch support:

1. Test WebGPU renderer with existing sketches
2. Investigate if `GPUTexture` exposes any handles
3. Check if WebKit's WebGPU uses IOSurface-backed textures internally
4. If yes, this becomes the cleanest path to zero-copy

---

## Conclusion

IOSurface integration would provide the ultimate performance solution, but the path from WebView/WebGL to IOSurface is blocked by private APIs and WebKit internals.

**Recommendation**: Pursue shared memory IPC + PBO async readback first. These provide meaningful gains (potentially 2× improvement) with well-documented, maintainable code. Revisit IOSurface when/if:

1. WebGPU support in r3f matures and exposes Metal textures
2. Apple provides public IOSurface APIs for WebView
3. Performance requirements justify the risk of private APIs

---

_Last updated: Research conducted for sebcat-vj video output optimization project_
