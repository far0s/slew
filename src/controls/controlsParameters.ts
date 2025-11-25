import { useState } from "react";

export type BackendParameter = {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
};

export type ControlsDefaults = {
  readonly crossfade: number;
  // Scene A
  readonly sceneABrightness: number;
  readonly rotationSpeed: number;
  readonly sceneAWobble: number;
  readonly sceneATint: number;
  readonly sceneATintLfoDepth: number;
  // Scene B
  readonly sceneBBrightness: number;
  readonly sceneBRotationSpeed: number;
  readonly sceneBTint: number;
  readonly sceneBScale: number;
  // Scene C
  readonly sceneCBrightness: number;
  readonly sceneCPulseSpeed: number;
  readonly sceneCRotationSpeed: number;
  readonly sceneCTint: number;
};

export interface ControlsParametersState {
  crossfade: number;
  // Scene A
  sceneABrightness: number;
  rotationSpeed: number;
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

  backendParameters: BackendParameter[] | null;

  isLoadingParams: boolean;
  isClearing: boolean;
  isResettingDefaults: boolean;
  paramError: string | null;

  setCrossfade(next: number): void;
  // Scene A setters
  setSceneABrightness(next: number): void;
  setRotationSpeed(next: number): void;
  setSceneAWobble(next: number): void;
  setSceneATint(next: number): void;
  setSceneATintLfoDepth(next: number): void;
  // Scene B setters
  setSceneBBrightness(next: number): void;
  setSceneBRotationSpeed(next: number): void;
  setSceneBTint(next: number): void;
  setSceneBScale(next: number): void;
  // Scene C setters
  setSceneCBrightness(next: number): void;
  setSceneCPulseSpeed(next: number): void;
  setSceneCRotationSpeed(next: number): void;
  setSceneCTint(next: number): void;

  setBackendParameters(next: BackendParameter[] | null): void;
  setIsLoadingParams(next: boolean): void;
  setIsClearing(next: boolean): void;
  setIsResettingDefaults(next: boolean): void;
  setParamError(next: string | null): void;

  DEFAULTS: ControlsDefaults;

  applyBackendParamsToSliders(params: BackendParameter[]): void;
}

/**
 * Centralized hook for Controls window parameter state.
 *
 * - Owns local slider values.
 * - Owns loading/clearing/resetting flags and backend snapshot.
 * - Provides a helper to map backend `BackendParameter[]` into slider state.
 *
 * All backend I/O (invoke/listen) should live in the App component; this
 * hook stays purely client-side state + mapping logic.
 */
export function useControlsParameters(): ControlsParametersState {
  const DEFAULTS: ControlsDefaults = {
    crossfade: 0,
    // Scene A
    sceneABrightness: 1,
    rotationSpeed: 0.6,
    sceneAWobble: 0,
    sceneATint: 0,
    sceneATintLfoDepth: 0.2,
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
  } as const;

  // Crossfade
  const [crossfade, setCrossfade] = useState(DEFAULTS.crossfade);

  // Scene A
  const [sceneABrightness, setSceneABrightness] = useState(
    DEFAULTS.sceneABrightness,
  );
  const [rotationSpeed, setRotationSpeed] = useState(DEFAULTS.rotationSpeed);
  const [sceneAWobble, setSceneAWobble] = useState(DEFAULTS.sceneAWobble);
  const [sceneATint, setSceneATint] = useState(DEFAULTS.sceneATint);
  const [sceneATintLfoDepth, setSceneATintLfoDepth] = useState(
    DEFAULTS.sceneATintLfoDepth,
  );

  // Scene B
  const [sceneBBrightness, setSceneBBrightness] = useState(
    DEFAULTS.sceneBBrightness,
  );
  const [sceneBRotationSpeed, setSceneBRotationSpeed] = useState(
    DEFAULTS.sceneBRotationSpeed,
  );
  const [sceneBTint, setSceneBTint] = useState(DEFAULTS.sceneBTint);
  const [sceneBScale, setSceneBScale] = useState(DEFAULTS.sceneBScale);

  // Scene C
  const [sceneCBrightness, setSceneCBrightness] = useState(
    DEFAULTS.sceneCBrightness,
  );
  const [sceneCPulseSpeed, setSceneCPulseSpeed] = useState(
    DEFAULTS.sceneCPulseSpeed,
  );
  const [sceneCRotationSpeed, setSceneCRotationSpeed] = useState(
    DEFAULTS.sceneCRotationSpeed,
  );
  const [sceneCTint, setSceneCTint] = useState(DEFAULTS.sceneCTint);

  const [backendParameters, setBackendParameters] = useState<
    BackendParameter[] | null
  >(null);

  const [isLoadingParams, setIsLoadingParams] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isResettingDefaults, setIsResettingDefaults] = useState(false);
  const [paramError, setParamError] = useState<string | null>(null);

  /**
   * Map backend parameters into local slider state.
   *
   * This is used for:
   * - Initial hydration (get_parameters)
   * - Live updates (parameter_changed)
   *
   * It is intentionally conservative: unknown IDs are ignored.
   */
  function applyBackendParamsToSliders(params: BackendParameter[]): void {
    const tintParam = params.find((p) => p.id === "scene_a_tint");
    const tintLfoDepthParam = params.find(
      (p) => p.id === "scene_a_tint_lfo_depth",
    );

    for (const param of params) {
      switch (param.id) {
        // Crossfade
        case "crossfade": {
          const clamped = clamp(param.value, 0, 1);
          setCrossfade(clamped);
          break;
        }

        // Scene A
        case "scene_a_brightness": {
          const clamped = clamp(param.value, 0, 2);
          setSceneABrightness(clamped);
          break;
        }
        case "rotationSpeed": {
          const clamped = clamp(param.value, 0, 5);
          setRotationSpeed(clamped);
          break;
        }
        case "scene_a_wobble": {
          const clamped = clamp(param.value, 0, 1);
          setSceneAWobble(clamped);
          break;
        }
        case "scene_a_tint": {
          if (tintParam && typeof tintParam.value === "number") {
            const clamped = clamp(tintParam.value, 0, 1);
            setSceneATint(clamped);
          }
          if (
            tintLfoDepthParam &&
            typeof tintLfoDepthParam.value === "number"
          ) {
            const clamped = clamp(tintLfoDepthParam.value, 0, 1);
            setSceneATintLfoDepth(clamped);
          }
          break;
        }
        case "scene_a_tint_lfo_depth": {
          const clamped = clamp(param.value, 0, 1);
          setSceneATintLfoDepth(clamped);
          break;
        }

        // Scene B
        case "scene_b_brightness": {
          const clamped = clamp(param.value, 0, 2);
          setSceneBBrightness(clamped);
          break;
        }
        case "scene_b_rotation_speed": {
          const clamped = clamp(param.value, 0, 5);
          setSceneBRotationSpeed(clamped);
          break;
        }
        case "scene_b_tint": {
          const clamped = clamp(param.value, 0, 1);
          setSceneBTint(clamped);
          break;
        }
        case "scene_b_scale": {
          const clamped = clamp(param.value, 0.5, 2);
          setSceneBScale(clamped);
          break;
        }

        // Scene C
        case "scene_c_brightness": {
          const clamped = clamp(param.value, 0, 2);
          setSceneCBrightness(clamped);
          break;
        }
        case "scene_c_pulse_speed": {
          const clamped = clamp(param.value, 0, 5);
          setSceneCPulseSpeed(clamped);
          break;
        }
        case "scene_c_rotation_speed": {
          const clamped = clamp(param.value, 0, 5);
          setSceneCRotationSpeed(clamped);
          break;
        }
        case "scene_c_tint": {
          const clamped = clamp(param.value, 0, 1);
          setSceneCTint(clamped);
          break;
        }

        default:
          // Unknown parameter ID, ignore
          break;
      }
    }
  }

  return {
    crossfade,
    // Scene A
    sceneABrightness,
    rotationSpeed,
    sceneAWobble,
    sceneATint,
    sceneATintLfoDepth,
    // Scene B
    sceneBBrightness,
    sceneBRotationSpeed,
    sceneBTint,
    sceneBScale,
    // Scene C
    sceneCBrightness,
    sceneCPulseSpeed,
    sceneCRotationSpeed,
    sceneCTint,

    backendParameters,
    isLoadingParams,
    isClearing,
    isResettingDefaults,
    paramError,

    setCrossfade,
    // Scene A setters
    setSceneABrightness,
    setRotationSpeed,
    setSceneAWobble,
    setSceneATint,
    setSceneATintLfoDepth,
    // Scene B setters
    setSceneBBrightness,
    setSceneBRotationSpeed,
    setSceneBTint,
    setSceneBScale,
    // Scene C setters
    setSceneCBrightness,
    setSceneCPulseSpeed,
    setSceneCRotationSpeed,
    setSceneCTint,

    setBackendParameters,
    setIsLoadingParams,
    setIsClearing,
    setIsResettingDefaults,
    setParamError,
    DEFAULTS,
    applyBackendParamsToSliders,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
