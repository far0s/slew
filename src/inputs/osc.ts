/**
 * OSC Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust OSC module and
 * React hooks for managing the OSC server, mappings, and activity.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

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
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial status
  useEffect(() => {
    let isMounted = true;

    async function fetchStatus() {
      try {
        const result = await getOscStatus();
        if (isMounted) {
          setStatus(result);
        }
      } catch (e) {
        console.error("[OSC] Failed to get status:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to status changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<OscServerStatus>(
        "osc_status_changed",
        (event) => {
          setStatus(event.payload);
        },
      );
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const start = useCallback(async (port: number = DEFAULT_OSC_PORT) => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(async () => {
    setIsLoading(true);
    try {
      await stopOscServer();
      const newStatus = await getOscStatus();
      setStatus(newStatus);
    } catch (e) {
      console.error("[OSC] Failed to stop server:", e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isRunning: status.is_running,
    port: status.port,
    error: status.error,
    isLoading,
    start,
    stop,
  };
}

/** Hook for OSC mappings. */
export function useOscMappings() {
  const [mappings, setMappings] = useState<OscMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch mappings on mount
  useEffect(() => {
    void getOscMappings().then((result) => {
      setMappings(result);
      setIsLoading(false);
    });
  }, []);

  const addMapping = useCallback(async (mapping: OscMapping) => {
    await addOscMapping(mapping);
    const result = await getOscMappings();
    setMappings(result);
  }, []);

  const removeMapping = useCallback(async (address: string) => {
    await removeOscMapping(address);
    const result = await getOscMappings();
    setMappings(result);
  }, []);

  const clearAll = useCallback(async () => {
    await clearOscMappings();
    setMappings([]);
  }, []);

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
    isLoading,
    addMapping,
    removeMapping,
    clearAll,
    getMappingForAddress,
    getMappingForParameter,
  };
}

/** Hook for OSC activity monitoring. */
export function useOscActivity() {
  const [lastMessage, setLastMessage] = useState<OscMessageInfo | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<OscMessageInfo>("osc_message", (event) => {
        setLastMessage(event.payload);
        setMessageCount((prev) => prev + 1);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const resetCount = useCallback(() => {
    setMessageCount(0);
  }, []);

  return {
    lastMessage,
    messageCount,
    resetCount,
  };
}

/** Maximum number of recent messages to keep */
const MAX_RECENT_MESSAGES = 20;

/** Hook for tracking recent OSC messages (for debugging UI). */
export function useOscRecentMessages() {
  const [messages, setMessages] = useState<OscMessageInfo[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<OscMessageInfo>("osc_message", (event) => {
        setMessages((prev) => {
          const next = [event.payload, ...prev];
          // Keep only the most recent messages
          return next.slice(0, MAX_RECENT_MESSAGES);
        });
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    clear,
  };
}
