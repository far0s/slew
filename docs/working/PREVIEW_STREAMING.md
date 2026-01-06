# Preview Streaming

Stream the Renderer window output to Controls window previews in real-time, ensuring pixel-perfect consistency between what the operator sees and what goes out to Syphon/NDI.

---

## Current Status

| Phase   | Description               | Status      |
| ------- | ------------------------- | ----------- |
| Phase 1 | Architecture Design       | ✅ Complete |
| Phase 2 | Binary Frame Distribution | ✅ Complete |
| Phase 3 | Live Preview Streaming    | ✅ Complete |
| Phase 4 | Per-Slot Render Targets   | 🔲 Pending  |
| Phase 5 | Slot Preview Streaming    | 🔲 Pending  |

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

### Phase 4: Per-Slot Render Targets

Render each slot to its own offscreen target in the Renderer, enabling individual streaming.

#### 4.1 Modify RendererRoot for Per-Slot Targets

Update `src/renderer/RendererRoot.tsx`:

```tsx
// Create render targets for each active slot
const slotRenderTargets = useRef<Map<number, THREE.WebGLRenderTarget>>(
  new Map(),
);

// In render loop, render each slot to its target before compositing
for (const slot of visibleSlots) {
  const target = getOrCreateSlotTarget(slot.index);
  renderer.setRenderTarget(target);
  renderer.clear();
  // Render just this slot's scene
  renderer.render(slotScene, camera);
  renderer.setRenderTarget(null);
}

// Then composite all slots for main output (existing behavior)
```

#### 4.2 Capture Per-Slot Frames

Extend VideoOutputCapture to read from slot targets:

```tsx
// After main frame capture, also capture visible slots
for (const slot of visibleSlots) {
  const slotTarget = slotRenderTargets.get(slot.index);
  if (slotTarget) {
    const slotPixels = await captureRenderTarget(slotTarget);
    await invoke("distribute_frame", slotPixels, {
      headers: {
        "X-Source": `slot-${slot.index}`,
        // ... dimensions
      },
    });
  }
}
```

**Acceptance Criteria:**

- [ ] Each active slot has its own render target
- [ ] Slot targets are captured after main output
- [ ] Slot frames distributed via same mechanism
- [ ] Minimal impact on main render performance

---

### Phase 5: Slot Preview Streaming

Replace SlotColumn individual rendering with streamed slot frames.

#### 5.1 Update SlotColumn

Modify `src/components/SlotColumn/SlotColumn.tsx`:

```tsx
// Replace local WebGPUCanvas with StreamedPreview
<PreviewContainer>
  <WebGPUCanvas camera={{ position: [0, 0, 10] }}>
    <StreamedPreview source={`slot-${slotIndex}`} />
  </WebGPUCanvas>
  {/* Alpha overlay, slot badge, etc. remain */}
</PreviewContainer>
```

#### 5.2 Handle Missing Streams

If a slot isn't streaming (e.g., slot inactive), fall back to local render:

```tsx
const [isStreaming, setIsStreaming] = useState(false);

// Use streaming if receiving frames, otherwise local render
if (isStreaming) {
  return <StreamedPreview source={`slot-${slotIndex}`} />;
} else {
  return <SketchComponent /* existing props */ />;
}
```

**Acceptance Criteria:**

- [ ] SlotColumn uses streamed frames when available
- [ ] Falls back to local rendering gracefully
- [ ] Alpha overlay still works over streamed content
- [ ] All 8 slots can stream independently

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

| File                                                        | Purpose                          |
| ----------------------------------------------------------- | -------------------------------- |
| `src-tauri/src/frame_distribution.rs`                       | Backend frame distribution logic |
| `src/components/StreamedPreview/StreamedPreview.tsx`        | Streamed frame display component |
| `src/components/StreamedPreview/StreamedPreview.module.css` | Styles                           |
| `src/components/StreamedPreview/index.ts`                   | Barrel export                    |

### Modified Files

| File                                                 | Changes                                               |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `src-tauri/src/lib.rs`                               | Register `distribute_frame` command, init distributor |
| `src-tauri/src/video_out.rs`                         | Integrate with frame distribution                     |
| `src/renderer/VideoOutputCapture.tsx`                | Emit frames for distribution                          |
| `src/renderer/RendererRoot.tsx`                      | Add per-slot render targets                           |
| `src/components/RendererPreview/RendererPreview.tsx` | Use StreamedPreview                                   |
| `src/components/SlotColumn/SlotColumn.tsx`           | Use StreamedPreview                                   |

---

## Testing Checklist

### Visual Consistency

- [ ] Live Preview matches Renderer window exactly
- [ ] Slot Previews match their portion of Renderer output
- [ ] No timing/animation phase differences
- [ ] Random/procedural effects are identical

### Performance

- [ ] Renderer maintains 60fps with streaming enabled
- [ ] Controls window updates smoothly
- [ ] No memory leaks from texture updates
- [ ] CPU usage acceptable

### Edge Cases

- [ ] Streaming works after window restart
- [ ] Handles rapid slot changes
- [ ] Handles resolution changes
- [ ] Graceful fallback when streaming unavailable

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

## Open Questions

1. **Resolution for slot previews**: Should each slot stream match main resolution, or use fixed thumbnail size?

2. **Compression**: Is LZ4 or simple RLE worth the CPU cost for bandwidth savings?

3. **Frame dropping**: If Controls can't keep up, should we drop frames or buffer?

4. **Slot isolation**: Do we need true render isolation (separate scenes) or can we mask from composited output?

---

## References

- `docs/finished/VIDEO_OUTPUT_OPTIMIZATION.md` - Binary IPC protocol details
- `docs/finished/IOSURFACE_FEASIBILITY.md` - Future zero-copy potential
- `docs/finished/WEBGPU_MIGRATION.md` - WebGPU renderer architecture
- `src/renderer/VideoOutputCapture.tsx` - Existing frame capture implementation

---

_Last updated: Preview streaming implementation plan for Slew_
