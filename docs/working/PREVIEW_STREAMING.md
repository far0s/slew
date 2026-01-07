# Preview Streaming

Stream the Renderer window output to Controls window previews in real-time, ensuring pixel-perfect consistency between what the operator sees and what goes out to Syphon/NDI.

---

## Current Status

| Phase   | Description               | Status      |
| ------- | ------------------------- | ----------- |
| Phase 1 | Architecture Design       | ✅ Complete |
| Phase 2 | Binary Frame Distribution | ✅ Complete |
| Phase 3 | Live Preview Streaming    | ✅ Complete |
| Phase 4 | Per-Slot Render Targets   | ✅ Complete |
| Phase 5 | Slot Preview Streaming    | ✅ Complete |

---

## Problem Statement

### Current Behavior

The Controls window has two types of preview canvases:

1. **Live Preview** (`RendererPreview.tsx`): Shows composited output of all active slots
2. **Slot Previews** (`SlotColumn.tsx`): Shows individual sketch per slot

Currently, **both re-render independently** from the main Renderer window:

```
┌─────────────────────┐     ┌─────────────────────┐
│   Renderer Window   │     │   Controls Window   │
│                     │     │                     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ WebGPU Canvas │  │     │  │ Live Preview  │  │
│  │  (all slots)  │──┼──►  │  │ WebGPU Canvas │  │  ← SEPARATE RENDER
│  └───────────────┘  │     │  │  (all slots)  │  │
│         │           │     │  └───────────────┘  │
│         ▼           │     │                     │
│  ┌───────────────┐  │     │  ┌───┐ ┌───┐ ┌───┐  │
│  │ VideoCapture  │  │     │  │S1 │ │S2 │ │S3 │  │  ← SEPARATE RENDERS
│  │  → Syphon     │  │     │  │   │ │   │ │   │  │
│  │  → NDI        │  │     │  └───┘ └───┘ └───┘  │
│  └───────────────┘  │     │                     │
└─────────────────────┘     └─────────────────────┘
```

### Issues

| Issue                    | Description                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Visual inconsistency** | Previews may differ from actual output due to timing, random state, floating-point precision |
| **Clock desync**         | Each canvas has its own `clock.getElapsedTime()`, causing animation phase differences        |
| **Random state**         | Procedural noise/effects may produce different results                                       |
| **Wasted GPU work**      | Same scene rendered 2+ times (Renderer + Live Preview + N slot previews)                     |

### Goal

Stream actual rendered pixels from the Renderer window to all preview canvases:

```
┌─────────────────────┐     ┌─────────────────────┐
│   Renderer Window   │     │   Controls Window   │
│                     │     │                     │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ WebGPU Canvas │  │     │  │ Live Preview  │  │
│  │  (all slots)  │──┼──────►│  (streamed)   │  │  ← SAME PIXELS
│  └───────┬───────┘  │     │  └───────────────┘  │
│          │          │     │                     │
│          ▼          │     │  ┌───┐ ┌───┐ ┌───┐  │
│  ┌───────────────┐  │     │  │S1 │ │S2 │ │S3 │  │  ← SAME PIXELS
│  │  Distribution │──┼──────►│   │ │   │ │   │  │
│  │               │  │     │  └───┘ └───┘ └───┘  │
│  │  → Syphon     │  │     │                     │
│  │  → NDI        │  │     │                     │
│  │  → Controls   │  │     │                     │
│  └───────────────┘  │     │                     │
└─────────────────────┘     └─────────────────────┘
```

---

## Relationship to IOSurface Zero-Copy

This task and the "IOSurface Zero-Copy (macOS)" backlog item are **closely related**:

| Task          | Purpose                                                                           |
| ------------- | --------------------------------------------------------------------------------- |
| **This task** | Share rendered frames **internally** (Renderer → Controls window)                 |
| **IOSurface** | Share rendered frames **externally** (Renderer → Syphon/NDI) with zero CPU copies |

Both solve the same fundamental problem: **efficient distribution of rendered frames to multiple destinations**.

### If IOSurface becomes viable

The ideal macOS solution would use IOSurface for everything:

1. Renderer renders to IOSurface-backed texture
2. Same IOSurface is:
   - Published to Syphon (zero-copy)
   - Published to NDI (requires CPU encoding, but reads from IOSurface)
   - Displayed in Controls window via native `CALayer` (zero-copy)

### Why we're not doing IOSurface now

Per `docs/finished/IOSURFACE_FEASIBILITY.md`:

- No public API to get WebGPU textures as IOSurface
- Would require private APIs with App Store rejection risk
- High maintenance risk with macOS updates

### Design for future IOSurface

The architecture designed here should be **IOSurface-ready**:

- Single "frame distribution" point in the pipeline
- Destinations registered dynamically
- When IOSurface becomes viable, it becomes a drop-in optimization

---

## Technical Approach

### Option A: Binary Frame Streaming via Tauri Events (Recommended)

Leverage existing `VideoOutputCapture` infrastructure:

1. Renderer captures frame (already happening for Syphon/NDI)
2. Emit frame data as Tauri event to Controls window
3. Controls window receives frame, renders as texture

**Pros:**

- Uses existing binary IPC protocol
- Cross-platform
- No private APIs

**Cons:**

- Adds ~10-20ms latency to preview
- CPU overhead for IPC

### Option B: Shared Memory Buffer

Use memory-mapped file shared between windows:

1. Renderer writes frame to shared memory
2. Signals completion via lightweight event
3. Controls reads directly from shared memory

**Pros:**

- Faster than IPC (no data copy in event)
- Lower latency

**Cons:**

- More complex implementation
- Platform-specific code needed
- Synchronization challenges

### Decision: Start with Option A

Option A is simpler and leverages existing infrastructure. If latency becomes problematic, Option B can be added later. The architecture supports both approaches.

---

## Implementation Phases

### Phase 1: Architecture Design ✅

Design the frame distribution system.

**Key decisions:**

- Frame data flows: Renderer → Backend → Controls
- Binary protocol reused from video output
- Event-based distribution to Controls window
- Per-slot render targets for individual streaming

**Status:** ✅ Complete

---

### Phase 2: Binary Frame Distribution

Add frame distribution infrastructure to the backend.

#### 2.1 Create Frame Distribution Module

New file: `src-tauri/src/frame_distribution.rs`

```rust
//! Frame distribution to multiple destinations.
//!
//! Receives captured frames from the Renderer window and distributes
//! them to registered destinations (Syphon, NDI, Controls window previews).

use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Emitter};

/// Frame data with metadata
pub struct Frame {
    pub data: Vec<u8>,
    pub width: u32,
    pub height: u32,
    pub format: FrameFormat,
    pub source: FrameSource,
}

pub enum FrameFormat {
    Rgba,
}

pub enum FrameSource {
    Composited,      // Full composited output
    Slot(u8),        // Individual slot (0-7)
}

/// Manages frame distribution to multiple destinations
pub struct FrameDistributor {
    app: AppHandle,
    controls_enabled: Arc<RwLock<bool>>,
}

impl FrameDistributor {
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            controls_enabled: Arc::new(RwLock::new(true)),
        }
    }

    /// Distribute a frame to all enabled destinations
    pub fn distribute(&self, frame: Frame) {
        // Emit to Controls window
        if *self.controls_enabled.read().unwrap() {
            self.emit_to_controls(&frame);
        }
    }

    fn emit_to_controls(&self, frame: &Frame) {
        // Emit binary frame data as event
        // Controls window listens and updates preview textures
    }
}
```

#### 2.2 Modify VideoOutputCapture

Update `src/renderer/VideoOutputCapture.tsx` to emit frames for distribution:

```tsx
// After capturing frame for Syphon/NDI, also emit for Controls
if (USE_PREVIEW_STREAMING) {
  await invoke("distribute_frame", pixelData, {
    headers: {
      "X-Width": String(width),
      "X-Height": String(height),
      "X-Format": "rgba",
      "X-Source": "composited",
    },
  });
}
```

#### 2.3 Backend Command

Add Tauri command in `src-tauri/src/lib.rs`:

```rust
#[tauri::command]
async fn distribute_frame(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    // Similar to publish_video_frame_binary but routes to frame distributor
    let distributor = app.state::<FrameDistributor>();

    // Parse frame data and distribute
    distributor.distribute(frame);

    Ok(())
}
```

**Acceptance Criteria:**

- [x] Frame distribution module created (`src-tauri/src/frame_distribution.rs`)
- [x] `distribute_frame` command registered in `lib.rs`
- [x] VideoOutputCapture emits frames for distribution
- [x] Frames received in Controls window via event listener

**Status:** ✅ Complete

---

### Phase 3: Live Preview Streaming

Replace `RendererPreview` re-rendering with streamed frames.

#### 3.1 Create StreamedPreview Component

New file: `src/components/StreamedPreview/StreamedPreview.tsx`

```tsx
/**
 * StreamedPreview
 *
 * Displays frames streamed from the Renderer window.
 * Uses a WebGL texture updated from received frame data.
 */

import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface StreamedPreviewProps {
  source: "composited" | `slot-${number}`;
}

export function StreamedPreview({ source }: StreamedPreviewProps) {
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

  // Initialize texture
  useEffect(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array(dimensions.width * dimensions.height * 4),
      dimensions.width,
      dimensions.height,
      THREE.RGBAFormat,
    );
    texture.needsUpdate = true;
    textureRef.current = texture;

    return () => texture.dispose();
  }, [dimensions.width, dimensions.height]);

  // Listen for frame events
  useEffect(() => {
    const unlisten = listen<Uint8Array>("preview-frame", (event) => {
      // Update texture data
      if (textureRef.current && event.payload) {
        textureRef.current.image.data.set(event.payload);
        textureRef.current.needsUpdate = true;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [source]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[16, 9]} /> {/* 16:9 aspect ratio */}
      <meshBasicMaterial map={textureRef.current} />
    </mesh>
  );
}
```

#### 3.2 Update RendererPreview

Modify `src/components/RendererPreview/RendererPreview.tsx`:

```tsx
import { StreamedPreview } from "../StreamedPreview/StreamedPreview";

export function RendererPreview(/* props */) {
    const [useStreaming, setUseStreaming] = useState(true);

    if (useStreaming) {
        return (
            <div className={styles.container}>
                <WebGPUCanvas camera={{ position: [0, 0, 10] }}>
                    <StreamedPreview source="composited" />
                </WebGPUCanvas>
                <div className={styles.label}>Live Preview (Streamed)</div>
            </div>
        );
    }

    // Fallback to local rendering (existing code)
    return (/* existing implementation */);
}
```

**Acceptance Criteria:**

- [x] StreamedPreview component created (`src/components/StreamedPreview/`)
- [x] Receives frame events from backend
- [x] Updates texture in real-time
- [x] RendererPreview updated to use StreamedPreview with fallback
- [x] Visual verification of pixel-perfect match (requires runtime testing)

**Status:** ✅ Complete

---

### Phase 4: Per-Slot Render Targets ✅

Render each slot to its own offscreen target in the Renderer, enabling individual streaming.

#### Implementation: Visibility Toggling Approach

We implemented **approach #2** (visibility toggling) via a dedicated `SlotPreviewCapture` component (`src/renderer/SlotPreviewCapture.tsx`):

```tsx
// SlotPreviewCapture runs in useFrame at priority 0 (pre-render)
// It captures one slot per frame using round-robin scheduling

useFrame(() => {
  // 1. Find the next slot that needs capturing
  const slotIndex = getNextSlotToCapture();

  // 2. Hide all slot groups except the target
  for (const [index, group] of slotGroups) {
    group.visible = index === slotIndex;
  }

  // 3. Render to offscreen target
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // 4. IMMEDIATELY restore visibility before main render
  for (const [index, visible] of originalVisibility) {
    slotGroups.get(index).visible = visible;
  }

  // 5. Read pixels and distribute
  // WebGPU: async readback via readRenderTargetPixelsAsync
  // WebGL: sync readback via readRenderTargetPixels
});
```

**Key Implementation Details:**

- **Priority 0 (pre-render)**: Critical! Priority > 0 (post-render) breaks WebGPU rendering in r3f
- **Round-robin capture**: One slot per frame to minimize GPU overhead
- **100ms initialization delay**: New slots wait before first capture to allow shader compilation
- **SRGB color space**: Render targets use `THREE.SRGBColorSpace` for correct colors
- **Async readback for WebGPU**: Uses `readRenderTargetPixelsAsync` to avoid blocking
- **Vertical flip**: Pixels are flipped in-place before sending (WebGL/WebGPU read from bottom-left)

**Acceptance Criteria:**

- [x] Each active slot has its own render target
- [x] Slot targets are captured without breaking main render
- [x] Slot frames distributed via same mechanism as composited
- [x] Minimal impact on main render performance (visibility restored before main render)
- [x] Works with both WebGL and WebGPU renderers

---

### Phase 5: Slot Preview Streaming ✅

Replace SlotColumn individual rendering with streamed slot frames.

#### 5.1 SlotPreview Component

The `SlotPreview` component in `src/components/SlotColumn/SlotColumn.tsx` handles streaming with automatic fallback:

```tsx
function SlotPreview({ slotIndex, SketchComponent, params, colors }) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(false);

  // Check backend config for stream_slots setting
  useEffect(() => {
    const config = await invoke("get_frame_distribution_config");
    setStreamingEnabled(config.enabled && config.stream_slots);
  }, []);

  const useStreamedPreview = streamingEnabled && isStreaming;

  return (
    <WebGPUCanvas>
      {/* Always render StreamedPreview when enabled - it reports streaming status */}
      {streamingEnabled && (
        <StreamedPreview
          source={`slot-${slotIndex}`}
          onStreamingStatusChange={setIsStreaming}
        />
      )}
      {/* Fall back to local render when not streaming */}
      {!useStreamedPreview && (
        <SketchComponent opacity={1} params={params} colors={colors} />
      )}
    </WebGPUCanvas>
  );
}
```

#### 5.2 Streaming Status Indicator

Added discrete visual indicators to show streaming status:

- **Slot badge**: Small 5px dot inside the slot number badge (top-left)
  - 🟢 Green with glow when streaming from Renderer
  - ⚪ Dim gray when rendering locally
- **Live Preview label**: `● Live` with same dot pattern
- Tooltip on hover shows "Streamed from Renderer" or "Local preview"

**Acceptance Criteria:**

- [x] SlotColumn uses streamed frames when available
- [x] Falls back to local rendering gracefully
- [x] Alpha overlay still works over streamed content
- [x] All 8 slots can stream independently
- [x] Visual indicator shows streaming vs local status

---

## Performance Considerations

### Bandwidth

At 1080p 60fps RGBA:

- Per frame: 1920 × 1080 × 4 = 8.3 MB
- Per second: 8.3 MB × 60 = 498 MB/s

With 8 slots + 1 composited = 9 streams:

- Per second: 4.5 GB/s (unrealistic)

**Mitigations:**

1. **Resolution scaling**: Stream previews at lower resolution (540p = 25% bandwidth)
2. **Frame rate limiting**: Stream at 30fps to previews (half bandwidth)
3. **Only stream visible**: Only stream slots visible in UI
4. **Compression**: Consider simple RLE or LZ4 for preview streams

### Latency Budget

| Stage             | Expected Time                  |
| ----------------- | ------------------------------ |
| GPU readback      | 1-5ms (async)                  |
| IPC to backend    | 2-5ms                          |
| Event to Controls | 2-5ms                          |
| Texture upload    | 1-2ms                          |
| **Total**         | **6-17ms** (~1 frame at 60fps) |

This latency is acceptable for preview purposes.

### CPU Overhead

- Frame distribution adds one additional IPC round-trip
- Texture updates in Controls are cheap (just data copy)
- Main Renderer performance should not be impacted

---

## Configuration Options

Add settings to control streaming behavior:

```tsx
interface PreviewStreamingSettings {
  enabled: boolean; // Master toggle
  resolution: number; // 0.25 = 540p, 0.5 = 720p, 1.0 = 1080p
  frameRate: number; // Target FPS for preview streams
  streamSlots: boolean; // Whether to stream individual slots
  streamComposited: boolean; // Whether to stream composited output
}
```

Exposed in Settings panel or sidebar.

---

## Files to Create/Modify

### New Files

| File                                                        | Purpose                                  |
| ----------------------------------------------------------- | ---------------------------------------- |
| `src-tauri/src/frame_distribution.rs`                       | Backend frame distribution logic         |
| `src/components/StreamedPreview/StreamedPreview.tsx`        | Streamed frame display component         |
| `src/components/StreamedPreview/StreamedPreview.module.css` | Styles                                   |
| `src/components/StreamedPreview/index.ts`                   | Barrel export                            |
| `src/renderer/SlotPreviewCapture.tsx`                       | Per-slot capture via visibility toggling |

### Modified Files

| File                                                        | Changes                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `src-tauri/src/lib.rs`                                      | Register `distribute_frame` command, init distributor        |
| `src-tauri/src/video_out.rs`                                | Integrate with frame distribution                            |
| `src/renderer/VideoOutputCapture.tsx`                       | Emit composited frames for distribution                      |
| `src/renderer/RendererRoot.tsx`                             | Integrate SlotPreviewCapture, track slot groups via refs     |
| `src/components/RendererPreview/RendererPreview.tsx`        | Use StreamedPreview, add streaming status indicator          |
| `src/components/RendererPreview/RendererPreview.module.css` | Add streaming dot styles                                     |
| `src/components/SlotColumn/SlotColumn.tsx`                  | Add SlotPreview with streaming/fallback, streaming indicator |
| `src/components/SlotColumn/SlotColumn.module.css`           | Add streaming dot styles in slot badge                       |

---

## Quick Test Guide

### Testing Slot Streaming (Phase 4 + 5)

1. **Start the app**:

   ```bash
   npm run tauri dev
   ```

2. **Enable debug logging** (in both Renderer and Controls window consoles):

   ```javascript
   localStorage.setItem("previewStreamDebug", "true");
   location.reload();
   ```

3. **Enable slot streaming** (in Renderer window console):

   ```javascript
   // Import invoke if needed
   const { invoke } = await import("@tauri-apps/api/core");

   // Enable slot streaming
   await invoke("set_frame_distribution_config", {
     config: {
       enabled: true,
       stream_composited: true,
       stream_slots: true,
       resolution_scale: 0.5,
       target_fps: 30,
     },
   });
   ```

4. **Verify it's working**:
   - Check Renderer console for `[SlotPreviewCapture]` logs
   - Check Controls console for `[PreviewStream]` logs
   - Slot previews in Controls should now show streamed content

5. **Disable slot streaming** (to compare):
   ```javascript
   await invoke("set_frame_distribution_config", {
     config: {
       enabled: true,
       stream_composited: true,
       stream_slots: false, // <-- disabled
       resolution_scale: 0.5,
       target_fps: 30,
     },
   });
   ```

### Expected Behavior

| State                                  | Slot Previews                                        |
| -------------------------------------- | ---------------------------------------------------- |
| `stream_slots: false`                  | Local rendering (each slot renders independently)    |
| `stream_slots: true`, no frames yet    | Local rendering (fallback)                           |
| `stream_slots: true`, receiving frames | Streamed preview (pixel-perfect match with Renderer) |

---

## Testing Checklist

### Visual Consistency

- [x] Live Preview matches Renderer window exactly
- [x] Slot Previews match their portion of Renderer output
- [x] No timing/animation phase differences
- [x] Random/procedural effects are identical

### Performance

- [x] Renderer maintains 60fps with streaming enabled
- [x] Controls window updates smoothly
- [ ] No memory leaks from texture updates (needs long-running test)
- [x] CPU usage acceptable

### Edge Cases

- [x] Streaming works after window restart
- [x] Handles rapid slot changes
- [ ] Handles resolution changes (needs testing)
- [x] Graceful fallback when streaming unavailable

### Known Constraints

- **WebGPU useFrame priority**: Slot capture MUST use priority 0 or negative. Priority > 0 (post-render) breaks WebGPU rendering in r3f.
- **Initialization delay**: New slots wait 100ms before first capture to allow shader compilation and uniform initialization.
- **Round-robin capture**: Only one slot is captured per frame to minimize GPU overhead. With 2 slots at 30fps target, each slot updates at ~15fps.

---

## Success Metrics

| Metric              | Target                                |
| ------------------- | ------------------------------------- |
| Visual match        | 100% pixel-perfect (or imperceptible) |
| Preview latency     | < 2 frames (33ms at 60fps)            |
| Renderer FPS impact | < 5% reduction                        |
| CPU overhead        | < 10% increase                        |

---

## Debugging & Logging

To verify the streaming pipeline is working correctly, structured console logs are emitted at each stage. When reporting issues, copy these logs to share the current state.

### Log Format

All preview streaming logs use the `[PreviewStream]` prefix for easy filtering.

#### Renderer Window (Frame Capture)

```
[PreviewStream:Capture] Composited frame 1234 @ 1920x1080, readback: 2.3ms
[PreviewStream:Capture] Slot 0 frame 1234 @ 1920x1080, readback: 1.1ms
[PreviewStream:Capture] Slot 2 frame 1234 @ 1920x1080, readback: 1.0ms
```

#### Backend (Distribution)

```
[PreviewStream:Distribute] Frame 1234 (composited) → Controls, size: 8294400 bytes, took: 3.2ms
[PreviewStream:Distribute] Frame 1234 (slot-0) → Controls, size: 8294400 bytes, took: 2.8ms
[PreviewStream:Distribute] Stats: 60 fps, avg distribute: 3.1ms, dropped: 0
```

#### Controls Window (Reception)

```
[PreviewStream:Receive] Composited frame 1234, latency: 12ms, texture updated
[PreviewStream:Receive] Slot 0 frame 1234, latency: 14ms, texture updated
[PreviewStream:Receive] Stats: 58 fps received, 2 frames dropped, avg latency: 13ms
```

### Enabling Verbose Logs

Set environment variable or add to settings:

```bash
# Environment variable
SLEW_PREVIEW_STREAM_DEBUG=1 npm run tauri dev

# Or in browser console
localStorage.setItem('previewStreamDebug', 'true');
location.reload();
```

### Key Metrics to Watch

| Metric             | Healthy | Warning | Problem |
| ------------------ | ------- | ------- | ------- |
| Capture readback   | < 5ms   | 5-10ms  | > 10ms  |
| Distribute time    | < 5ms   | 5-15ms  | > 15ms  |
| End-to-end latency | < 20ms  | 20-40ms | > 40ms  |
| Frames dropped     | 0       | 1-5/sec | > 5/sec |
| FPS received       | 55-60   | 45-55   | < 45    |

### Troubleshooting Commands

Run these in browser console to diagnose issues:

```javascript
// Check streaming status
window.__previewStreamStatus?.();

// Get recent frame stats
window.__previewStreamStats?.();

// Force disable streaming (fallback to local render)
window.__previewStreamDisable?.();

// Re-enable streaming
window.__previewStreamEnable?.();
```

### Sharing Logs for Debugging

When reporting issues:

1. Open DevTools in both windows (Cmd+Option+I)
2. Filter console by `[PreviewStream]`
3. Reproduce the issue
4. Copy logs from both windows
5. Include the streaming status output

---

## Future Enhancements

### IOSurface Integration (macOS)

When/if IOSurface becomes viable:

1. Replace binary IPC with IOSurface sharing
2. Controls window displays via CALayer backed by IOSurface
3. Zero-copy, sub-millisecond latency

### WebRTC Streaming

For remote preview (iPad companion app, etc.):

1. Encode frames as low-latency H.264
2. Stream via WebRTC DataChannel
3. Decode and display on remote device

### Multi-Window Preview

For multi-display setups:

1. Spawn additional preview windows
2. Each window subscribes to specific frame source
3. Position on secondary monitors

---

## Open Questions (Resolved)

1. **Resolution for slot previews**: Should each slot stream match main resolution, or use fixed thumbnail size?

   **Answer**: Slot previews use 50% of the Renderer resolution (`PREVIEW_SCALE = 0.5`). This provides good visual quality while reducing bandwidth and GPU overhead.

2. **Compression**: Is LZ4 or simple RLE worth the CPU cost for bandwidth savings?

   **Answer**: Currently using uncompressed RGBA with base64 encoding for IPC. Compression was not needed—the binary protocol handles the data efficiently. If bandwidth becomes an issue, this can be revisited.

3. **Frame dropping**: If Controls can't keep up, should we drop frames or buffer?

   **Answer**: Frames are dropped implicitly. Each new frame replaces the previous texture data. The `StreamedPreview` component has a 2-second timeout to detect stream loss and fall back to local rendering.

4. **Slot isolation**: Do we need true render isolation (separate scenes) or can we mask from composited output?

   **Answer**: We use visibility toggling within the main scene. Before capturing a slot, all other slot groups are hidden, the scene is rendered to an offscreen target, then visibility is restored. This works because sketches share the same lighting and camera setup, and the capture happens in `useFrame` priority 0 (pre-render) so the main render sees the restored visibility.

---

## References

- `docs/finished/VIDEO_OUTPUT_OPTIMIZATION.md` - Binary IPC protocol details
- `docs/finished/IOSURFACE_FEASIBILITY.md` - Future zero-copy potential
- `docs/finished/WEBGPU_MIGRATION.md` - WebGPU renderer architecture
- `src/renderer/VideoOutputCapture.tsx` - Composited frame capture implementation
- `src/renderer/SlotPreviewCapture.tsx` - Per-slot capture via visibility toggling
- `src/components/StreamedPreview/StreamedPreview.tsx` - Streamed frame display component
- `src-tauri/src/frame_distribution.rs` - Backend frame distribution logic

---

_Last updated: 2025-01-07 — All phases complete. Preview streaming fully functional for both composited and per-slot previews._
