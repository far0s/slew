/**
 * HID Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust HID module and
 * React hooks for managing HID device connections, mappings, and encoder events.
 *
 * Designed for devices like the Megalodon Triple Knob Macropad.
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/** Information about an HID device. */
export interface HidDeviceInfo {
  /** Vendor ID */
  vendor_id: number;
  /** Product ID */
  product_id: number;
  /** Device path (unique identifier for opening) */
  path: string;
  /** Manufacturer name (if available) */
  manufacturer: string | null;
  /** Product name (if available) */
  product: string | null;
  /** Serial number (if available) */
  serial: string | null;
  /** Whether this is a known/supported device */
  is_supported: boolean;
  /** Usage page (helps identify interface type) */
  usage_page: number;
  /** Usage (helps identify interface type) */
  usage: number;
  /** Interface number */
  interface_number: number;
  /** Human-readable interface description */
  interface_description: string;
}

/** Status of the HID connection. */
export interface HidStatus {
  /** Whether a device is currently connected */
  is_connected: boolean;
  /** Info about the connected device (if any) */
  device: HidDeviceInfo | null;
  /** Error message if connection failed */
  error: string | null;
}

/** A mapping from an encoder knob to a parameter. */
export interface HidMapping {
  /** Which encoder (0, 1, 2 for the Megalodon) */
  encoder_index: number;
  /** The parameter ID to control */
  parameter_id: string;
  /** Sensitivity multiplier (how much each tick changes the value) */
  sensitivity: number;
  /** Whether to invert the direction */
  inverted: boolean;
}

/** An encoder event for UI display. */
export interface HidEncoderEvent {
  /** Which encoder (0, 1, 2) */
  encoder_index: number;
  /** Direction: positive = clockwise, negative = counter-clockwise */
  delta: number;
  /** Timestamp in milliseconds */
  timestamp: number;
}

/** A raw HID report for debugging. */
export interface HidRawReport {
  /** Raw bytes as hex string */
  hex: string;
  /** Raw bytes as decimal array */
  bytes: number[];
  /** Report size */
  size: number;
  /** Timestamp in milliseconds */
  timestamp: number;
}

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** List all HID devices. */
export async function listHidDevices(): Promise<HidDeviceInfo[]> {
  return invoke<HidDeviceInfo[]>("list_hid_devices");
}

/** List only supported HID devices (e.g., Megalodon). */
export async function listSupportedHidDevices(): Promise<HidDeviceInfo[]> {
  return invoke<HidDeviceInfo[]>("list_supported_hid_devices");
}

/** Connect to an HID device by path. */
export async function connectHidDevice(path: string): Promise<void> {
  return invoke("connect_hid_device", { path });
}

/** Connect to the first available Megalodon device. */
export async function connectMegalodon(): Promise<void> {
  return invoke("connect_hid_megalodon");
}

/** Disconnect from the current HID device. */
export async function disconnectHidDevice(): Promise<void> {
  return invoke("disconnect_hid_device");
}

/** Get current HID connection status. */
export async function getHidStatus(): Promise<HidStatus> {
  return invoke<HidStatus>("get_hid_status");
}

/** Get all HID mappings. */
export async function getHidMappings(): Promise<HidMapping[]> {
  return invoke<HidMapping[]>("get_hid_mappings");
}

/** Add or update an HID mapping. */
export async function addHidMapping(mapping: HidMapping): Promise<void> {
  return invoke("add_hid_mapping", { mapping });
}

/** Remove an HID mapping by encoder index. */
export async function removeHidMapping(encoderIndex: number): Promise<void> {
  return invoke("remove_hid_mapping", { encoder_index: encoderIndex });
}

/** Clear all HID mappings. */
export async function clearHidMappings(): Promise<void> {
  return invoke("clear_hid_mappings");
}

/** Set up default HID mappings for the Megalodon. */
export async function setupDefaultHidMappings(): Promise<void> {
  return invoke("setup_default_hid_mappings");
}

// ============================================================================
// Constants
// ============================================================================

/** Default encoder sensitivity */
export const DEFAULT_SENSITIVITY = 0.02;

/** Encoder labels for the Megalodon */
export const ENCODER_LABELS = ["Left Knob", "Center Knob", "Right Knob"];

/** Default parameter suggestions for each encoder */
export const DEFAULT_ENCODER_PARAMS = [
  "crossfade",
  "scene_a_brightness",
  "scene_a_tint",
];

// ============================================================================
// React Hooks
// ============================================================================

/** Hook for managing HID device connection. */
export function useHidDevice() {
  const [status, setStatus] = useState<HidStatus>({
    is_connected: false,
    device: null,
    error: null,
  });
  const [devices, setDevices] = useState<HidDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial status and device list
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const [statusResult, devicesResult] = await Promise.all([
          getHidStatus(),
          listSupportedHidDevices(),
        ]);
        if (isMounted) {
          setStatus(statusResult);
          setDevices(devicesResult);
        }
      } catch (e) {
        console.error("[HID] Failed to initialize:", e);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to status changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidStatus>("hid_status_changed", (event) => {
        setStatus(event.payload);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const connect = useCallback(async (path?: string) => {
    setIsLoading(true);
    try {
      if (path) {
        await connectHidDevice(path);
      } else {
        await connectMegalodon();
      }
      const newStatus = await getHidStatus();
      setStatus(newStatus);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setStatus((prev) => ({
        ...prev,
        is_connected: false,
        error: errorMessage,
      }));
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await disconnectHidDevice();
      const newStatus = await getHidStatus();
      setStatus(newStatus);
    } catch (e) {
      console.error("[HID] Failed to disconnect:", e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const devicesResult = await listSupportedHidDevices();
      setDevices(devicesResult);
    } catch (e) {
      console.error("[HID] Failed to refresh devices:", e);
    }
  }, []);

  return {
    status,
    devices,
    isLoading,
    isConnected: status.is_connected,
    connectedDevice: status.device,
    error: status.error,
    connect,
    disconnect,
    refresh,
  };
}

/** Hook for managing HID mappings. */
export function useHidMappings() {
  const [mappings, setMappings] = useState<HidMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch mappings on mount
  useEffect(() => {
    void getHidMappings().then((result) => {
      setMappings(result);
      setIsLoading(false);
    });
  }, []);

  const addMapping = useCallback(async (mapping: HidMapping) => {
    await addHidMapping(mapping);
    const result = await getHidMappings();
    setMappings(result);
  }, []);

  const removeMapping = useCallback(async (encoderIndex: number) => {
    await removeHidMapping(encoderIndex);
    const result = await getHidMappings();
    setMappings(result);
  }, []);

  const clearAll = useCallback(async () => {
    await clearHidMappings();
    setMappings([]);
  }, []);

  const setupDefaults = useCallback(async () => {
    await setupDefaultHidMappings();
    const result = await getHidMappings();
    setMappings(result);
  }, []);

  const getMappingForEncoder = useCallback(
    (encoderIndex: number): HidMapping | undefined => {
      return mappings.find((m) => m.encoder_index === encoderIndex);
    },
    [mappings],
  );

  return {
    mappings,
    isLoading,
    addMapping,
    removeMapping,
    clearAll,
    setupDefaults,
    getMappingForEncoder,
  };
}

/** Maximum number of recent events to keep */
const MAX_RECENT_EVENTS = 30;

/** Maximum number of raw reports to keep */
const MAX_RAW_REPORTS = 20;

/** Hook for monitoring encoder events. */
export function useHidEncoderEvents() {
  const [events, setEvents] = useState<HidEncoderEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<HidEncoderEvent | null>(null);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidEncoderEvent>("hid_encoder", (event) => {
        setLastEvent(event.payload);
        setEventCount((prev) => prev + 1);
        setEvents((prev) => {
          const next = [event.payload, ...prev];
          return next.slice(0, MAX_RECENT_EVENTS);
        });
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
    setEventCount(0);
    setLastEvent(null);
  }, []);

  return {
    events,
    lastEvent,
    eventCount,
    clear,
  };
}

/** Hook for monitoring raw HID reports (for debugging). */
export function useHidRawReports() {
  const [reports, setReports] = useState<HidRawReport[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidRawReport>("hid_raw_report", (event) => {
        setReports((prev) => {
          const next = [event.payload, ...prev];
          return next.slice(0, MAX_RAW_REPORTS);
        });
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const clear = useCallback(() => {
    setReports([]);
  }, []);

  return {
    reports,
    clear,
  };
}

/** Hook combining device, mappings, and events for a complete HID panel. */
export function useHidPanel() {
  const device = useHidDevice();
  const mappings = useHidMappings();
  const events = useHidEncoderEvents();

  return {
    device,
    mappings,
    events,
  };
}
