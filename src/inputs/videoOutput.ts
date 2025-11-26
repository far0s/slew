/**
 * Video Output Types and Hooks
 *
 * Provides TypeScript types matching the Rust VideoOutput module and
 * React hooks for managing video output backends (Syphon, Spout, NDI).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/**
 * Pixel format for frame data.
 *
 * @property rgba - 8-bit RGBA (4 bytes per pixel)
 * @property bgra - 8-bit BGRA (4 bytes per pixel) — native for some backends
 * @property rgb - 8-bit RGB (3 bytes per pixel)
 */
export type PixelFormat = "rgba" | "bgra" | "rgb";

/**
 * Status of a video output backend.
 *
 * @property id - Backend identifier (e.g., "syphon", "spout", "ndi")
 * @property name - Human-readable backend name
 * @property active - Whether the backend is currently active
 * @property available - Whether the backend is available on this platform
 * @property receivers - Number of connected receivers (if known)
 * @property frames_published - Frames published since activation
 * @property last_error - Last error message (if any)
 */
export interface BackendStatus {
  id: string;
  name: string;
  active: boolean;
  available: boolean;
  receivers: number | null;
  frames_published: number;
  last_error: string | null;
}

// ============================================================================
// Tauri Command Wrappers
// ============================================================================

/** List all video output backends and their status. */
export async function listVideoBackends(): Promise<BackendStatus[]> {
  return invoke<BackendStatus[]>("list_video_backends");
}

/** Get status of a specific backend. */
export async function getVideoBackendStatus(
  backendId: string
): Promise<BackendStatus> {
  return invoke<BackendStatus>("get_video_backend_status", {
    backendId,
  });
}

/** Initialize a video output backend. */
export async function initVideoBackend(
  backendId: string,
  name: string
): Promise<BackendStatus> {
  return invoke<BackendStatus>("init_video_backend", {
    backendId,
    name,
  });
}

/** Shutdown a video output backend. */
export async function shutdownVideoBackend(
  backendId: string
): Promise<BackendStatus> {
  return invoke<BackendStatus>("shutdown_video_backend", {
    backendId,
  });
}

/**
 * Publish a video frame from the renderer.
 *
 * @param data - Base64-encoded frame data
 * @param width - Width in pixels
 * @param height - Height in pixels
 * @param format - Pixel format ("rgba", "bgra", or "rgb")
 */
export async function publishVideoFrame(
  data: string,
  width: number,
  height: number,
  format: PixelFormat
): Promise<void> {
  return invoke("publish_video_frame", {
    data,
    width,
    height,
    format,
  });
}

// ============================================================================
// Frame Capture Utilities
// ============================================================================

/**
 * Capture the current frame from a canvas element.
 *
 * @param canvas - The canvas element to capture
 * @param format - Pixel format to use (default: rgba)
 * @returns Object with base64 data and dimensions
 */
export function captureCanvas(
  canvas: HTMLCanvasElement,
  format: PixelFormat = "rgba"
): { data: string; width: number; height: number; format: PixelFormat } {
  const ctx = canvas.getContext("2d") || canvas.getContext("webgl");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  // For WebGL, we need to read pixels differently
  if (ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext) {
    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);

    ctx.readPixels(0, 0, width, height, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels);

    // WebGL reads from bottom-left, need to flip vertically
    const flipped = new Uint8Array(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      const srcRow = (height - y - 1) * rowSize;
      const dstRow = y * rowSize;
      flipped.set(pixels.subarray(srcRow, srcRow + rowSize), dstRow);
    }

    // Convert to base64
    const binary = String.fromCharCode(...flipped);
    const base64 = btoa(binary);

    return { data: base64, width, height, format: "rgba" };
  }

  // For 2D context, use toDataURL
  const dataUrl = canvas.toDataURL("image/png");
  // Note: This returns PNG, not raw pixels. For raw pixels, use ImageData.

  return {
    data: dataUrl,
    width: canvas.width,
    height: canvas.height,
    format,
  };
}

/**
 * Capture raw pixel data from a 2D canvas context.
 *
 * @param canvas - The canvas element to capture
 * @returns Object with base64 data and dimensions
 */
export function captureCanvasRaw(
  canvas: HTMLCanvasElement
): { data: string; width: number; height: number; format: PixelFormat } {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not get 2D canvas context");
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const binary = String.fromCharCode(...imageData.data);
  const base64 = btoa(binary);

  return {
    data: base64,
    width: canvas.width,
    height: canvas.height,
    format: "rgba",
  };
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to manage video output backends.
 *
 * Provides:
 * - List of all backends with their status
 * - Functions to initialize/shutdown backends
 * - Auto-refresh on status changes
 */
export function useVideoOutputBackends() {
  const [backends, setBackends] = useState<BackendStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load backends on mount
  const refresh = useCallback(async () => {
    try {
      const result = await listVideoBackends();
      setBackends(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for status changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<BackendStatus>("video_output_status_changed", (event) => {
      setBackends((prev) =>
        prev.map((b) => (b.id === event.payload.id ? event.payload : b))
      );
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Initialize a backend
  const initialize = useCallback(
    async (backendId: string, name: string = "sebcat-vj") => {
      try {
        const status = await initVideoBackend(backendId, name);
        setBackends((prev) =>
          prev.map((b) => (b.id === backendId ? status : b))
        );
        return status;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    []
  );

  // Shutdown a backend
  const shutdown = useCallback(async (backendId: string) => {
    try {
      const status = await shutdownVideoBackend(backendId);
      setBackends((prev) =>
        prev.map((b) => (b.id === backendId ? status : b))
      );
      return status;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  // Toggle a backend on/off
  const toggle = useCallback(
    async (backendId: string, name: string = "sebcat-vj") => {
      const backend = backends.find((b) => b.id === backendId);
      if (!backend) {
        throw new Error(`Backend '${backendId}' not found`);
      }

      if (backend.active) {
        return shutdown(backendId);
      } else {
        return initialize(backendId, name);
      }
    },
    [backends, initialize, shutdown]
  );

  return {
    backends,
    loading,
    error,
    refresh,
    initialize,
    shutdown,
    toggle,
  };
}

/**
 * Hook to publish frames to video output backends.
 *
 * Provides a publish function that captures a canvas and sends it to backends.
 * Includes frame rate limiting and performance metrics.
 */
export function useVideoFramePublisher(options?: {
  /** Target frame rate (default: 60) */
  targetFps?: number;
  /** Pixel format (default: rgba) */
  format?: PixelFormat;
}) {
  const { targetFps = 60, format = "rgba" } = options ?? {};

  const [isPublishing, setIsPublishing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [actualFps, setActualFps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const lastFrameTime = useRef<number>(0);
  const frameInterval = 1000 / targetFps;
  const fpsCounterRef = useRef<{ frames: number; lastTime: number }>({
    frames: 0,
    lastTime: Date.now(),
  });

  // Publish a single frame
  const publishFrame = useCallback(
    async (canvas: HTMLCanvasElement) => {
      const now = performance.now();

      // Frame rate limiting
      if (now - lastFrameTime.current < frameInterval) {
        return;
      }
      lastFrameTime.current = now;

      try {
        const { data, width, height } = captureCanvas(canvas, format);
        await publishVideoFrame(data, width, height, format);

        setFrameCount((c) => c + 1);
        setError(null);

        // Update FPS counter
        fpsCounterRef.current.frames++;
        const elapsed = Date.now() - fpsCounterRef.current.lastTime;
        if (elapsed >= 1000) {
          setActualFps(
            Math.round(
              (fpsCounterRef.current.frames * 1000) / elapsed
            )
          );
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = Date.now();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [format, frameInterval]
  );

  // Start continuous publishing from a canvas
  const startPublishing = useCallback(
    (canvas: HTMLCanvasElement) => {
      setIsPublishing(true);
      setFrameCount(0);
      fpsCounterRef.current = { frames: 0, lastTime: Date.now() };

      let animationId: number;

      const tick = () => {
        publishFrame(canvas);
        animationId = requestAnimationFrame(tick);
      };

      animationId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(animationId);
        setIsPublishing(false);
      };
    },
    [publishFrame]
  );

  return {
    publishFrame,
    startPublishing,
    isPublishing,
    frameCount,
    actualFps,
    error,
  };
}

/**
 * Hook for a specific video output backend.
 *
 * Provides status and control for a single backend.
 */
export function useVideoBackend(backendId: string) {
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial status
  useEffect(() => {
    getVideoBackendStatus(backendId)
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [backendId]);

  // Listen for status changes
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    listen<BackendStatus>("video_output_status_changed", (event) => {
      if (event.payload.id === backendId) {
        setStatus(event.payload);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [backendId]);

  // Initialize the backend
  const initialize = useCallback(
    async (name: string = "sebcat-vj") => {
      try {
        const newStatus = await initVideoBackend(backendId, name);
        setStatus(newStatus);
        setError(null);
        return newStatus;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e;
      }
    },
    [backendId]
  );

  // Shutdown the backend
  const shutdown = useCallback(async () => {
    try {
      const newStatus = await shutdownVideoBackend(backendId);
      setStatus(newStatus);
      setError(null);
      return newStatus;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    }
  }, [backendId]);

  // Toggle on/off
  const toggle = useCallback(
    async (name: string = "sebcat-vj") => {
      if (status?.active) {
        return shutdown();
      } else {
        return initialize(name);
      }
    },
    [status, initialize, shutdown]
  );

  return {
    status,
    loading,
    error,
    initialize,
    shutdown,
    toggle,
    isAvailable: status?.available ?? false,
    isActive: status?.active ?? false,
  };
}
