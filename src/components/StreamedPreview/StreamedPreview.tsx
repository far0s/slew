import { useEffect, useRef, useState, useMemo } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

// Debounce dimension changes to avoid rapid texture recreation during resize
const DIMENSION_DEBOUNCE_MS = 100;

interface FrameMetadata {
  frame_number: number;
  width: number;
  height: number;
  source: "composited" | { slot: number };
  capture_timestamp_ms: number;
  data: string;
}

function getSlotIndexFromSource(
  source: "composited" | { slot: number },
): number | null {
  if (source === "composited") return null;
  if (typeof source === "object" && "slot" in source) return source.slot;
  return null;
}

interface StreamedPreviewProps {
  source: "composited" | `slot-${number}`;
  /** Called when the first frame is received (streaming has started) */
  onFirstFrame?: () => void;
}

const BG_COLOR = { r: 2, g: 6, b: 23 };

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function createTexture(width: number, height: number): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = BG_COLOR.r;
    data[i + 1] = BG_COLOR.g;
    data[i + 2] = BG_COLOR.b;
    data[i + 3] = 255;
  }

  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * StreamedPreview - Displays frames streamed from the Renderer window.
 *
 * Simplified architecture:
 * - Receives frame data via Tauri events
 * - Updates texture when frames arrive
 * - Debounces dimension changes to avoid rapid texture recreation during resize
 * - Shows last valid frame during dimension transitions
 * - No complex streaming status tracking - just render what we have
 */
export function StreamedPreview({
  source,
  onFirstFrame,
}: StreamedPreviewProps) {
  const { viewport, camera } = useThree();

  // Texture and material refs for stable binding
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Current texture dimensions (debounced)
  const [textureDimensions, setTextureDimensions] = useState({
    width: 1920,
    height: 1080,
  });

  // Pending dimension change for debouncing
  const pendingDimensionsRef = useRef<{ width: number; height: number } | null>(
    null,
  );
  const dimensionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Latest frame data waiting to be applied
  const latestFrameRef = useRef<{
    data: Uint8Array;
    width: number;
    height: number;
  } | null>(null);

  // Track whether we've ever received a frame
  const hasReceivedFrameRef = useRef(false);
  const onFirstFrameRef = useRef(onFirstFrame);

  // Keep callback ref in sync
  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  // Event name based on source
  const eventName = useMemo(
    () =>
      source === "composited"
        ? "preview-frame-composited"
        : "preview-frame-slot",
    [source],
  );

  // Extract slot index from source prop (e.g., "slot-0" -> 0)
  const expectedSlotIndex = useMemo(() => {
    if (source === "composited") return null;
    const match = source.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }, [source]);

  // Create/recreate texture when dimensions change
  useEffect(() => {
    const texture = createTexture(
      textureDimensions.width,
      textureDimensions.height,
    );
    const oldTexture = textureRef.current;
    textureRef.current = texture;

    // Update material's map reference
    if (materialRef.current) {
      materialRef.current.map = texture;
      materialRef.current.needsUpdate = true;
    }

    // Apply latest frame if dimensions match
    if (latestFrameRef.current) {
      const { data, width, height } = latestFrameRef.current;
      if (
        width === textureDimensions.width &&
        height === textureDimensions.height &&
        data.length === width * height * 4
      ) {
        (texture.image.data as Uint8Array).set(data);
        texture.needsUpdate = true;
      }
    }

    // Dispose old texture
    if (oldTexture) {
      oldTexture.dispose();
    }

    return () => {
      texture.dispose();
    };
  }, [textureDimensions, source]);

  // Cleanup dimension timeout on unmount
  useEffect(() => {
    return () => {
      if (dimensionTimeoutRef.current) {
        clearTimeout(dimensionTimeoutRef.current);
      }
    };
  }, []);

  // Listen for frame events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let mounted = true;

    const setupListener = async () => {
      try {
        unlisten = await listen<FrameMetadata>(eventName, (event) => {
          if (!mounted) return;

          const { width, height, data, source: frameSource } = event.payload;

          // For slot events, filter by slot index
          if (expectedSlotIndex !== null) {
            const frameSlotIndex = getSlotIndexFromSource(frameSource);
            if (frameSlotIndex !== expectedSlotIndex) {
              return;
            }
          }

          // Decode pixel data
          let pixels: Uint8Array;
          try {
            pixels = base64ToUint8Array(data);
          } catch {
            return;
          }

          // Notify on first frame
          if (!hasReceivedFrameRef.current) {
            hasReceivedFrameRef.current = true;
            onFirstFrameRef.current?.();
          }

          // Store latest frame
          latestFrameRef.current = { data: pixels, width, height };

          // Check if dimensions match current texture
          const tex = textureRef.current;
          if (tex && tex.image.width === width && tex.image.height === height) {
            // Dimensions match - update texture directly
            if (pixels.length === width * height * 4) {
              (tex.image.data as Uint8Array).set(pixels);
              tex.needsUpdate = true;
            }
          } else {
            // Dimensions don't match - debounce the resize
            const needsResize =
              !pendingDimensionsRef.current ||
              pendingDimensionsRef.current.width !== width ||
              pendingDimensionsRef.current.height !== height;

            if (needsResize) {
              pendingDimensionsRef.current = { width, height };

              // Clear existing timeout
              if (dimensionTimeoutRef.current) {
                clearTimeout(dimensionTimeoutRef.current);
              }

              // Schedule dimension update
              dimensionTimeoutRef.current = setTimeout(() => {
                if (!mounted) return;
                if (pendingDimensionsRef.current) {
                  setTextureDimensions({
                    width: pendingDimensionsRef.current.width,
                    height: pendingDimensionsRef.current.height,
                  });
                  pendingDimensionsRef.current = null;
                }
              }, DIMENSION_DEBOUNCE_MS);
            }
          }
        });
      } catch {
        // Listener setup failed - component will show placeholder
      }
    };

    setupListener();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [eventName, expectedSlotIndex, source]);

  // Ensure material stays bound to current texture (handles r3f reconciliation edge cases)
  useFrame(() => {
    if (materialRef.current && textureRef.current) {
      if (materialRef.current.map !== textureRef.current) {
        materialRef.current.map = textureRef.current;
        materialRef.current.needsUpdate = true;
      }
    }
  });

  // Calculate plane dimensions to fit viewport while maintaining aspect ratio
  const { planeWidth, planeHeight } = useMemo(() => {
    const frameAspect = textureDimensions.width / textureDimensions.height;

    if (camera instanceof THREE.PerspectiveCamera) {
      const dist = camera.position.z;
      const fovRad = (camera.fov * Math.PI) / 180;
      const visH = 2 * Math.tan(fovRad / 2) * dist;
      const visW = visH * viewport.aspect;

      return frameAspect > viewport.aspect
        ? { planeWidth: visW, planeHeight: visW / frameAspect }
        : { planeWidth: visH * frameAspect, planeHeight: visH };
    }

    return frameAspect > viewport.aspect
      ? {
          planeWidth: viewport.width,
          planeHeight: viewport.width / frameAspect,
        }
      : {
          planeWidth: viewport.height * frameAspect,
          planeHeight: viewport.height,
        };
  }, [camera, viewport, textureDimensions]);

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <mesh>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial ref={materialRef} toneMapped={false} />
      </mesh>
    </>
  );
}

export default StreamedPreview;
