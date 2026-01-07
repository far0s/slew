# IOSurface Feasibility Research

## Executive Summary

**Updated Verdict: Performance target achieved; IOSurface remains a future optimization opportunity**

With the WebGPU migration complete, Slew now achieves stable **60fps Syphon output at 1080p** using `readRenderTargetPixelsAsync()` and binary IPC. IOSurface zero-copy would provide further gains but is **no longer a blocking requirement**.

| Aspect                      | Previous (WebGL)                      | Current (WebGPU)                         |
| --------------------------- | ------------------------------------- | ---------------------------------------- |
| **Performance**             | ~20-30 FPS at 1080p                   | Stable 60 FPS at 1080p ✅                |
| **GPU Readback**            | Blocking `readPixels()` (4-5ms stall) | Async `readRenderTargetPixelsAsync()` ✅ |
| **IPC Method**              | Base64 JSON (~30ms overhead)          | Binary protocol via custom URI scheme ✅ |
| **IOSurface Value**         | Critical for acceptable performance   | Incremental improvement (~10-20% gain)   |
| **Implementation Priority** | High                                  | Low (nice-to-have)                       |

---

## What is IOSurface?

IOSurface is Apple's cross-process GPU texture sharing mechanism on macOS:

- **Zero-copy**: Surfaces exist in GPU memory, shared via Mach ports
- **Cross-process**: Can be shared between any processes on the system
- **GPU-native**: Metal, OpenGL, and Core Graphics all support IOSurface
- **Reference-counted**: Safe sharing with automatic cleanup

### How Syphon Uses IOSurface

Syphon is built entirely on IOSurface. From `SyphonMetalServer.m`:

```objc
// Server creates IOSurface-backed Metal texture
IOSurfaceRef surface = [self newSurfaceForWidth:size.width height:size.height options:nil];
_surfaceTexture = [_device newTextureWithDescriptor:descriptor iosurface:surface plane:0];

// Publishing uses GPU blit (zero CPU involvement)
id<MTLBlitCommandEncoder> blitCommandEncoder = [commandBuffer blitCommandEncoder];
[blitCommandEncoder copyFromTexture:textureToPublish ... toTexture:destination ...];
```

The key insight: **if we could get a Metal texture handle from WebGPU, we could blit directly to the Syphon IOSurface**.

---

## Current Architecture

### Data Flow (WebGPU Mode)

```
Three.js Scene
       │
       ▼
WebGPU Renderer (Metal backend)
       │
       ▼
readRenderTargetPixelsAsync() ── ~1-2ms (async DMA, non-blocking)
       │
       ▼
Uint8Array (CPU buffer)
       │
       ▼
flipVerticallyInPlace() ──────── ~0.5ms
       │
       ▼
Binary IPC (videoframe://) ───── ~2-3ms (raw bytes, no encoding)
       │
       ▼
Rust Backend
       │
       ▼
glTexSubImage2D() ───────────── ~0.5ms (CPU→GPU upload)
       │
       ▼
Syphon publishFrameTexture ──── ~0.5ms
```

**Current Total: ~5-8ms per frame = stable 60 FPS**

### Theoretical IOSurface Flow

```
Three.js Scene
       │
       ▼
WebGPU Renderer (Metal backend)
       │
       ▼
Get Metal texture handle ─────── N/A (no public API)
       │
       ▼
Blit to IOSurface ───────────── ~0.1ms (GPU-to-GPU)
       │
       ▼
Syphon publish ──────────────── ~0.1ms (surface ID only)
```

**Theoretical Total: ~0.2ms per frame = 1000+ FPS ceiling**

---

## Technical Analysis

### The Core Challenge

WebGPU on macOS uses Metal internally, but WebKit does not expose any public API to access the underlying Metal textures. The `GPUTexture` JavaScript object is an opaque handle.

### Path 1: WebKit WebGPU Internals (Blocked)

**WebKit's Implementation:**

- WebGPU in Safari/WKWebView runs in a separate GPU process
- Textures are managed internally using IOSurface for compositing
- No public API to access Metal handles from JavaScript

**Chromium's Approach (for reference):**

- Chromium uses `iosurface_image_backing.mm` for shared image backing
- This is internal to Chromium's GPU process, not exposed to web content

**Conclusion:** No path through the standard WebGPU API.

### Path 2: CALayer Capture (Private API)

```objc
// PRIVATE API - captures composited WebView layer
CALayer *webViewLayer = wkWebView.layer;
IOSurfaceRef surface = (__bridge IOSurfaceRef)[webViewLayer valueForKey:@"contentsIOSurface"];
```

**Issues:**

- `_contentsIOSurface` is a private API (App Store rejection)
- Captures entire WebView, not just the canvas
- May include UI elements, overlays
- Timing/synchronization unclear
- May only update at display refresh rate

**Assessment:** High risk, uncertain benefit.

### Path 3: Native Metal Renderer (Bypass WebView)

Replace WebGL/WebGPU rendering entirely with native Metal:

```
Scene Data (JSON/binary) ──► Native Metal Renderer ──► IOSurface ──► Syphon
```

**Pros:**

- Full control over IOSurface
- Maximum performance
- Clean architecture

**Cons:**

- Massive rewrite (lose all Three.js/r3f benefits)
- Must reimplement all TSL shaders in Metal/MSL
- Different skill set required
- Loses hot-reload and web dev velocity

**Assessment:** Only viable if VJ performance becomes the singular priority.

### Path 4: Tauri Custom Render Target (Speculative)

Tauri v2 uses WKWebView on macOS. A custom Tauri plugin could:

1. Create an IOSurface-backed render target in Rust/Metal
2. Inject this as a custom WebGPU external texture
3. Render to it from JavaScript
4. Publish directly to Syphon

**Challenges:**

- Requires deep WebKit/WebGPU integration
- WebGPU `importExternalTexture` is designed for video, not custom surfaces
- No documentation or prior art for this approach

**Assessment:** Highly experimental, 2-4 weeks exploration minimum.

### Path 5: wgpu Native + Shared Memory

Use `wgpu` (Rust WebGPU implementation) as the renderer instead of WebKit's:

```
Scene Data ──► wgpu (native) ──► Metal texture ──► IOSurface ──► Syphon
```

`wgpu` supports Metal interop and has access to underlying textures. However:

- Would require a completely different rendering architecture
- Scene data would need to be serialized from frontend to Rust
- Loses Three.js/r3f ecosystem entirely

**Assessment:** Similar to Path 3, not practical without major rewrite.

---

## SyphonMetalServer Analysis

Syphon supports both OpenGL (`SyphonOpenGLServer`) and Metal (`SyphonMetalServer`). Our current implementation uses OpenGL.

### Why We Use OpenGL

1. **Simpler integration**: CGL context creation is straightforward
2. **Texture upload**: `glTexSubImage2D` accepts raw pixel data
3. **No command buffer management**: OpenGL handles synchronization

### Migrating to SyphonMetalServer

If we had access to Metal textures, `SyphonMetalServer` would be preferable:

```objc
- (void)publishFrameTexture:(id<MTLTexture>)textureToPublish
            onCommandBuffer:(id<MTLCommandBuffer>)commandBuffer
                imageRegion:(NSRect)region
                    flipped:(BOOL)isFlipped;
```

Benefits:

- Uses GPU blit (no CPU involvement if textures match format)
- Better performance on Apple Silicon
- Avoids OpenGL deprecation concerns

**Blocker:** We don't have access to Metal textures from WebGPU.

---

## Comparison with node-syphon

[node-syphon](https://github.com/benoitlahoz/node-syphon) achieves IOSurface integration in Electron by:

1. Using native addons with direct GPU access
2. Creating IOSurface-backed textures in native code
3. Rendering directly to those surfaces

However, this approach:

- Bypasses the web content entirely
- Requires native rendering pipeline
- Doesn't help with WebView-based rendering

---

## What We've Already Optimized

| Optimization                    | Status      | Impact                         |
| ------------------------------- | ----------- | ------------------------------ |
| WebGPU Renderer                 | ✅ Complete | GPU-native rendering via Metal |
| `readRenderTargetPixelsAsync()` | ✅ Complete | Non-blocking GPU→CPU transfer  |
| Binary IPC Protocol             | ✅ Complete | ~30ms saved vs base64          |
| PBO Async Readback (WebGL)      | ✅ Complete | Fallback for WebGL2            |
| Pre-allocated Buffers           | ✅ Complete | Avoid per-frame allocations    |

These optimizations have brought us from ~20 FPS to stable 60 FPS at 1080p.

---

## Remaining Bottlenecks

With current optimizations, the remaining overhead per frame is approximately:

| Stage                         | Time   | Notes                              |
| ----------------------------- | ------ | ---------------------------------- |
| `readRenderTargetPixelsAsync` | ~1-2ms | Async DMA, minimal stall           |
| `flipVerticallyInPlace`       | ~0.5ms | CPU-side row swap                  |
| Binary IPC transfer           | ~2-3ms | 8MB raw data at 1080p RGBA         |
| `glTexSubImage2D`             | ~0.5ms | CPU→GPU upload                     |
| Syphon publish                | ~0.5ms | GPU blit to clients                |
| **Total**                     | ~5-8ms | Well within 16.67ms budget (60fps) |

IOSurface would eliminate steps 1-4 entirely (~5-6ms savings), but we're already hitting our target.

---

## Recommendations

### Current State: ✅ Performance Goals Met

With WebGPU + binary IPC, we achieve stable 60fps Syphon output at 1080p. No immediate action required.

### Short-term Improvements (Low Priority)

1. **Explore CPU-side flip elimination**: WebGPU might support different coordinate systems
2. **Investigate `SyphonMetalServer`**: Even with CPU upload, Metal might be faster than OpenGL
3. **Profile on different hardware**: Ensure performance on Intel Macs

### Long-term Opportunities

1. **Monitor WebGPU Native Extensions**: Future specs may expose Metal handles
2. **Watch for Tauri GPU Plugins**: Community plugins for GPU interop
3. **Apple API Changes**: Safari may eventually expose more control

### When to Revisit IOSurface

Consider investing in IOSurface if:

- Performance requirements increase (4K output, multiple outputs)
- Apple provides public APIs for WebGPU texture access
- VJ performance becomes a key differentiator worth the development cost

---

## Implementation Cost vs Benefit

| Approach                        | Effort     | Risk      | Benefit Over Current |
| ------------------------------- | ---------- | --------- | -------------------- |
| Do nothing (current state)      | None       | None      | Baseline (60fps ✅)  |
| SyphonMetalServer migration     | 1 week     | Low       | ~5-10% improvement   |
| CALayer IOSurface (private API) | 2-4 weeks  | Very High | ~20% improvement     |
| Native Metal renderer           | 2-3 months | Medium    | ~25% improvement     |
| Tauri GPU plugin prototype      | 3-4 weeks  | Very High | Unknown              |

**Verdict:** Given stable 60fps with current implementation, none of these are justified unless requirements change.

---

## Key Insights from Research

1. **WebGPU on macOS uses Metal internally**, but no public API exposes the Metal textures
2. **Chromium uses IOSurface internally** for shared image backing, proving the concept works
3. **SyphonMetalServer** can publish directly from Metal textures with GPU blit
4. **The bottleneck has moved**: Previously GPU→CPU was the issue; now IPC is comparable
5. **60fps is achievable** without IOSurface through async readback + binary IPC

---

## References

### Apple Documentation

- [IOSurface Framework](https://developer.apple.com/documentation/iosurface)
- [MTLTexture ioSurface Property](https://developer.apple.com/documentation/metal/mtltexture/1515598-iosurface)

### Syphon Source Code

- [SyphonMetalServer.m](https://github.com/Syphon/Syphon-Framework/blob/master/SyphonMetalServer.m)
- [SyphonIOSurfaceImageCore.m](https://github.com/Syphon/Syphon-Framework/blob/master/SyphonIOSurfaceImageCore.m)

### Browser Internals

- Chromium `iosurface_image_backing.mm` - internal IOSurface integration for GPU process
- WebKit WebGPU implementation - uses IOSurface for layer compositing

### Related Projects

- [node-syphon](https://github.com/benoitlahoz/node-syphon) - Electron/Node.js Syphon bindings
- [wgpu](https://github.com/gfx-rs/wgpu) - Rust WebGPU implementation with Metal interop
- [Geyser](https://github.com/compiling-org/Geyser) - Rust GPU texture sharing library (experimental)

---

## Conclusion

IOSurface zero-copy remains the theoretical ideal for video output performance, but the practical path from WebView/WebGPU to IOSurface is blocked by lack of public APIs.

**The good news:** Our current implementation with WebGPU async readback and binary IPC delivers the performance we need. IOSurface optimization can be deferred until requirements change or Apple/WebKit provide new APIs.

**Status:** Research complete. No action required. Revisit if performance requirements increase significantly.

---

_Last updated: Based on Slew architecture with WebGPU renderer, binary IPC, and stable 60fps Syphon output_
