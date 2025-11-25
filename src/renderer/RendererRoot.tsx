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
type SceneBBrightnessPayload = { value?: unknown };
type SceneCBrightnessPayload = { value?: unknown };

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
  // Scene A
  | "sceneABrightness"
  | "sceneAWobble"
  | "sceneATint"
  | "sceneATintLfoDepth"
  // Scene B
  | "sceneBBrightness"
  | "sceneBRotationSpeed"
  | "sceneBTint"
  | "sceneBScale"
  // Scene C
  | "sceneCBrightness"
  | "sceneCPulseSpeed"
  | "sceneCRotationSpeed"
  | "sceneCTint";

type RendererParameters = {
  crossfade: number;
  rotationSpeed: number;
  // Scene A
  sceneABrightness: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;
  // Scene B
  sceneBBrightness: number;
  sceneBRotationSpeed: number;
  sceneBTint: number;
  sceneBScale: number;
  // Scene C
  sceneCBrightness: number;
  sceneCPulseSpeed: number;
  sceneCRotationSpeed: number;
  sceneCTint: number;
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
    // Scene A
    case "sceneABrightness":
      return { ...current, sceneABrightness: value };
    case "sceneAWobble":
      return { ...current, sceneAWobble: value };
    case "sceneATint":
      return { ...current, sceneATint: value };
    case "sceneATintLfoDepth":
      return { ...current, sceneATintLfoDepth: value };
    // Scene B
    case "sceneBBrightness":
      return { ...current, sceneBBrightness: value };
    case "sceneBRotationSpeed":
      return { ...current, sceneBRotationSpeed: value };
    case "sceneBTint":
      return { ...current, sceneBTint: value };
    case "sceneBScale":
      return { ...current, sceneBScale: value };
    // Scene C
    case "sceneCBrightness":
      return { ...current, sceneCBrightness: value };
    case "sceneCPulseSpeed":
      return { ...current, sceneCPulseSpeed: value };
    case "sceneCRotationSpeed":
      return { ...current, sceneCRotationSpeed: value };
    case "sceneCTint":
      return { ...current, sceneCTint: value };
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
    // Scene A
    sceneABrightness: 1,
    sceneAWobble: 0,
    sceneATint: 0,
    sceneATintLfoDepth: 0,
    // Scene B
    sceneBBrightness: 1,
    sceneBRotationSpeed: 0.4,
    sceneBTint: 0.5,
    sceneBScale: 1,
    // Scene C
    sceneCBrightness: 1,
    sceneCPulseSpeed: 1.5,
    sceneCRotationSpeed: 0.4,
    sceneCTint: 0.5,
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

  // Listen for Scene B brightness events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<string>(
        "renderer:scene_b_brightness",
        (event) => {
          try {
            const parsed = JSON.parse(
              event.payload ?? "{}",
            ) as SceneBBrightnessPayload;

            if (typeof parsed.value === "number") {
              const clamped = Math.max(0, Math.min(2, parsed.value));
              applyParamUpdate("sceneBBrightness", clamped);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              "Failed to parse renderer:scene_b_brightness payload",
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

  // Listen for Scene C brightness events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      unlisten = await listen<string>(
        "renderer:scene_c_brightness",
        (event) => {
          try {
            const parsed = JSON.parse(
              event.payload ?? "{}",
            ) as SceneCBrightnessPayload;

            if (typeof parsed.value === "number") {
              const clamped = Math.max(0, Math.min(2, parsed.value));
              applyParamUpdate("sceneCBrightness", clamped);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              "Failed to parse renderer:scene_c_brightness payload",
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
            switch (param.id) {
              case "crossfade": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("crossfade", clamped);
                break;
              }
              case "rotationSpeed": {
                const clamped = Math.max(0, Math.min(5, param.value));
                setUseBackendRotationSpeed(true);
                applyParamUpdate("rotationSpeed", clamped);
                break;
              }
              // Scene A
              case "scene_a_brightness": {
                const clamped = Math.max(0, Math.min(2, param.value));
                applyParamUpdate("sceneABrightness", clamped);
                break;
              }
              case "scene_a_wobble": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("sceneAWobble", clamped);
                break;
              }
              case "scene_a_tint": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("sceneATint", clamped);
                break;
              }
              case "scene_a_tint_lfo_depth": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("sceneATintLfoDepth", clamped);
                break;
              }
              // Scene B
              case "scene_b_brightness": {
                const clamped = Math.max(0, Math.min(2, param.value));
                applyParamUpdate("sceneBBrightness", clamped);
                break;
              }
              case "scene_b_rotation_speed": {
                const clamped = Math.max(0, Math.min(5, param.value));
                applyParamUpdate("sceneBRotationSpeed", clamped);
                break;
              }
              case "scene_b_tint": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("sceneBTint", clamped);
                break;
              }
              case "scene_b_scale": {
                const clamped = Math.max(0.5, Math.min(2, param.value));
                applyParamUpdate("sceneBScale", clamped);
                break;
              }
              // Scene C
              case "scene_c_brightness": {
                const clamped = Math.max(0, Math.min(2, param.value));
                applyParamUpdate("sceneCBrightness", clamped);
                break;
              }
              case "scene_c_pulse_speed": {
                const clamped = Math.max(0, Math.min(5, param.value));
                applyParamUpdate("sceneCPulseSpeed", clamped);
                break;
              }
              case "scene_c_rotation_speed": {
                const clamped = Math.max(0, Math.min(5, param.value));
                applyParamUpdate("sceneCRotationSpeed", clamped);
                break;
              }
              case "scene_c_tint": {
                const clamped = Math.max(0, Math.min(1, param.value));
                applyParamUpdate("sceneCTint", clamped);
                break;
              }
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

            switch (updated.id) {
              case "crossfade": {
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
                break;
              }
              case "rotationSpeed": {
                const clamped = Math.max(0, Math.min(5, updated.value));
                setUseBackendRotationSpeed(true);
                applyParamUpdate("rotationSpeed", clamped);
                break;
              }
              // Scene A
              case "scene_a_brightness": {
                const clamped = Math.max(0, Math.min(2, updated.value));
                applyParamUpdate("sceneABrightness", clamped);
                break;
              }
              case "scene_a_wobble": {
                const clamped = Math.max(0, Math.min(1, updated.value));
                applyParamUpdate("sceneAWobble", clamped);
                break;
              }
              case "scene_a_tint": {
                const clamped = Math.max(0, Math.min(1, updated.value));
                applyParamUpdate("sceneATint", clamped);
                break;
              }
              case "scene_a_tint_lfo_depth": {
                const clamped = Math.max(0, Math.min(1, updated.value));
                applyParamUpdate("sceneATintLfoDepth", clamped);
                break;
              }
              // Scene B
              case "scene_b_brightness": {
                const clamped = Math.max(0, Math.min(2, updated.value));
                applyParamUpdate("sceneBBrightness", clamped);
                break;
              }
              case "scene_b_rotation_speed": {
                const clamped = Math.max(0, Math.min(5, updated.value));
                applyParamUpdate("sceneBRotationSpeed", clamped);
                break;
              }
              case "scene_b_tint": {
                const clamped = Math.max(0, Math.min(1, updated.value));
                applyParamUpdate("sceneBTint", clamped);
                break;
              }
              case "scene_b_scale": {
                const clamped = Math.max(0.5, Math.min(2, updated.value));
                applyParamUpdate("sceneBScale", clamped);
                break;
              }
              // Scene C
              case "scene_c_brightness": {
                const clamped = Math.max(0, Math.min(2, updated.value));
                applyParamUpdate("sceneCBrightness", clamped);
                break;
              }
              case "scene_c_pulse_speed": {
                const clamped = Math.max(0, Math.min(5, updated.value));
                applyParamUpdate("sceneCPulseSpeed", clamped);
                break;
              }
              case "scene_c_rotation_speed": {
                const clamped = Math.max(0, Math.min(5, updated.value));
                applyParamUpdate("sceneCRotationSpeed", clamped);
                break;
              }
              case "scene_c_tint": {
                const clamped = Math.max(0, Math.min(1, updated.value));
                applyParamUpdate("sceneCTint", clamped);
                break;
              }
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

  // Build scene-specific params objects
  const sceneAParams = {
    rotationSpeed: params.rotationSpeed,
    sceneABrightness: params.sceneABrightness,
    sceneAWobble: params.sceneAWobble,
    sceneATint: tintModulated,
  };

  const sceneBParams = {
    sceneBBrightness: params.sceneBBrightness,
    sceneBRotationSpeed: params.sceneBRotationSpeed,
    sceneBTint: params.sceneBTint,
    sceneBScale: params.sceneBScale,
  };

  const sceneCParams = {
    sceneCBrightness: params.sceneCBrightness,
    sceneCPulseSpeed: params.sceneCPulseSpeed,
    sceneCRotationSpeed: params.sceneCRotationSpeed,
    sceneCTint: params.sceneCTint,
  };

  // Helper to get the right params for a scene ID
  const getParamsForScene = (sceneId: SceneId) => {
    switch (sceneId) {
      case "sceneA":
        return sceneAParams;
      case "sceneB":
        return sceneBParams;
      case "sceneC":
        return sceneCParams;
      default:
        return {};
    }
  };

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

          return (
            <>
              {ActiveSceneComponent && sceneWeights.activeWeight > 0.001 && (
                <ActiveSceneComponent
                  opacity={sceneWeights.activeWeight}
                  params={getParamsForScene(sceneManager.activeSceneId)}
                />
              )}

              {NextSceneComponent && sceneWeights.nextWeight > 0.001 && (
                <NextSceneComponent
                  opacity={sceneWeights.nextWeight}
                  params={getParamsForScene(sceneManager.nextSceneId)}
                />
              )}
            </>
          );
        })()}
      </Canvas>
    </div>
  );
}

export default RendererRoot;
