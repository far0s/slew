import { useState, useCallback, useRef } from "react";
import type { SketchId, ParameterTemplateId } from "../sketches";
import { getSketchDescriptor } from "../sketches";
import type { ParameterId, SlotParameterId } from "../scenes/sceneTypes";
import {
  buildSlotDefaultParameters,
  buildAllSlotsDefaultParameters,
  copySlotParameters,
  makeSlotParameterId,
  parseSlotParameterId,
} from "../scenes/sceneTypes";

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
 * Slot configuration for parameter store initialization.
 */
export interface SlotConfig {
  index: number;
  sketchId: SketchId;
  /** @deprecated Use sketchId. Kept for backend compatibility. */
  sceneId?: SketchId;
}

/**
 * State and actions for the parameter store.
 *
 * @property parameters - Map of parameter ID → target value (for UI sliders)
 * @property interpolatedValues - Map of parameter ID → interpolated value (for previews)
 * @property get - Get a parameter target value (with fallback to default)
 * @property getInterpolated - Get the interpolated value for smooth preview rendering
 * @property set - Set a parameter value locally
 * @property setMany - Set multiple parameters at once
 * @property setInterpolated - Set an interpolated value (from backend tick loop)
 * @property initializeSlot - Initialize parameters for a new slot
 * @property removeSlotParameters - Remove parameters for a slot (local only, keeps in backend)
 * @property copySlotParametersTo - Copy parameters from one slot to another
 * @property resetSlotToDefaults - Reset a slot's parameters to defaults
 * @property resetAllToDefaults - Reset all parameters to defaults
 * @property applyBackendParams - Apply backend parameters to local state
 * @property getSlotParameter - Get a parameter value for a specific slot and template
 * @property setSlotParameter - Set a parameter value for a specific slot and template
 * @property has - Check if a parameter exists in the store
 * @property entries - Get all parameter entries as an array
 * @property backendSnapshot - Backend parameters snapshot (for debug/inspector)
 * @property setBackendSnapshot - Set backend snapshot
 * @property isLoading - Loading state
 * @property setIsLoading - Set loading state
 * @property error - Error state
 * @property setError - Set error state
 * @property currentSlots - Current slot configuration
 * @property setCurrentSlots - Update slot configuration
 */
export interface ParameterStoreState {
  parameters: Map<ParameterId, number>;
  interpolatedValues: Map<ParameterId, number>;
  get: (id: ParameterId) => number;
  getInterpolated: (id: ParameterId) => number;
  set: (id: ParameterId, value: number) => void;
  setMany: (updates: Array<[ParameterId, number]>) => void;
  setInterpolated: (id: ParameterId, value: number) => void;
  initializeSlot: (slotIndex: number, sketchId: SketchId) => void;
  initializeSlotWithValues: (
    slotIndex: number,
    values: Map<SlotParameterId, number>,
  ) => void;
  removeSlotParameters: (slotIndex: number) => void;
  copySlotParametersTo: (
    sourceSlotIndex: number,
    targetSlotIndex: number,
    sketchId: SketchId,
  ) => void;
  resetSlotToDefaults: (slotIndex: number, sketchId: SketchId) => void;
  resetAllToDefaults: (slots: SlotConfig[]) => void;
  applyBackendParams: (params: BackendParameter[]) => void;
  getSlotParameter: (
    slotIndex: number,
    templateId: ParameterTemplateId,
  ) => number;
  setSlotParameter: (
    slotIndex: number,
    templateId: ParameterTemplateId,
    value: number,
  ) => void;
  has: (id: ParameterId) => boolean;
  entries: () => Array<[ParameterId, number]>;
  backendSnapshot: BackendParameter[] | null;
  setBackendSnapshot: (params: BackendParameter[] | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  currentSlots: SlotConfig[];
  setCurrentSlots: (slots: SlotConfig[]) => void;
}

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Get the min/max range for a parameter.
 * For slot parameters, we need to look up the template in the scene descriptor.
 */
function getParameterRange(
  id: ParameterId,
  slots: SlotConfig[],
): { min: number; max: number } | undefined {
  // Handle global crossfade parameter
  if (id === "crossfade") {
    return { min: 0, max: 1 };
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(id);
  if (parsed) {
    const slot = slots.find((s) => s.index === parsed.slotIndex);
    if (slot) {
      const sketch = getSketchDescriptor(slot.sketchId);
      if (sketch) {
        const template = sketch.parameters.find(
          (p) => p.templateId === parsed.templateId,
        );
        if (template) {
          return { min: template.min, max: template.max };
        }
      }
    }
  }

  return undefined;
}

/**
 * Get the default value for a parameter.
 */
function getParameterDefault(
  id: ParameterId,
  slots: SlotConfig[],
): number | undefined {
  // Handle global crossfade parameter
  if (id === "crossfade") {
    return 0;
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(id);
  if (parsed) {
    const slot = slots.find((s) => s.index === parsed.slotIndex);
    if (slot) {
      const sketch = getSketchDescriptor(slot.sketchId);
      if (sketch) {
        const template = sketch.parameters.find(
          (p) => p.templateId === parsed.templateId,
        );
        if (template) {
          return template.defaultValue;
        }
      }
    }
  }

  return undefined;
}

/**
 * Hook for centralized parameter state management with multi-instance support.
 *
 * Uses a Map internally for efficient lookups and updates.
 * Parameters are slot-scoped (e.g., `slot_0_brightness`).
 *
 * Features:
 * - Dynamic slot-based parameter management
 * - Slot parameter initialization and copying
 * - Automatic clamping based on sketch registry ranges
 * - Separate interpolated values for smooth preview rendering
 */
export function useParameterStore(): ParameterStoreState {
  // Track current slot configuration
  const [currentSlots, setCurrentSlots] = useState<SlotConfig[]>([]);

  // Initialize with just the crossfade parameter
  const [parameters, setParameters] = useState<Map<ParameterId, number>>(
    () => new Map([["crossfade", 0]]),
  );

  // Interpolated values for smooth preview rendering
  const interpolatedRef = useRef<Map<ParameterId, number>>(
    new Map([["crossfade", 0]]),
  );
  const [interpolatedValues, setInterpolatedValues] = useState<
    Map<ParameterId, number>
  >(() => new Map([["crossfade", 0]]));

  const [backendSnapshot, setBackendSnapshot] = useState<
    BackendParameter[] | null
  >(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get a parameter target value
  const get = useCallback(
    (id: ParameterId): number => {
      const value = parameters.get(id);
      if (value !== undefined) return value;
      return getParameterDefault(id, currentSlots) ?? 0;
    },
    [parameters, currentSlots],
  );

  // Get interpolated value (for smooth preview rendering)
  const getInterpolated = useCallback(
    (id: ParameterId): number => {
      const value = interpolatedValues.get(id);
      if (value !== undefined) return value;
      return getParameterDefault(id, currentSlots) ?? 0;
    },
    [interpolatedValues, currentSlots],
  );

  // Set a single parameter
  const set = useCallback(
    (id: ParameterId, value: number) => {
      const range = getParameterRange(id, currentSlots);
      const clampedValue = range ? clamp(value, range.min, range.max) : value;

      setParameters((prev) => {
        const next = new Map(prev);
        next.set(id, clampedValue);
        return next;
      });
    },
    [currentSlots],
  );

  // Set multiple parameters
  const setMany = useCallback(
    (updates: Array<[ParameterId, number]>) => {
      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of updates) {
          const range = getParameterRange(id, currentSlots);
          const clampedValue = range
            ? clamp(value, range.min, range.max)
            : value;
          next.set(id, clampedValue);
        }
        return next;
      });
    },
    [currentSlots],
  );

  // Set an interpolated value (from backend tick loop)
  const setInterpolated = useCallback(
    (id: ParameterId, value: number) => {
      const range = getParameterRange(id, currentSlots);
      const clampedValue = range ? clamp(value, range.min, range.max) : value;

      interpolatedRef.current.set(id, clampedValue);

      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        next.set(id, clampedValue);
        return next;
      });
    },
    [currentSlots],
  );

  // Initialize parameters for a new slot with defaults
  const initializeSlot = useCallback(
    (slotIndex: number, sketchId: SketchId) => {
      const defaults = buildSlotDefaultParameters(slotIndex, sketchId);

      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          next.set(id, value);
        }
        return next;
      });

      // Also update interpolated values
      for (const [id, value] of defaults) {
        interpolatedRef.current.set(id, value);
      }
      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          next.set(id, value);
        }
        return next;
      });
    },
    [],
  );

  // Initialize slot with specific values (from copy operation)
  const initializeSlotWithValues = useCallback(
    (_slotIndex: number, values: Map<SlotParameterId, number>) => {
      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of values) {
          next.set(id, value);
        }
        return next;
      });

      // Also update interpolated values
      for (const [id, value] of values) {
        interpolatedRef.current.set(id, value);
      }
      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        for (const [id, value] of values) {
          next.set(id, value);
        }
        return next;
      });
    },
    [],
  );

  // Remove slot parameters from local state (backend keeps them)
  const removeSlotParameters = useCallback((slotIndex: number) => {
    const prefix = `slot_${slotIndex}_`;

    setParameters((prev) => {
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (typeof key === "string" && key.startsWith(prefix)) {
          next.delete(key);
        }
      }
      return next;
    });

    // Also remove from interpolated values
    setInterpolatedValues((prev) => {
      const next = new Map(prev);
      for (const key of prev.keys()) {
        if (typeof key === "string" && key.startsWith(prefix)) {
          next.delete(key);
          interpolatedRef.current.delete(key);
        }
      }
      return next;
    });
  }, []);

  // Copy parameters from one slot to another
  const copySlotParametersTo = useCallback(
    (sourceSlotIndex: number, targetSlotIndex: number, sketchId: SketchId) => {
      const copied = copySlotParameters(
        sourceSlotIndex,
        targetSlotIndex,
        sketchId,
        (id) => parameters.get(id),
      );

      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of copied) {
          next.set(id, value);
        }
        return next;
      });

      // Also update interpolated values
      for (const [id, value] of copied) {
        interpolatedRef.current.set(id, value);
      }
      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        for (const [id, value] of copied) {
          next.set(id, value);
        }
        return next;
      });
    },
    [parameters],
  );

  // Reset a slot's parameters to defaults
  const resetSlotToDefaults = useCallback(
    (slotIndex: number, sketchId: SketchId) => {
      const defaults = buildSlotDefaultParameters(slotIndex, sketchId);

      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          next.set(id, value);
        }
        return next;
      });

      for (const [id, value] of defaults) {
        interpolatedRef.current.set(id, value);
      }
      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          next.set(id, value);
        }
        return next;
      });
    },
    [],
  );

  // Reset all to defaults
  const resetAllToDefaults = useCallback((slots: SlotConfig[]) => {
    const defaults = buildAllSlotsDefaultParameters(
      slots.map((s) => ({ index: s.index, sceneId: s.sketchId })),
    );

    setParameters(new Map(defaults));

    interpolatedRef.current = new Map(defaults);
    setInterpolatedValues(new Map(defaults));
  }, []);

  // Apply backend parameters to local state
  const applyBackendParams = useCallback(
    (params: BackendParameter[]) => {
      setParameters((prev) => {
        const next = new Map(prev);

        for (const param of params) {
          const id = param.id as ParameterId;
          const range = getParameterRange(id, currentSlots);
          const targetValue = param.target;
          const clampedValue = range
            ? clamp(targetValue, range.min, range.max)
            : targetValue;
          next.set(id, clampedValue);
        }

        return next;
      });
    },
    [currentSlots],
  );

  // Get slot parameter value
  const getSlotParameter = useCallback(
    (slotIndex: number, templateId: ParameterTemplateId): number => {
      const id = makeSlotParameterId(slotIndex, templateId);
      return get(id);
    },
    [get],
  );

  // Set slot parameter value
  const setSlotParameter = useCallback(
    (slotIndex: number, templateId: ParameterTemplateId, value: number) => {
      const id = makeSlotParameterId(slotIndex, templateId);
      set(id, value);
    },
    [set],
  );

  // Check if parameter exists
  const has = useCallback(
    (id: ParameterId): boolean => {
      return parameters.has(id);
    },
    [parameters],
  );

  // Get all entries
  const entries = useCallback((): Array<[ParameterId, number]> => {
    return Array.from(parameters.entries());
  }, [parameters]);

  return {
    parameters,
    interpolatedValues,
    get,
    getInterpolated,
    set,
    setMany,
    setInterpolated,
    initializeSlot,
    initializeSlotWithValues,
    removeSlotParameters,
    copySlotParametersTo,
    resetSlotToDefaults,
    resetAllToDefaults,
    applyBackendParams,
    getSlotParameter,
    setSlotParameter,
    has,
    entries,
    backendSnapshot,
    setBackendSnapshot,
    isLoading,
    setIsLoading,
    error,
    setError,
    currentSlots,
    setCurrentSlots,
  };
}

/**
 * Map from template ID (snake_case) to props key (camelCase).
 */
const TEMPLATE_ID_TO_PROPS_KEY: Record<ParameterTemplateId, string> = {
  brightness: "brightness",
  rotation_speed: "rotationSpeed",
  tint: "tint",
  wobble: "wobble",
  tint_lfo_depth: "tintLfoDepth",
  scale: "scale",
  pulse_speed: "pulseSpeed",
  // TslText3D specific
  hue_shift: "hueShift",
  glow_intensity: "glowIntensity",
  // TslNoiseBlob specific
  noise_scale: "noiseScale",
  noise_speed: "noiseSpeed",
  color_mix: "colorMix",
};

/**
 * Build scene props object from parameter store for a slot.
 * Uses target values (for sliders/controls).
 */
export function buildSlotSceneParams(
  slotIndex: number,
  sketchId: SketchId,
  store: ParameterStoreState,
): Record<string, number> {
  const sketch = getSketchDescriptor(sketchId);
  if (!sketch) return {};

  const params: Record<string, number> = {};

  for (const template of sketch.parameters) {
    const propsKey = TEMPLATE_ID_TO_PROPS_KEY[template.templateId];
    if (propsKey) {
      const paramId = makeSlotParameterId(slotIndex, template.templateId);
      params[propsKey] = store.get(paramId);
    }
  }

  return params;
}

/**
 * Build scene props object using interpolated values for smooth preview rendering.
 */
export function buildSlotSceneParamsInterpolated(
  slotIndex: number,
  sketchId: SketchId,
  store: ParameterStoreState,
): Record<string, number> {
  const sketch = getSketchDescriptor(sketchId);
  if (!sketch) return {};

  const params: Record<string, number> = {};

  for (const template of sketch.parameters) {
    const propsKey = TEMPLATE_ID_TO_PROPS_KEY[template.templateId];
    if (propsKey) {
      const paramId = makeSlotParameterId(slotIndex, template.templateId);
      params[propsKey] = store.getInterpolated(paramId);
    }
  }

  return params;
}

/**
 * Legacy compatibility exports.
 * These are deprecated but kept for backwards compatibility during migration.
 */
export {
  buildSlotSceneParams as buildSceneParams,
  buildSlotSceneParamsInterpolated as buildSceneParamsInterpolated,
};
