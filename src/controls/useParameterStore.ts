import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { SketchId, ParameterTemplateId } from "../sketches";
import { getSketchDescriptor } from "../sketches";
import type { ParameterId, SlotParameterId } from "../slots/slotTypes";
import {
  buildSlotDefaultParameters,
  buildAllSlotsDefaultParameters,
  copySlotParameters,
  makeSlotParameterId,
  parseSlotParameterId,
} from "../slots/slotTypes";

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
  hasPendingUserInput: (id: ParameterId) => boolean;
  setFromBackend: (id: ParameterId, value: number) => void;
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

  // Refs for stable get/set - always point to current state
  const parametersRef = useRef<Map<ParameterId, number>>(parameters);
  const currentSlotsRef = useRef<SlotConfig[]>(currentSlots);

  // Track pending user input to prevent backend events from overwriting during drag
  const pendingUserInputRef = useRef<Map<ParameterId, number>>(new Map());

  // Keep refs in sync with state
  useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);

  useEffect(() => {
    currentSlotsRef.current = currentSlots;
  }, [currentSlots]);

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

  // Get a parameter value
  const get = useCallback((id: ParameterId): number => {
    const value = parametersRef.current.get(id);
    if (value !== undefined) return value;
    return getParameterDefault(id, currentSlotsRef.current) ?? 0;
  }, []);

  // Get interpolated value for smooth preview rendering
  const getInterpolated = useCallback((id: ParameterId): number => {
    const value = interpolatedRef.current.get(id);
    if (value !== undefined) return value;
    return getParameterDefault(id, currentSlotsRef.current) ?? 0;
  }, []);

  // Set a parameter (from user input) - marks as pending to block backend overwrites
  const set = useCallback((id: ParameterId, value: number) => {
    const range = getParameterRange(id, currentSlotsRef.current);
    const clampedValue = range ? clamp(value, range.min, range.max) : value;

    pendingUserInputRef.current.set(id, Date.now());

    const next = new Map(parametersRef.current);
    next.set(id, clampedValue);
    parametersRef.current = next;
    setParameters(next);
  }, []);

  // Set multiple parameters at once
  const setMany = useCallback((updates: Array<[ParameterId, number]>) => {
    setParameters((prev) => {
      const next = new Map(prev);
      for (const [id, value] of updates) {
        const range = getParameterRange(id, currentSlotsRef.current);
        const clampedValue = range ? clamp(value, range.min, range.max) : value;
        next.set(id, clampedValue);
      }
      return next;
    });
  }, []);

  // Set an interpolated value from backend tick loop
  const setInterpolated = useCallback((id: ParameterId, value: number) => {
    const range = getParameterRange(id, currentSlotsRef.current);
    const clampedValue = range ? clamp(value, range.min, range.max) : value;

    interpolatedRef.current.set(id, clampedValue);

    setInterpolatedValues((prev) => {
      const next = new Map(prev);
      next.set(id, clampedValue);
      return next;
    });
  }, []);

  // Initialize slot parameters with defaults (only for missing parameters)
  const initializeSlot = useCallback(
    (slotIndex: number, sketchId: SketchId) => {
      const defaults = buildSlotDefaultParameters(slotIndex, sketchId);

      setParameters((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          // Only set if parameter doesn't already exist
          if (!next.has(id)) {
            next.set(id, value);
          }
        }
        return next;
      });

      // Also update interpolated values (only for missing ones)
      setInterpolatedValues((prev) => {
        const next = new Map(prev);
        for (const [id, value] of defaults) {
          if (!interpolatedRef.current.has(id)) {
            interpolatedRef.current.set(id, value);
            next.set(id, value);
          }
        }
        return next;
      });
    },
    [],
  );

  // Initialize slot with specific values
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
      slots.map((s) => ({ index: s.index, sketchId: s.sketchId })),
    );

    setParameters(new Map(defaults));

    interpolatedRef.current = new Map(defaults);
    setInterpolatedValues(new Map(defaults));
  }, []);

  // Apply backend parameters (initial hydration only)
  const applyBackendParams = useCallback((params: BackendParameter[]) => {
    setParameters((prev) => {
      const next = new Map(prev);

      for (const param of params) {
        const id = param.id as ParameterId;
        const range = getParameterRange(id, currentSlotsRef.current);
        const targetValue = param.target;
        const clampedValue = range
          ? clamp(targetValue, range.min, range.max)
          : targetValue;
        next.set(id, clampedValue);
      }

      // Update ref synchronously
      parametersRef.current = next;
      return next;
    });
  }, []);

  // Check if parameter has pending user input (within 300ms timeout)
  const hasPendingUserInput = useCallback((id: ParameterId): boolean => {
    const PENDING_TIMEOUT_MS = 300;
    const timestamp = pendingUserInputRef.current.get(id);
    if (timestamp === undefined) return false;

    if (Date.now() - timestamp >= PENDING_TIMEOUT_MS) {
      pendingUserInputRef.current.delete(id);
      return false;
    }
    return true;
  }, []);

  // Set a parameter from backend (respects pending user input)
  const setFromBackend = useCallback(
    (id: ParameterId, value: number) => {
      if (hasPendingUserInput(id)) return;

      const range = getParameterRange(id, currentSlotsRef.current);
      const clampedValue = range ? clamp(value, range.min, range.max) : value;

      const currentValue = parametersRef.current.get(id);
      if (
        currentValue !== undefined &&
        Math.abs(currentValue - clampedValue) < 0.001
      ) {
        return;
      }

      const next = new Map(parametersRef.current);
      next.set(id, clampedValue);
      parametersRef.current = next;
      setParameters(next);
    },
    [hasPendingUserInput],
  );

  // Get slot parameter value
  const getSlotParameter = useCallback(
    (slotIndex: number, templateId: ParameterTemplateId): number => {
      const id = makeSlotParameterId(slotIndex, templateId);
      const value = parametersRef.current.get(id);
      if (value !== undefined) return value;
      return getParameterDefault(id, currentSlotsRef.current) ?? 0;
    },
    [],
  );

  // Set slot parameter value
  const setSlotParameter = useCallback(
    (slotIndex: number, templateId: ParameterTemplateId, value: number) => {
      const id = makeSlotParameterId(slotIndex, templateId);
      const range = getParameterRange(id, currentSlotsRef.current);
      const clampedValue = range ? clamp(value, range.min, range.max) : value;
      setParameters((prev) => {
        const next = new Map(prev);
        next.set(id, clampedValue);
        return next;
      });
    },
    [],
  );

  // Check if parameter exists
  const has = useCallback((id: ParameterId): boolean => {
    return parametersRef.current.has(id);
  }, []);

  // Get all entries
  const entries = useCallback((): Array<[ParameterId, number]> => {
    return Array.from(parametersRef.current.entries());
  }, []);

  // Memoized return object to prevent unnecessary re-renders
  const storeState = useMemo(
    () => ({
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
      hasPendingUserInput,
      setFromBackend,
    }),
    [
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
      hasPendingUserInput,
      setFromBackend,
    ],
  );

  return storeState;
}

/**
 * Map from template ID (snake_case) to props key (camelCase).
 */
const TEMPLATE_ID_TO_PROPS_KEY: Record<ParameterTemplateId, string> = {
  // Slot-level parameters
  alpha: "alpha",
  audio_reactivity: "audioReactivity",
  // Common parameters
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
  // Plasma specific
  plasma_speed: "plasmaSpeed",
  plasma_scale: "plasmaScale",
  plasma_complexity: "plasmaComplexity",
  plasma_color_cycle: "plasmaColorCycle",
  // Kaleidoscope specific
  kaleid_segments: "kaleidSegments",
  kaleid_zoom: "kaleidZoom",
  kaleid_rotation: "kaleidRotation",
  kaleid_pattern_speed: "kaleidPatternSpeed",
  // FeedbackTunnel specific
  tunnel_speed: "tunnelSpeed",
  tunnel_twist: "tunnelTwist",
  tunnel_layers: "tunnelLayers",
  tunnel_color_speed: "tunnelColorSpeed",
  // Waveform specific
  wave_speed: "waveSpeed",
  wave_amplitude: "waveAmplitude",
  wave_frequency: "waveFrequency",
  wave_glow: "waveGlow",
  // Aura specific
  bloom: "bloom",
  complexity: "complexity",
  sample_offset: "sampleOffset",
  speed: "speed",
  scale_base: "scaleBase",
  distance: "distance",
  attenuation: "attenuation",
  ray_steps: "raySteps",
  seed: "seed",
  color_interp: "colorInterp",
  grain_intensity: "grainIntensity",
  tonemap_mode: "tonemapMode",
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
