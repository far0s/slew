/**
 * StreamedPreview - Displays frames streamed from the Renderer window.
 * Receives frame data via Tauri events and updates a texture in real-time.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

interface FrameMetadata {
  frame_number: number;
  width: number;
  height: number;
  source: "composited" | { Slot: number };
  capture_timestamp_ms: number;
  data: string; // Base64-encoded RGBA pixel data
}

interface StreamedPreviewProps {
  source: "composited" | `slot-${number}`;
  onFrameReceived?: (frameNumber: number, latencyMs: number) => void;
  onStreamingStatusChange?: (isStreaming: boolean) => void;
}

const DEBUG =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("previewStreamDebug") === "true";
const STREAM_TIMEOUT_MS = 2000;

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function StreamedPreview({
  source,
  onFrameReceived,
  onStreamingStatusChange,
}: StreamedPreviewProps) {
  const { viewport, camera } = useThree();
  const textureRef = useRef<THREE.DataTexture | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [isStreaming, setIsStreaming] = useState(false);
  const lastFrameTimeRef = useRef(0);
  const pendingFrameRef = useRef<{
    data: Uint8Array;
    width: number;
    height: number;
  } | null>(null);

  const eventName = useMemo(() => {
    if (source === "composited") return "preview-frame-composited";
    const match = source.match(/^slot-(\d)$/);
    return match
      ? `preview-frame-slot-${match[1]}`
      : "preview-frame-composited";
  }, [source]);

  // Initialize texture
  useEffect(() => {
    const { width, height } = dimensions;
    const data = new Uint8Array(width * height * 4);
    // Fill with dark background (#020617)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 2;
      data[i + 1] = 6;
      data[i + 2] = 23;
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
    textureRef.current = texture;

    if (materialRef.current) {
      materialRef.current.map = texture;
      materialRef.current.needsUpdate = true;
    }

    return () => texture.dispose();
  }, [dimensions]);

  // Listen for frame events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setup = async () => {
      unlisten = await listen<FrameMetadata>(eventName, (event) => {
        lastFrameTimeRef.current = performance.now();
        const { width, height, data, frame_number, capture_timestamp_ms } =
          event.payload;

        let pixels: Uint8Array;
        try {
          pixels = base64ToUint8Array(data);
        } catch {
          return;
        }

        onFrameReceived?.(frame_number, Date.now() - capture_timestamp_ms);

        // Handle dimension change
        if (width !== dimensions.width || height !== dimensions.height) {
          setDimensions({ width, height });
          pendingFrameRef.current = { data: pixels, width, height };
          return;
        }

        // Update texture
        if (textureRef.current?.image?.data) {
          const expected = width * height * 4;
          if (pixels.length === expected) {
            (textureRef.current.image.data as Uint8Array).set(pixels);
            textureRef.current.needsUpdate = true;
          }
        }

        if (!isStreaming) {
          setIsStreaming(true);
          onStreamingStatusChange?.(true);
        }
      });
    };

    setup();
    return () => {
      unlisten?.();
    };
  }, [
    eventName,
    dimensions,
    isStreaming,
    onFrameReceived,
    onStreamingStatusChange,
  ]);

  // Apply pending frame after dimension change
  useEffect(() => {
    if (pendingFrameRef.current && textureRef.current?.image?.data) {
      const { data, width, height } = pendingFrameRef.current;
      if (data.length === width * height * 4) {
        (textureRef.current.image.data as Uint8Array).set(data);
        textureRef.current.needsUpdate = true;
      }
      pendingFrameRef.current = null;
    }
  }, [dimensions]);

  // Stream timeout detection
  useFrame(() => {
    if (
      isStreaming &&
      performance.now() - lastFrameTimeRef.current > STREAM_TIMEOUT_MS
    ) {
      setIsStreaming(false);
      onStreamingStatusChange?.(false);
      if (DEBUG) console.log(`[PreviewStream] Timeout for ${source}`);
    }
  });

  // Calculate plane size preserving frame aspect ratio ("contain" logic)
  const { planeWidth, planeHeight } = useMemo(() => {
    const frameAspect = dimensions.width / dimensions.height;

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
  }, [camera, viewport, dimensions]);

  return (
    <>
      <color attach="background" args={["#020617"]} />
      <mesh>
        <planeGeometry args={[planeWidth, planeHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          map={textureRef.current}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

export default StreamedPreview;
