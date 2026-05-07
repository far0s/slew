/**
 * OSC Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust OSC module and
 * React hooks for managing the OSC server, mappings, and activity.
 */

import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useEventListener,
  useFetchOnMount,
  useMessageActivity,
  useMessageHistory,
} from "./shared";
import { logger } from "../lib/logger";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** Status of the OSC server. */
export interface OscServerStatus {
  /** Whether the server is currently running */
  is_running: boolean;
  /** The port the server is listening on (if running) */
  port: number | null;
  /** Error message if the server failed to start */
  error: string | null;
}

/** An OSC mapping that routes an address pattern to a parameter. */
export interface OscMapping {
  /** The OSC address pattern (e.g., "/scene/a/brightness") */
  address: string;
  /** The parameter ID this mapping controls */
  parameter_id: string;
  /** Minimum input value (maps to min_output) */
  min_input: number;
  /** Maximum input value (maps to max_output) */
  max_input: number;
  /** Minimum output value */
  min_output: number;
  /** Maximum output value */
  max_output: number;
}

/** A raw OSC message for UI display / activity indicators. */
export interface OscMessageInfo {
  /** The OSC address */
  address: string;
  /** String representation of the arguments */
  args: string[];
  /** Timestamp in milliseconds */
  timestamp: number;
}

/** Beat event emitted when /slew/beat is received. */
export interface OscBeatInfo {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Current BPM if set via /slew/bpm (null until first /slew/bpm message) */
  bpm: number | null;
}

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** Start the OSC server on the specified port. */
export async function startOscServer(port: number): Promise<void> {
  return invoke("start_osc_server", { port });
}

/** Stop the OSC server. */
export async function stopOscServer(): Promise<void> {
  return invoke("stop_osc_server");
}

/** Get the current OSC server status. */
export async function getOscStatus(): Promise<OscServerStatus> {
  return invoke<OscServerStatus>("get_osc_status");
}

/** Get all OSC mappings. */
export async function getOscMappings(): Promise<OscMapping[]> {
  return invoke<OscMapping[]>("get_osc_mappings");
}

/** Add or update an OSC mapping. */
export async function addOscMapping(mapping: OscMapping): Promise<void> {
  return invoke("add_osc_mapping", { mapping });
}

/** Remove an OSC mapping by address. */
export async function removeOscMapping(address: string): Promise<void> {
  return invoke("remove_osc_mapping", { address });
}

/** Clear all OSC mappings. */
export async function clearOscMappings(): Promise<void> {
  return invoke("clear_osc_mappings");
}

// ============================================================================
// React Hooks
// ============================================================================

/** Default OSC port */
export const DEFAULT_OSC_PORT = 9000;

/** Default parameter mappings for auto-setup */
export const DEFAULT_OSC_MAPPINGS: OscMapping[] = [
  // Crossfade
  {
    address: "/crossfade",
    parameter_id: "crossfade",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
  },
  // Slot 0 (default BlueCube parameters)
  {
    address: "/slot/0/brightness",
    parameter_id: "slot_0_brightness",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 2,
  },
  {
    address: "/slot/0/wobble",
    parameter_id: "slot_0_wobble",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
  },
  {
    address: "/slot/0/tint",
    parameter_id: "slot_0_tint",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
  },
  {
    address: "/slot/0/tint_lfo_depth",
    parameter_id: "slot_0_tint_lfo_depth",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
  },
  {
    address: "/slot/0/rotation_speed",
    parameter_id: "slot_0_rotation_speed",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 2,
  },
  {
    address: "/slot/0/scale",
    parameter_id: "slot_0_scale",
    min_input: 0,
    max_input: 1,
    min_output: 0.5,
    max_output: 2,
  },
  {
    address: "/slot/0/pulse_speed",
    parameter_id: "slot_0_pulse_speed",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 2,
  },
  // Slot 1 (common parameters)
  {
    address: "/slot/1/brightness",
    parameter_id: "slot_1_brightness",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 2,
  },
  {
    address: "/slot/1/rotation_speed",
    parameter_id: "slot_1_rotation_speed",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 2,
  },
  {
    address: "/slot/1/tint",
    parameter_id: "slot_1_tint",
    min_input: 0,
    max_input: 1,
    min_output: 0,
    max_output: 1,
  },
  {
    address: "/slot/1/scale",
    parameter_id: "slot_1_scale",
    min_input: 0,
    max_input: 1,
    min_output: 0.5,
    max_output: 2,
  },
];

/** Setup default OSC mappings for all parameters */
export async function setupDefaultMappings(): Promise<void> {
  for (const mapping of DEFAULT_OSC_MAPPINGS) {
    await addOscMapping(mapping);
  }
}

/** Hook for managing the OSC server. */
export function useOscServer() {
  const [status, setStatus] = useState<OscServerStatus>({
    is_running: false,
    port: null,
    error: null,
  });

  // Fetch initial status
  const { isLoading, setData: _setData } = useFetchOnMount(getOscStatus, {
    initialValue: status,
    onSuccess: setStatus,
  });

  const [isOperating, setIsOperating] = useState(false);

  // Subscribe to status changes
  useEventListener<OscServerStatus>("osc_status_changed", setStatus);

  const start = useCallback(async (port: number = DEFAULT_OSC_PORT) => {
    setIsOperating(true);
    try {
      await startOscServer(port);
      const newStatus = await getOscStatus();
      setStatus(newStatus);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setStatus((prev) => ({
        ...prev,
        is_running: false,
        error: errorMessage,
      }));
      throw e;
    } finally {
      setIsOperating(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setIsOperating(true);
    try {
      await stopOscServer();
      const newStatus = await getOscStatus();
      setStatus(newStatus);
    } catch (e) {
      logger.error("OSC", "Failed to stop server:", e);
      throw e;
    } finally {
      setIsOperating(false);
    }
  }, []);

  return {
    isRunning: status.is_running,
    port: status.port,
    error: status.error,
    isLoading: isLoading || isOperating,
    start,
    stop,
  };
}

/** Hook for OSC mappings. */
export function useOscMappings() {
  // Fetch initial mappings
  const {
    data: mappings,
    isLoading: isFetching,
    setData: setMappings,
    refetch,
  } = useFetchOnMount(getOscMappings, { initialValue: [] as OscMapping[] });

  const [isOperating, setIsOperating] = useState(false);

  const addMapping = useCallback(
    async (mapping: OscMapping) => {
      setIsOperating(true);
      try {
        await addOscMapping(mapping);
        await refetch();
      } finally {
        setIsOperating(false);
      }
    },
    [refetch],
  );

  const removeMapping = useCallback(
    async (address: string) => {
      setIsOperating(true);
      try {
        await removeOscMapping(address);
        await refetch();
      } finally {
        setIsOperating(false);
      }
    },
    [refetch],
  );

  const clearAll = useCallback(async () => {
    setIsOperating(true);
    try {
      await clearOscMappings();
      setMappings([]);
    } finally {
      setIsOperating(false);
    }
  }, [setMappings]);

  const getMappingForAddress = useCallback(
    (address: string): OscMapping | undefined => {
      return mappings.find((m) => m.address === address);
    },
    [mappings],
  );

  const getMappingForParameter = useCallback(
    (parameterId: string): OscMapping | undefined => {
      return mappings.find((m) => m.parameter_id === parameterId);
    },
    [mappings],
  );

  return {
    mappings,
    isLoading: isFetching || isOperating,
    addMapping,
    removeMapping,
    clearAll,
    getMappingForAddress,
    getMappingForParameter,
  };
}

/** Hook for OSC activity monitoring. */
export function useOscActivity() {
  return useMessageActivity<OscMessageInfo>("osc_message");
}

/** Maximum number of recent messages to keep */
const MAX_RECENT_MESSAGES = 20;

/** Hook for tracking recent OSC messages (for debugging UI). */
export function useOscRecentMessages() {
  return useMessageHistory<OscMessageInfo>("osc_message", {
    maxHistory: MAX_RECENT_MESSAGES,
  });
}

// Module-level BPM store — survives component unmount so the OscPanel
// retains the last received BPM even when you navigate away and back.
let _lastOscBpm: number | null = null;

/**
 * Hook for OSC beat input.
 *
 * Listens for `osc_beat` events emitted when /slew/beat is received.
 * Returns a `beat` boolean that is true for one render cycle after each pulse,
 * and the most recently received BPM (null until /slew/bpm is sent).
 */
export function useOscBeat() {
  const [beat, setBeat] = useState(false);
  const [bpm, setBpm] = useState<number | null>(_lastOscBpm);

  useEventListener<OscBeatInfo>("osc_beat", (info) => {
    if (info.bpm !== null) {
      _lastOscBpm = info.bpm;
      setBpm(info.bpm);
    }
    setBeat(true);
    // Reset the beat flag after one frame so consumers see a pulse
    setTimeout(() => setBeat(false), 100);
  });

  return { beat, bpm };
}

// ============================================================================
// OSC Output
// ============================================================================

/** Configuration for the OSC output client. */
export interface OscOutputConfig {
  /** Whether the output client is enabled */
  enabled: boolean;
  /** Target hostname or IP */
  host: string;
  /** Target port */
  port: number;
  /** Forward /slew/beat on every detected beat */
  forward_beat: boolean;
  /** Forward /slew/bpm when BPM changes */
  forward_bpm: boolean;
  /** Forward /slew/slot/{n}/color/{template_id} when a color param changes */
  forward_colors: boolean;
}

const DEFAULT_OUTPUT_CONFIG: OscOutputConfig = {
  enabled: false,
  host: "127.0.0.1",
  port: 9001,
  forward_beat: true,
  forward_bpm: true,
  forward_colors: false,
};

/** Fetch the current OSC output config from the backend. */
export async function getOscOutputConfig(): Promise<OscOutputConfig> {
  return invoke<OscOutputConfig>("get_osc_output_config");
}

/** Save a new OSC output config to the backend. */
export async function setOscOutputConfig(
  config: OscOutputConfig,
): Promise<void> {
  return invoke<void>("set_osc_output_config", { config });
}

/** Send a color OSC message via the backend if forward_colors is enabled. */
export async function sendColorOsc(
  slot: number,
  templateId: string,
  r: number,
  g: number,
  b: number,
): Promise<void> {
  return invoke<void>("send_color_osc", { slot, templateId, r, g, b });
}

/**
 * Hook for OSC output configuration.
 *
 * Loads the current config on mount and provides an `update` callback
 * that persists changes to the backend immediately.
 */
export function useOscOutput() {
  const [config, setConfig] = useState<OscOutputConfig>(DEFAULT_OUTPUT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void getOscOutputConfig()
      .then(setConfig)
      .catch(() => {
        /* backend not ready — keep defaults */
      })
      .finally(() => setIsLoading(false));
  }, []);

  const update = useCallback(
    async (partial: Partial<OscOutputConfig>) => {
      const next = { ...config, ...partial };
      setConfig(next);
      try {
        await setOscOutputConfig(next);
      } catch (e) {
        // revert on error
        setConfig(config);
        throw e;
      }
    },
    [config],
  );

  return { config, isLoading, update };
}
