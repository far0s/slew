# Video Output Optimization

Implementation plan for achieving professional-grade 1080p@60fps video output.

---

## Problem Statement

The current video output pipeline has significant overhead that limits performance:

1. **Base64 encoding**: ~8MB of pixel data encoded to ~11MB base64 string per frame
2. **JSON IPC**: Tauri command serializes/deserializes the entire payload
3. **Synchronous GPU readback**: `readPixels` blocks until GPU→CPU transfer completes
4. **CPU texture upload**: Rust receives pixels, uploads to new GL texture for Syphon
5. **Memory copies**: Multiple buffer copies (WebGL → JS → base64 → Rust → GL)

At 1080p@60fps, this means:

- ~660MB/s of base64 encoding
- ~660MB/s of base64 decoding
- Multiple memory copies per frame
- GPU pipeline stalls from synchronous readback

---

## Current Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CURRENT PIPELINE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WebGL Canvas                                                               │
│       │                                                                     │
│       ▼                                                                     │
│  gl.readPixels() ──────────────────────────── GPU→CPU sync (blocks!)        │
│       │                                                                     │
│       ▼                                                                     │
│  Uint8Array (8MB @ 1080p RGBA)                                              │
│       │                                                                     │
│       ▼                                                                     │
│  flipVerticallyInPlace() ──────────────────── CPU work                      │
│       │                                                                     │
│       ▼                                                                     │
│  uint8ArrayToBase64() ─────────────────────── FileReader async (~11MB)      │
│       │                                                                     │
│       ▼                                                                     │
│  invoke("publish_video_frame", {data: base64}) ── Tauri IPC (JSON)          │
│       │                                                                     │
│       ▼                                                                     │
│  base64_decode() ──────────────────────────── Rust decode (~8MB)            │
│       │                                                                     │
│       ▼                                                                     │
│  glTexImage2D() ───────────────────────────── CPU→GPU upload                │
│       │                                                                     │
│       ▼                                                                     │
│  SyphonServer.publishFrameTexture() ───────── Syphon output                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Bottlenecks identified:**

1. `readPixels` is synchronous and stalls the GPU pipeline
2. Base64 encode/decode adds ~40% overhead and CPU time
3. JSON serialization of large strings is slow
4. Texture upload in Rust re-uploads data that was already on the GPU

---

## Proposed Solution: Zero-Copy IOSurface Sharing (macOS)

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPTIMIZED PIPELINE (macOS)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WebGL Canvas                                                               │
│       │                                                                     │
│       ▼                                                                     │
│  Render to WebGLRenderTarget ──────────────── Already doing this            │
│       │                                                                     │
│       ▼                                                                     │
│  Get IOSurface handle from texture ────────── Zero-copy GPU reference       │
│       │                                                                     │
│       ▼                                                                     │
│  invoke("publish_iosurface", {handle}) ────── Tiny IPC (just a handle)      │
│       │                                                                     │
│       ▼                                                                     │
│  Syphon publishSurface: ───────────────────── Direct GPU→GPU                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Benefits:**

- No `readPixels` (no GPU→CPU transfer)
- No base64 encoding/decoding
- No CPU pixel manipulation
- No texture re-upload
- GPU memory stays on GPU

### Why This Works

Syphon supports IOSurface-backed textures natively. On macOS, WebGL textures in Safari/WebKit are backed by IOSurfaces. We can:

1. Get the IOSurface handle from the WebGL texture
2. Pass just the handle (an integer) to Rust
3. Syphon publishes directly from the IOSurface

---

## Implementation Phases

### Phase 1: Binary IPC (Immediate Win)

Replace base64 encoding with binary transfer to reduce overhead by ~40%.

**Changes required:**

#### Frontend (`VideoOutputCapture.tsx`)

- Remove `uint8ArrayToBase64()`
- Use Tauri's binary command support with `ArrayBuffer`

#### Backend (`video_out.rs`)

- Change `publish_video_frame` to accept `Vec<u8>` directly
- Remove `base64_decode()` function usage

**Estimated improvement:** ~40% reduction in encoding overhead

**Complexity:** Low - straightforward refactor

---

### Phase 2: Async GPU Readback with PBOs

Use Pixel Buffer Objects (PBOs) for asynchronous GPU→CPU transfer.

**Concept:**

- Frame N: Start async readback to PBO
- Frame N+1: Read PBO from previous frame (now complete)
- Introduces 1 frame of latency but eliminates GPU stalls

**Changes required:**

#### Frontend (`VideoOutputCapture.tsx`)

- Create two PBO-style buffers (ping-pong)
- Use `gl.fenceSync()` + `gl.clientWaitSync()` pattern
- Or use WebGL2 `getBufferSubData` with transform feedback

**Challenge:** WebGL2 doesn't expose PBOs directly. Workarounds:

1. Use `getBufferSubData` with PIXEL_PACK_BUFFER (WebGL2)
2. Use OffscreenCanvas + `transferToImageBitmap` (may not help)
3. Rely on browser optimizations for large readbacks

**Estimated improvement:** Eliminates GPU pipeline stalls

**Complexity:** Medium - WebGL2 nuances, ping-pong buffer management

---

### Phase 3: IOSurface Zero-Copy (macOS) ⭐ Maximum Impact

Bypass CPU entirely by sharing GPU surfaces directly.

**Prerequisites:**

- Understand Tauri's WebView rendering pipeline
- Confirm WebView (WKWebView) exposes IOSurface handles
- May require native Swift/ObjC bridge code

**Research required:**

1. Can we access the backing IOSurface of a WebGL texture in WKWebView?
2. Does Tauri expose any GPU resource sharing APIs?
3. Alternative: Use a shared Metal texture between WebView and Syphon

**Potential approaches:**

#### Approach A: WebView CALayer IOSurface

- WKWebView renders to a CALayer backed by IOSurface
- Capture the layer's IOSurface after composition
- Pass to Syphon

**Pros:** Works at compositor level, no WebGL changes
**Cons:** Captures entire WebView (not just canvas), timing complexity

#### Approach B: Custom Rendering Pipeline

- Replace r3f/Three.js with native Metal rendering in a separate view
- Eliminates WebView overhead entirely
- Share IOSurface between Metal and Syphon

**Pros:** Maximum performance, full control
**Cons:** Major architecture change, loses web dev velocity

#### Approach C: WebGPU with Shared Textures

- When r3f supports WebGPU, Metal backend may expose shareable textures
- GPUTexture could potentially be shared with Syphon

**Pros:** Future-proof, leverages modern APIs
**Cons:** Blocked on r3f WebGPU support, experimental

**Recommended:** Start with Approach A, research feasibility

**Complexity:** High - requires macOS internals knowledge, FFI work

---

### Phase 4: NDI Optimization

Apply similar optimizations to NDI backend.

**Current NDI flow:**

- Receives decoded RGBA bytes from Rust
- Converts RGBA → BGRA (NDI format)
- Calls `grafton-ndi` send

**Optimizations:**

1. Binary IPC (Phase 1) applies here too
2. Pre-allocated BGRA buffer already exists (`bgra_buffer` field)
3. Consider SIMD for RGBA→BGRA conversion

**Complexity:** Low-Medium

---

### Phase 5: Spout Implementation (Windows)

Complete the Windows video output.

**Spout approach:**

- Similar to Syphon but for Windows
- Uses OpenGL texture sharing via `WGL_NV_DX_interop`
- Or DirectX shared textures

**Note:** Lower priority than macOS optimizations

---

## Implementation Order

| Phase | Description         | Impact | Effort | Dependencies |
| ----- | ------------------- | ------ | ------ | ------------ |
| 1     | Binary IPC          | Medium | Low    | None         |
| 2     | PBO Async Readback  | Medium | Medium | Phase 1      |
| 3     | IOSurface Zero-Copy | High   | High   | Research     |
| 4     | NDI Optimization    | Medium | Low    | Phase 1      |
| 5     | Spout (Windows)     | Medium | Medium | Phase 1      |

**Recommended start:** Phase 1 (quick win, enables measurements)

---

## Phase 1 Detailed Plan: Improved IPC

### Understanding Tauri IPC Limitations

**Important:** Tauri v2 commands serialize all data as JSON. This means:

- `Vec<u8>` becomes a JSON array of numbers: `[255, 128, 64, ...]`
- This is **worse** than base64 (~3-4 chars per byte vs ~1.33 chars)
- Base64 is actually the most efficient option for Tauri's JSON-based IPC

**Current approach is near-optimal for Tauri commands.** Further improvement requires bypassing Tauri's IPC.

### Alternative Approaches for True Binary Transfer

#### Option A: Shared Memory (Recommended)

Use memory-mapped files or shared memory regions:

```
Frontend                          Backend
   │                                 │
   ├─── Write pixels to shared ─────►│ mmap region
   │    memory region                │
   │                                 │
   ├─── invoke("frame_ready", ──────►│ Signal only
   │          {width, height})       │
   │                                 │
   │    Backend reads directly ◄─────┤ from shared memory
```

**Implementation:**

1. Backend creates a memory-mapped file at startup
2. Frontend gets the file path/handle via command
3. Frontend writes raw pixels to the region
4. Frontend calls a lightweight command to signal "frame ready"
5. Backend reads directly from shared memory

**Rust side:**

```rust
use memmap2::MmapMut;

// Create shared memory region for frame data
// 1080p RGBA = 1920 * 1080 * 4 = ~8MB
let mmap = MmapMut::map_anon(FRAME_BUFFER_SIZE)?;
```

**Complexity:** Medium - need to handle memory synchronization

#### Option B: Unix Domain Socket (macOS/Linux)

Bypass Tauri entirely for frame data:

```
Frontend WebSocket ──────► Rust tokio/async-std server
(binary frames)            (Unix socket listener)
```

**Pros:** True binary transfer, async
**Cons:** Platform-specific, extra complexity

#### Option C: Custom Protocol Handler

Use Tauri's `tauri://` protocol with POST body:

```typescript
// Frontend
await fetch("tauri://localhost/video-frame", {
  method: "POST",
  body: pixelData.buffer, // Raw ArrayBuffer
  headers: { "X-Width": "1920", "X-Height": "1080" },
});
```

**Pros:** Uses existing Tauri infrastructure
**Cons:** May still have overhead, needs testing

### Revised Phase 1 Plan

Given the complexity of true binary IPC, Phase 1 should focus on:

1. **Baseline measurements** - Understand where time is actually spent
2. **Quick optimizations** - Tune what we have
3. **Evaluate alternatives** - Test shared memory feasibility

### Step 1.1: Add Detailed Timing Instrumentation

```typescript
// VideoOutputCapture.tsx - add timing breakdown

const encodeAndSend = useCallback(async (...) => {
  const t0 = performance.now();

  // Base64 encode
  const base64 = await uint8ArrayToBase64(pixelData);
  const t1 = performance.now();

  // IPC call
  await invoke("publish_video_frame", { data: base64, width, height, format: "rgba" });
  const t2 = performance.now();

  console.log(`[VideoCapture] encode: ${(t1-t0).toFixed(1)}ms, ipc: ${(t2-t1).toFixed(1)}ms`);
}, []);
```

```rust
// video_out.rs - add backend timing

#[tauri::command]
pub fn publish_video_frame(...) -> Result<(), String> {
    let t0 = std::time::Instant::now();

    let decoded = base64_decode(&data)?;
    let t1 = std::time::Instant::now();

    // ... create frame and publish
    let result = manager.publish_frame(&frame);
    let t2 = std::time::Instant::now();

    log::debug!("[VideoOut] decode: {:?}, publish: {:?}", t1-t0, t2-t1);
    result
}
```

### Step 1.2: Optimize Base64 Encoding (Frontend)

Replace FileReader-based async encoding with synchronous btoa or a WASM encoder:

```typescript
// Faster base64 encoding using native btoa
function uint8ArrayToBase64Fast(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

Or use a WASM-based encoder like `base64-js` for large arrays.

### Step 1.3: Test Shared Memory Prototype

Create a minimal shared memory prototype to validate the approach:

1. Add `memmap2` dependency to Cargo.toml
2. Create a shared memory region on backend init
3. Expose the region to frontend (via file path on macOS)
4. Test writing/reading frame data

If shared memory works well, it becomes the primary optimization path.

### Step 1.4: Benchmark Checklist

### Step 1.5: Measure and Compare

Before starting, capture baseline metrics:

- Frame capture time (readPixels)
- Encode time (base64)
- IPC time (invoke round-trip)
- Backend time (texture upload + Syphon publish)
- Total frame time
- CPU usage
- Actual achieved FPS

After Phase 1:

- Compare IPC time (should be ~40% faster)
- Compare CPU usage (less encoding work)
- Compare achieved FPS

---

## Success Metrics

| Metric        | Current (est.) | Phase 1 Target | Phase 3 Target |
| ------------- | -------------- | -------------- | -------------- |
| 1080p@60fps   | Unstable       | Stable         | Rock solid     |
| Frame latency | ~25-35ms       | ~18-25ms       | <8ms           |
| CPU usage     | High           | Medium         | Low            |
| GPU stalls    | Yes            | Yes            | No             |
| Memory copies | 5+             | 3              | 0              |

---

## Open Questions

1. **Tauri binary IPC**: Does `Vec<u8>` in commands avoid JSON serialization?
   - Need to test/measure
   - May need raw IPC channel for true zero-copy

2. **WebGL IOSurface access**: Can we get IOSurface from WKWebView's WebGL?
   - Research Apple documentation
   - May need private APIs or entitlements

3. **Syphon IOSurface API**: Does Syphon support publishing from IOSurface?
   - Check `publishSurface:` method availability
   - May need SyphonServerDirectory instead of OpenGL server

4. **Frame timing**: How do we synchronize with VSync?
   - Current: Fire-and-forget from useFrame
   - Optimal: Coordinate with compositor

---

## Files to Modify

### Phase 1

- `src/renderer/VideoOutputCapture.tsx` - Remove base64, use binary
- `src-tauri/src/video_out.rs` - Add binary command variant
- `src-tauri/src/lib.rs` - Register new command

### Phase 2

- `src/renderer/VideoOutputCapture.tsx` - PBO ping-pong logic

### Phase 3

- `src-tauri/src/syphon.rs` - IOSurface publishing
- `src-tauri/src/video_out.rs` - New IOSurface code path
- Possibly new Swift bridge code

---

## References

- [Syphon Framework Documentation](https://github.com/Syphon/Syphon-Framework)
- [IOSurface Programming Guide](https://developer.apple.com/documentation/iosurface)
- [WebGL2 Specification - Buffer Objects](https://www.khronos.org/registry/webgl/specs/latest/2.0/)
- [Tauri Binary Commands](https://tauri.app/v1/guides/features/command/#binary-data)
- [WKWebView Internals](https://webkit.org/)

---

## Next Steps

1. ✅ Create this implementation plan
2. [ ] Establish baseline measurements at 1080p@30fps and 1080p@60fps
3. [ ] Implement Phase 1 (Binary IPC)
4. [ ] Measure improvements
5. [ ] Research IOSurface feasibility for Phase 3
6. [ ] Decide on Phase 2 vs Phase 3 priority based on research
