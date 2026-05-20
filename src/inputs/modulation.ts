/**
 * Modulation Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust Modulation module and
 * React hooks for managing LFOs, modulation targets, and audio modulation.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AudioSource } from "./audio";
import { useEventListener, useFetchOnMount } from "./shared";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** LFO waveform shapes */
export type LfoShape = "sine" | "triangle" | "saw" | "square" | "random" | "smooth_random";

/** All available LFO shapes for UI iteration */
export const LFO_SHAPES: LfoShape[] = [
  "sine",
  "triangle",
  "saw",
  "square",
  "random",
  "smooth_random",
];

/** Human-readable labels for LFO shapes */
export const LFO_SHAPE_LABELS: Record<LfoShape, string> = {
  sine: "Sine",
  triangle: "Triangle",
  saw: "Saw",
  square: "Square",
  random: "Random (stepped)",
  smooth_random: "Random (smooth)",
};

/** An LFO source that generates a periodic signal */
export interface LfoSource {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Waveform shape */
  shape: LfoShape;
  /** Frequency in Hz (0.01 to 20.0) */
  rate: number;
  /** Phase offset (0.0 to 1.0) */
  phase: number;
  /** Output amplitude (0.0 to 1.0) */
  depth: number;
  /** Center offset for bipolar output (-1.0 to 1.0) */
  offset: number;
  /** Whether the LFO is enabled */
  enabled: boolean;
  /** Whether to sync rate to BPM (if audio provides it) */
  sync_to_bpm: boolean;
  /** BPM division when synced (1 = 1 beat, 2 = 2 beats, 0.5 = half beat, etc.) */
  bpm_division: number;
  /** Display order index for reordering (lower = higher in list) */
  order: number;
  /** Whether this LFO is pinned (stays at top, survives Clear All) */
  pinned: boolean;
}

/** Default values for a new LFO */
export const DEFAULT_LFO: Omit<LfoSource, "id"> = {
  name: "LFO",
  shape: "sine",
  rate: 1.0,
  phase: 0.0,
  depth: 1.0,
  offset: 0.0,
  enabled: true,
  sync_to_bpm: true,
  bpm_division: 4.0,
  order: 0,
  pinned: false,
};

/** A modulation target that routes an LFO to a parameter */
export interface ModulationTarget {
  /** Unique identifier */
  id: string;
  /** Source LFO ID */
  source_id: string;
  /** Target parameter ID */
  parameter_id: string;
  /** Modulation depth (how much the LFO affects the parameter) */
  depth: number;
  /** Whether modulation is bipolar (±depth) or unipolar (0 to depth) */
  bipolar: boolean;
  /** Whether this target is enabled */
  enabled: boolean;
}

/** Default values for a new modulation target */
export const DEFAULT_MODULATION_TARGET: Omit<
  ModulationTarget,
  "id" | "source_id" | "parameter_id"
> = {
  depth: 0.5,
  bipolar: true,
  enabled: true,
};

/** What property of an LFO can be modulated by audio */
export type LfoProperty = "rate" | "depth" | "phase";

/** All available LFO properties for audio modulation */
export const LFO_PROPERTIES: LfoProperty[] = ["rate", "depth", "phase"];

/** Human-readable labels for LFO properties */
export const LFO_PROPERTY_LABELS: Record<LfoProperty, string> = {
  rate: "Rate",
  depth: "Depth",
  phase: "Phase",
};

/** An audio modulation that routes an audio source to an LFO property */
export interface AudioModulation {
  /** Unique identifier */
  id: string;
  /** Audio source to read from */
  source: AudioSource;
  /** Target LFO ID */
  lfo_id: string;
  /** Property to modulate */
  property: LfoProperty;
  /** Modulation amount (multiplier for audio value) */
  amount: number;
  /** Minimum output value */
  min_output: number;
  /** Maximum output value */
  max_output: number;
  /** Whether this modulation is enabled */
  enabled: boolean;
}

/** Default values for a new audio modulation */
export const DEFAULT_AUDIO_MODULATION: Omit<AudioModulation, "id" | "lfo_id"> =
  {
    source: "rms",
    property: "rate",
    amount: 1.0,
    min_output: 0.0,
    max_output: 1.0,
    enabled: true,
  };

/** Full modulation state snapshot */
export interface ModulationState {
  lfos: LfoSource[];
  targets: ModulationTarget[];
  audio_modulations: AudioModulation[];
}

/** LFO values emitted for UI visualization */
export interface LfoValues {
  /** Map of LFO ID to current value (-1.0 to 1.0) */
  values: Record<string, number>;
  /** Timestamp in milliseconds */
  timestamp: number;
}

// ============================================================================
// Colors for UI
// ============================================================================

/** Colors for LFO shapes in UI */
export const LFO_SHAPE_COLORS: Record<LfoShape, string> = {
  sine: "rgb(99 102 241)", // indigo
  triangle: "rgb(34 197 94)", // emerald
  saw: "rgb(251 191 36)", // amber
  square: "rgb(168 85 247)", // purple
  random: "rgb(239 68 68)", // red
  smooth_random: "rgb(249 115 22)", // orange
};

/** Colors for modulation depth indicators */
export const MODULATION_INDICATOR_COLOR = "rgb(99 102 241)"; // indigo

/**
 * Generate a human-readable default name for a new LFO.
 * e.g. "Sine 1.0 Hz", "Triangle 0.25 Hz"
 */
export function generateLfoName(shape: LfoShape, rate: number): string {
  const shapeLabel = LFO_SHAPE_LABELS[shape] ?? shape;
  const hz = rate >= 1 ? `${rate.toFixed(1)} Hz` : `${rate.toFixed(2)} Hz`;
  return `${shapeLabel} ${hz}`;
}

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** Get all LFO sources */
export async function getLfos(): Promise<LfoSource[]> {
  return invoke<LfoSource[]>("get_modulation_lfos");
}

/** Get a single LFO by ID */
export async function getLfo(id: string): Promise<LfoSource | null> {
  return invoke<LfoSource | null>("get_modulation_lfo", { id });
}

/** Add or update an LFO */
export async function addLfo(lfo: LfoSource): Promise<LfoSource> {
  return invoke<LfoSource>("add_modulation_lfo", { lfo });
}

/** Update an existing LFO */
export async function updateLfo(lfo: LfoSource): Promise<LfoSource | null> {
  return invoke<LfoSource | null>("update_modulation_lfo", { lfo });
}

/** Remove an LFO by ID */
export async function removeLfo(id: string): Promise<boolean> {
  return invoke<boolean>("remove_modulation_lfo", { id });
}

/** Clear all LFOs */
export async function clearLfos(): Promise<void> {
  return invoke("clear_modulation_lfos");
}

/** Get all modulation targets */
export async function getTargets(): Promise<ModulationTarget[]> {
  return invoke<ModulationTarget[]>("get_modulation_targets");
}

/** Add or update a modulation target */
export async function addTarget(
  target: ModulationTarget,
): Promise<ModulationTarget> {
  return invoke<ModulationTarget>("add_modulation_target", { target });
}

/** Remove a modulation target by ID */
export async function removeTarget(id: string): Promise<boolean> {
  return invoke<boolean>("remove_modulation_target", { id });
}

/** Clear all modulation targets */
export async function clearTargets(): Promise<void> {
  return invoke("clear_modulation_targets");
}

/** Update the base value for a modulated parameter */
export async function updateBaseValue(
  parameterId: string,
  value: number,
): Promise<void> {
  return invoke("update_modulation_base_value", {
    parameter_id: parameterId,
    value,
  });
}

/** Get all audio modulations */
export async function getAudioModulations(): Promise<AudioModulation[]> {
  return invoke<AudioModulation[]>("get_modulation_audio_modulations");
}

/** Add or update an audio modulation */
export async function addAudioModulation(
  audioMod: AudioModulation,
): Promise<AudioModulation> {
  // Tauri expects camelCase parameter names in invoke
  return invoke<AudioModulation>("add_modulation_audio_modulation", {
    audioMod,
  });
}

/** Remove an audio modulation by ID */
export async function removeAudioModulation(id: string): Promise<boolean> {
  return invoke<boolean>("remove_modulation_audio_modulation", { id });
}

/** Clear all audio modulations */
export async function clearAudioModulations(): Promise<void> {
  return invoke("clear_modulation_audio_modulations");
}

/** Get the full modulation state */
export async function getModulationState(): Promise<ModulationState> {
  return invoke<ModulationState>("get_full_modulation_state");
}

/** Check if a parameter is being modulated */
export async function isParameterModulated(
  parameterId: string,
): Promise<boolean> {
  return invoke<boolean>("is_parameter_modulated_cmd", {
    parameter_id: parameterId,
  });
}

// ============================================================================
// React Hooks
// ============================================================================

/** Hook for managing LFO sources */
export function useLfos() {
  // Fetch initial data
  const {
    data: lfos,
    isLoading: isFetching,
    setData: setLfos,
    refetch: doRefetch,
  } = useFetchOnMount(getLfos, { initialValue: [] as LfoSource[] });

  const [isOperating, setIsOperating] = useState(false);

  // Subscribe to LFO changes
  useEventListener<LfoSource[]>("modulation_lfos_changed", setLfos);

  const add = useCallback(async (lfo: LfoSource) => {
    setIsOperating(true);
    try {
      return await addLfo(lfo);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const update = useCallback(async (lfo: LfoSource) => {
    setIsOperating(true);
    try {
      return await updateLfo(lfo);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setIsOperating(true);
    try {
      return await removeLfo(id);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setIsOperating(true);
    try {
      await clearLfos();
    } finally {
      setIsOperating(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsOperating(true);
    try {
      await doRefetch();
    } finally {
      setIsOperating(false);
    }
  }, [doRefetch]);

  return {
    lfos,
    isLoading: isFetching || isOperating,
    add,
    update,
    remove,
    clear,
    refresh,
  };
}

/** Hook for managing modulation targets */
export function useModulationTargets() {
  // Fetch initial data
  const {
    data: targets,
    isLoading: isFetching,
    setData: setTargets,
    refetch: doRefetch,
  } = useFetchOnMount(getTargets, { initialValue: [] as ModulationTarget[] });

  const [isOperating, setIsOperating] = useState(false);

  // Subscribe to target changes
  useEventListener<ModulationTarget[]>(
    "modulation_targets_changed",
    setTargets,
  );

  const add = useCallback(async (target: ModulationTarget) => {
    setIsOperating(true);
    try {
      return await addTarget(target);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setIsOperating(true);
    try {
      return await removeTarget(id);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setIsOperating(true);
    try {
      await clearTargets();
    } finally {
      setIsOperating(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsOperating(true);
    try {
      await doRefetch();
    } finally {
      setIsOperating(false);
    }
  }, [doRefetch]);

  return {
    targets,
    isLoading: isFetching || isOperating,
    add,
    remove,
    clear,
    refresh,
  };
}

/** Hook for managing audio modulations */
export function useAudioModulations() {
  // Fetch initial data
  const {
    data: audioModulations,
    isLoading: isFetching,
    setData: setAudioModulations,
    refetch: doRefetch,
  } = useFetchOnMount(getAudioModulations, {
    initialValue: [] as AudioModulation[],
  });

  const [isOperating, setIsOperating] = useState(false);

  // Subscribe to audio modulation changes
  useEventListener<AudioModulation[]>(
    "modulation_audio_changed",
    setAudioModulations,
  );

  const add = useCallback(async (audioMod: AudioModulation) => {
    setIsOperating(true);
    try {
      return await addAudioModulation(audioMod);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setIsOperating(true);
    try {
      return await removeAudioModulation(id);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setIsOperating(true);
    try {
      await clearAudioModulations();
    } finally {
      setIsOperating(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsOperating(true);
    try {
      await doRefetch();
    } finally {
      setIsOperating(false);
    }
  }, [doRefetch]);

  return {
    audioModulations,
    isLoading: isFetching || isOperating,
    add,
    remove,
    clear,
    refresh,
  };
}

/** Hook for LFO value visualization */
export function useLfoValues() {
  const [values, setValues] = useState<Record<string, number>>({});
  const lastValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<LfoValues>("lfo_values", (event) => {
        // Only update if values actually changed to avoid unnecessary re-renders
        const newValues = event.payload.values;
        const changed = Object.keys(newValues).some(
          (key) =>
            Math.abs(
              (lastValuesRef.current[key] ?? 0) - (newValues[key] ?? 0),
            ) > 0.001,
        );
        if (changed) {
          lastValuesRef.current = newValues;
          setValues(newValues);
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const getValue = useCallback(
    (lfoId: string): number => {
      return values[lfoId] ?? 0;
    },
    [values],
  );

  return {
    values,
    getValue,
  };
}

/** Hook for the full modulation state */
export function useModulationState() {
  const { lfos, add: addLfo, update: updateLfo, remove: removeLfo } = useLfos();
  const {
    targets,
    add: addTarget,
    remove: removeTarget,
  } = useModulationTargets();
  const {
    audioModulations,
    add: addAudioMod,
    remove: removeAudioMod,
  } = useAudioModulations();
  const { values: lfoValues, getValue: getLfoValue } = useLfoValues();

  return {
    lfos,
    targets,
    audioModulations,
    lfoValues,
    addLfo,
    updateLfo,
    removeLfo,
    addTarget,
    removeTarget,
    addAudioMod,
    removeAudioMod,
    getLfoValue,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for a new LFO, target, or audio modulation.
 */
export function generateModulationId(prefix: string = "mod"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new LFO with default values and a unique ID.
 */
export function createLfo(overrides: Partial<LfoSource> = {}): LfoSource {
  return {
    ...DEFAULT_LFO,
    id: generateModulationId("lfo"),
    ...overrides,
  };
}

/**
 * Create a new modulation target with default values and a unique ID.
 */
export function createTarget(
  sourceId: string,
  parameterId: string,
  overrides: Partial<ModulationTarget> = {},
): ModulationTarget {
  return {
    ...DEFAULT_MODULATION_TARGET,
    id: generateModulationId("target"),
    source_id: sourceId,
    parameter_id: parameterId,
    ...overrides,
  };
}

/**
 * Create a new audio modulation with default values and a unique ID.
 */
export function createAudioModulation(
  lfoId: string,
  overrides: Partial<AudioModulation> = {},
): AudioModulation {
  return {
    ...DEFAULT_AUDIO_MODULATION,
    id: generateModulationId("audiomod"),
    lfo_id: lfoId,
    ...overrides,
  };
}

/**
 * Get the targets for a specific parameter.
 */
export function getTargetsForParameter(
  targets: ModulationTarget[],
  parameterId: string,
): ModulationTarget[] {
  return targets.filter((t) => t.parameter_id === parameterId);
}

/**
 * Get the targets for a specific LFO.
 */
export function getTargetsForLfo(
  targets: ModulationTarget[],
  lfoId: string,
): ModulationTarget[] {
  return targets.filter((t) => t.source_id === lfoId);
}

/**
 * Get the audio modulations for a specific LFO.
 */
export function getAudioModulationsForLfo(
  audioModulations: AudioModulation[],
  lfoId: string,
): AudioModulation[] {
  return audioModulations.filter((m) => m.lfo_id === lfoId);
}

/**
 * Check if a parameter has any active modulation.
 */
export function hasActiveModulation(
  targets: ModulationTarget[],
  parameterId: string,
): boolean {
  return targets.some((t) => t.enabled && t.parameter_id === parameterId);
}
