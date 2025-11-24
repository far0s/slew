import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import type { Event as TauriEvent } from "@tauri-apps/api/event";

/**
 * Entry point for the Tauri app.
 *
 * We support two windows:
 * - Renderer window:   Tauri `label: "renderer"`, URL `/renderer`
 * - Controls window:   Tauri `label: "controls"`, URL `/`
 *
 * Tauri loads the same bundled frontend for both windows, but we choose
 * what to render based on `window.location.pathname`. For now:
 *
 * - `/renderer` → basic renderer visualization that listens for crossfade events
 * - `/` (or anything else) → control UI (`App`)
 *
 * As the project grows:
 * - The renderer entrypoint will mount a dedicated React tree that hosts
 *   the r3f/WebGPU canvas and scene system.
 * - The controls entrypoint will mount the dashboard UI.
 */

const pathname = window.location.pathname;

type CrossfadePayload = {
  value?: unknown;
};

type SceneABrightnessPayload = {
  value?: unknown;
};

type BackendParameter = {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
};

type RendererParameterKey =
  | "crossfade"
  | "rotationSpeed"
  | "sceneABrightness"
  | "sceneAWobble";

/**
 * Ultra-minimal parameter abstraction local to the renderer.
 * This is intentionally simple and will later be replaced by the
 * real backend-driven Parameter Server.
 */
type RendererParameters = {
  crossfade: number;
  rotationSpeed: number;
  sceneABrightness: number;
  sceneAWobble: number;
};

/**
 * Helper to update a single renderer parameter in an immutable way.
 * Keeping all parameter writes going through this function will make
 * it easier to swap in a real backend-driven Parameter Server later.
 */
function updateRendererParam(
  current: RendererParameters,
  key: RendererParameterKey,
  value: number,
): RendererParameters {
  switch (key) {
    case "crossfade":
      return {
        ...current,
        crossfade: value,
      };
    case "rotationSpeed":
      return {
        ...current,
        rotationSpeed: value,
      };
    case "sceneABrightness":
      return {
        ...current,
        sceneABrightness: value,
      };
    case "sceneAWobble":
      return {
        ...current,
        sceneAWobble: value,
      };
    default: {
      // Exhaustive check for future keys.
      return current;
    }
  }
}

function SceneA({
  rotationSpeed,
  opacity,
  brightness,
  wobble,
}: {
  rotationSpeed: number;
  opacity: number;
  brightness: number;
  wobble: number;
}) {
  // Basic rotating cube representing Scene A. Rotation speed is provided
  // explicitly as a parameter, and opacity is used for the crossfade.
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const timeRef = React.useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Speed in radians per second; clamp delta to avoid huge jumps on tab switch.
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    const wobbleAmount = Math.max(0, Math.min(1, wobble));
    const wobbleOffsetX = wobbleAmount * 0.15 * Math.sin(timeRef.current * 1.3);
    const wobbleOffsetY = wobbleAmount * 0.1 * Math.cos(timeRef.current * 0.9);

    meshRef.current.rotation.y += rotationSpeed * clampedDelta;
    meshRef.current.rotation.x += rotationSpeed * 0.4 * clampedDelta;

    meshRef.current.position.x = wobbleOffsetX;
    meshRef.current.position.y = wobbleOffsetY;
  });

  const clampedBrightness = Math.max(0, Math.min(2, brightness));

  return (
    <mesh ref={meshRef} rotation={[0.5, 0.8, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#38bdf8"
        metalness={0.2}
        roughness={0.1}
        transparent
        opacity={opacity}
        emissive="#38bdf8"
        emissiveIntensity={0.3 * clampedBrightness}
      />
    </mesh>
  );
}

function SceneB({ opacity }: { opacity: number }) {
  // Simple “energy” object for now: a slightly larger warm-colored cube.
  return (
    <mesh rotation={[0.3, -0.4, 0]}>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial
        color="#f97316"
        metalness={0.4}
        roughness={0.25}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

function RendererRoot() {
  /**
   * Local parameter state for the renderer.
   *
   * This is a placeholder abstraction standing in for the future
   * backend Parameter Server:
   * - crossfade: 0..1, driven by the Controls window or backend-smoothed value
   * - rotationSpeed: can be driven independently
   * - sceneABrightness: emissive intensity for Scene A
   * - sceneAWobble: 0..1, controls wobble strength for Scene A
   */
  const [params, setParams] = useState<RendererParameters>({
    crossfade: 0.5,
    rotationSpeed: 0.6,
    sceneABrightness: 1,
    sceneAWobble: 0,
  });
  const [hasHydratedFromBackend, setHasHydratedFromBackend] = useState(false);
  const [useBackendSmoothedCrossfade, setUseBackendSmoothedCrossfade] =
    useState(false);
  const [useBackendRotationSpeed, setUseBackendRotationSpeed] = useState(false);

  /**
   * Centralized parameter update helper.
   * All mutations to the renderer's local parameter state should go
   * through this function so that the update logic stays in one place.
   *
   * Wrapped in useCallback so that effects depending on it have a stable
   * reference and don't re-subscribe unnecessarily.
   */
  const applyParamUpdate = React.useCallback(
    (key: RendererParameterKey, value: number) => {
      setParams((current) => updateRendererParam(current, key, value));
    },
    [],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<string>("renderer:crossfade", (event) => {
        // If we're currently driven by backend-smoothed crossfade values,
        // keep listening to this event only as a fallback, but ignore it
        // while the backend stream is healthy.
        if (useBackendSmoothedCrossfade) {
          return;
        }

        try {
          const parsed = JSON.parse(event.payload ?? "{}") as CrossfadePayload;

          if (typeof parsed.value === "number") {
            const clamped = Math.max(0, Math.min(1, parsed.value));

            // Update crossfade via the central helper.
            applyParamUpdate("crossfade", clamped);

            // When there is no dedicated backend rotationSpeed parameter,
            // we still derive a local rotation speed from crossfade as a
            // fallback. If a backend rotationSpeed is present, the
            // backend-driven path will override this.
            if (!useBackendRotationSpeed) {
              const baseSpeed = 0.6;
              const variation = (clamped - 0.5) * 0.4;
              applyParamUpdate("rotationSpeed", baseSpeed + variation);
            }
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to parse renderer:crossfade payload", error);
        }
      });
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyParamUpdate, useBackendSmoothedCrossfade, useBackendRotationSpeed]);

  // Listen for Scene A brightness events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<string>(
        "renderer:scene_a_brightness",
        (event) => {
          try {
            const parsed = JSON.parse(
              event.payload ?? "{}",
            ) as SceneABrightnessPayload;

            if (typeof parsed.value === "number") {
              const clamped = Math.max(0, Math.min(2, parsed.value));
              applyParamUpdate("sceneABrightness", clamped);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              "Failed to parse renderer:scene_a_brightness payload",
              error,
            );
          }
        },
      );
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyParamUpdate]);

  /**
   * On first mount, hydrate renderer parameters from the backend
   * Parameter Server so that the renderer reflects canonical state
   * rather than hard-coded defaults.
   */
  useEffect(() => {
    if (hasHydratedFromBackend) {
      return;
    }

    void (async () => {
      try {
        const backendParams = (await invoke(
          "get_parameters",
        )) as BackendParameter[];

        if (Array.isArray(backendParams)) {
          backendParams.forEach((param) => {
            // We only care about parameters we currently model locally.
            if (param.id === "crossfade") {
              const clamped = Math.max(0, Math.min(1, param.value));
              applyParamUpdate("crossfade", clamped);
            } else if (param.id === "rotationSpeed") {
              const clamped = Math.max(0, Math.min(5, param.value));
              setUseBackendRotationSpeed(true);
              applyParamUpdate("rotationSpeed", clamped);
            } else if (param.id === "scene_a_brightness") {
              const clamped = Math.max(0, Math.min(2, param.value));
              applyParamUpdate("sceneABrightness", clamped);
            } else if (param.id === "scene_a_wobble") {
              const clamped = Math.max(0, Math.min(1, param.value));
              applyParamUpdate("sceneAWobble", clamped);
            }
          });

          // If there was no explicit rotationSpeed parameter, fall back to
          // the crossfade-derived speed after hydration.
          if (!useBackendRotationSpeed) {
            const crossfadeParam = backendParams.find(
              (p) => p.id === "crossfade",
            );
            if (crossfadeParam) {
              const clamped = Math.max(0, Math.min(1, crossfadeParam.value));
              const baseSpeed = 0.6;
              const variation = (clamped - 0.5) * 0.4;
              applyParamUpdate("rotationSpeed", baseSpeed + variation);
            }
          }
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          "Failed to hydrate renderer parameters from backend",
          error,
        );
      } finally {
        setHasHydratedFromBackend(true);
      }
    })();
  }, [applyParamUpdate, hasHydratedFromBackend]);

  /**
   * Listen for backend Parameter Server events so the renderer can
   * follow smoothed values (e.g. crossfade transitions computed in Rust).
   *
   * We keep the direct `renderer:crossfade` path as a fallback and
   * default to backend-driven values once we see a matching parameter.
   */
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event: TauriEvent<BackendParameter>) => {
            const updated = event.payload;

            if (!updated) return;

            if (updated.id === "crossfade") {
              const clamped = Math.max(0, Math.min(1, updated.value));

              // Prefer backend-smoothed crossfade when available.
              setUseBackendSmoothedCrossfade(true);

              applyParamUpdate("crossfade", clamped);

              // Only derive rotationSpeed from crossfade if there is no
              // dedicated backend rotationSpeed parameter in use.
              if (!useBackendRotationSpeed) {
                const baseSpeed = 0.6;
                const variation = (clamped - 0.5) * 0.4;
                applyParamUpdate("rotationSpeed", baseSpeed + variation);
              }
            } else if (updated.id === "rotationSpeed") {
              const clamped = Math.max(0, Math.min(5, updated.value));
              setUseBackendRotationSpeed(true);
              applyParamUpdate("rotationSpeed", clamped);
            } else if (updated.id === "scene_a_brightness") {
              const clamped = Math.max(0, Math.min(2, updated.value));
              applyParamUpdate("sceneABrightness", clamped);
            } else if (updated.id === "scene_a_wobble") {
              const clamped = Math.max(0, Math.min(1, updated.value));
              applyParamUpdate("sceneAWobble", clamped);
            }
          },
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          "Renderer failed to subscribe to backend parameter_changed events",
          error,
        );
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [applyParamUpdate, useBackendRotationSpeed]);

  const percent = Math.round(params.crossfade * 100);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "0.75rem 1.25rem",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            zIndex: 10,
            position: "relative",
          }}
        >
          <h1
            style={{
              fontSize: "1rem",
              margin: 0,
              letterSpacing: 0.04,
              textTransform: "uppercase",
              opacity: 0.9,
            }}
          >
            sebcat-vj — Renderer
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              opacity: 0.7,
            }}
          >
            Crossfade: {percent}%
          </p>
        </header>

        <div
          style={{
            flex: 1,
            position: "relative",
          }}
        >
          <Canvas
            style={{ width: "100%", height: "100%" }}
            camera={{ position: [0, 0, 4] }}
          >
            <color attach="background" args={["#020617"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[4, 6, 3]} intensity={1.1} />
            <directionalLight position={[-4, -4, -2]} intensity={0.4} />

            {/*
              Dual-scene crossfade approximation:
              - Scene A opacity: 1 - crossfade
              - Scene B opacity: crossfade
              - When crossfade is ~0 or ~1, only one scene is rendered
                to avoid depth/overdraw artifacts.
            */}
            {params.crossfade < 0.999 && (
              <SceneA
                rotationSpeed={params.rotationSpeed}
                opacity={1 - params.crossfade}
                brightness={params.sceneABrightness}
                wobble={params.sceneAWobble}
              />
            )}

            {params.crossfade > 0.001 && <SceneB opacity={params.crossfade} />}
          </Canvas>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  // Hard fail early; Tauri's HTML template should always include #root.
  throw new Error("Root element #root not found");
}

const root = ReactDOM.createRoot(rootElement);

// Route based on pathname. Later we can refine this (e.g. hash, search params)
// or read the window label from Tauri if needed.
if (pathname === "/renderer") {
  root.render(
    <React.StrictMode>
      <RendererRoot />
    </React.StrictMode>,
  );
} else {
  // Default to the controls UI
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
