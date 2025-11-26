/**
 * Audio Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust Audio module and
 * React hooks for managing audio devices, capture, level monitoring,
 * and audio → parameter mappings.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** Information about an available audio input device. */
export interface AudioDeviceInfo {
  /** Device name */
  name: string;
  /** Whether this is the default input device */
  is_default: boolean;
  /** Whether this device is currently active */
  is_active: boolean;
}

/** Frequency band energy levels. */
export interface AudioBands {
  /** Bass (20-250 Hz) */
  bass: number;
  /** Low-mid (250-500 Hz) */
  low_mid: number;
  /** High-mid (500-2000 Hz) */
  high_mid: number;
  /** Treble (2000-20000 Hz) */
  treble: number;
}

/** Audio analysis results emitted periodically. */
export interface AudioLevels {
  /** RMS (root mean square) loudness, normalized 0-1 */
  rms: number;
  /** Peak amplitude, normalized 0-1 */
  peak: number;
  /** Frequency bands (bass, low-mid, high-mid, treble), each 0-1 */
  bands: AudioBands;
  /** Beat detection flag (true if beat detected this frame) */
  beat: boolean;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/** Status of the audio engine. */
export interface AudioStatus {
  /** Whether audio capture is currently running */
  is_running: boolean;
  /** Name of the active device (if running) */
  device_name: string | null;
  /** Sample rate in Hz (if running) */
  sample_rate: number | null;
  /** Error message if capture failed */
  error: string | null;
}

/** Audio source that can be mapped to a parameter. */
export type AudioSource =
  | "rms"
  | "peak"
  | "bass"
  | "low_mid"
  | "high_mid"
  | "treble"
  | "beat";

/** All available audio sources for UI iteration. */
export const AUDIO_SOURCES: AudioSource[] = [
  "rms",
  "peak",
  "bass",
  "low_mid",
  "high_mid",
  "treble",
  "beat",
];

/** Human-readable labels for audio sources. */
export const AUDIO_SOURCE_LABELS: Record<AudioSource, string> = {
  rms: "RMS (Volume)",
  peak: "Peak",
  bass: "Bass",
  low_mid: "Low-Mid",
  high_mid: "High-Mid",
  treble: "Treble",
  beat: "Beat",
};

/** Color CSS values for each audio source (matching level meter colors). */
export const AUDIO_SOURCE_COLORS: Record<AudioSource, string> = {
  rms: "rgb(34 197 94)", // emerald
  peak: "rgb(251 191 36)", // amber
  bass: "rgb(168 85 247)", // purple
  low_mid: "rgb(34 211 238)", // cyan
  high_mid: "rgb(34 197 94)", // emerald
  treble: "rgb(251 191 36)", // amber
  beat: "rgb(239 68 68)", // red
};

/** Short labels for audio sources (for compact display). */
export const AUDIO_SOURCE_SHORT_LABELS: Record<AudioSource, string> = {
  rms: "RMS",
  peak: "Peak",
  bass: "Bass",
  low_mid: "LoMid",
  high_mid: "HiMid",
  treble: "Treb",
  beat: "Beat",
};

/** Mode for how audio values are applied to parameters. */
export type AudioMappingMode = "continuous" | "trigger" | "add";

/** All available mapping modes for UI iteration. */
export const AUDIO_MAPPING_MODES: AudioMappingMode[] = [
  "continuous",
  "trigger",
  "add",
];

/** Human-readable labels for mapping modes. */
export const AUDIO_MAPPING_MODE_LABELS: Record<AudioMappingMode, string> = {
  continuous: "Continuous",
  trigger: "Trigger (on beat)",
  add: "Add to value",
};

/** An audio mapping that routes an audio source to a parameter. */
export interface AudioMapping {
  /** Unique ID for this mapping */
  id: string;
  /** Audio source (rms, bass, beat, etc.) */
  source: AudioSource;
  /** Target parameter ID */
  parameter_id: string;
  /** Minimum input value (maps to min_output) */
  min_input: number;
  /** Maximum input value (maps to max_output) */
  max_input: number;
  /** Minimum output value */
  min_output: number;
  /** Maximum output value */
  max_output: number;
  /** Mapping mode (continuous, trigger, add) */
  mode: AudioMappingMode;
  /** Smoothing factor (0-1, 0=instant, higher=smoother) */
  smoothing: number;
  /** Whether this mapping is currently enabled */
  enabled: boolean;
}

/** Default values for a new audio mapping. */
export const DEFAULT_AUDIO_MAPPING: Omit<AudioMapping, "id" | "parameter_id"> =
  {
    source: "rms",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
    mode: "continuous",
    smoothing: 0,
    enabled: true,
  };

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** List all available audio input devices. */
export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  return invoke<AudioDeviceInfo[]>("list_audio_devices");
}

/** Start audio capture from a device. */
export async function startAudioCapture(deviceName?: string): Promise<void> {
  return invoke("start_audio_capture", { deviceName });
}

/** Stop audio capture. */
export async function stopAudioCapture(): Promise<void> {
  return invoke("stop_audio_capture");
}

/** Get current audio status. */
export async function getAudioStatus(): Promise<AudioStatus> {
  return invoke<AudioStatus>("get_audio_status");
}

/** Get all audio mappings. */
export async function getAudioMappings(): Promise<AudioMapping[]> {
  return invoke<AudioMapping[]>("get_audio_mappings");
}

/** Add or update an audio mapping. */
export async function addAudioMapping(
  mapping: AudioMapping,
): Promise<AudioMapping> {
  return invoke<AudioMapping>("add_audio_mapping", { mapping });
}

/** Remove an audio mapping by ID. */
export async function removeAudioMapping(id: string): Promise<boolean> {
  return invoke<boolean>("remove_audio_mapping", { id });
}

/** Clear all audio mappings. */
export async function clearAudioMappings(): Promise<void> {
  return invoke("clear_audio_mappings");
}

/** Set mapping enabled state. */
export async function setAudioMappingEnabled(
  id: string,
  enabled: boolean,
): Promise<boolean> {
  return invoke<boolean>("set_audio_mapping_enabled", { id, enabled });
}

// ============================================================================
// React Hooks
// ============================================================================

/** Hook for managing audio devices and capture. */
export function useAudioCapture() {
  const [devices, setDevices] = useState<AudioDeviceInfo[]>([]);
  const [status, setStatus] = useState<AudioStatus>({
    is_running: false,
    device_name: null,
    sample_rate: null,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial data
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [deviceList, audioStatus] = await Promise.all([
          listAudioDevices(),
          getAudioStatus(),
        ]);
        if (isMounted) {
          setDevices(deviceList);
          setStatus(audioStatus);
        }
      } catch (e) {
        console.error("[Audio] Failed to fetch initial data:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to status changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<AudioStatus>("audio_status_changed", (event) => {
        setStatus(event.payload);
        // Refresh device list when status changes
        void listAudioDevices().then(setDevices);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const deviceList = await listAudioDevices();
      setDevices(deviceList);
    } catch (e) {
      console.error("[Audio] Failed to refresh devices:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const start = useCallback(async (deviceName?: string) => {
    setIsLoading(true);
    try {
      await startAudioCapture(deviceName);
      const newStatus = await getAudioStatus();
      setStatus(newStatus);
      const deviceList = await listAudioDevices();
      setDevices(deviceList);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setStatus((prev) => ({
        ...prev,
        is_running: false,
        error: errorMessage,
      }));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setIsLoading(true);
    try {
      await stopAudioCapture();
      const newStatus = await getAudioStatus();
      setStatus(newStatus);
      const deviceList = await listAudioDevices();
      setDevices(deviceList);
    } catch (e) {
      console.error("[Audio] Failed to stop capture:", e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    devices,
    isRunning: status.is_running,
    deviceName: status.device_name,
    sampleRate: status.sample_rate,
    error: status.error,
    isLoading,
    refresh,
    start,
    stop,
  };
}

/** Hook for audio level monitoring. */
/** Number of recent beat intervals to keep for BPM calculation */
const BPM_HISTORY_SIZE = 8;
/** Minimum BPM we'll report (filters out very slow "beats") */
const MIN_BPM = 60;
/** Maximum BPM we'll report (filters out noise) */
const MAX_BPM = 200;

export function useAudioLevels() {
  const [levels, setLevels] = useState<AudioLevels | null>(null);
  const [beatCount, setBeatCount] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);

  // Track beat timestamps for BPM calculation
  const beatTimestampsRef = useRef<number[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<AudioLevels>("audio_levels", (event) => {
        setLevels(event.payload);
        if (event.payload.beat) {
          setBeatCount((prev) => prev + 1);

          // Calculate BPM from beat intervals
          const now = Date.now();
          const timestamps = beatTimestampsRef.current;
          timestamps.push(now);

          // Keep only recent timestamps
          if (timestamps.length > BPM_HISTORY_SIZE + 1) {
            timestamps.shift();
          }

          // Need at least 2 beats to calculate BPM
          if (timestamps.length >= 2) {
            // Calculate average interval between beats
            const intervals: number[] = [];
            for (let i = 1; i < timestamps.length; i++) {
              intervals.push(timestamps[i] - timestamps[i - 1]);
            }
            const avgInterval =
              intervals.reduce((a, b) => a + b, 0) / intervals.length;

            // Convert to BPM (60000ms per minute)
            const calculatedBpm = 60000 / avgInterval;

            // Only update if within reasonable range
            if (calculatedBpm >= MIN_BPM && calculatedBpm <= MAX_BPM) {
              setBpm(Math.round(calculatedBpm));
            }
          }
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const resetBeatCount = useCallback(() => {
    setBeatCount(0);
    setBpm(null);
    beatTimestampsRef.current = [];
  }, []);

  return {
    levels,
    rms: levels?.rms ?? 0,
    peak: levels?.peak ?? 0,
    bands: levels?.bands ?? { bass: 0, low_mid: 0, high_mid: 0, treble: 0 },
    beat: levels?.beat ?? false,
    beatCount,
    bpm,
    resetBeatCount,
  };
}

/** Hook for managing audio → parameter mappings. */
export function useAudioMappings() {
  const [mappings, setMappings] = useState<AudioMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial mappings
  useEffect(() => {
    let isMounted = true;

    async function fetchMappings() {
      try {
        const result = await getAudioMappings();
        if (isMounted) {
          setMappings(result);
        }
      } catch (e) {
        console.error("[Audio] Failed to fetch mappings:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchMappings();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to mapping changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<AudioMapping[]>(
        "audio_mappings_changed",
        (event) => {
          setMappings(event.payload);
        },
      );
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const add = useCallback(async (mapping: AudioMapping) => {
    setIsLoading(true);
    try {
      const result = await addAudioMapping(mapping);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setIsLoading(true);
    try {
      return await removeAudioMapping(id);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(async () => {
    setIsLoading(true);
    try {
      await clearAudioMappings();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setEnabled = useCallback(async (id: string, enabled: boolean) => {
    return await setAudioMappingEnabled(id, enabled);
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAudioMappings();
      setMappings(result);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    mappings,
    isLoading,
    add,
    remove,
    clear,
    setEnabled,
    refresh,
  };
}

/**
 * Helper to generate a unique mapping ID.
 */
export function generateMappingId(): string {
  return `audio_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Helper to get the current value of an audio source from levels.
 */
export function getAudioSourceValue(
  source: AudioSource,
  levels: AudioLevels | null,
): number {
  if (!levels) return 0;

  switch (source) {
    case "rms":
      return levels.rms;
    case "peak":
      return levels.peak;
    case "bass":
      return levels.bands.bass;
    case "low_mid":
      return levels.bands.low_mid;
    case "high_mid":
      return levels.bands.high_mid;
    case "treble":
      return levels.bands.treble;
    case "beat":
      return levels.beat ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Extract scene identifier from a parameter ID.
 * Returns "A", "B", "C", or null for global parameters.
 */
export function getSceneFromParameterId(parameterId: string): string | null {
  const match = parameterId.match(/^scene_([a-c])_/i);
  if (match) {
    return match[1].toUpperCase();
  }
  // Special case for rotationSpeed which belongs to Scene A
  if (parameterId === "rotationSpeed") {
    return "A";
  }
  return null;
}
