/**
 * Audio Input Types and Hooks
 *
 * Provides TypeScript types matching the Rust Audio module and
 * React hooks for managing audio devices, capture, and level monitoring.
 */

import { useState, useEffect, useCallback } from "react";
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

// ============================================================================
// API Functions (Tauri command wrappers)
// ============================================================================

/** List all available audio input devices. */
export async function listAudioDevices(): Promise<AudioDeviceInfo[]> {
  return invoke<AudioDeviceInfo[]>("list_audio_devices");
}

/** Start audio capture from a device. */
export async function startAudioCapture(
  deviceName?: string,
): Promise<void> {
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
export function useAudioLevels() {
  const [levels, setLevels] = useState<AudioLevels | null>(null);
  const [beatCount, setBeatCount] = useState(0);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<AudioLevels>("audio_levels", (event) => {
        setLevels(event.payload);
        if (event.payload.beat) {
          setBeatCount((prev) => prev + 1);
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const resetBeatCount = useCallback(() => {
    setBeatCount(0);
  }, []);

  return {
    levels,
    rms: levels?.rms ?? 0,
    peak: levels?.peak ?? 0,
    bands: levels?.bands ?? { bass: 0, low_mid: 0, high_mid: 0, treble: 0 },
    beat: levels?.beat ?? false,
    beatCount,
    resetBeatCount,
  };
}
