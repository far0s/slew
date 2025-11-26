import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  SCENE_COMPONENT_REGISTRY,
  type SceneProps,
} from "../scenes/sceneComponents";
import { ALL_SCENE_IDS, type SceneId } from "../scenes/sceneTypes";
import { getSceneDescriptor } from "../scenes/sceneTypes";
import styles from "./RendererRoot.module.css";

// =============================================================================
// Types
// =============================================================================

/**
 * Backend parameter shape from the Rust Parameter Server.
 */
interface BackendParameter {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
}

/**
 * Scene pairing event payload from backend.
 */
interface ScenePairingPayload {
  active_scene_id: SceneId;
  next_scene_id: SceneId;
}

// =============================================================================
// Parameter ID to Props Key Mapping
// =============================================================================

/**
 * Maps backend parameter IDs (snake_case) to SceneProps param keys (camelCase).
 * This is the single source of truth for the mapping.
 */
const PARAM_ID_TO_PROPS_KEY: Record<string, string> = {
  // Scene A
  rotationSpeed: "rotationSpeed",
  scene_a_brightness: "sceneABrightness",
  scene_a_wobble: "sceneAWobble",
  scene_a_tint: "sceneATint",
  scene_a_tint_lfo_depth: "sceneATintLfoDepth",
  // Scene B
  scene_b_brightness: "sceneBBrightness",
  scene_b_rotation_speed: "sceneBRotationSpeed",
  scene_b_tint: "sceneBTint",
  scene_b_scale: "sceneBScale",
  // Scene C
  scene_c_brightness: "sceneCBrightness",
  scene_c_pulse_speed: "sceneCPulseSpeed",
  scene_c_rotation_speed: "sceneCRotationSpeed",
  scene_c_tint: "sceneCTint",
};

// =============================================================================
// Helper Components
// =============================================================================

interface TintLfoDriverProps {
  depth: number;
  setPhase: (phase: number) => void;
}

/**
 * Drives the tint LFO phase inside the r3f Canvas.
 */
function TintLfoDriver({ depth, setPhase }: TintLfoDriverProps) {
  useFrame(({ clock }) => {
    if (depth <= 0) return;
    const elapsed = clock.getElapsedTime();
    const frequencyHz = 0.1;
    setPhase(2 * Math.PI * frequencyHz * elapsed);
  });
  return null;
}

// =============================================================================
// Dynamic Scene Params Builder
// =============================================================================

/**
 * Build SceneProps params for a given scene from the generic parameter store.
 * Uses the scene descriptor to know which parameters the scene cares about,
 * then maps them to the camelCase keys the scene component expects.
 */
function buildSceneParams(
  sceneId: SceneId,
  paramStore: Map<string, number>,
  tintLfoPhase: number,
): SceneProps["params"] {
  const descriptor = getSceneDescriptor(sceneId);
  if (!descriptor) return {};

  const params: Record<string, number> = {};

  // Build params from scene descriptor
  for (const paramDesc of descriptor.parameters) {
    const backendId = paramDesc.id;
    const propsKey = PARAM_ID_TO_PROPS_KEY[backendId];

    if (propsKey && paramStore.has(backendId)) {
      params[propsKey] = paramStore.get(backendId)!;
    } else if (propsKey) {
      // Use default from descriptor if not in store
      params[propsKey] = paramDesc.defaultValue;
    }
  }

  // Apply Scene A tint LFO modulation if this is Scene A
  if (sceneId === "sceneA") {
    const tintBase = params.sceneATint ?? 0;
    const tintDepth = paramStore.get("scene_a_tint_lfo_depth") ?? 0;
    params.sceneATint = Math.max(
      0,
      Math.min(1, tintBase + Math.sin(tintLfoPhase) * tintDepth),
    );
  }

  return params as SceneProps["params"];
}

// =============================================================================
// Opacity Calculation
// =============================================================================

/**
 * Calculate the opacity for a scene based on:
 * - Whether it's the active scene (shown at crossfade=0)
 * - Whether it's the next scene (shown at crossfade=1)
 * - The current crossfade value
 *
 * If a scene is neither active nor next, its opacity is 0.
 * If active === next (no crossfade in progress), that scene gets opacity 1.
 */
function calculateSceneOpacity(
  sceneId: SceneId,
  activeSceneId: SceneId,
  nextSceneId: SceneId,
  crossfade: number,
): number {
  const clampedCrossfade = Math.max(0, Math.min(1, crossfade));

  const isActive = sceneId === activeSceneId;
  const isNext = sceneId === nextSceneId;

  // If this scene is both active and next (same scene), show at full opacity
  if (isActive && isNext) {
    return 1;
  }

  // If this is the active scene, fade out as crossfade increases
  if (isActive) {
    return 1 - clampedCrossfade;
  }

  // If this is the next scene, fade in as crossfade increases
  if (isNext) {
    return clampedCrossfade;
  }

  // Scene is neither active nor next - hide it
  return 0;
}

// =============================================================================
// Canvas Content
// =============================================================================

interface RendererContentProps {
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  paramStore: Record<string, number>;
}

function RendererContent({
  activeSceneId,
  nextSceneId,
  paramStore,
}: RendererContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const crossfade = paramStore["crossfade"] ?? 0;
  const tintLfoDepth = paramStore["scene_a_tint_lfo_depth"] ?? 0;

  // Convert to Map for buildSceneParams
  const paramMap = new Map(Object.entries(paramStore));

  return (
    <>
      <TintLfoDriver depth={tintLfoDepth} setPhase={setTintLfoPhase} />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {/* Render ALL scenes, controlling visibility via opacity */}
      {ALL_SCENE_IDS.map((sceneId) => {
        const SceneComponent = SCENE_COMPONENT_REGISTRY[sceneId];
        if (!SceneComponent) return null;

        const opacity = calculateSceneOpacity(
          sceneId,
          activeSceneId,
          nextSceneId,
          crossfade,
        );

        // Skip rendering scenes with zero opacity for performance
        if (opacity < 0.001) return null;

        const sceneParams = buildSceneParams(sceneId, paramMap, tintLfoPhase);

        return (
          <SceneComponent
            key={sceneId}
            opacity={opacity}
            params={sceneParams}
          />
        );
      })}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * RendererRoot - Main renderer window component.
 *
 * Architecture:
 * 1. Stores ALL parameters in a generic Record<string, number>
 * 2. Listens to `scene_pairing_changed` for active/next scene IDs
 * 3. Listens to `parameter_changed` for ANY parameter update
 * 4. Renders ALL scenes but controls visibility via opacity
 * 5. Dynamically builds scene params based on scene descriptors
 *
 * Key insight: Instead of conditionally mounting/unmounting scene components
 * based on active/next, we render all scenes and let the opacity calculation
 * determine which are visible. This avoids race conditions between scene
 * pairing updates and crossfade value changes.
 */
export function RendererRoot() {
  // Scene pairing state
  const [activeSceneId, setActiveSceneId] = useState<SceneId>("sceneA");
  const [nextSceneId, setNextSceneId] = useState<SceneId>("sceneA");

  // Generic parameter store - stores ANY parameter by its backend ID
  const [paramStore, setParamStore] = useState<Record<string, number>>({});

  // Update a parameter and trigger re-render
  const updateParam = useCallback((id: string, value: number) => {
    setParamStore((prev) => {
      // Only update if value actually changed to avoid unnecessary re-renders
      if (prev[id] === value) return prev;
      return { ...prev, [id]: value };
    });
  }, []);

  // Handle incoming parameter from backend
  const handleParameterChanged = useCallback(
    (param: BackendParameter) => {
      updateParam(param.id, param.value);
    },
    [updateParam],
  );

  // Handle scene pairing change
  const handleScenePairingChanged = useCallback(
    (payload: ScenePairingPayload) => {
      console.log(
        "[Renderer] Scene pairing:",
        payload.active_scene_id,
        "->",
        payload.next_scene_id,
      );
      if (payload.active_scene_id) {
        setActiveSceneId(payload.active_scene_id);
      }
      if (payload.next_scene_id) {
        setNextSceneId(payload.next_scene_id);
      }
    },
    [],
  );

  // Hydrate from backend on startup
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const backendParams = (await invoke(
          "get_parameters",
        )) as BackendParameter[];

        if (!mounted) return;

        for (const param of backendParams) {
          handleParameterChanged(param);
        }

        console.log(
          "[Renderer] Hydrated",
          backendParams.length,
          "parameters from backend",
        );
      } catch (error) {
        console.error("[Renderer] Failed to hydrate parameters:", error);
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [handleParameterChanged]);

  // Listen for scene pairing changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<ScenePairingPayload>(
          "scene_pairing_changed",
          (event) => {
            if (event.payload) {
              handleScenePairingChanged(event.payload);
            }
          },
        );
        console.log("[Renderer] Subscribed to scene_pairing_changed events");
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to scene_pairing_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleScenePairingChanged]);

  // Listen for parameter changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            if (event.payload) {
              handleParameterChanged(event.payload);
            }
          },
        );
        console.log("[Renderer] Subscribed to parameter_changed events");
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to parameter_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleParameterChanged]);

  return (
    <div className={styles.root}>
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }} frameloop="always">
        <RendererContent
          activeSceneId={activeSceneId}
          nextSceneId={nextSceneId}
          paramStore={paramStore}
        />
      </Canvas>
    </div>
  );
}

export default RendererRoot;
