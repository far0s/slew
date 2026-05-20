/**
 * BPM Source Types and Hooks
 *
 * Provides TypeScript types matching the Rust bpm.rs module and
 * React hooks for tracking the active BPM source and managing MIDI Clock.
 */

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEventListener, useFetchOnMount } from "./shared";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** The possible BPM input sources, matching the Rust `BpmSourceKind` enum. */
export type BpmSourceKind = "idle" | "manual" | "osc" | "midi_clock" | "microphone" | "link";

/** Event payload emitted when the active BPM source or BPM value changes. */
export interface BpmSourceChangedEvent {
  /** The source that is now in control */
  source: BpmSourceKind;
  /** The current BPM value, or null if the source has not produced one yet */
  bpm: number | null;
}

/** Status of the Ableton Link session. */
export interface LinkStatus {
  /** Whether Link is currently enabled */
  enabled: boolean;
  /** Number of peers currently in the Link session */
  peer_count: number;
  /** The current session BPM from Link, or null if not yet received */
  bpm: number | null;
  /** Whether Link support was compiled in */
  available: boolean;
}

/** Status of the MIDI Clock receiver. */
export interface MidiClockStatus {
  /** ID of the currently connected MIDI device, or null if none */
  device_id: string | null;
  /** Whether the device is currently connected and receiving clock */
  is_connected: boolean;
  /** The most recently computed BPM from MIDI clock, or null */
  bpm: number | null;
}

/** A MIDI device available for MIDI Clock input. */
export interface MidiDeviceInfo {
  /** Unique device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Whether the device is currently open/connected */
  is_connected: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Human-readable labels for each BPM source kind. */
export const BPM_SOURCE_LABELS: Record<BpmSourceKind, string> = {
  idle: "—",
  manual: "Tap / Manual",
  osc: "OSC",
  midi_clock: "MIDI Clock",
  microphone: "Microphone",
  link: "Ableton Link",
};

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** Get the currently active BPM source and its most recent BPM value. */
export async function getActiveBpmSource(): Promise<{
  source: BpmSourceKind;
  bpm: number | null;
}> {
  return invoke("get_active_bpm_source");
}

/** Get the current Ableton Link status. */
export async function getLinkStatus(): Promise<LinkStatus> {
  return invoke<LinkStatus>("get_link_status_cmd");
}

/** Enable or disable Ableton Link. */
export async function setLinkEnabled(enabled: boolean): Promise<void> {
  return invoke<void>("enable_link_cmd", { enabled });
}

/** List MIDI devices available for MIDI Clock input. */
export async function listMidiClockPorts(): Promise<MidiDeviceInfo[]> {
  return invoke<MidiDeviceInfo[]>("list_midi_clock_ports");
}

/** Connect to a MIDI device for MIDI Clock input. */
export async function connectMidiClock(deviceId: string): Promise<void> {
  return invoke<void>("connect_midi_clock", { device_id: deviceId });
}

/** Disconnect from the current MIDI Clock device. */
export async function disconnectMidiClock(): Promise<void> {
  return invoke<void>("disconnect_midi_clock");
}

/** Get the current MIDI Clock receiver status. */
export async function getMidiClockStatus(): Promise<MidiClockStatus> {
  return invoke<MidiClockStatus>("get_midi_clock_status");
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook that tracks the currently active BPM source.
 *
 * Fetches the initial state via `get_active_bpm_source` on mount and
 * subscribes to `bpm_source_changed` events for live updates.
 */
export function useActiveBpmSource(): {
  source: BpmSourceKind;
  bpm: number | null;
} {
  const [state, setState] = useState<{
    source: BpmSourceKind;
    bpm: number | null;
  }>({ source: "manual", bpm: null });

  useFetchOnMount(getActiveBpmSource, {
    initialValue: state,
    onSuccess: setState,
  });

  useEventListener<BpmSourceChangedEvent>("bpm_source_changed", (event) => {
    setState({ source: event.source, bpm: event.bpm });
  });

  return state;
}

/** Default Link status used before the first fetch completes. */
const DEFAULT_LINK_STATUS: LinkStatus = {
  enabled: false,
  peer_count: 0,
  bpm: null,
  available: true,
};

/**
 * Hook for Ableton Link management.
 *
 * Fetches the initial status on mount, subscribes to `link_status_changed`
 * events for live updates, and exposes a `setEnabled` action that optimistically
 * updates local state.
 */
export function useLinkStatus(): {
  status: LinkStatus;
  setEnabled: (enabled: boolean) => Promise<void>;
} {
  const [status, setStatus] = useState<LinkStatus>(DEFAULT_LINK_STATUS);

  useFetchOnMount(getLinkStatus, {
    initialValue: DEFAULT_LINK_STATUS,
    onSuccess: setStatus,
  });

  useEventListener<LinkStatus>("link_status_changed", setStatus);

  const setEnabled = useCallback(async (enabled: boolean) => {
    // Optimistic update
    setStatus((prev) => ({ ...prev, enabled }));
    try {
      await setLinkEnabled(enabled);
    } catch {
      // Revert on failure — next event will reconcile
      setStatus((prev) => ({ ...prev, enabled: !enabled }));
    }
  }, []);

  return { status, setEnabled };
}

/** Default MIDI Clock status used before the first fetch completes. */
const DEFAULT_MIDI_CLOCK_STATUS: MidiClockStatus = {
  device_id: null,
  is_connected: false,
  bpm: null,
};

/**
 * Hook for MIDI Clock management.
 *
 * Fetches the initial status and ports list on mount, subscribes to
 * `midi_clock_status_changed` events for live status updates, and exposes
 * `connect`, `disconnect`, and `refreshPorts` actions.
 */
export function useMidiClock(): {
  status: MidiClockStatus;
  ports: MidiDeviceInfo[];
  isLoading: boolean;
  connect: (deviceId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshPorts: () => Promise<void>;
} {
  const [status, setStatus] = useState<MidiClockStatus>(
    DEFAULT_MIDI_CLOCK_STATUS,
  );
  const [isOperating, setIsOperating] = useState(false);

  // Fetch initial status
  const { isLoading: isStatusLoading } = useFetchOnMount(getMidiClockStatus, {
    initialValue: DEFAULT_MIDI_CLOCK_STATUS,
    onSuccess: setStatus,
  });

  // Fetch initial ports list
  const {
    data: ports,
    isLoading: isPortsLoading,
    refetch: refetchPorts,
  } = useFetchOnMount(listMidiClockPorts, {
    initialValue: [] as MidiDeviceInfo[],
  });

  // Subscribe to status changes
  useEventListener<MidiClockStatus>("midi_clock_status_changed", setStatus);

  const connect = useCallback(async (deviceId: string) => {
    setIsOperating(true);
    try {
      await connectMidiClock(deviceId);
      const newStatus = await getMidiClockStatus();
      setStatus(newStatus);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsOperating(true);
    try {
      await disconnectMidiClock();
      const newStatus = await getMidiClockStatus();
      setStatus(newStatus);
    } finally {
      setIsOperating(false);
    }
  }, []);

  const refreshPorts = useCallback(async () => {
    await refetchPorts();
  }, [refetchPorts]);

  return {
    status,
    ports,
    isLoading: isStatusLoading || isPortsLoading || isOperating,
    connect,
    disconnect,
    refreshPorts,
  };
}
