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
 * - PBO async readback with ping-pong buffers (eliminates GPU stall)
 * - Frame skipping when previous capture is still pending
 * - Reusable pixel buffers to avoid allocations
 * - Configurable capture resolution (can downscale)
 * - Lower default FPS (30) to reduce CPU/GPU load
 * - Binary IPC protocol (bypasses base64 encoding)
 * - Detailed timing instrumentation for performance analysis
 *
 * CRITICAL: We use a WebGLRenderTarget to capture the scene, because
 * readPixels on the default framebuffer returns zeros (buffer already cleared).
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "@/lib/logger";

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

interface TimingBreakdown {
  renderMs: number;
  readPixelsMs: number;
  flipMs: number;
  encodeMs: number;
  ipcMs: number;
  totalMs: number;
}

interface CaptureStats {
  framesCapured: number;
  lastCaptureTime: number;
  averageCaptureMs: number;
  actualFps: number;
  skippedFrames: number;
  timing: TimingBreakdown;
}

/** PBO state for ping-pong async readback */
interface PBOState {
  buffer: WebGLBuffer;
  fence: WebGLSync | null;
  width: number;
  height: number;
  ready: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/** Default target capture rate (captures per second) */
const DEFAULT_CAPTURE_FPS = 60;

/** Maximum scale factor (1.0 = full resolution) */
const MAX_SCALE = 1.0;

/** Minimum scale factor */
const MIN_SCALE = 0.25;

/** Default target resolution for video output (1080p) */
const DEFAULT_TARGET_WIDTH = 1920;
const DEFAULT_TARGET_HEIGHT = 1080;

/** [DEBUG] Skip IPC call entirely to isolate frontend timing */
const DRY_RUN_MODE = false;

/** [DEBUG] Skip base64 encoding to measure encode overhead */
const SKIP_ENCODE = false;

// ============================================================================
// Protocol Configuration (production settings)
// ============================================================================

/**
 * Use binary protocol instead of base64+JSON for video frame transfer.
 * This uses Tauri's native binary invoke with raw Uint8Array, bypassing
 * JSON serialization entirely.
 */
const USE_BINARY_PROTOCOL = true;

/**
 * Use PBO (Pixel Buffer Object) async readback with ping-pong buffers.
 * This eliminates the GPU stall during readPixels by reading from the
 * previous frame's PBO while the current frame is being transferred.
 * Introduces 1 frame of latency but significantly improves throughput.
 */
const USE_PBO_ASYNC_READBACK = true;

/**
 * Prefer WebGPU async readback when available.
 * WebGPU's readRenderTargetPixelsAsync is truly non-blocking,
 * unlike WebGL's PBO which still has some stall.
 */
const PREFER_WEBGPU_ASYNC = true;

/** Enable preview streaming to Controls window */
const USE_PREVIEW_STREAMING = true;

/** Preview resolution scale (0.5 = half resolution) */
const PREVIEW_STREAM_SCALE = 0.5;

/** Default preview FPS (can be changed via settings) */
const DEFAULT_PREVIEW_STREAM_FPS = 30;

const SETTINGS_EVENT = "renderer-settings-changed";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Uint8Array to base64 string synchronously.
 * Uses chunked String.fromCharCode to avoid call stack limits on large arrays.
 * This is faster than the async FileReader approach for our use case.
 */
function uint8ArrayToBase64Sync(bytes: Uint8Array): string {
  // Process in chunks to avoid "Maximum call stack size exceeded"
  // for large arrays (1080p RGBA = ~8MB = ~8 million bytes)
  const CHUNK_SIZE = 32768; // 32KB chunks
  let binary = "";

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }

  return btoa(binary);
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

/**
 * Check if the renderer is a WebGPU renderer
 */
function isWebGPURenderer(
  renderer: THREE.WebGLRenderer | THREEWebGPU.WebGPURenderer,
): renderer is THREEWebGPU.WebGPURenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}

/**
 * Check if WebGL2 context supports PBO operations
 */
function supportsPBO(gl: WebGL2RenderingContext): boolean {
  // Check for WebGL2 by looking for PIXEL_PACK_BUFFER constant
  return (
    typeof gl.PIXEL_PACK_BUFFER === "number" &&
    typeof gl.fenceSync === "function" &&
    typeof gl.clientWaitSync === "function" &&
    typeof gl.getBufferSubData === "function"
  );
}

// ============================================================================
// Main Component
// ============================================================================

export interface VideoOutputCaptureProps {
  enabled?: boolean;
  targetFps?: number;
  /**
   * Scale factor for capture resolution (0.25 - 1.0).
   * Only used when targetWidth/targetHeight are not specified.
   * @default 0.5
   */
  scale?: number;
  /**
   * Fixed target width for video output.
   * When specified along with targetHeight, overrides scale-based sizing.
   * @default 1920
   */
  targetWidth?: number;
  /**
   * Fixed target height for video output.
   * When specified along with targetWidth, overrides scale-based sizing.
   * @default 1080
   */
  targetHeight?: number;
  onStatsUpdate?: (stats: CaptureStats) => void;
}

export function VideoOutputCapture({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  enabled: enabledProp,
  targetFps = DEFAULT_CAPTURE_FPS,
  scale = 0.5,
  targetWidth = DEFAULT_TARGET_WIDTH,
  targetHeight = DEFAULT_TARGET_HEIGHT,
  onStatsUpdate,
}: VideoOutputCaptureProps) {
  const { gl, scene, camera, size } = useThree();

  // Detect renderer type
  const isWebGPU = isWebGPURenderer(gl);

  // Render target for capturing frames
  // Use separate refs for WebGL and WebGPU to maintain proper types
  const webglRenderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const webgpuRenderTargetRef = useRef<THREEWebGPU.RenderTarget | null>(null);

  // Helper to get current render target
  const getRenderTarget = () =>
    isWebGPU ? webgpuRenderTargetRef.current : webglRenderTargetRef.current;

  // Track pending async readback for WebGPU
  const webgpuReadbackPending = useRef(false);

  // Track whether any backend is active
  const [hasActiveBackend, setHasActiveBackend] = useState(false);

  // Capture state refs (using refs to avoid re-renders in the frame loop)
  const lastCaptureTime = useRef(0);
  const frameCount = useRef(0);
  const skippedFrames = useRef(0);
  const captureTimesMs = useRef<number[]>([]);
  const fpsCounter = useRef({ frames: 0, lastTime: performance.now() });

  // Timing breakdown tracking (rolling averages)
  const timingHistory = useRef<TimingBreakdown[]>([]);
  const lastTiming = useRef<TimingBreakdown>({
    renderMs: 0,
    readPixelsMs: 0,
    flipMs: 0,
    encodeMs: 0,
    ipcMs: 0,
    totalMs: 0,
  });

  // Flag to track if a send is currently in progress (encoding + IPC)
  const sendInProgress = useRef(false);

  // Reusable buffers to avoid allocations
  const fullResBufferRef = useRef<Uint8Array | null>(null);
  const tempRowBufferRef = useRef<Uint8Array | null>(null);

  // Preview streaming state
  const lastPreviewTime = useRef(0);
  const nativePreviewCanvasRef = useRef<OffscreenCanvas | null>(null);
  const nativePreviewCtxRef = useRef<OffscreenCanvasRenderingContext2D | null>(
    null,
  );

  // Preview FPS from settings
  const [previewStreamFps, setPreviewStreamFps] = useState(() => {
    if (typeof localStorage !== "undefined") {
      try {
        const stored = localStorage.getItem("slew-renderer-settings");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (
            parsed.previewStreamFps &&
            [15, 30, 45, 60].includes(parsed.previewStreamFps)
          ) {
            return parsed.previewStreamFps;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return DEFAULT_PREVIEW_STREAM_FPS;
  });
  const previewIntervalMs = 1000 / previewStreamFps;

  // Listen for preview FPS changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<{ previewStreamFps?: number }>(SETTINGS_EVENT, (event) => {
      const fps = event.payload.previewStreamFps;
      if (fps && [15, 30, 45, 60].includes(fps)) {
        setPreviewStreamFps(fps);
      }
    }).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  // Buffer for the data being sent (so we can capture new frames while sending)
  const sendBufferRef = useRef<Uint8Array | null>(null);

  // PBO state for async readback (ping-pong pattern)
  const pboStateRef = useRef<[PBOState | null, PBOState | null]>([null, null]);
  const currentPboIndex = useRef(0);
  const pboSupported = useRef<boolean | null>(null);
  const pboInitialized = useRef(false);

  // Clamp scale factor (only used if no fixed target resolution)
  const effectiveScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));

  // Calculate capture resolution - use fixed target if specified, otherwise scale from canvas
  const useFixedResolution = targetWidth > 0 && targetHeight > 0;
  const captureWidth = useFixedResolution
    ? targetWidth
    : Math.floor(size.width * effectiveScale);
  const captureHeight = useFixedResolution
    ? targetHeight
    : Math.floor(size.height * effectiveScale);

  // Calculate capture interval
  const captureIntervalMs = 1000 / targetFps;

  // Create/update render target when size changes
  useEffect(() => {
    const width = captureWidth;
    const height = captureHeight;

    if (width > 0 && height > 0) {
      // Dispose old render targets
      if (webglRenderTargetRef.current) {
        webglRenderTargetRef.current.dispose();
        webglRenderTargetRef.current = null;
      }
      if (webgpuRenderTargetRef.current) {
        webgpuRenderTargetRef.current.dispose();
        webgpuRenderTargetRef.current = null;
      }

      // Create new render target at capture resolution
      // Use appropriate render target type based on renderer
      if (isWebGPU) {
        webgpuRenderTargetRef.current = new THREEWebGPU.RenderTarget(
          width,
          height,
          {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
          },
        );
      } else {
        webglRenderTargetRef.current = new THREE.WebGLRenderTarget(
          width,
          height,
          {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
          },
        );
      }

      // Reset PBO state when size changes
      pboInitialized.current = false;
    }

    return () => {
      if (webglRenderTargetRef.current) {
        webglRenderTargetRef.current.dispose();
        webglRenderTargetRef.current = null;
      }
      if (webgpuRenderTargetRef.current) {
        webgpuRenderTargetRef.current.dispose();
        webgpuRenderTargetRef.current = null;
      }
    };
  }, [captureWidth, captureHeight]);

  // Initialize PBOs
  const initializePBOs = useCallback(
    (glContext: WebGLRenderingContext, width: number, height: number) => {
      const gl2 = glContext as WebGL2RenderingContext;

      // Check if PBO is supported
      if (pboSupported.current === null) {
        pboSupported.current = supportsPBO(gl2);
      }

      if (!pboSupported.current || !USE_PBO_ASYNC_READBACK) {
        return;
      }

      const bufferSize = width * height * 4;

      // Clean up old PBOs if they exist with different size
      for (let i = 0; i < 2; i++) {
        const oldPbo = pboStateRef.current[i];
        if (oldPbo && (oldPbo.width !== width || oldPbo.height !== height)) {
          gl2.deleteBuffer(oldPbo.buffer);
          if (oldPbo.fence) {
            gl2.deleteSync(oldPbo.fence);
          }
          pboStateRef.current[i] = null;
        }
      }

      // Create new PBOs
      for (let i = 0; i < 2; i++) {
        if (!pboStateRef.current[i]) {
          const buffer = gl2.createBuffer();
          if (!buffer) {
            logger.error("VideoCapture", "Failed to create PBO");
            pboSupported.current = false;
            return;
          }

          gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, buffer);
          gl2.bufferData(gl2.PIXEL_PACK_BUFFER, bufferSize, gl2.STREAM_READ);
          gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);

          pboStateRef.current[i] = {
            buffer,
            fence: null,
            width,
            height,
            ready: false,
          };
        }
      }

      pboInitialized.current = true;
    },
    [],
  );

  // Cleanup PBOs on unmount
  useEffect(() => {
    return () => {
      const gl2 = gl.getContext() as WebGL2RenderingContext;
      for (let i = 0; i < 2; i++) {
        const pbo = pboStateRef.current[i];
        if (pbo) {
          gl2.deleteBuffer(pbo.buffer);
          if (pbo.fence) {
            gl2.deleteSync(pbo.fence);
          }
          pboStateRef.current[i] = null;
        }
      }
    };
  }, [gl]);

  // Effective enabled state
  // Enable capture if:
  // 1. Explicitly enabled via prop, OR
  // 2. Any video backend is active (Syphon/NDI), OR
  // 3. Preview streaming is enabled (so Controls window can receive frames)
  const isEnabled = enabledProp ?? (hasActiveBackend || USE_PREVIEW_STREAMING);

  // Check for active backends on mount and listen for changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    async function checkBackends() {
      try {
        const backends = await invoke<BackendStatus[]>("list_video_backends");
        const anyActive = backends.some((b) => b.active);
        setHasActiveBackend(anyActive);
      } catch (e) {
        logger.error("VideoCapture", "Failed to list backends:", e);
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

  // Compute average timing from history
  const getAverageTiming = useCallback((): TimingBreakdown => {
    const history = timingHistory.current;
    if (history.length === 0) {
      return lastTiming.current;
    }

    const sum = history.reduce(
      (acc, t) => ({
        renderMs: acc.renderMs + t.renderMs,
        readPixelsMs: acc.readPixelsMs + t.readPixelsMs,
        flipMs: acc.flipMs + t.flipMs,
        encodeMs: acc.encodeMs + t.encodeMs,
        ipcMs: acc.ipcMs + t.ipcMs,
        totalMs: acc.totalMs + t.totalMs,
      }),
      {
        renderMs: 0,
        readPixelsMs: 0,
        flipMs: 0,
        encodeMs: 0,
        ipcMs: 0,
        totalMs: 0,
      },
    );

    const count = history.length;
    return {
      renderMs: sum.renderMs / count,
      readPixelsMs: sum.readPixelsMs / count,
      flipMs: sum.flipMs / count,
      encodeMs: sum.encodeMs / count,
      ipcMs: sum.ipcMs / count,
      totalMs: sum.totalMs / count,
    };
  }, []);

  // Function to encode and send frame data (now synchronous encode, async IPC)
  const encodeAndSend = useCallback(
    async (
      pixelData: Uint8Array,
      width: number,
      height: number,
      timingSoFar: { renderMs: number; readPixelsMs: number; flipMs: number },
    ) => {
      const encodeStart = performance.now();

      try {
        let encodeMs: number;
        let ipcMs: number;

        const ipcStart = performance.now();

        // Preview streaming handled separately in its own useFrame hook

        if (USE_BINARY_PROTOCOL && !DRY_RUN_MODE) {
          // Binary protocol: send raw pixels via Tauri's native binary invoke
          // No base64 encoding needed!
          const encodeEnd = performance.now();
          encodeMs = encodeEnd - encodeStart; // Should be ~0ms

          // Publish to video backends (Syphon/NDI) if any are active
          await invoke("publish_video_frame_binary", pixelData, {
            headers: {
              "X-Width": String(width),
              "X-Height": String(height),
              "X-Format": "rgba",
            },
          });

          const ipcEnd = performance.now();
          ipcMs = ipcEnd - ipcStart;
        } else {
          // Legacy base64 protocol
          let base64: string;
          if (SKIP_ENCODE) {
            // Skip encoding to measure overhead without it
            base64 = "";
          } else {
            base64 = uint8ArrayToBase64Sync(pixelData);
          }
          const encodeEnd = performance.now();
          encodeMs = encodeEnd - encodeStart;

          // Send to backend
          const ipcStart = performance.now();
          if (!DRY_RUN_MODE) {
            await invoke("publish_video_frame", {
              data: base64,
              width,
              height,
              format: "rgba",
            });
          }
          const ipcEnd = performance.now();
          ipcMs = ipcEnd - ipcStart;
        }

        // Calculate total time
        const totalMs =
          timingSoFar.renderMs +
          timingSoFar.readPixelsMs +
          timingSoFar.flipMs +
          encodeMs +
          ipcMs;

        // Store timing breakdown
        const timing: TimingBreakdown = {
          ...timingSoFar,
          encodeMs,
          ipcMs,
          totalMs,
        };
        lastTiming.current = timing;

        // Keep rolling history of last 30 samples
        timingHistory.current.push(timing);
        if (timingHistory.current.length > 30) {
          timingHistory.current.shift();
        }

        // Track stats
        frameCount.current++;
        captureTimesMs.current.push(totalMs);

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

          // Report stats with timing breakdown
          if (onStatsUpdate) {
            const avgMs =
              captureTimesMs.current.reduce((a, b) => a + b, 0) /
              captureTimesMs.current.length;

            onStatsUpdate({
              framesCapured: frameCount.current,
              lastCaptureTime: totalMs,
              averageCaptureMs: avgMs,
              actualFps,
              skippedFrames: skippedFrames.current,
              timing: getAverageTiming(),
            });
          }
        }
      } catch (e) {
        // Only log errors occasionally to avoid spam
        if (frameCount.current % 300 === 0) {
          logger.error("VideoCapture", "Send error:", e);
        }
      } finally {
        sendInProgress.current = false;
      }
    },
    [onStatsUpdate, getAverageTiming],
  );

  // Capture frame using WebGPU async readback (non-blocking)
  const captureFrameWebGPU = useCallback(
    async (
      renderer: THREEWebGPU.WebGPURenderer,
      rt: THREEWebGPU.RenderTarget,
      width: number,
      height: number,
      renderMs: number,
    ) => {
      const readStart = performance.now();

      try {
        // Use WebGPU's async readback - truly non-blocking!
        const pixelData = await renderer.readRenderTargetPixelsAsync(
          rt,
          0,
          0,
          width,
          height,
        );

        const readEnd = performance.now();
        const readPixelsMs = readEnd - readStart;

        // Ensure we have a properly typed Uint8Array
        const pixels =
          pixelData instanceof Uint8Array
            ? pixelData
            : new Uint8Array(pixelData.buffer);

        // Ensure temp row buffer exists (for flipping)
        const rowSize = width * 4;
        if (
          !tempRowBufferRef.current ||
          tempRowBufferRef.current.length !== rowSize
        ) {
          tempRowBufferRef.current = new Uint8Array(rowSize);
        }

        // Flip vertically (WebGPU also reads from bottom-left)
        const flipStart = performance.now();
        flipVerticallyInPlace(pixels, width, height, tempRowBufferRef.current);
        const flipEnd = performance.now();
        const flipMs = flipEnd - flipStart;

        // Send to backend
        await encodeAndSend(pixels, width, height, {
          renderMs,
          readPixelsMs,
          flipMs,
        });
      } catch (e) {
        if (frameCount.current % 300 === 0) {
          logger.error("VideoCapture:WebGPU", "Async readback error:", e);
        }
      } finally {
        webgpuReadbackPending.current = false;
      }
    },
    [encodeAndSend],
  );

  // Start async readback using PBO
  const startAsyncReadback = useCallback(
    (
      glContext: WebGLRenderingContext,
      rt: THREE.WebGLRenderTarget,
      pboIndex: number,
    ) => {
      const gl2 = glContext as WebGL2RenderingContext;
      const pbo = pboStateRef.current[pboIndex];
      if (!pbo) return;

      // Delete old fence if exists
      if (pbo.fence) {
        gl2.deleteSync(pbo.fence);
        pbo.fence = null;
      }

      // Bind render target's framebuffer
      const renderer = gl as THREE.WebGLRenderer;
      renderer.setRenderTarget(rt);

      // Bind PBO and start async readback
      gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, pbo.buffer);

      // readPixels with PBO bound returns immediately - async DMA transfer
      gl2.readPixels(
        0,
        0,
        pbo.width,
        pbo.height,
        gl2.RGBA,
        gl2.UNSIGNED_BYTE,
        0,
      );

      // Create fence to track when transfer is complete
      pbo.fence = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
      pbo.ready = false;

      // Unbind PBO
      gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);

      // Reset render target
      renderer.setRenderTarget(null);
    },
    [gl],
  );

  // Check if PBO readback is complete and read data
  const readFromPBO = useCallback(
    (
      glContext: WebGLRenderingContext,
      pboIndex: number,
      outputBuffer: Uint8Array,
    ): boolean => {
      const gl2 = glContext as WebGL2RenderingContext;
      const pbo = pboStateRef.current[pboIndex];
      if (!pbo || !pbo.fence) return false;

      // Check if the async transfer is complete (non-blocking check)
      const status = gl2.clientWaitSync(pbo.fence, 0, 0);

      if (
        status === gl2.ALREADY_SIGNALED ||
        status === gl2.CONDITION_SATISFIED
      ) {
        // Data is ready, read from PBO
        gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, pbo.buffer);
        gl2.getBufferSubData(gl2.PIXEL_PACK_BUFFER, 0, outputBuffer);
        gl2.bindBuffer(gl2.PIXEL_PACK_BUFFER, null);

        // Clean up fence
        gl2.deleteSync(pbo.fence);
        pbo.fence = null;
        pbo.ready = true;

        return true;
      }

      return false;
    },
    [],
  );

  // Preview streaming - captures from native canvas at correct aspect ratio
  useFrame(() => {
    if (!USE_PREVIEW_STREAMING || DRY_RUN_MODE) return;
    if (performance.now() - lastPreviewTime.current < previewIntervalMs) return;
    lastPreviewTime.current = performance.now();

    const nativeWidth = size.width;
    const nativeHeight = size.height;
    if (nativeWidth <= 0 || nativeHeight <= 0) return;

    const previewWidth = Math.round(nativeWidth * PREVIEW_STREAM_SCALE);
    const previewHeight = Math.round(nativeHeight * PREVIEW_STREAM_SCALE);

    // Initialize/resize OffscreenCanvas
    if (
      !nativePreviewCanvasRef.current ||
      nativePreviewCanvasRef.current.width !== previewWidth ||
      nativePreviewCanvasRef.current.height !== previewHeight
    ) {
      nativePreviewCanvasRef.current = new OffscreenCanvas(
        previewWidth,
        previewHeight,
      );
      nativePreviewCtxRef.current = nativePreviewCanvasRef.current.getContext(
        "2d",
        { willReadFrequently: true, colorSpace: "srgb" },
      );
    }

    const ctx = nativePreviewCtxRef.current;
    const canvas = gl.domElement;
    if (!ctx || !canvas) return;

    // Flip Y-axis (WebGL/WebGPU coordinate system)
    ctx.save();
    ctx.translate(0, previewHeight);
    ctx.scale(1, -1);
    ctx.drawImage(canvas, 0, 0, previewWidth, previewHeight);
    ctx.restore();

    const imageData = ctx.getImageData(0, 0, previewWidth, previewHeight, {
      colorSpace: "srgb",
    });

    invoke("distribute_frame", new Uint8Array(imageData.data.buffer), {
      headers: {
        "X-Width": String(previewWidth),
        "X-Height": String(previewHeight),
        "X-Format": "rgba",
        "X-Source": "composited",
      },
    }).catch(() => {});
  });

  // Video output capture
  useFrame(() => {
    if (!isEnabled) return;

    const rt = getRenderTarget();
    if (!rt) return;

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

    // Skip if WebGPU async readback is pending
    if (isWebGPU && webgpuReadbackPending.current) {
      skippedFrames.current++;
      return;
    }

    lastCaptureTime.current = now;

    try {
      const width = rt.width;
      const height = rt.height;

      // === WebGPU Path ===
      if (isWebGPU && PREFER_WEBGPU_ASYNC) {
        const renderer = gl as THREEWebGPU.WebGPURenderer;
        const webgpuRT = webgpuRenderTargetRef.current!;

        // Render to target
        const renderStart = performance.now();
        renderer.setRenderTarget(webgpuRT);
        // WebGPU uses renderAsync but we're in a sync useFrame, so use render
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        const renderEnd = performance.now();
        const renderMs = renderEnd - renderStart;

        // Start async readback (non-blocking)
        webgpuReadbackPending.current = true;
        captureFrameWebGPU(renderer, webgpuRT, width, height, renderMs);
        return;
      }

      // === WebGL Path ===
      // Get WebGL context
      const glContext = gl.getContext();

      // === WebGL Path - use typed render target ===
      const webglRT = webglRenderTargetRef.current!;

      // === TIMING: Render ===
      const renderStart = performance.now();
      gl.setRenderTarget(webglRT);
      gl.render(scene, camera);
      gl.setRenderTarget(null); // Reset to default
      const renderEnd = performance.now();
      const renderMs = renderEnd - renderStart;

      // Ensure we have a buffer of the right size
      const bufferSize = width * height * 4;
      if (
        !fullResBufferRef.current ||
        fullResBufferRef.current.length !== bufferSize
      ) {
        fullResBufferRef.current = new Uint8Array(bufferSize);
      }

      // Ensure temp row buffer exists (for flipping)
      const rowSize = width * 4;
      if (
        !tempRowBufferRef.current ||
        tempRowBufferRef.current.length !== rowSize
      ) {
        tempRowBufferRef.current = new Uint8Array(rowSize);
      }

      let readPixelsMs: number;
      let hasPixelData = false;

      // Try PBO async readback if supported
      if (USE_PBO_ASYNC_READBACK && pboSupported.current !== false) {
        // Initialize PBOs if needed
        if (!pboInitialized.current) {
          initializePBOs(glContext, width, height);
        }

        if (pboSupported.current && pboInitialized.current) {
          const readStart = performance.now();

          // Index of PBO we'll read FROM (previous frame's data)
          const readPboIndex = currentPboIndex.current;
          // Index of PBO we'll write TO (current frame)
          const writePboIndex = 1 - currentPboIndex.current;

          // Try to read from the previous frame's PBO
          const pboToRead = pboStateRef.current[readPboIndex];
          if (pboToRead && pboToRead.fence) {
            hasPixelData = readFromPBO(
              glContext,
              readPboIndex,
              fullResBufferRef.current,
            );
          }

          // Start async readback for current frame into the other PBO
          startAsyncReadback(glContext, webglRT, writePboIndex);

          // Swap PBO indices for next frame
          currentPboIndex.current = writePboIndex;

          const readEnd = performance.now();
          readPixelsMs = readEnd - readStart;

          // If we don't have data yet (first frame with PBO), skip sending
          if (!hasPixelData) {
            // First frame - just started async readback, no data yet
            return;
          }
        } else {
          // Fallback to sync readPixels
          const readStart = performance.now();
          gl.readRenderTargetPixels(
            webglRT,
            0,
            0,
            width,
            height,
            fullResBufferRef.current,
          );
          const readEnd = performance.now();
          readPixelsMs = readEnd - readStart;
          hasPixelData = true;
        }
      } else {
        // === TIMING: Read Pixels (sync) ===
        const readStart = performance.now();
        gl.readRenderTargetPixels(
          webglRT,
          0,
          0,
          width,
          height,
          fullResBufferRef.current,
        );
        const readEnd = performance.now();
        readPixelsMs = readEnd - readStart;
        hasPixelData = true;
      }

      if (!hasPixelData) {
        return;
      }

      // === TIMING: Flip ===
      const flipStart = performance.now();
      flipVerticallyInPlace(
        fullResBufferRef.current,
        width,
        height,
        tempRowBufferRef.current,
      );
      const flipEnd = performance.now();
      const flipMs = flipEnd - flipStart;

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
      encodeAndSend(sendBufferRef.current, width, height, {
        renderMs,
        readPixelsMs,
        flipMs,
      });
    } catch (e) {
      logger.error("VideoCapture", "Capture error:", e);
    }
  });

  // This component doesn't render anything
  return null;
}

export default VideoOutputCapture;
