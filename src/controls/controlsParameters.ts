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
  readonly sceneABrightness: number;
  readonly rotationSpeed: number;
  readonly sceneAWobble: number;
  readonly sceneATint: number;
  readonly sceneATintLfoDepth: number;
};

export interface ControlsParametersState {
  crossfade: number;
  sceneABrightness: number;
  rotationSpeed: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;

  backendParameters: BackendParameter[] | null;

  isLoadingParams: boolean;
  isClearing: boolean;
  isResettingDefaults: boolean;
  paramError: string | null;

  setCrossfade(next: number): void;
  setSceneABrightness(next: number): void;
  setRotationSpeed(next: number): void;
  setSceneAWobble(next: number): void;
  setSceneATint(next: number): void;
  setSceneATintLfoDepth(next: number): void;

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
    sceneABrightness: 1,
    rotationSpeed: 0.6,
    sceneAWobble: 0,
    sceneATint: 0,
    sceneATintLfoDepth: 0.2,
  } as const;

  const [crossfade, setCrossfade] = useState(DEFAULTS.crossfade);
  const [sceneABrightness, setSceneABrightness] = useState(
    DEFAULTS.sceneABrightness,
  );
  const [rotationSpeed, setRotationSpeed] = useState(DEFAULTS.rotationSpeed);
  const [sceneAWobble, setSceneAWobble] = useState(DEFAULTS.sceneAWobble);
  const [sceneATint, setSceneATint] = useState(DEFAULTS.sceneATint);
  const [sceneATintLfoDepth, setSceneATintLfoDepth] = useState(
    DEFAULTS.sceneATintLfoDepth,
  );

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
      if (param.id === "crossfade") {
        const clamped = clamp(param.value, 0, 1);
        setCrossfade(clamped);
      } else if (param.id === "scene_a_brightness") {
        const clamped = clamp(param.value, 0, 2);
        setSceneABrightness(clamped);
      } else if (param.id === "rotationSpeed") {
        const clamped = clamp(param.value, 0, 5);
        setRotationSpeed(clamped);
      } else if (param.id === "scene_a_wobble") {
        const clamped = clamp(param.value, 0, 1);
        setSceneAWobble(clamped);
      } else if (param.id === "scene_a_tint") {
        if (tintParam && typeof tintParam.value === "number") {
          const clamped = clamp(tintParam.value, 0, 1);
          setSceneATint(clamped);
        }
        if (tintLfoDepthParam && typeof tintLfoDepthParam.value === "number") {
          const clamped = clamp(tintLfoDepthParam.value, 0, 1);
          setSceneATintLfoDepth(clamped);
        }
      } else if (param.id === "scene_a_tint_lfo_depth") {
        const clamped = clamp(param.value, 0, 1);
        setSceneATintLfoDepth(clamped);
      }
    }
  }

  return {
    crossfade,
    sceneABrightness,
    rotationSpeed,
    sceneAWobble,
    sceneATint,
    sceneATintLfoDepth,
    backendParameters,
    isLoadingParams,
    isClearing,
    isResettingDefaults,
    paramError,
    setCrossfade,
    setSceneABrightness,
    setRotationSpeed,
    setSceneAWobble,
    setSceneATint,
    setSceneATintLfoDepth,
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
