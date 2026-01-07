import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import * as THREEWebGPU from "three/webgpu";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const PREVIEW_SCALE = 0.5;
const DEFAULT_FPS = 30;
const FIRST_CAPTURE_DELAY_MS = 100;

function isWebGPURenderer(
  gl: THREE.WebGLRenderer | THREEWebGPU.WebGPURenderer,
): gl is THREEWebGPU.WebGPURenderer {
  return "isWebGPURenderer" in gl && gl.isWebGPURenderer === true;
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
  const tempRowRef = useRef<Uint8Array | null>(null);
  const captureIndexRef = useRef(0);

  const previewWidth = Math.round(size.width * PREVIEW_SCALE);
  const previewHeight = Math.round(size.height * PREVIEW_SCALE);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const checkConfig = async () => {
      try {
        const config = await invoke<{
          stream_slots: boolean;
          target_fps: number;
        }>("get_frame_distribution_config");
        streamSlotsEnabledRef.current = config.stream_slots;
        fpsRef.current = config.target_fps;
      } catch {}
    };

    checkConfig();
    listen("renderer-settings-changed", checkConfig).then((u) => {
      unlisten = u;
    });

    return () => unlisten?.();
  }, []);

  const getOrCreateTarget = useCallback(
    (slotIndex: number): THREE.WebGLRenderTarget | THREEWebGPU.RenderTarget => {
      let target = renderTargetsRef.current.get(slotIndex);
      if (target) {
        if (target.width !== previewWidth || target.height !== previewHeight) {
          target.setSize(previewWidth, previewHeight);
        }
        return target;
      }

      const opts = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      };
      target = isWebGPU
        ? new THREEWebGPU.RenderTarget(previewWidth, previewHeight, opts)
        : new THREE.WebGLRenderTarget(previewWidth, previewHeight, opts);
      target.texture.colorSpace = THREE.SRGBColorSpace;
      renderTargetsRef.current.set(slotIndex, target);
      return target;
    },
    [previewWidth, previewHeight, isWebGPU],
  );

  useEffect(() => {
    const activeSet = new Set(visibleSlotIndices);
    const now = performance.now();
    for (const idx of visibleSlotIndices) {
      if (!slotFirstSeenTimeRef.current.has(idx)) {
        slotFirstSeenTimeRef.current.set(idx, now);
      }
    }
    for (const [index, target] of renderTargetsRef.current) {
      if (!activeSet.has(index)) {
        target.dispose();
        renderTargetsRef.current.delete(index);
        lastCaptureTimeRef.current.delete(index);
        slotFirstSeenTimeRef.current.delete(index);
      }
    }
  }, [visibleSlotIndices]);

  useEffect(() => {
    return () => {
      for (const target of renderTargetsRef.current.values()) target.dispose();
      renderTargetsRef.current.clear();
    };
  }, []);

  const distributeFrame = useCallback(
    (pixels: Uint8Array, width: number, height: number, slotIndex: number) => {
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
    },
    [],
  );

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
      if (now - firstSeenTime < FIRST_CAPTURE_DELAY_MS) continue;
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
    const originalVisibility = new Map<number, boolean>();
    for (const [index, group] of groups) {
      originalVisibility.set(index, group.visible);
      group.visible = index === slotIndex;
    }

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

    for (const [index, visible] of originalVisibility) {
      const group = groups.get(index);
      if (group) {
        group.visible = visible;
      }
    }

    const width = target.width;
    const height = target.height;

    if (isWebGPU) {
      const renderer = gl as THREEWebGPU.WebGPURenderer;
      const idx = slotIndex;
      pendingReadbackRef.current.set(idx, true);
      renderer
        .readRenderTargetPixelsAsync(
          target as THREEWebGPU.RenderTarget,
          0,
          0,
          width,
          height,
        )
        .then((arr) => {
          pendingReadbackRef.current.set(idx, false);
          distributeFrame(new Uint8Array(arr.buffer), width, height, idx);
        })
        .catch(() => pendingReadbackRef.current.set(idx, false));
    } else {
      const pixels = new Uint8Array(width * height * 4);
      (gl as THREE.WebGLRenderer).readRenderTargetPixels(
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
