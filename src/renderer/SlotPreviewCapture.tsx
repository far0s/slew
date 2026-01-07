/**
 * SlotPreviewCapture - Captures individual slot previews for streaming to Controls window.
 *
 * Uses a pre-render capture approach with priority 0 (same as default).
 * NOTE: Priority 1 (post-render) breaks WebGPU rendering in react-three-fiber.
 *
 * Captures each slot individually by toggling visibility, then immediately restores
 * visibility before the main render occurs.
 *
 * Supports both WebGL and WebGPU renderers with appropriate pixel readback methods.
 */

import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const PREVIEW_SCALE = 0.5;
const DEFAULT_FPS = 30;
const DEBUG =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("previewStreamDebug") === "true";

// Delay first capture of a new slot to allow sketch materials to initialize
const FIRST_CAPTURE_DELAY_MS = 100;

function isWebGPURenderer(
  renderer: THREE.WebGLRenderer | THREEWebGPU.WebGPURenderer,
): renderer is THREEWebGPU.WebGPURenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}

interface SlotPreviewCaptureProps {
  slotGroups: React.MutableRefObject<Map<number, THREE.Group>>;
  visibleSlotIndices: number[];
}

export function SlotPreviewCapture({
  slotGroups,
  visibleSlotIndices,
}: SlotPreviewCaptureProps) {
  const { gl, scene, camera, size } = useThree();
  const isWebGPU = isWebGPURenderer(gl);
  const renderTargetsRef = useRef<
    Map<number, THREE.WebGLRenderTarget | THREEWebGPU.RenderTarget>
  >(new Map());
  const pendingReadbackRef = useRef<Map<number, boolean>>(new Map());
  const lastCaptureTimeRef = useRef<Map<number, number>>(new Map());
  const slotFirstSeenTimeRef = useRef<Map<number, number>>(new Map());
  const streamSlotsEnabledRef = useRef(false);
  const fpsRef = useRef(DEFAULT_FPS);
  const frameCountRef = useRef(0);
  const tempRowRef = useRef<Uint8Array | null>(null);
  const captureIndexRef = useRef(0);

  const previewWidth = Math.round(size.width * PREVIEW_SCALE);
  const previewHeight = Math.round(size.height * PREVIEW_SCALE);

  // Check config on mount and listen for changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const checkConfig = async () => {
      try {
        const config = await invoke<{
          enabled: boolean;
          stream_composited: boolean;
          stream_slots: boolean;
          target_fps: number;
        }>("get_frame_distribution_config");
        streamSlotsEnabledRef.current = config.stream_slots;
        fpsRef.current = config.target_fps;
        if (DEBUG) {
          console.log("[SlotPreviewCapture] Config:", config);
        }
      } catch {
        // Config not available yet
      }
    };

    checkConfig();

    listen("renderer-settings-changed", () => {
      checkConfig();
    }).then((u) => {
      unlisten = u;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Get or create render target for a slot
  const getOrCreateTarget = useCallback(
    (slotIndex: number): THREE.WebGLRenderTarget | THREEWebGPU.RenderTarget => {
      let target = renderTargetsRef.current.get(slotIndex);

      if (target) {
        if (target.width !== previewWidth || target.height !== previewHeight) {
          target.setSize(previewWidth, previewHeight);
        }
        return target;
      }

      if (isWebGPU) {
        target = new THREEWebGPU.RenderTarget(previewWidth, previewHeight, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });
      } else {
        target = new THREE.WebGLRenderTarget(previewWidth, previewHeight, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });
      }

      // Set color space on the texture to match the main render output
      target.texture.colorSpace = THREE.SRGBColorSpace;

      renderTargetsRef.current.set(slotIndex, target);

      if (DEBUG) {
        console.log(
          `[SlotPreviewCapture] Created ${isWebGPU ? "WebGPU" : "WebGL"} target for slot ${slotIndex} @ ${previewWidth}x${previewHeight}`,
        );
      }

      return target;
    },
    [previewWidth, previewHeight, isWebGPU],
  );

  // Cleanup unused targets and track when slots are first seen
  useEffect(() => {
    const activeSet = new Set(visibleSlotIndices);
    const now = performance.now();

    // Track first-seen time for new slots
    for (const idx of visibleSlotIndices) {
      if (!slotFirstSeenTimeRef.current.has(idx)) {
        slotFirstSeenTimeRef.current.set(idx, now);
      }
    }

    // Cleanup removed slots
    for (const [index, target] of renderTargetsRef.current) {
      if (!activeSet.has(index)) {
        target.dispose();
        renderTargetsRef.current.delete(index);
        lastCaptureTimeRef.current.delete(index);
        slotFirstSeenTimeRef.current.delete(index);
      }
    }
  }, [visibleSlotIndices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const target of renderTargetsRef.current.values()) {
        target.dispose();
      }
      renderTargetsRef.current.clear();
    };
  }, []);

  // Helper to distribute frame data
  const distributeFrame = useCallback(
    (pixels: Uint8Array, width: number, height: number, slotIndex: number) => {
      // Flip vertically (WebGL/WebGPU read from bottom-left)
      const rowSize = width * 4;
      const halfHeight = Math.floor(height / 2);

      if (!tempRowRef.current || tempRowRef.current.length < rowSize) {
        tempRowRef.current = new Uint8Array(rowSize);
      }
      const tempRow = tempRowRef.current;

      for (let y = 0; y < halfHeight; y++) {
        const topOffset = y * rowSize;
        const bottomOffset = (height - y - 1) * rowSize;

        tempRow.set(pixels.subarray(topOffset, topOffset + rowSize));
        pixels.set(
          pixels.subarray(bottomOffset, bottomOffset + rowSize),
          topOffset,
        );
        pixels.set(tempRow, bottomOffset);
      }

      invoke("distribute_frame", pixels, {
        headers: {
          "X-Width": String(width),
          "X-Height": String(height),
          "X-Format": "rgba",
          "X-Source": `slot-${slotIndex}`,
        },
      }).catch(() => {});

      frameCountRef.current++;
      if (DEBUG && frameCountRef.current % 300 === 0) {
        console.log(
          `[SlotPreviewCapture] Captured slot ${slotIndex} @ ${width}x${height}`,
        );
      }
    },
    [],
  );

  // Capture slot frames using visibility toggling
  // IMPORTANT: Using priority 0 (default) because priority > 0 breaks WebGPU rendering
  // We capture one slot per frame to minimize overhead
  useFrame(() => {
    if (!streamSlotsEnabledRef.current) return;

    const groups = slotGroups.current;
    if (groups.size === 0 || visibleSlotIndices.length === 0) return;

    const now = performance.now();
    const intervalMs = 1000 / fpsRef.current;

    // Find the next slot that needs capturing (round-robin)
    let slotIndex: number | null = null;
    for (let i = 0; i < visibleSlotIndices.length; i++) {
      const idx =
        visibleSlotIndices[
          (captureIndexRef.current + i) % visibleSlotIndices.length
        ];
      const lastCapture = lastCaptureTimeRef.current.get(idx) ?? 0;
      const firstSeenTime = slotFirstSeenTimeRef.current.get(idx) ?? now;

      // Skip if slot was just added (allow sketch to initialize)
      if (now - firstSeenTime < FIRST_CAPTURE_DELAY_MS) {
        continue;
      }

      // Also check if a readback is pending for this slot
      if (
        now - lastCapture >= intervalMs &&
        !pendingReadbackRef.current.get(idx)
      ) {
        slotIndex = idx;
        captureIndexRef.current =
          (captureIndexRef.current + i + 1) % visibleSlotIndices.length;
        break;
      }
    }

    if (slotIndex === null) return;

    const slotGroup = groups.get(slotIndex);
    if (!slotGroup) return;

    lastCaptureTimeRef.current.set(slotIndex, now);

    // Store original visibility and hide all except target slot
    const originalVisibility = new Map<number, boolean>();
    for (const [index, group] of groups) {
      originalVisibility.set(index, group.visible);
      group.visible = index === slotIndex;
    }

    // Render to target
    const target = getOrCreateTarget(slotIndex);
    const prevTarget = gl.getRenderTarget();

    if (isWebGPU) {
      const webgpuRenderer = gl as THREEWebGPU.WebGPURenderer;
      webgpuRenderer.setRenderTarget(target as THREEWebGPU.RenderTarget);
      webgpuRenderer.clear();
      webgpuRenderer.render(scene, camera);
      webgpuRenderer.setRenderTarget(
        prevTarget as THREEWebGPU.RenderTarget | null,
      );
    } else {
      const webglRenderer = gl as THREE.WebGLRenderer;
      webglRenderer.setRenderTarget(target as THREE.WebGLRenderTarget);
      webglRenderer.clear();
      webglRenderer.render(scene, camera);
      webglRenderer.setRenderTarget(
        prevTarget as THREE.WebGLRenderTarget | null,
      );
    }

    // IMMEDIATELY restore visibility before the main render occurs
    for (const [index, visible] of originalVisibility) {
      const group = groups.get(index);
      if (group) {
        group.visible = visible;
      }
    }

    // Read pixels - different approach for WebGL vs WebGPU
    const width = target.width;
    const height = target.height;

    if (isWebGPU) {
      // WebGPU: use async readback
      const webgpuRenderer = gl as THREEWebGPU.WebGPURenderer;
      const capturedSlotIndex = slotIndex; // Capture for closure

      pendingReadbackRef.current.set(capturedSlotIndex, true);

      webgpuRenderer
        .readRenderTargetPixelsAsync(
          target as THREEWebGPU.RenderTarget,
          0,
          0,
          width,
          height,
        )
        .then((typedArray) => {
          pendingReadbackRef.current.set(capturedSlotIndex, false);
          const pixels = new Uint8Array(typedArray.buffer);
          distributeFrame(pixels, width, height, capturedSlotIndex);
        })
        .catch(() => {
          pendingReadbackRef.current.set(capturedSlotIndex, false);
        });
    } else {
      // WebGL: synchronous readback
      const pixels = new Uint8Array(width * height * 4);
      const webglRenderer = gl as THREE.WebGLRenderer;
      webglRenderer.readRenderTargetPixels(
        target as THREE.WebGLRenderTarget,
        0,
        0,
        width,
        height,
        pixels,
      );
      distributeFrame(pixels, width, height, slotIndex);
    }
  });

  return null;
}

export default SlotPreviewCapture;
