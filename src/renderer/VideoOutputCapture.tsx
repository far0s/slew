/**
 * VideoOutputCapture
 *
 * Component that captures frames from the r3f canvas and sends them
 * to the video output backends (Syphon, Spout, NDI).
 *
 * This component must be placed inside a <Canvas> to access the WebGL context.
 * It hooks into the r3f render loop to capture frames at the configured rate.
 *
 * Performance optimizations:
 * - Frame skipping when previous capture is still pending
 * - Reusable pixel buffers to avoid allocations
 * - Configurable capture resolution (can downscale)
 * - Lower default FPS (30) to reduce CPU/GPU load
 *
 * CRITICAL: We use a WebGLRenderTarget to capture the scene, because
 * readPixels on the default framebuffer returns zeros (buffer already cleared).
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types
// ============================================================================

interface BackendStatus {
  id: string;
  name: string;
  active: boolean;
  available: boolean;
  receivers: number | null;
  frames_published: number;
  last_error: string | null;
}

interface CaptureStats {
  framesCapured: number;
  lastCaptureTime: number;
  averageCaptureMs: number;
  actualFps: number;
  skippedFrames: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Default target capture rate (captures per second) - reduced from 60 for performance */
const DEFAULT_CAPTURE_FPS = 30;

/** How often to log stats (in frames) */
const STATS_LOG_INTERVAL = 150;

/** Maximum scale factor (1.0 = full resolution) */
const MAX_SCALE = 1.0;

/** Minimum scale factor */
const MIN_SCALE = 0.25;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Uint8Array to base64 string using FileReader (async, non-blocking).
 */
function uint8ArrayToBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix to get just the base64
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Flip image vertically in-place (WebGL reads from bottom-left).
 * Swaps rows from top and bottom, meeting in the middle.
 */
function flipVerticallyInPlace(
  pixels: Uint8Array,
  width: number,
  height: number,
  tempRow: Uint8Array,
): void {
  const rowSize = width * 4; // RGBA
  const halfHeight = Math.floor(height / 2);

  for (let y = 0; y < halfHeight; y++) {
    const topRowStart = y * rowSize;
    const bottomRowStart = (height - y - 1) * rowSize;

    // Copy top row to temp
    tempRow.set(pixels.subarray(topRowStart, topRowStart + rowSize));
    // Copy bottom row to top
    pixels.set(
      pixels.subarray(bottomRowStart, bottomRowStart + rowSize),
      topRowStart,
    );
    // Copy temp to bottom
    pixels.set(tempRow, bottomRowStart);
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Props for VideoOutputCapture component.
 *
 * @property enabled - Whether capture is enabled (default: true when backends are active)
 * @property targetFps - Target capture frame rate (default: 30)
 * @property scale - Resolution scale factor (0.25 to 1.0, default: 0.5)
 * @property onStatsUpdate - Callback for capture statistics
 */
export interface VideoOutputCaptureProps {
  enabled?: boolean;
  targetFps?: number;
  scale?: number;
  onStatsUpdate?: (stats: CaptureStats) => void;
}

/**
 * VideoOutputCapture
 *
 * Captures frames from the r3f canvas and sends them to video output backends.
 * Must be placed inside a <Canvas> component.
 *
 * Features:
 * - Synchronous readPixels within useFrame for reliable capture
 * - Async encoding/sending to avoid blocking the render loop
 * - Frame rate limiting to avoid overwhelming the system
 * - Frame skipping when previous send is still in flight
 * - Automatic enable/disable based on backend status
 */
export function VideoOutputCapture({
  enabled: enabledProp,
  targetFps = DEFAULT_CAPTURE_FPS,
  scale = 0.5,
  onStatsUpdate,
}: VideoOutputCaptureProps) {
  const { gl, scene, camera, size } = useThree();

  // Render target for capturing frames
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);

  // Track whether any backend is active
  const [hasActiveBackend, setHasActiveBackend] = useState(false);

  // Capture state refs (using refs to avoid re-renders in the frame loop)
  const lastCaptureTime = useRef(0);
  const frameCount = useRef(0);
  const skippedFrames = useRef(0);
  const captureTimesMs = useRef<number[]>([]);
  const fpsCounter = useRef({ frames: 0, lastTime: performance.now() });

  // Flag to track if a send is currently in progress (encoding + IPC)
  const sendInProgress = useRef(false);

  // Reusable buffers to avoid allocations
  const fullResBufferRef = useRef<Uint8Array | null>(null);
  const tempRowBufferRef = useRef<Uint8Array | null>(null);

  // Buffer for the data being sent (so we can capture new frames while sending)
  const sendBufferRef = useRef<Uint8Array | null>(null);

  // Clamp scale factor
  const effectiveScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

  // Calculate capture interval
  const captureIntervalMs = 1000 / targetFps;

  // Create/update render target when size changes
  useEffect(() => {
    const width = Math.floor(size.width * effectiveScale);
    const height = Math.floor(size.height * effectiveScale);

    if (width > 0 && height > 0) {
      // Dispose old render target
      if (renderTargetRef.current) {
        renderTargetRef.current.dispose();
      }

      // Create new render target at capture resolution
      renderTargetRef.current = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
    }

    return () => {
      if (renderTargetRef.current) {
        renderTargetRef.current.dispose();
        renderTargetRef.current = null;
      }
    };
  }, [size.width, size.height, effectiveScale]);

  // Effective enabled state
  const isEnabled = enabledProp ?? hasActiveBackend;

  // Check for active backends on mount and listen for changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    async function checkBackends() {
      try {
        const backends = await invoke<BackendStatus[]>("list_video_backends");
        const anyActive = backends.some((b) => b.active);
        setHasActiveBackend(anyActive);
      } catch (e) {
        console.error("[VideoCapture] Failed to list backends:", e);
      }
    }

    async function subscribe() {
      unlisten = await listen<BackendStatus>(
        "video_output_status_changed",
        async () => {
          // Re-check all backends when any status changes
          await checkBackends();
        },
      );
    }

    checkBackends();
    subscribe();

    return () => {
      unlisten?.();
    };
  }, []);

  // Async function to encode and send frame data
  const encodeAndSend = useCallback(
    async (
      pixelData: Uint8Array,
      width: number,
      height: number,
      startTime: number,
    ) => {
      try {
        // Convert to base64
        const base64 = await uint8ArrayToBase64(pixelData);

        // Send to backend
        await invoke("publish_video_frame", {
          data: base64,
          width,
          height,
          format: "rgba",
        });

        // Track stats
        frameCount.current++;
        const captureTime = performance.now() - startTime;
        captureTimesMs.current.push(captureTime);

        // Keep only last 30 samples for average
        if (captureTimesMs.current.length > 30) {
          captureTimesMs.current.shift();
        }

        // Update FPS counter
        fpsCounter.current.frames++;
        const elapsed = performance.now() - fpsCounter.current.lastTime;
        if (elapsed >= 1000) {
          const actualFps = (fpsCounter.current.frames * 1000) / elapsed;
          fpsCounter.current.frames = 0;
          fpsCounter.current.lastTime = performance.now();

          // Report stats
          if (onStatsUpdate) {
            const avgMs =
              captureTimesMs.current.reduce((a, b) => a + b, 0) /
              captureTimesMs.current.length;

            onStatsUpdate({
              framesCapured: frameCount.current,
              lastCaptureTime: captureTime,
              averageCaptureMs: avgMs,
              actualFps,
              skippedFrames: skippedFrames.current,
            });
          }
        }

        // Log periodic stats
        if (frameCount.current % STATS_LOG_INTERVAL === 0) {
          const avgMs =
            captureTimesMs.current.reduce((a, b) => a + b, 0) /
            captureTimesMs.current.length;
          console.log(
            `[VideoCapture] ${frameCount.current} frames, avg: ${avgMs.toFixed(1)}ms, ${width}x${height}, skipped: ${skippedFrames.current}`,
          );
        }
      } catch (e) {
        // Only log errors occasionally to avoid spam
        if (frameCount.current % 300 === 0) {
          console.error("[VideoCapture] Send error:", e);
        }
      } finally {
        sendInProgress.current = false;
      }
    },
    [onStatsUpdate],
  );

  // Hook into the render loop - render to our target, then read pixels
  useFrame(() => {
    if (!isEnabled) return;
    if (!renderTargetRef.current) return;

    const now = performance.now();
    const timeSinceLastCapture = now - lastCaptureTime.current;

    // Rate limiting
    if (timeSinceLastCapture < captureIntervalMs) {
      return;
    }

    // Skip if previous send is still in progress
    if (sendInProgress.current) {
      skippedFrames.current++;
      return;
    }

    lastCaptureTime.current = now;
    const startTime = performance.now();

    try {
      const rt = renderTargetRef.current;
      const width = rt.width;
      const height = rt.height;

      // Render the scene to our render target
      gl.setRenderTarget(rt);
      gl.render(scene, camera);
      gl.setRenderTarget(null); // Reset to default

      // Ensure we have a buffer of the right size
      const bufferSize = width * height * 4;
      if (
        !fullResBufferRef.current ||
        fullResBufferRef.current.length !== bufferSize
      ) {
        fullResBufferRef.current = new Uint8Array(bufferSize);
      }

      // Read pixels from the render target
      gl.readRenderTargetPixels(
        rt,
        0,
        0,
        width,
        height,
        fullResBufferRef.current,
      );

      // Ensure temp row buffer exists (for flipping)
      const rowSize = width * 4;
      if (
        !tempRowBufferRef.current ||
        tempRowBufferRef.current.length !== rowSize
      ) {
        tempRowBufferRef.current = new Uint8Array(rowSize);
      }

      // Flip vertically in-place (WebGL reads bottom-to-top)
      flipVerticallyInPlace(
        fullResBufferRef.current,
        width,
        height,
        tempRowBufferRef.current,
      );

      // Copy to send buffer so we can capture new frames while sending
      if (
        !sendBufferRef.current ||
        sendBufferRef.current.length !== bufferSize
      ) {
        sendBufferRef.current = new Uint8Array(bufferSize);
      }
      sendBufferRef.current.set(fullResBufferRef.current);

      // Mark send as in progress and start async encode/send
      sendInProgress.current = true;
      encodeAndSend(sendBufferRef.current, width, height, startTime);
    } catch (e) {
      console.error("[VideoCapture] Capture error:", e);
    }
  });

  // This component doesn't render anything
  return null;
}

export default VideoOutputCapture;
