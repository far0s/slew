import { useState, useCallback, useMemo } from "react";
import type { ParameterId } from "../scenes/sceneTypes";
import { buildDefaultParameterMap, SCENE_REGISTRY } from "../scenes/sceneTypes";

/**
 * Backend parameter shape (from Rust Parameter Server).
 *
 * @property id - Parameter identifier
 * @property value - Current interpolated value
 * @property target - Target value being transitioned to
 * @property transition_speed - Speed of the transition
 * @property curve - Easing curve type
 */
export interface BackendParameter {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
}

/**
 * State and actions for the parameter store.
 *
 * @property parameters - Map of parameter ID → current value
 * @property get - Get a parameter value (with fallback to default)
 * @property set - Set a parameter value locally
 * @property setMany - Set multiple parameters at once
 * @property resetToDefault - Reset a parameter to its default value
 * @property resetAllToDefaults - Reset all parameters to defaults
 * @property applyBackendParams - Apply backend parameters to local state
 * @property getDefault - Get the default value for a parameter
 * @property has - Check if a parameter exists in the store
 * @property entries - Get all parameter entries as an array
 * @property backendSnapshot - Backend parameters snapshot (for debug/inspector)
 * @property setBackendSnapshot - Set backend snapshot
 * @property isLoading - Loading state
 * @property setIsLoading - Set loading state
 * @property error - Error state
 * @property setError - Set error state
 */
export interface ParameterStoreState {
  parameters: Map<ParameterId, number>;
  get: (id: ParameterId) => number;
  set: (id: ParameterId, value: number) => void;
  setMany: (updates: Array<[ParameterId, number]>) => void;
  resetToDefault: (id: ParameterId) => void;
  resetAllToDefaults: () => void;
  applyBackendParams: (params: BackendParameter[]) => void;
  getDefault: (id: ParameterId) => number;
  has: (id: ParameterId) => boolean;
  entries: () => Array<[ParameterId, number]>;
  backendSnapshot: BackendParameter[] | null;
  setBackendSnapshot: (params: BackendParameter[] | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Get the min/max range for a parameter from the scene registry.
 */
function getParameterRange(
  id: ParameterId,
): { min: number; max: number } | undefined {
  for (const scene of SCENE_REGISTRY) {
    const param = scene.parameters.find((p) => p.id === id);
    if (param) {
      return { min: param.min, max: param.max };
    }
  }
  // Special case for crossfade
  if (id === "crossfade") {
    return { min: 0, max: 1 };
  }
  return undefined;
}

/**
 * Hook for centralized parameter state management.
 *
 * Uses a Map internally for efficient lookups and updates.
 * Replaces the old pattern of individual useState calls per parameter.
 *
 * Features:
 * - Single source of truth for all parameter values
 * - Automatic clamping based on scene registry ranges
 * - Default values from scene descriptors
 * - Backend synchronization helpers
 */
export function useParameterStore(): ParameterStoreState {
  // Initialize with defaults from scene registry
  const defaultMap = useMemo(() => buildDefaultParameterMap(), []);

  const [parameters, setParameters] = useState<Map<ParameterId, number>>(
    () => new Map(defaultMap),
  );

  const [backendSnapshot, setBackendSnapshot] = useState<
    BackendParameter[] | null
  >(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get a parameter value
  const get = useCallback(
    (id: ParameterId): number => {
      return parameters.get(id) ?? defaultMap.get(id) ?? 0;
    },
    [parameters, defaultMap],
  );

  // Set a single parameter
  const set = useCallback((id: ParameterId, value: number) => {
    const range = getParameterRange(id);
    const clampedValue = range ? clamp(value, range.min, range.max) : value;

    setParameters((prev) => {
      const next = new Map(prev);
      next.set(id, clampedValue);
      return next;
    });
  }, []);

  // Set multiple parameters
  const setMany = useCallback((updates: Array<[ParameterId, number]>) => {
    setParameters((prev) => {
      const next = new Map(prev);
      for (const [id, value] of updates) {
        const range = getParameterRange(id);
        const clampedValue = range ? clamp(value, range.min, range.max) : value;
        next.set(id, clampedValue);
      }
      return next;
    });
  }, []);

  // Reset a parameter to default
  const resetToDefault = useCallback(
    (id: ParameterId) => {
      const defaultValue = defaultMap.get(id);
      if (defaultValue !== undefined) {
        set(id, defaultValue);
      }
    },
    [defaultMap, set],
  );

  // Reset all to defaults
  const resetAllToDefaults = useCallback(() => {
    setParameters(new Map(defaultMap));
  }, [defaultMap]);

  // Apply backend parameters to local state
  const applyBackendParams = useCallback((params: BackendParameter[]) => {
    setParameters((prev) => {
      const next = new Map(prev);

      for (const param of params) {
        const id = param.id as ParameterId;
        const range = getParameterRange(id);
        const clampedValue = range
          ? clamp(param.value, range.min, range.max)
          : param.value;
        next.set(id, clampedValue);
      }

      return next;
    });
  }, []);

  // Get default value
  const getDefault = useCallback(
    (id: ParameterId): number => {
      return defaultMap.get(id) ?? 0;
    },
    [defaultMap],
  );

  // Check if parameter exists
  const has = useCallback(
    (id: ParameterId): boolean => {
      return parameters.has(id) || defaultMap.has(id);
    },
    [parameters, defaultMap],
  );

  // Get all entries
  const entries = useCallback((): Array<[ParameterId, number]> => {
    return Array.from(parameters.entries());
  }, [parameters]);

  return {
    parameters,
    get,
    set,
    setMany,
    resetToDefault,
    resetAllToDefaults,
    applyBackendParams,
    getDefault,
    has,
    entries,
    backendSnapshot,
    setBackendSnapshot,
    isLoading,
    setIsLoading,
    error,
    setError,
  };
}

/**
 * Helper to convert ParameterId to the camelCase key used in SceneProps.params.
 *
 * This bridges the gap between backend parameter IDs (snake_case) and
 * the renderer's expected prop names (camelCase).
 */
export function paramIdToPropsKey(
  id: ParameterId,
):
  | keyof NonNullable<import("../scenes/sceneComponents").SceneProps["params"]>
  | null {
  const mapping: Record<string, string> = {
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

  return (
    (mapping[id] as keyof NonNullable<
      import("../scenes/sceneComponents").SceneProps["params"]
    >) ?? null
  );
}

/**
 * Build scene params object from parameter store for a given scene.
 */
export function buildSceneParams(
  sceneId: import("../scenes/sceneTypes").SceneId,
  store: ParameterStoreState,
): import("../scenes/sceneComponents").SceneProps["params"] {
  const scene = SCENE_REGISTRY.find((s) => s.id === sceneId);
  if (!scene) return {};

  const params: Record<string, number> = {};

  for (const paramDesc of scene.parameters) {
    const propsKey = paramIdToPropsKey(paramDesc.id);
    if (propsKey) {
      params[propsKey] = store.get(paramDesc.id);
    }
  }

  return params as import("../scenes/sceneComponents").SceneProps["params"];
}
