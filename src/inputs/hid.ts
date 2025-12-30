/**
 * HID Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust HID module and React hooks for:
 * - Managing HID device connections with auto-connect
 * - Encoder events (3 knobs)
 * - Key events (16 keys for scene selection and crossfade)
 * - Macropad state management for scene slot integration
 *
 * Designed for devices like the DOIO Megalodon Macropad.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useMessageActivityWithHistory, useMessageHistory } from "./shared";

// ============================================================================
// Types (matching Rust structs)
// ============================================================================

/**
 * Information about an HID device.
 *
 * @property vendor_id - Vendor ID
 * @property product_id - Product ID
 * @property path - Device path (unique identifier for opening)
 * @property manufacturer - Manufacturer name (if available)
 * @property product - Product name (if available)
 * @property serial - Serial number (if available)
 * @property is_supported - Whether this is a known/supported device
 * @property usage_page - Usage page (helps identify interface type)
 * @property usage - Usage (helps identify interface type)
 * @property interface_number - Interface number
 * @property interface_description - Human-readable interface description
 */
export interface HidDeviceInfo {
  vendor_id: number;
  product_id: number;
  path: string;
  manufacturer: string | null;
  product: string | null;
  serial: string | null;
  is_supported: boolean;
  usage_page: number;
  usage: number;
  interface_number: number;
  interface_description: string;
}

/**
 * Status of the HID connection.
 *
 * @property is_connected - Whether a device is currently connected
 * @property device - Info about the connected device (if any)
 * @property error - Error message if connection failed
 * @property is_searching - Whether auto-connect is actively searching
 */
export interface HidStatus {
  is_connected: boolean;
  device: HidDeviceInfo | null;
  error: string | null;
  is_searching: boolean;
}

/**
 * A mapping from an encoder knob to a parameter.
 *
 * @property encoder_index - Which encoder (0 = K1, 1 = K2, 2 = K3)
 * @property parameter_id - The parameter ID to control
 * @property sensitivity - Sensitivity multiplier (how much each tick changes the value)
 * @property inverted - Whether to invert the direction
 */
export interface HidMapping {
  encoder_index: number;
  parameter_id: string;
  sensitivity: number;
  inverted: boolean;
}

/**
 * An encoder event from the macropad knobs.
 *
 * @property encoder_index - Which encoder (0 = K1/left, 1 = K2/right small, 2 = K3/large)
 * @property delta - Direction: positive = clockwise, negative = counter-clockwise
 * @property timestamp - Timestamp in milliseconds
 */
export interface HidEncoderEvent {
  encoder_index: number;
  delta: number;
  timestamp: number;
}

/**
 * A key event from the macropad.
 *
 * @property key_code - The HID key code
 * @property key_name - Logical key name (e.g., "1", "Enter", "Up")
 * @property pressed - Whether the key was pressed (true) or released (false)
 * @property timestamp - Timestamp in milliseconds
 */
export interface HidKeyEvent {
  key_code: number;
  key_name: string;
  pressed: boolean;
  timestamp: number;
}

/**
 * A raw HID report for debugging.
 *
 * @property hex - Raw bytes as hex string
 * @property bytes - Raw bytes as decimal array
 * @property size - Report size
 * @property timestamp - Timestamp in milliseconds
 */
export interface HidRawReport {
  hex: string;
  bytes: number[];
  size: number;
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

/** Connect to the first available Megalodon device (all interfaces). */
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

/** Enable or disable auto-connect. */
export async function setHidAutoConnect(enabled: boolean): Promise<void> {
  return invoke("set_hid_auto_connect", { enabled });
}

/** Check if auto-connect is enabled. */
export async function getHidAutoConnect(): Promise<boolean> {
  return invoke<boolean>("get_hid_auto_connect");
}

// ============================================================================
// Constants
// ============================================================================

/** Default encoder sensitivity */
export const DEFAULT_SENSITIVITY = 0.02;

/** Encoder labels for the Megalodon (based on actual device behavior) */
export const ENCODER_LABELS = [
  "K1 (Left small)",
  "K2 (Right small)",
  "K3 (Large bottom)",
] as const;

/** Maximum number of scene slots */
export const MAX_SCENE_SLOTS = 4;

/**
 * Keys that select scene slots (1-4).
 * These map to physical keys in the top row of the DOIO macropad.
 * The backend translates the actual HID codes to these logical names.
 */
export const SCENE_SELECT_KEYS = ["1", "2", "3", "4"] as const;

/**
 * Keys that trigger crossfade action.
 * Physical key 7 sends "7" (Space position), Enter is physical Enter key.
 * MO(3) might send "Enter" (shares code 0x30) or nothing if layer-only.
 */
export const ACTION_KEYS = ["7", "Enter", "8", "5", "6"] as const;

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Automatically subscribes to status changes and provides connection state.
 * Auto-connect runs in the backend and periodically searches for devices.
 */
export function useHidDevice() {
  const [status, setStatus] = useState<HidStatus>({
    is_connected: false,
    device: null,
    error: null,
    is_searching: true,
  });
  const [devices, setDevices] = useState<HidDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [autoConnectEnabled, setAutoConnectEnabled] = useState(true);

  // Fetch initial status and device list
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        // Note: listSupportedHidDevices removed - it blocks/crashes on repeated calls
        // and the devices list isn't used in the UI anyway
        const [statusResult, autoConnect] = await Promise.all([
          getHidStatus(),
          getHidAutoConnect(),
        ]);
        if (isMounted) {
          setStatus(statusResult);
          setAutoConnectEnabled(autoConnect);
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

  const setAutoConnect = useCallback(async (enabled: boolean) => {
    try {
      await setHidAutoConnect(enabled);
      setAutoConnectEnabled(enabled);
    } catch (e) {
      console.error("[HID] Failed to set auto-connect:", e);
    }
  }, []);

  return {
    status,
    devices,
    isLoading,
    isConnected: status.is_connected,
    isSearching: status.is_searching,
    connectedDevice: status.device,
    error: status.error,
    autoConnectEnabled,
    connect,
    disconnect,
    refresh,
    setAutoConnect,
  };
}

/**
 * Hook for managing HID mappings (legacy, for direct parameter control).
 */
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

/**
 * Hook for monitoring encoder events.
 */
export function useHidEncoderEvents() {
  const result = useMessageActivityWithHistory<HidEncoderEvent>("hid_encoder", {
    maxHistory: MAX_RECENT_EVENTS,
  });

  return {
    events: result.messages,
    lastEvent: result.lastMessage,
    eventCount: result.messageCount,
    clear: () => {
      result.clear();
      result.resetCount();
    },
  };
}

/**
 * Hook for monitoring key events.
 */
export function useHidKeyEvents() {
  const result = useMessageActivityWithHistory<HidKeyEvent>("hid_key", {
    maxHistory: MAX_RECENT_EVENTS,
  });

  return {
    events: result.messages,
    lastEvent: result.lastMessage,
    eventCount: result.messageCount,
    clear: () => {
      result.clear();
      result.resetCount();
    },
  };
}

/**
 * Hook for monitoring raw HID reports (for debugging).
 */
export function useHidRawReports() {
  const { messages: reports, clear } = useMessageHistory<HidRawReport>(
    "hid_raw_report",
    { maxHistory: MAX_RAW_REPORTS },
  );

  return {
    reports,
    clear,
  };
}

// ============================================================================
// Macropad Integration Hook
// ============================================================================

/**
 * Configuration for useMacropad hook.
 *
 * @property maxSlots - Maximum number of scene slots (defaults to 8)
 * @property actionKey - Key name that triggers crossfade (defaults to auto-detect)
 * @property encoderSensitivity - Sensitivity for encoder parameter changes
 */
export interface MacropadConfig {
  maxSlots?: number;
  actionKey?: string;
  encoderSensitivity?: number;
}

/**
 * State returned by the useMacropad hook.
 *
 * @property isConnected - Whether the macropad is connected
 * @property isSearching - Whether auto-connect is searching
 * @property selectedSlotIndex - Currently selected slot (0-3) or null if none
 * @property lastKeyEvent - Last key event received
 * @property lastEncoderEvent - Last encoder event received
 */
export interface MacropadState {
  isConnected: boolean;
  isSearching: boolean;
  selectedSlotIndex: number | null;
  lastKeyEvent: HidKeyEvent | null;
  lastEncoderEvent: HidEncoderEvent | null;
}

/**
 * Callbacks for macropad events.
 *
 * @property onSlotSelect - Called when a slot is selected via keys 1-4
 * @property onCrossfade - Called when the action key is pressed
 * @property onEncoderChange - Called when an encoder is turned
 */
export interface MacropadCallbacks {
  onSlotSelect?: (slotIndex: number) => void;
  onCrossfade?: () => void;
  onEncoderChange?: (encoderIndex: number, delta: number) => void;
}

/**
 * Hook for macropad integration with scene slot system.
 *
 * Listens to key and encoder events from the macropad and provides:
 * - Slot selection via keys 1-4
 * - Crossfade triggering via action key
 * - Encoder delta events for parameter control
 *
 * Key concepts:
 * - Keys 1-4 select the corresponding scene slot (0-3)
 * - The action key (Space, F13, Enter, etc.) triggers crossfade to selected slot
 * - Encoder events are forwarded with the encoder index and delta
 */
export function useMacropad(
  callbacks: MacropadCallbacks = {},
  config: MacropadConfig = {},
): MacropadState {
  const {
    maxSlots = 8,
    actionKey,
    encoderSensitivity = DEFAULT_SENSITIVITY,
  } = config;
  const { onSlotSelect, onCrossfade, onEncoderChange } = callbacks;

  // Store callbacks in refs to avoid re-subscribing
  const callbacksRef = useRef({ onSlotSelect, onCrossfade, onEncoderChange });
  callbacksRef.current = { onSlotSelect, onCrossfade, onEncoderChange };

  const [state, setState] = useState<MacropadState>({
    isConnected: false,
    isSearching: true,
    selectedSlotIndex: null,
    lastKeyEvent: null,
    lastEncoderEvent: null,
  });

  // Subscribe to HID status changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      // Get initial status
      try {
        const status = await getHidStatus();
        setState((prev) => ({
          ...prev,
          isConnected: status.is_connected,
          isSearching: status.is_searching,
        }));
      } catch (e) {
        console.error("[Macropad] Failed to get initial status:", e);
      }

      // Subscribe to status changes
      unlisten = await listen<HidStatus>("hid_status_changed", (event) => {
        setState((prev) => ({
          ...prev,
          isConnected: event.payload.is_connected,
          isSearching: event.payload.is_searching,
        }));
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Subscribe to key events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidKeyEvent>("hid_key", (event) => {
        const keyEvent = event.payload;

        // Only handle key press events (not release)
        if (!keyEvent.pressed) {
          return;
        }

        setState((prev) => ({ ...prev, lastKeyEvent: keyEvent }));

        const { onSlotSelect, onCrossfade } = callbacksRef.current;

        // Check if it's a slot selection key (1-4)
        const slotIndex = SCENE_SELECT_KEYS.indexOf(
          keyEvent.key_name as (typeof SCENE_SELECT_KEYS)[number],
        );
        if (slotIndex !== -1 && slotIndex < maxSlots) {
          setState((prev) => ({ ...prev, selectedSlotIndex: slotIndex }));
          onSlotSelect?.(slotIndex);
          return;
        }

        // Check if it's the action key
        const isActionKey = actionKey
          ? keyEvent.key_name === actionKey
          : ACTION_KEYS.includes(
              keyEvent.key_name as (typeof ACTION_KEYS)[number],
            );
        if (isActionKey) {
          onCrossfade?.();
          return;
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [maxSlots, actionKey]);

  // Subscribe to encoder events
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidEncoderEvent>("hid_encoder", (event) => {
        const encoderEvent = event.payload;
        setState((prev) => ({ ...prev, lastEncoderEvent: encoderEvent }));

        const { onEncoderChange } = callbacksRef.current;
        onEncoderChange?.(encoderEvent.encoder_index, encoderEvent.delta);
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [encoderSensitivity]);

  return state;
}

/**
 * Hook combining device, mappings, and events for a complete HID panel.
 * Useful for debug UI that needs access to all HID state.
 */
export function useHidPanel() {
  const device = useHidDevice();
  const mappings = useHidMappings();
  const encoderEvents = useHidEncoderEvents();
  const keyEvents = useHidKeyEvents();
  const rawReports = useHidRawReports();

  return {
    device,
    mappings,
    encoderEvents,
    keyEvents,
    rawReports,
  };
}
