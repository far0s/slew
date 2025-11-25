import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event as TauriEvent } from "@tauri-apps/api/event";
import { Canvas, useFrame } from "@react-three/fiber";
import { useSceneManager } from "../scenes/useSceneManager";
import { SCENE_COMPONENT_REGISTRY } from "../scenes/sceneComponents";
import styles from "./RendererRoot.module.css";

/**
 * Types and utilities for renderer-side parameters and events.
 */

type SceneId = "sceneA" | "sceneB" | "sceneC";

type CrossfadePayload = { value?: unknown };
type SceneABrightnessPayload = { value?: unknown };

export type BackendParameter = {
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
  | "sceneAWobble"
  | "sceneATint"
  | "sceneATintLfoDepth";

type RendererParameters = {
  crossfade: number;
  rotationSpeed: number;
  sceneABrightness: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;
};

function updateRendererParam(
  current: RendererParameters,
  key: RendererParameterKey,
  value: number,
): RendererParameters {
  switch (key) {
    case "crossfade":
      return { ...current, crossfade: value };
    case "rotationSpeed":
      return { ...current, rotationSpeed: value };
    case "sceneABrightness":
      return { ...current, sceneABrightness: value };
    case "sceneAWobble":
      return { ...current, sceneAWobble: value };
    case "sceneATint":
      return { ...current, sceneATint: value };
    case "sceneATintLfoDepth":
      return { ...current, sceneATintLfoDepth: value };
    default:
      return current;
  }
}

/**
 * Small helper component that runs inside the r3f Canvas subtree to
 * advance the tint LFO phase every frame.
 */
type TintLfoDriverProps = {
  tintLfoDepth: number;
  setTintLfoPhase: (phase: number) => void;
};

function TintLfoDriver({ tintLfoDepth, setTintLfoPhase }: TintLfoDriverProps) {
  useFrame(({ clock }) => {
    if (tintLfoDepth <= 0) return;
    const elapsed = clock.getElapsedTime();
    const frequencyHz = 0.1;
    setTintLfoPhase(2 * Math.PI * frequencyHz * elapsed);
  });
  return null;
}

/**
 * Main renderer root component.
 *
 * This encapsulates:
 * - Scene pairing (Active / Next) via `scene_pairing_changed` events.
 * - Hydration of renderer parameters from the backend Parameter Server.
 * - Live subscription to `parameter_changed` to follow smoothed values.
 * - Local LFO modulation of Scene A tint, driven by backend depth.
 * - Mapping Active/Next scenes to concrete scene components with opacity.
 */
export function RendererRoot() {
  // Scene pairing, driven by backend `scene_pairing_changed` events.
  const [sceneSelection, setSceneSelection] = useState<{
    activeSceneId?: SceneId;
    nextSceneId?: SceneId;
  }>({});

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<{
          active_scene_id: SceneId;
          next_scene_id: SceneId;
        }>("scene_pairing_changed", (event) => {
          const payload = event.payload;
          if (!payload) return;

          setSceneSelection({
            activeSceneId: payload.active_scene_id,
            nextSceneId: payload.next_scene_id,
          });
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          "Renderer failed to subscribe to scene_pairing_changed events",
          error,
        );
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const sceneManager = useSceneManager(
    sceneSelection.activeSceneId && sceneSelection.nextSceneId
      ? {
          activeSceneId: sceneSelection.activeSceneId,
          nextSceneId: sceneSelection.nextSceneId,
        }
      : undefined,
  );

  // Renderer-local view of parameters hydrated from the backend.
  const [params, setParams] = useState<RendererParameters>({
    crossfade: 0.5,
    rotationSpeed: 0.6,
    sceneABrightness: 1,
    sceneAWobble: 0,
    sceneATint: 0,
    sceneATintLfoDepth: 0,
  });
  const [hasHydratedFromBackend, setHasHydratedFromBackend] = useState(false);
  const [useBackendSmoothedCrossfade, setUseBackendSmoothedCrossfade] =
    useState(false);
  const [useBackendRotationSpeed, setUseBackendRotationSpeed] = useState(false);
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const applyParamUpdate = useCallback(
    (key: RendererParameterKey, value: number) => {
      setParams((current) => updateRendererParam(current, key, value));
    },
    [],
  );

  // Fallback direct crossfade event listener (renderer:crossfade).
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
            // we derive a local rotation speed from crossfade as a
            // documented fallback. As soon as a backend `rotationSpeed`
            // value appears (either via hydration or `parameter_changed`),
            // the backend-driven path becomes authoritative and this
            // derived value is no longer applied.
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
            // Note: any subsystem that wants to take authoritative control
            // of rotation should ensure it creates/updates a `rotationSpeed`
            // parameter in the backend via `set_parameter("rotationSpeed", ...)`.
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
            } else if (param.id === "scene_a_tint") {
              const clamped = Math.max(0, Math.min(1, param.value));
              applyParamUpdate("sceneATint", clamped);
            } else if (param.id === "scene_a_tint_lfo_depth") {
              const clamped = Math.max(0, Math.min(1, param.value));
              applyParamUpdate("sceneATintLfoDepth", clamped);
            }
          });

          // If there was no explicit rotationSpeed parameter, fall back to
          // the crossfade-derived speed after hydration. This keeps the
          // demo feeling responsive without forcing every setup to define
          // a dedicated `rotationSpeed` parameter.
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
  }, [applyParamUpdate, hasHydratedFromBackend, useBackendRotationSpeed]);

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
              // dedicated backend rotationSpeed parameter in use. Once a
              // backend `rotationSpeed` param is observed, it becomes the
              // canonical source and this derivation is skipped.
              if (!useBackendRotationSpeed) {
                const baseSpeed = 0.6;
                const variation = (clamped - 0.5) * 0.4;
                applyParamUpdate("rotationSpeed", baseSpeed + variation);
              }
            } else if (updated.id === "rotationSpeed") {
              const clamped = Math.max(0, Math.min(5, updated.value));
              // Seeing a backend `rotationSpeed` parameter means rotation
              // is now fully backend-driven; stop applying any crossfade-
              // derived fallback in future updates.
              setUseBackendRotationSpeed(true);
              applyParamUpdate("rotationSpeed", clamped);
            } else if (updated.id === "scene_a_brightness") {
              const clamped = Math.max(0, Math.min(2, updated.value));
              applyParamUpdate("sceneABrightness", clamped);
            } else if (updated.id === "scene_a_wobble") {
              const clamped = Math.max(0, Math.min(1, updated.value));
              applyParamUpdate("sceneAWobble", clamped);
            } else if (updated.id === "scene_a_tint") {
              const clamped = Math.max(0, Math.min(1, updated.value));
              applyParamUpdate("sceneATint", clamped);
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

  const sceneWeights = sceneManager.mapCrossfadeToSceneWeights(
    params.crossfade,
  );

  // Renderer-side tint modulation for Scene A, controlled by backend depth.
  const tintLfoDepth = Math.max(0, Math.min(1, params.sceneATintLfoDepth));
  const tintBase = params.sceneATint;
  const tintModulated = Math.max(
    0,
    Math.min(1, tintBase + Math.sin(tintLfoPhase) * tintLfoDepth),
  );

  return (
    <div className={styles.root}>
      <Canvas className={styles.canvas} camera={{ position: [0, 0, 4] }}>
        {/* Drive the tint LFO phase inside the r3f Canvas so that
            r3f hooks are only used within the Canvas subtree. */}
        <TintLfoDriver
          tintLfoDepth={tintLfoDepth}
          setTintLfoPhase={setTintLfoPhase}
        />
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[4, 6, 3]} intensity={1.1} />
        <directionalLight position={[-4, -4, -2]} intensity={0.4} />

        {(() => {
          const ActiveSceneComponent =
            SCENE_COMPONENT_REGISTRY[sceneManager.activeSceneId];
          const NextSceneComponent =
            SCENE_COMPONENT_REGISTRY[sceneManager.nextSceneId];

          const activeSceneParams = {
            rotationSpeed: params.rotationSpeed,
            sceneABrightness: params.sceneABrightness,
            sceneAWobble: params.sceneAWobble,
            sceneATint: tintModulated,
          };

          return (
            <>
              {ActiveSceneComponent && sceneWeights.activeWeight > 0.001 && (
                <ActiveSceneComponent
                  opacity={sceneWeights.activeWeight}
                  params={activeSceneParams}
                />
              )}

              {NextSceneComponent && sceneWeights.nextWeight > 0.001 && (
                <NextSceneComponent opacity={sceneWeights.nextWeight} />
              )}
            </>
          );
        })()}
      </Canvas>
    </div>
  );
}

export default RendererRoot;
