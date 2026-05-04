/// <reference types="@webgpu/types" />
import { ReactNode, useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three/webgpu";

type RendererBackend = "webgpu" | "webgl2" | "detecting";

interface WebGPUCanvasProps {
  children: ReactNode;
  camera?: { position?: [number, number, number]; fov?: number };
  fallback?: ReactNode;
  frameloop?: "always" | "demand" | "never";
  onRendererReady?: (backend: "webgpu" | "webgl2") => void;
  /** Optional className for the container div shown during detection */
  className?: string;
  /** Optional style for the Canvas */
  style?: React.CSSProperties;
  /**
   * Device pixel ratio for rendering.
   * - 1 = 1x resolution (best performance, recommended for heavy shaders)
   * - 2 = 2x resolution (Retina quality, 4x pixel count)
   * - [min, max] = Clamp between range
   * - undefined = Use device default (respects window.devicePixelRatio)
   * @default 1
   */
  dpr?: number | [min: number, max: number];
}

/**
 * Check if native WebGPU is available in the browser
 */
async function checkWebGPUSupport(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * WebGPUCanvas
 *
 * A Canvas wrapper that always uses THREE.WebGPURenderer for TSL/node material compatibility.
 *
 * Key insight: WebGPURenderer can target both WebGPU and WebGL2 backends.
 * TSL (Three.js Shading Language) materials ONLY work with WebGPURenderer,
 * not the standard WebGLRenderer. So we always use WebGPURenderer, but with
 * `forceWebGL: true` when native WebGPU isn't available.
 *
 * This ensures:
 * - TSL node materials (MeshBasicNodeMaterial, etc.) work everywhere
 * - Best performance with native WebGPU when available
 * - Fallback to WebGL2 backend for broad compatibility
 *
 * Performance note:
 * The `dpr` prop defaults to 1 to optimize for heavy shaders like Aura.
 * On Retina displays (2x DPR), this reduces pixel count by 4x.
 * Set `dpr={2}` or `dpr={[1, 2]}` for sharper rendering at the cost of performance.
 */
export function WebGPUCanvas({
  children,
  camera,
  fallback,
  frameloop = "always",
  onRendererReady,
  className,
  style,
  dpr = 1,
}: WebGPUCanvasProps) {
  const [backend, setBackend] = useState<RendererBackend>("detecting");
  const [forceWebGL, setForceWebGL] = useState(false);

  useEffect(() => {
    let cancelled = false;

    checkWebGPUSupport().then((webgpuSupported) => {
      if (cancelled) return;

      if (webgpuSupported) {
        setForceWebGL(false);
        setBackend("webgpu");
        onRendererReady?.("webgpu");
      } else {
        setForceWebGL(true);
        setBackend("webgl2");
        onRendererReady?.("webgl2");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [onRendererReady]);

  // WebGPURenderer factory - always uses WebGPURenderer, optionally forcing WebGL2 backend
  const createRenderer = useCallback(
    async (props: {
      canvas: HTMLCanvasElement;
      antialias?: boolean;
      alpha?: boolean;
      powerPreference?: GPUPowerPreference;
    }) => {
      const renderer = new THREE.WebGPURenderer({
        canvas: props.canvas,
        antialias: props.antialias ?? true,
        alpha: props.alpha ?? true,
        powerPreference: props.powerPreference ?? "high-performance",
        // Force WebGL2 backend when native WebGPU isn't available
        // This still supports TSL/node materials unlike standard WebGLRenderer
        forceWebGL,
      });

      await renderer.init();

      return renderer;
    },
    [forceWebGL],
  );

  // Still detecting WebGPU support
  if (backend === "detecting") {
    return (
      fallback ?? (
        <div
          className={className}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#000",
            color: "#666",
            fontSize: "12px",
            ...style,
          }}
        >
          Initializing…
        </div>
      )
    );
  }

  // Render with WebGPURenderer (using either WebGPU or WebGL2 backend)
  return (
    <Canvas
      camera={camera}
      frameloop={frameloop}
      style={style}
      dpr={dpr}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gl={createRenderer as any}
    >
      {children}
    </Canvas>
  );
}

export default WebGPUCanvas;
