# Video Output Optimization

Implementation plan for achieving professional-grade 1080p@60fps video output.

---

## Current Status: WebGPU Migration Complete ✅

The WebGPU/TSL migration has been a **major performance win**. The key improvements:

| Optimization                        | Status      | Impact                                   |
| ----------------------------------- | ----------- | ---------------------------------------- |
| WebGPU Renderer                     | ✅ Complete | GPU-native rendering, better parallelism |
| `readRenderTargetPixelsAsync()`     | ✅ Complete | Truly non-blocking GPU→CPU transfer      |
| Binary IPC Protocol                 | ✅ Complete | No base64 overhead (~30ms saved)         |
| PBO Async Readback (WebGL fallback) | ✅ Complete | For WebGL2 fallback mode                 |
| TSL Shader Materials                | ✅ Complete | GPU-optimized node materials             |

### What's Working Now

- **Syphon output**: Stable at 60fps (reported improvement with WebGPU)
- **NDI output**: Working, benefits from same optimizations
- **WebGPU async readback**: `PREFER_WEBGPU_ASYNC = true` uses `readRenderTargetPixelsAsync()`
- **Binary protocol**: `USE_BINARY_PROTOCOL = true` bypasses JSON/base64 entirely
- **PBO fallback**: `USE_PBO_ASYNC_READBACK = true` for WebGL2 when WebGPU unavailable

### Key Code Paths

```
WebGPU Mode (preferred):
  render → readRenderTargetPixelsAsync() → flip → binary IPC → Syphon/NDI
  └── Non-blocking, GPU schedules DMA transfer

WebGL2 Fallback:
  render → PBO ping-pong readPixels → flip → binary IPC → Syphon/NDI
  └── Async via fence sync, 1-frame latency
```

---

## Remaining Work Items

### High Priority

| Item                         | Description                                        | Effort                             |
| ---------------------------- | -------------------------------------------------- | ---------------------------------- |
| ~~Performance validation~~   | ~~Measure actual fps with WebGPU~~                 | ✅ Done (user reports improvement) |
| Clean up debug flags         | Remove/hide timing instrumentation when not needed | Low                                |
| Document final configuration | Update ARCHITECTURE.md with video output details   | Low                                |

### Medium Priority (Future Optimization)

| Item                        | Description                                 | Effort |
| --------------------------- | ------------------------------------------- | ------ |
| IOSurface zero-copy (macOS) | Bypass CPU entirely via GPU surface sharing | High   |
| NDI GPU path                | Investigate NDI Advanced SDK for GPU frames | Medium |
| Resolution auto-scaling     | Adaptive quality based on frame time budget | Medium |

### Low Priority (Nice to Have)

| Item                 | Description                            | Effort |
| -------------------- | -------------------------------------- | ------ |
| Spout (Windows)      | Windows equivalent of Syphon           | Medium |
| Frame timing sync    | VSync coordination with compositor     | Medium |
| Multi-output routing | Different content to different outputs | High   |

---

## Phase 1 Implementation Status ✅

**Completed:** Timing instrumentation, base64 optimization, binary protocol, and PBO async readback

### Changes Made

#### Frontend (`src/renderer/VideoOutputCapture.tsx`)

1. **Detailed timing breakdown** - Now tracks individual phases:
   - `renderMs` - Time to render scene to render target
   - `readPixelsMs` - Time for GPU→CPU pixel transfer
   - `flipMs` - Time to flip image vertically
   - `encodeMs` - Time for base64 encoding
   - `ipcMs` - Time for Tauri IPC round-trip
   - `totalMs` - End-to-end frame time

2. **Faster synchronous base64 encoding** - Replaced async FileReader with chunked `btoa()`:
   - Processes in 32KB chunks to avoid call stack limits
   - Synchronous = no microtask scheduling overhead
   - ~20-30% faster for large arrays

3. **Extended `CaptureStats` interface** - Now includes `timing: TimingBreakdown`

4. **Rolling average timing** - Keeps last 30 samples for stable averages

5. **Periodic console logs** - Every 150 frames, logs timing breakdown:

   ```
   [VideoCapture] 150 frames @ 960x540, avg: 18.2ms (render: 0.8, read: 2.1, flip: 0.3, encode: 4.2, ipc: 10.8), skipped: 0
   ```

6. **Optional detailed per-frame logs** - Set `ENABLE_TIMING_LOGS = true` for per-frame analysis

7. **Binary protocol option** - `USE_BINARY_PROTOCOL = true` (default) sends raw pixels via custom URI scheme:
   - Bypasses Tauri's JSON-based IPC entirely
   - No base64 encoding/decoding overhead
   - Uses `videoframe://localhost/frame?width=X&height=Y&format=rgba` endpoint
   - Raw pixel data sent as POST body

#### Backend (`src-tauri/src/video_out.rs`)

1. **Command timing** - `publish_video_frame` now tracks:
   - `decode_time` - Base64 decode duration
   - `publish_time` - Backend publish duration
   - `total_time` - Full command duration

2. **Periodic backend logs** - Every 300 frames (~5s at 60fps):

   ```
   [VideoOut] Backend timing @ 1920x1080: decode=3.21ms, publish=1.45ms, total=4.72ms
   ```

3. **Syphon publish timing** - Added timing to `SyphonBackend::publish_frame`

4. **Pre-allocated decode buffer** - Thread-local buffer reuse for base64 decode

#### Backend (`src-tauri/src/lib.rs`)

1. **Binary protocol handler** - `register_asynchronous_uri_scheme_protocol("videoframe", ...)`
   - Receives raw pixel data directly (no base64)
   - Parses width/height/format from query parameters
   - Publishes directly to video backends
   - Logs timing every 300 frames: `[VideoOut:Binary] Frame N @ WxH: X.XXms`

### How to Use

1. Run the app with video output enabled (Syphon or NDI active)
2. Watch console logs for timing breakdown
3. For detailed analysis, set `ENABLE_TIMING_LOGS = true` in `VideoOutputCapture.tsx`

### Expected Output

At 1080p (1920×1080) with scale=0.5 (960×540 actual):

```
[VideoCapture] 150 frames @ 960x540, avg: 18.2ms (render: 0.8, read: 2.1, flip: 0.3, encode: 4.2, ipc: 10.8), skipped: 0
[VideoOut] Backend timing @ 960x540: decode=2.15ms, publish=1.23ms, total=3.42ms
```

### Bottleneck Isolation Testing

The code includes two debug flags in `VideoOutputCapture.tsx` for isolating bottlenecks:

```typescript
/** Skip IPC call entirely to isolate frontend timing (for benchmarking only) */
const DRY_RUN_MODE = false;

/** Skip base64 encoding to isolate encode overhead (for benchmarking only) */
const SKIP_ENCODE = false;
```

**Test 1: Baseline (both flags false)**

```
[VideoCapture] 150 frames @ 960x540, avg: 50.0ms (render: 0.8, read: 2.1, flip: 0.3, encode: 6.0, ipc: 40.8)
```

→ If `ipc` dominates, IPC is the bottleneck

**Test 2: DRY_RUN_MODE = true**
Skips the Tauri `invoke()` call entirely.

```
[VideoCapture] [DRY_RUN] 150 frames @ 960x540, avg: 9.2ms (render: 0.8, read: 2.1, flip: 0.3, encode: 6.0, ipc: 0.0)
```

→ If FPS jumps to 60+, confirms IPC is the bottleneck

**Test 3: SKIP_ENCODE = true (with DRY_RUN_MODE = false)**
Sends empty string to backend (will error, but measures encode impact).

```
[VideoCapture] [SKIP_ENCODE] 150 frames @ 960x540, avg: 44.0ms (render: 0.8, read: 2.1, flip: 0.3, encode: 0.0, ipc: 40.8)
```

→ Shows how much encoding contributes

**Test 4: Both flags true**
Measures pure capture pipeline (render + readPixels + flip).

```
[VideoCapture] [DRY_RUN,SKIP_ENCODE] 150 frames @ 960x540, avg: 3.2ms
```

→ Shows theoretical maximum FPS if IPC were zero-cost

### Initial Observation

User reports: **Stable 20fps ceiling at scale ≤0.5**

At 20fps, frame time = 50ms. This strongly suggests:

- IPC is the primary bottleneck (~40-45ms per frame)
- Base64 encode/decode adds ~6-10ms
- Actual GPU work (render + readPixels) is fast (~3-5ms)

**Hypothesis:** Tauri's JSON-based IPC with ~2.7MB base64 payloads per frame is saturating at ~20fps.

**Confirmed by backend timing:** `decode=20.17ms` for base64 decode alone at 849×517!

### Binary Protocol Solution

Instead of shared memory, we implemented a simpler solution using Tauri's custom URI scheme:

```
Frontend                              Backend
   │                                     │
   ├─── fetch("videoframe://...") ──────►│ Raw binary POST
   │    body: Blob(pixelData)            │
   │                                     │
   │    Backend receives Vec<u8> ◄───────┤ No base64!
   │    directly, publishes to Syphon    │
```

**Expected improvement:**

- Eliminates ~10ms frontend base64 encode
- Eliminates ~20ms backend base64 decode
- Total savings: ~30ms per frame → should enable 30+ fps

### Next Steps

- [x] Run Test 1-4 to confirm bottleneck hypothesis
- [x] Implement binary protocol (completed)
- [x] Implement PBO async readback (completed)
- [x] WebGPU migration with `readRenderTargetPixelsAsync()` (completed)
- [x] Test binary protocol + WebGPU async performance (user reports stable 60fps with Syphon)
- [ ] Clean up debug instrumentation (optional - useful for future profiling)
- [ ] If ever needed: IOSurface zero-copy for absolute minimum latency

---

## Phase 1b: PBO Async Readback ✅

**Completed:** Ping-pong PBO pattern for zero-stall GPU readback

### What is PBO Async Readback?

Pixel Buffer Objects (PBOs) enable asynchronous GPU→CPU data transfer in WebGL2. Instead of blocking while `readPixels` transfers data, PBOs use DMA to transfer data in the background.

### Implementation Details

The ping-pong pattern uses two PBOs:

```
Frame N:
├── Read from PBO A (previous frame's data - already in CPU memory, fast!)
├── Start async DMA transfer to PBO B (returns immediately)
└── Process/send PBO A's data while PBO B transfers

Frame N+1:
├── Read from PBO B (now complete)
├── Start async DMA transfer to PBO A
└── Process/send PBO B's data while PBO A transfers
```

### Code Changes (`VideoOutputCapture.tsx`)

1. **PBO state management** - Track two PBOs with fence sync objects:

   ```typescript
   interface PBOState {
     buffer: WebGLBuffer;
     fence: WebGLSync | null;
     width: number;
     height: number;
     ready: boolean;
   }
   ```

2. **Configuration flag** - `USE_PBO_ASYNC_READBACK = true` (default enabled)

3. **WebGL2 feature detection** - Checks for `PIXEL_PACK_BUFFER`, `fenceSync`, `clientWaitSync`, `getBufferSubData`

4. **Async readback flow**:
   - `startAsyncReadback()` - Binds PBO, calls `readPixels` (returns immediately), creates fence
   - `readFromPBO()` - Non-blocking check with `clientWaitSync`, reads data with `getBufferSubData`

5. **Graceful fallback** - Falls back to sync `readPixels` if WebGL2 features not available

### Expected Benefits

- **Eliminates GPU stall**: `readPixels` no longer blocks waiting for GPU
- **Hides transfer latency**: DMA happens in parallel with CPU processing
- **Trade-off**: Introduces 1 frame of latency (acceptable for VJ use)

### Console Output

PBO mode is indicated in the periodic logs:

```
[VideoCapture] [BINARY,PBO] 150 frames @ 960x540, avg: 12.5ms (render: 0.8, read: 0.3, flip: 0.3, encode: 0.0, ipc: 11.1)
```

Note: `read` time should drop from ~4-5ms to ~0.3ms with PBO enabled.

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

| Metric        | Original          | Phase 1 Target | Current (WebGPU) | Phase 3 Target |
| ------------- | ----------------- | -------------- | ---------------- | -------------- |
| 1080p@60fps   | Unstable (~20fps) | Stable         | ✅ Stable 60fps  | Rock solid     |
| Frame latency | ~50ms             | ~18-25ms       | ~12-16ms (est.)  | <8ms           |
| CPU usage     | High              | Medium         | Low-Medium       | Low            |
| GPU stalls    | Yes               | Yes            | No (async)       | No             |
| Memory copies | 5+                | 3              | 2 (flip + IPC)   | 0              |

**Note:** With WebGPU async readback + binary IPC, we've achieved Phase 2 targets. Phase 3 (IOSurface) remains optional for latency-critical scenarios.

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
2. ✅ Implement Phase 1 timing instrumentation
3. ✅ Optimize base64 encoding (sync btoa vs async FileReader)
4. ✅ Analyze bottlenecks from timing data (decode=20ms confirmed!)
5. ✅ Implement binary protocol to bypass base64 entirely
6. ✅ Implement PBO async readback (Phase 2) for WebGL fallback
7. ✅ WebGPU migration with `readRenderTargetPixelsAsync()` - **major win!**
8. ✅ Test performance (user reports stable 60fps with Syphon)

### Optional Future Work

- [ ] IOSurface zero-copy (Phase 3) - only if sub-8ms latency needed
- [ ] Spout for Windows (Phase 5)
- [ ] NDI GPU acceleration
- [ ] Consider archiving this doc to `docs/finished/` once validated
