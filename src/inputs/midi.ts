/**
 * MIDI Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust MIDI module and
 * React hooks for managing MIDI devices, mappings, and Learn mode.
 *
 * Supports hot-plug detection via backend events and optional auto-reconnect.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** Information about an available MIDI input device. */
export interface MidiDeviceInfo {
  /** Unique identifier for the device */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Whether this device is currently connected/opened */
  is_connected: boolean;
}

/** A MIDI mapping that binds a CC message to a parameter. */
export interface MidiMapping {
  /** The parameter ID this mapping controls */
  parameter_id: string;
  /** MIDI channel (0-15, or null for any channel) */
  channel: number | null;
  /** CC number (0-127) */
  cc_number: number;
  /** Minimum output value (maps from CC 0) */
  min_value: number;
  /** Maximum output value (maps from CC 127) */
  max_value: number;
  /** Optional: device ID this mapping is specific to */
  device_id: string | null;
}

/** A raw MIDI message for UI display / activity indicators. */
export interface MidiMessage {
  /** Device ID that sent the message */
  device_id: string;
  /** MIDI channel (0-15) */
  channel: number;
  /** Message type: "cc", "note_on", "note_off", "pitch_bend", "other" */
  message_type: string;
  /** Control number (CC) or note number */
  control: number;
  /** Value (0-127 for CC/notes, 0-16383 for pitch bend) */
  value: number;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/** State for MIDI Learn mode. */
export interface MidiLearnState {
  /** Whether learn mode is active */
  is_learning: boolean;
  /** The parameter ID we're learning a mapping for */
  parameter_id: string | null;
}

/** Event emitted when MIDI Learn captures a mapping. */
export interface MidiLearnComplete {
  /** The captured mapping */
  mapping: MidiMapping;
}

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** List all available MIDI input devices. */
export async function listMidiDevices(): Promise<MidiDeviceInfo[]> {
  return invoke<MidiDeviceInfo[]>("list_midi_devices");
}

/** Open a MIDI device for input. */
export async function openMidiDevice(deviceId: string): Promise<void> {
  return invoke("open_midi_device", { deviceId });
}

/** Close a MIDI device. */
export async function closeMidiDevice(deviceId: string): Promise<void> {
  return invoke("close_midi_device", { deviceId });
}

/** Start MIDI Learn mode for a parameter. */
export async function startMidiLearn(parameterId: string): Promise<void> {
  return invoke("start_midi_learn", { parameterId });
}

/** Cancel MIDI Learn mode. */
export async function cancelMidiLearn(): Promise<void> {
  return invoke("cancel_midi_learn");
}

/** Get current MIDI Learn state. */
export async function getMidiLearnState(): Promise<MidiLearnState> {
  return invoke<MidiLearnState>("get_midi_learn_state");
}

/** Get all MIDI mappings. */
export async function getMidiMappings(): Promise<MidiMapping[]> {
  return invoke<MidiMapping[]>("get_midi_mappings");
}

/** Set a MIDI mapping. */
export async function setMidiMapping(mapping: MidiMapping): Promise<void> {
  return invoke("set_midi_mapping", { mapping });
}

/** Remove a MIDI mapping by parameter ID. */
export async function removeMidiMapping(parameterId: string): Promise<void> {
  return invoke("remove_midi_mapping", { parameterId });
}

/** Clear all MIDI mappings. */
export async function clearMidiMappings(): Promise<void> {
  return invoke("clear_midi_mappings");
}

/** Set auto-reconnect enabled state. */
export async function setMidiAutoReconnect(enabled: boolean): Promise<void> {
  return invoke("set_midi_auto_reconnect", { enabled });
}

/** Get auto-reconnect enabled state. */
export async function getMidiAutoReconnect(): Promise<boolean> {
  return invoke<boolean>("get_midi_auto_reconnect");
}

/** Clear the auto-reconnect device list (forgets which devices to reconnect to). */
export async function clearMidiAutoReconnectDevices(): Promise<void> {
  return invoke("clear_midi_auto_reconnect_devices");
}

// ============================================================================
// React Hooks
// ============================================================================

/** Hook for managing MIDI devices with hot-plug detection support. */
export function useMidiDevices() {
  const [devices, setDevices] = useState<MidiDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoReconnect, setAutoReconnectState] = useState(true);

  // Fetch devices and settings on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [deviceList, autoReconnectEnabled] = await Promise.all([
          listMidiDevices(),
          getMidiAutoReconnect(),
        ]);
        if (isMounted) {
          setDevices(deviceList);
          setAutoReconnectState(autoReconnectEnabled);
          setError(null);
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : String(e));
        }
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

  // Subscribe to device changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<MidiDeviceInfo[]>(
        "midi_devices_changed",
        (event) => {
          setDevices(event.payload);
        },
      );
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listMidiDevices();
      setDevices(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    try {
      await openMidiDevice(deviceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const disconnect = useCallback(async (deviceId: string) => {
    try {
      await closeMidiDevice(deviceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const setAutoReconnect = useCallback(async (enabled: boolean) => {
    try {
      await setMidiAutoReconnect(enabled);
      setAutoReconnectState(enabled);
    } catch (e) {
      console.error("[MIDI] Failed to set auto-reconnect:", e);
    }
  }, []);

  const clearAutoReconnectList = useCallback(async () => {
    try {
      await clearMidiAutoReconnectDevices();
    } catch (e) {
      console.error("[MIDI] Failed to clear auto-reconnect list:", e);
    }
  }, []);

  return {
    devices,
    isLoading,
    error,
    autoReconnect,
    refresh,
    connect,
    disconnect,
    setAutoReconnect,
    clearAutoReconnectList,
  };
}

/** Hook for MIDI Learn functionality. */
export function useMidiLearn() {
  const [learnState, setLearnState] = useState<MidiLearnState>({
    is_learning: false,
    parameter_id: null,
  });

  // Subscribe to learn state changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    // Fetch initial state
    void getMidiLearnState().then(setLearnState);

    void (async () => {
      unlisten = await listen<MidiLearnState>(
        "midi_learn_state_changed",
        (event) => {
          setLearnState(event.payload);
        },
      );
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const startLearn = useCallback(async (parameterId: string) => {
    await startMidiLearn(parameterId);
  }, []);

  const cancelLearn = useCallback(async () => {
    await cancelMidiLearn();
  }, []);

  return {
    isLearning: learnState.is_learning,
    learningParameterId: learnState.parameter_id,
    startLearn,
    cancelLearn,
  };
}

/** Hook for MIDI mappings. */
export function useMidiMappings() {
  const [mappings, setMappings] = useState<MidiMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch mappings on mount
  useEffect(() => {
    void getMidiMappings().then((result) => {
      setMappings(result);
      setIsLoading(false);
    });
  }, []);

  // Subscribe to learn complete events to update mappings
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<MidiLearnComplete>(
        "midi_learn_complete",
        async () => {
          // Refresh mappings when a new one is added via Learn
          const result = await getMidiMappings();
          setMappings(result);
        },
      );
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const addMapping = useCallback(async (mapping: MidiMapping) => {
    await setMidiMapping(mapping);
    const result = await getMidiMappings();
    setMappings(result);
  }, []);

  const removeMapping = useCallback(async (parameterId: string) => {
    await removeMidiMapping(parameterId);
    const result = await getMidiMappings();
    setMappings(result);
  }, []);

  const clearAll = useCallback(async () => {
    await clearMidiMappings();
    setMappings([]);
  }, []);

  const getMappingForParameter = useCallback(
    (parameterId: string): MidiMapping | undefined => {
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
    getMappingForParameter,
  };
}

/** Hook for MIDI activity monitoring. */
export function useMidiActivity() {
  const [lastMessage, setLastMessage] = useState<MidiMessage | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<MidiMessage>("midi_message", (event) => {
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
