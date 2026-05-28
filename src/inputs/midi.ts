/**
 * MIDI Input/Output Types and Hooks
 *
 * Provides TypeScript types matching the Rust MIDI module and
 * React hooks for managing MIDI devices, mappings, Learn mode, and output.
 *
 * Supports hot-plug detection via backend events and optional auto-reconnect.
 * Includes MIDI output for controller feedback (LEDs, motorized faders, etc.).
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useMessageActivity } from "./shared";
import { logger } from "@/lib/logger";

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
export type NoteMappingMode = "velocity" | "trigger";

export interface MidiMapping {
  /** The parameter ID this mapping controls */
  parameter_id: string;
  /** MIDI channel (0-15, or null for any channel) */
  channel: number | null;
  /** CC number — present for CC mappings */
  cc_number?: number;
  /** Note number — present for note mappings */
  note_number?: number;
  /** Note mapping mode — present for note mappings */
  note_mode?: NoteMappingMode;
  /** Minimum output value */
  min_value: number;
  /** Maximum output value */
  max_value: number;
  /** Optional: device ID this mapping is specific to */
  device_id: string | null;
}

export function isCcMapping(
  m: MidiMapping,
): m is MidiMapping & { cc_number: number } {
  return typeof m.cc_number === "number";
}

export function isNoteMapping(
  m: MidiMapping,
): m is MidiMapping & { note_number: number; note_mode: NoteMappingMode } {
  return typeof m.note_number === "number";
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
  /** Pending min value for the mapping (from parameter template) */
  pending_min_value: number;
  /** Pending max value for the mapping (from parameter template) */
  pending_max_value: number;
}

/** Event emitted when MIDI Learn captures a mapping. */
export interface MidiLearnComplete {
  /** The captured mapping */
  mapping: MidiMapping;
}

// ============================================================================
// Pickup State Types (Soft Takeover Indicator)
// ============================================================================

/** Pickup state for soft takeover indicator. */
export interface MidiPickupState {
  /** The parameter ID this pickup state is for */
  parameter_id: string;
  /** Whether the control has picked up the parameter value */
  picked_up: boolean;
  /** MIDI value normalized to parameter range (min_value to max_value) */
  midi_value: number;
  /** Direction to move to pick up: "left", "right", or null if picked up */
  direction: "left" | "right" | null;
}

// ============================================================================
// Output Types
// ============================================================================

/** Information about an available MIDI output device. */
export interface MidiOutputDeviceInfo {
  /** Unique identifier for the output device */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Whether this device is currently connected/opened for output */
  is_connected: boolean;
}

/** Configuration for MIDI output feedback. */
export interface MidiOutputConfig {
  /** Whether to send CC feedback when parameters change */
  send_cc_feedback: boolean;
  /** Output device ID to send feedback to (null = all connected outputs) */
  output_device_id: string | null;
}

/** Unified MIDI device info combining input and output capabilities. */
export interface MidiCombinedDeviceInfo {
  /** Base name of the device (without input/output suffix) */
  name: string;
  /** Input device info (if available) */
  input: MidiDeviceInfo | null;
  /** Output device info (if available) */
  output: MidiOutputDeviceInfo | null;
  /** Whether input is connected */
  inputConnected: boolean;
  /** Whether output is connected */
  outputConnected: boolean;
  /** Whether this device supports bidirectional MIDI */
  isBidirectional: boolean;
  /** Whether CC feedback is enabled for this device */
  feedbackEnabled: boolean;
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

/** Start MIDI Learn mode for a parameter with specified value range. */
export async function startMidiLearn(
  parameterId: string,
  minValue: number,
  maxValue: number,
): Promise<void> {
  return invoke("start_midi_learn", { parameterId, minValue, maxValue });
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
// Output API Functions
// ============================================================================

/** List all available MIDI output devices. */
export async function listMidiOutputDevices(): Promise<MidiOutputDeviceInfo[]> {
  return invoke<MidiOutputDeviceInfo[]>("list_midi_output_devices");
}

/** Open a MIDI device for output. */
export async function openMidiOutputDevice(deviceId: string): Promise<void> {
  return invoke("open_midi_output_device", { deviceId });
}

/** Close a MIDI output device. */
export async function closeMidiOutputDevice(deviceId: string): Promise<void> {
  return invoke("close_midi_output_device", { deviceId });
}

/** Send a MIDI CC message to an output device. */
export async function sendMidiCc(
  deviceId: string | null,
  channel: number,
  ccNumber: number,
  value: number,
): Promise<void> {
  return invoke("send_midi_cc", { deviceId, channel, ccNumber, value });
}

/** Send a MIDI Note On message to an output device. */
export async function sendMidiNoteOn(
  deviceId: string | null,
  channel: number,
  note: number,
  velocity: number,
): Promise<void> {
  return invoke("send_midi_note_on", { deviceId, channel, note, velocity });
}

/** Send a MIDI Note Off message to an output device. */
export async function sendMidiNoteOff(
  deviceId: string | null,
  channel: number,
  note: number,
  velocity: number,
): Promise<void> {
  return invoke("send_midi_note_off", { deviceId, channel, note, velocity });
}

/** Set MIDI output configuration. */
export async function setMidiOutputConfig(
  config: MidiOutputConfig,
): Promise<void> {
  return invoke("set_midi_output_config", { config });
}

/** Get MIDI output configuration. */
export async function getMidiOutputConfig(): Promise<MidiOutputConfig> {
  return invoke<MidiOutputConfig>("get_midi_output_config");
}

/** Trigger MIDI feedback for a parameter (sends CC based on mapping). */
export async function triggerMidiFeedback(
  parameterId: string,
  value: number,
): Promise<void> {
  return invoke("trigger_midi_feedback", { parameterId, value });
}

/** Get all current MIDI pickup states for mapped parameters. */
export async function getMidiPickupStates(): Promise<MidiPickupState[]> {
  return invoke<MidiPickupState[]>("get_midi_pickup_states");
}

// ============================================================================
// Import / Export
// ============================================================================

export type ImportMode = "replace" | "merge" | "merge_skip_conflicts";

export interface MidiMappingExport {
  version: number;
  device: string | null;
  exported_at: string;
  mappings: MidiMapping[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  replaced: number;
  errors: string[];
}

/**
 * Export current MIDI mappings as a JSON string.
 * Pass `deviceFilter` to export only mappings for a specific device_id.
 */
export async function exportMidiMappings(
  deviceFilter?: string,
): Promise<string> {
  return invoke<string>("export_midi_mappings", {
    deviceFilter: deviceFilter ?? null,
  });
}

/**
 * Import MIDI mappings from a JSON string.
 * `mode` controls how conflicts with existing mappings are resolved.
 */
export async function importMidiMappings(
  json: string,
  mode: ImportMode = "merge",
): Promise<ImportResult> {
  return invoke<ImportResult>("import_midi_mappings", { json, mode });
}

// ============================================================================
// Controller Templates
// ============================================================================

export interface ControllerTemplateMeta {
  label: string;
  match_patterns: string[];
  has_output: boolean;
  mapping_count: number;
  source: "user" | "builtin";
}

export interface ControllerTemplate {
  schema_version: number;
  label: string;
  match_patterns: string[];
  has_output: boolean;
  default_mappings: Array<{
    parameter_id: string;
    channel?: number;
    cc_number?: number;
    note_number?: number;
    note_mode?: NoteMappingMode;
    min_value: number;
    max_value: number;
  }>;
  startup_leds: Array<{ channel: number; note: number; velocity: number }>;
}

/** List all loaded user controller templates (metadata only). */
export async function listControllerTemplates(): Promise<
  ControllerTemplateMeta[]
> {
  return invoke<ControllerTemplateMeta[]>("list_controller_templates");
}

/** Import a controller template from a JSON string (saves to disk). */
export async function importControllerTemplate(json: string): Promise<void> {
  return invoke("import_controller_template", { json });
}

/** Delete a controller template by label. */
export async function deleteControllerTemplate(label: string): Promise<void> {
  return invoke("delete_controller_template", { label });
}

/** Reload all templates from disk (hot-reload). */
export async function reloadControllerTemplates(): Promise<void> {
  return invoke("reload_controller_templates");
}

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
    setError(null);
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

  // Retry with delay - useful when MIDI system needs time to initialize
  const retryWithDelay = useCallback(async (delayMs: number = 1000) => {
    setIsLoading(true);
    setError(null);
    // Wait for the delay to give MIDI system time to initialize
    await new Promise((resolve) => setTimeout(resolve, delayMs));
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
    setError(null);
    try {
      await openMidiDevice(deviceId);
      // Refresh device list to get updated connection status
      const result = await listMidiDevices();
      setDevices(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const disconnect = useCallback(async (deviceId: string) => {
    setError(null);
    try {
      await closeMidiDevice(deviceId);
      // Refresh device list to get updated connection status
      const result = await listMidiDevices();
      setDevices(result);
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
      logger.error("MIDI", "Failed to set auto-reconnect:", e);
    }
  }, []);

  const clearAutoReconnectList = useCallback(async () => {
    try {
      await clearMidiAutoReconnectDevices();
    } catch (e) {
      logger.error("MIDI", "Failed to clear auto-reconnect list:", e);
    }
  }, []);

  return {
    devices,
    isLoading,
    error,
    autoReconnect,
    refresh,
    retryWithDelay,
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
    pending_min_value: 0,
    pending_max_value: 1,
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

  const startLearn = useCallback(
    async (parameterId: string, minValue: number, maxValue: number) => {
      await startMidiLearn(parameterId, minValue, maxValue);
    },
    [],
  );

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

  // Subscribe to mappings changed events (covers add, remove, clear)
  useEffect(() => {
    let unlistenMappings: UnlistenFn | undefined;
    let unlistenLearn: UnlistenFn | undefined;

    void (async () => {
      unlistenMappings = await listen<MidiMapping[]>(
        "midi_mappings_changed",
        (event) => {
          setMappings(event.payload);
        },
      );

      unlistenLearn = await listen<MidiLearnComplete>(
        "midi_learn_complete",
        async () => {
          const result = await getMidiMappings();
          setMappings(result);
        },
      );
    })();

    return () => {
      if (unlistenMappings) unlistenMappings();
      if (unlistenLearn) unlistenLearn();
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
  return useMessageActivity<MidiMessage>("midi_message");
}

// ============================================================================
// Combined Device Hook
// ============================================================================

/** Hook for managing unified MIDI devices (input + output combined). */
export function useMidiCombinedDevices() {
  const [inputDevices, setInputDevices] = useState<MidiDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MidiOutputDeviceInfo[]>(
    [],
  );
  const [feedbackConfig, setFeedbackConfig] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoReconnect, setAutoReconnectState] = useState(true);

  // Fetch all devices on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [inputs, outputs, autoReconnectEnabled] = await Promise.all([
          listMidiDevices(),
          listMidiOutputDevices(),
          getMidiAutoReconnect(),
        ]);
        if (isMounted) {
          setInputDevices(inputs);
          setOutputDevices(outputs);
          setAutoReconnectState(autoReconnectEnabled);
          // Initialize feedback config - all devices default to enabled
          const config = new Map<string, boolean>();
          outputs.forEach((d) => config.set(d.name, true));
          setFeedbackConfig(config);
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
    let unlistenInput: UnlistenFn | undefined;
    let unlistenOutput: UnlistenFn | undefined;

    void (async () => {
      unlistenInput = await listen<MidiDeviceInfo[]>(
        "midi_devices_changed",
        (event) => {
          setInputDevices(event.payload);
        },
      );
      unlistenOutput = await listen<MidiOutputDeviceInfo[]>(
        "midi_output_devices_changed",
        (event) => {
          setOutputDevices(event.payload);
        },
      );
    })();

    return () => {
      if (unlistenInput) unlistenInput();
      if (unlistenOutput) unlistenOutput();
    };
  }, []);

  // Combine input and output devices.
  //
  // Strategy: key entries by input device id (or output id for output-only
  // devices). For each output, find the best unmatched input by exact name
  // match. This correctly handles multiple devices of the same model (e.g.
  // two Midimix units) because midir assigns unique names ("MIDI Mix",
  // "MIDI Mix 2", …) — they are kept as distinct entries.
  const combinedDevices: MidiCombinedDeviceInfo[] = (() => {
    // Map from entry key → combined info
    const entries = new Map<string, MidiCombinedDeviceInfo>();
    // Track which output ids have been matched to an input entry
    const matchedOutputIds = new Set<string>();

    // Build one entry per input device
    for (const input of inputDevices) {
      entries.set(`in:${input.id}`, {
        name: input.name,
        input,
        output: null,
        inputConnected: input.is_connected,
        outputConnected: false,
        isBidirectional: false,
        feedbackEnabled: feedbackConfig.get(input.name) ?? true,
      });
    }

    // Pair outputs to inputs by exact name match.
    // If multiple inputs share the same name, pair in order (first unmatched).
    for (const output of outputDevices) {
      // Find first input entry with same name that doesn't yet have an output
      const entryKey = [...entries.entries()].find(
        ([, e]) => e.name === output.name && e.output === null,
      )?.[0];

      if (entryKey) {
        const entry = entries.get(entryKey)!;
        entry.output = output;
        entry.outputConnected = output.is_connected;
        entry.isBidirectional = true;
        entry.feedbackEnabled = feedbackConfig.get(output.name) ?? true;
        matchedOutputIds.add(output.id);
      } else {
        // Output-only device (no matching input)
        entries.set(`out:${output.id}`, {
          name: output.name,
          input: null,
          output,
          inputConnected: false,
          outputConnected: output.is_connected,
          isBidirectional: false,
          feedbackEnabled: feedbackConfig.get(output.name) ?? true,
        });
      }
    }

    return Array.from(entries.values());
  })();

  const connect = useCallback(
    async (deviceName: string) => {
      setError(null);
      try {
        // Find input and output devices by name
        const input = inputDevices.find((d) => d.name === deviceName);
        const output = outputDevices.find((d) => d.name === deviceName);

        // Connect both if available
        if (input && !input.is_connected) {
          await openMidiDevice(input.id);
        }
        if (output && !output.is_connected) {
          await openMidiOutputDevice(output.id);
        }

        // Refresh device lists
        const [inputs, outputs] = await Promise.all([
          listMidiDevices(),
          listMidiOutputDevices(),
        ]);
        setInputDevices(inputs);
        setOutputDevices(outputs);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [inputDevices, outputDevices],
  );

  const disconnect = useCallback(
    async (deviceName: string) => {
      setError(null);
      try {
        // Find input and output devices by name
        const input = inputDevices.find((d) => d.name === deviceName);
        const output = outputDevices.find((d) => d.name === deviceName);

        // Disconnect both if connected
        if (input?.is_connected) {
          await closeMidiDevice(input.id);
        }
        if (output?.is_connected) {
          await closeMidiOutputDevice(output.id);
        }

        // Refresh device lists
        const [inputs, outputs] = await Promise.all([
          listMidiDevices(),
          listMidiOutputDevices(),
        ]);
        setInputDevices(inputs);
        setOutputDevices(outputs);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      }
    },
    [inputDevices, outputDevices],
  );

  const setDeviceFeedbackEnabled = useCallback(
    (deviceName: string, enabled: boolean) => {
      setFeedbackConfig((prev) => {
        const next = new Map(prev);
        next.set(deviceName, enabled);
        return next;
      });
    },
    [],
  );

  const setAutoReconnect = useCallback(async (enabled: boolean) => {
    try {
      await setMidiAutoReconnect(enabled);
      setAutoReconnectState(enabled);
    } catch (e) {
      logger.error("MIDI", "Failed to set auto-reconnect:", e);
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inputs, outputs] = await Promise.all([
        listMidiDevices(),
        listMidiOutputDevices(),
      ]);
      setInputDevices(inputs);
      setOutputDevices(outputs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const retryWithDelay = useCallback(async (delayMs: number = 1000) => {
    setIsLoading(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const [inputs, outputs] = await Promise.all([
        listMidiDevices(),
        listMidiOutputDevices(),
      ]);
      setInputDevices(inputs);
      setOutputDevices(outputs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    devices: combinedDevices,
    isLoading,
    error,
    autoReconnect,
    connect,
    disconnect,
    setDeviceFeedbackEnabled,
    setAutoReconnect,
    refresh,
    retryWithDelay,
  };
}

// ============================================================================
// Output Hooks
// ============================================================================

/** Hook for managing MIDI output devices with hot-plug detection support. */
export function useMidiOutputDevices() {
  const [devices, setDevices] = useState<MidiOutputDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch devices on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const deviceList = await listMidiOutputDevices();
        if (isMounted) {
          setDevices(deviceList);
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
      unlisten = await listen<MidiOutputDeviceInfo[]>(
        "midi_output_devices_changed",
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
      const result = await listMidiOutputDevices();
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
      await openMidiOutputDevice(deviceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  const disconnect = useCallback(async (deviceId: string) => {
    try {
      await closeMidiOutputDevice(deviceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    }
  }, []);

  return {
    devices,
    isLoading,
    error,
    refresh,
    connect,
    disconnect,
  };
}

/** Hook for MIDI output configuration. */
export function useMidiOutputConfig() {
  const [config, setConfig] = useState<MidiOutputConfig>({
    send_cc_feedback: true,
    output_device_id: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch config on mount
  useEffect(() => {
    void getMidiOutputConfig()
      .then(setConfig)
      .finally(() => setIsLoading(false));
  }, []);

  const updateConfig = useCallback(async (newConfig: MidiOutputConfig) => {
    await setMidiOutputConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const setFeedbackEnabled = useCallback(
    async (enabled: boolean) => {
      const newConfig = { ...config, send_cc_feedback: enabled };
      await updateConfig(newConfig);
    },
    [config, updateConfig],
  );

  const setOutputDevice = useCallback(
    async (deviceId: string | null) => {
      const newConfig = { ...config, output_device_id: deviceId };
      await updateConfig(newConfig);
    },
    [config, updateConfig],
  );

  return {
    config,
    isLoading,
    updateConfig,
    setFeedbackEnabled,
    setOutputDevice,
  };
}

/** Hook for sending MIDI output messages. */
export function useMidiOutput() {
  const sendCc = useCallback(
    async (
      channel: number,
      ccNumber: number,
      value: number,
      deviceId?: string,
    ) => {
      await sendMidiCc(deviceId ?? null, channel, ccNumber, value);
    },
    [],
  );

  const sendNoteOn = useCallback(
    async (
      channel: number,
      note: number,
      velocity: number,
      deviceId?: string,
    ) => {
      await sendMidiNoteOn(deviceId ?? null, channel, note, velocity);
    },
    [],
  );

  const sendNoteOff = useCallback(
    async (
      channel: number,
      note: number,
      velocity: number = 0,
      deviceId?: string,
    ) => {
      await sendMidiNoteOff(deviceId ?? null, channel, note, velocity);
    },
    [],
  );

  const sendFeedback = useCallback(
    async (parameterId: string, value: number) => {
      await triggerMidiFeedback(parameterId, value);
    },
    [],
  );

  return {
    sendCc,
    sendNoteOn,
    sendNoteOff,
    sendFeedback,
  };
}

// ============================================================================
// Pickup State Hook (Soft Takeover Indicator)
// ============================================================================

/**
 * Hook for tracking MIDI pickup states (soft takeover indicator).
 * Returns a Map of parameter_id → MidiPickupState for parameters that
 * have MIDI mappings but haven't picked up yet.
 */
export function useMidiPickupStates(): {
  pickupStates: Map<string, MidiPickupState>;
  getPickupState: (parameterId: string) => MidiPickupState | undefined;
} {
  const [pickupStates, setPickupStates] = useState<
    Map<string, MidiPickupState>
  >(new Map());

  // Fetch initial state and subscribe to events
  useEffect(() => {
    let isMounted = true;

    // Fetch initial pickup states
    async function fetchInitial() {
      try {
        const states = await getMidiPickupStates();
        if (isMounted) {
          const stateMap = new Map<string, MidiPickupState>();
          for (const state of states) {
            stateMap.set(state.parameter_id, state);
          }
          setPickupStates(stateMap);
        }
      } catch (e) {
        logger.error("MIDI", "Failed to fetch initial pickup states:", e);
      }
    }

    void fetchInitial();

    // Subscribe to pickup state events
    let unlisten: (() => void) | undefined;

    listen<MidiPickupState>("midi_pickup_state", (event) => {
      if (!isMounted) return;

      const update = event.payload;
      setPickupStates((prev) => {
        const next = new Map(prev);

        if (update.picked_up) {
          // When picked up, keep it briefly for the flash animation, then remove
          next.set(update.parameter_id, update);
          // Remove after animation completes (400ms)
          setTimeout(() => {
            if (isMounted) {
              setPickupStates((current) => {
                const updated = new Map(current);
                // Only remove if still picked up (not re-triggered)
                const existing = updated.get(update.parameter_id);
                if (existing?.picked_up) {
                  updated.delete(update.parameter_id);
                }
                return updated;
              });
            }
          }, 400);
        } else {
          // Not picked up yet, update the state
          next.set(update.parameter_id, update);
        }

        return next;
      });
    }).then((u) => {
      unlisten = u;
    });

    // Also listen for mapping removals to clear pickup state
    let unlistenMappings: (() => void) | undefined;

    listen<MidiMapping[]>("midi_mappings_changed", (event) => {
      if (!isMounted) return;

      const mappings = event.payload;
      const mappedParams = new Set(mappings.map((m) => m.parameter_id));

      setPickupStates((prev) => {
        const next = new Map(prev);
        // Remove pickup states for parameters that no longer have mappings
        for (const paramId of prev.keys()) {
          if (!mappedParams.has(paramId)) {
            next.delete(paramId);
          }
        }
        return next;
      });
    }).then((u) => {
      unlistenMappings = u;
    });

    return () => {
      isMounted = false;
      unlisten?.();
      unlistenMappings?.();
    };
  }, []);

  const getPickupState = useCallback(
    (parameterId: string): MidiPickupState | undefined => {
      return pickupStates.get(parameterId);
    },
    [pickupStates],
  );

  return {
    pickupStates,
    getPickupState,
  };
}
