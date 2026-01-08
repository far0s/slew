import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "../lib/logger";

// =============================================================================
// Types
// =============================================================================

/**
 * Status of a single window.
 *
 * @property exists - Whether the window exists
 * @property visible - Whether the window is visible
 * @property focused - Whether the window has focus
 * @property responsive - Whether the window is responding to heartbeats
 * @property restartCount - Number of times this window has been restarted
 */
export interface WindowStatus {
  exists: boolean;
  visible: boolean;
  focused: boolean;
  responsive: boolean;
  restartCount: number;
}

/**
 * Status of all managed windows.
 */
export interface AllWindowStatus {
  controls: WindowStatus;
  renderer: WindowStatus;
}

/**
 * Window restart event payload.
 */
export interface WindowRestartedEvent {
  label: string;
  timestamp: string;
}

/**
 * Window unresponsive event payload.
 */
export interface WindowUnresponsiveEvent {
  label: string;
  timestamp: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 5000;

/** Status polling interval in milliseconds */
const STATUS_POLL_INTERVAL_MS = 10000;

// =============================================================================
// Tauri Commands
// =============================================================================

/**
 * Restart the controls window.
 */
export async function restartControlsWindow(): Promise<void> {
  await invoke("restart_controls_window");
}

/**
 * Restart the renderer window.
 */
export async function restartRendererWindow(): Promise<void> {
  await invoke("restart_renderer_window");
}

/**
 * Toggle a window's visibility.
 */
export async function toggleWindowVisibility(label: string): Promise<void> {
  await invoke("toggle_window_visibility", { label });
}

/**
 * Focus a window.
 */
export async function focusWindow(label: string): Promise<void> {
  await invoke("focus_window", { label });
}

/**
 * Toggle fullscreen for a window.
 * @returns The new fullscreen state
 */
export async function toggleFullscreen(label: string): Promise<boolean> {
  return invoke<boolean>("toggle_fullscreen", { label });
}

/**
 * Get status of all windows.
 */
export async function getWindowStatus(): Promise<AllWindowStatus> {
  const status =
    await invoke<Record<string, WindowStatus>>("get_window_status");
  return {
    controls: status.controls ?? {
      exists: false,
      visible: false,
      focused: false,
      responsive: false,
      restartCount: 0,
    },
    renderer: status.renderer ?? {
      exists: false,
      visible: false,
      focused: false,
      responsive: false,
      restartCount: 0,
    },
  };
}

/**
 * Send a heartbeat for this window.
 */
export async function sendWindowHeartbeat(label: string): Promise<void> {
  await invoke("window_heartbeat", { label });
}

/**
 * Get the path to the window restart log.
 */
export async function getWindowRestartLogPath(): Promise<string | null> {
  return invoke<string | null>("get_window_restart_log_path");
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook options for useWindowManager.
 *
 * @property windowLabel - The label of this window (for heartbeat)
 * @property enableHeartbeat - Whether to send heartbeats (default: true)
 * @property enableStatusPolling - Whether to poll window status (default: false)
 */
export interface UseWindowManagerOptions {
  windowLabel: "controls" | "renderer";
  enableHeartbeat?: boolean;
  enableStatusPolling?: boolean;
}

/**
 * Hook return type.
 *
 * @property status - Current status of all windows
 * @property isRestarting - Whether a restart is in progress
 * @property restartControls - Restart the controls window
 * @property restartRenderer - Restart the renderer window
 * @property focusControls - Focus the controls window
 * @property focusRenderer - Focus the renderer window
 * @property toggleFullscreenControls - Toggle fullscreen for the controls window
 * @property toggleFullscreenRenderer - Toggle fullscreen for the renderer window
 */
export interface UseWindowManagerResult {
  status: AllWindowStatus | null;
  isRestarting: boolean;
  restartControls: () => Promise<void>;
  restartRenderer: () => Promise<void>;
  focusControls: () => Promise<void>;
  focusRenderer: () => Promise<void>;
  toggleFullscreenControls: () => Promise<boolean>;
  toggleFullscreenRenderer: () => Promise<boolean>;
}

/**
 * useWindowManager
 *
 * Hook for window lifecycle management. Provides:
 * - Automatic heartbeat sending (to detect frozen windows)
 * - Window status tracking
 * - Window restart and focus functions
 * - Event listeners for window lifecycle events
 */
export function useWindowManager(
  options: UseWindowManagerOptions,
): UseWindowManagerResult {
  const {
    windowLabel,
    enableHeartbeat = true,
    enableStatusPolling = false,
  } = options;

  const [status, setStatus] = useState<AllWindowStatus | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch window status
  const fetchStatus = useCallback(async () => {
    try {
      const s = await getWindowStatus();
      setStatus(s);
    } catch (e) {
      logger.error("WindowManager", "Failed to fetch status:", e);
    }
  }, []);

  // Restart controls with state tracking
  const restartControls = useCallback(async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    try {
      await restartControlsWindow();
    } catch (e) {
      logger.error("WindowManager", "Failed to restart controls:", e);
    } finally {
      // Reset after a delay to account for window recreation
      setTimeout(() => setIsRestarting(false), 1000);
    }
  }, [isRestarting]);

  // Restart renderer with state tracking
  const restartRenderer = useCallback(async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    try {
      await restartRendererWindow();
    } catch (e) {
      logger.error("WindowManager", "Failed to restart renderer:", e);
    } finally {
      setTimeout(() => setIsRestarting(false), 1000);
    }
  }, [isRestarting]);

  // Focus controls
  const focusControls = useCallback(async () => {
    try {
      await focusWindow("controls");
    } catch (e) {
      logger.error("WindowManager", "Failed to focus controls:", e);
    }
  }, []);

  // Focus renderer
  const focusRenderer = useCallback(async () => {
    try {
      await focusWindow("renderer");
    } catch (e) {
      logger.error("WindowManager", "Failed to focus renderer:", e);
    }
  }, []);

  // Toggle fullscreen controls
  const toggleFullscreenControls = useCallback(async (): Promise<boolean> => {
    try {
      return await toggleFullscreen("controls");
    } catch (e) {
      logger.error("WindowManager", "Failed to toggle fullscreen controls:", e);
      return false;
    }
  }, []);

  // Toggle fullscreen renderer
  const toggleFullscreenRenderer = useCallback(async (): Promise<boolean> => {
    try {
      return await toggleFullscreen("renderer");
    } catch (e) {
      logger.error("WindowManager", "Failed to toggle fullscreen renderer:", e);
      return false;
    }
  }, []);

  // Heartbeat effect
  useEffect(() => {
    if (!enableHeartbeat) return;

    // Send initial heartbeat
    sendWindowHeartbeat(windowLabel).catch((e) =>
      logger.warn("WindowManager", "Initial heartbeat failed:", e),
    );

    // Set up interval
    heartbeatRef.current = setInterval(() => {
      sendWindowHeartbeat(windowLabel).catch((e) =>
        logger.warn("WindowManager", "Heartbeat failed:", e),
      );
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [windowLabel, enableHeartbeat]);

  // Status polling effect
  useEffect(() => {
    if (!enableStatusPolling) return;

    // Fetch initial status
    fetchStatus();

    // Set up polling interval
    statusPollRef.current = setInterval(fetchStatus, STATUS_POLL_INTERVAL_MS);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, [enableStatusPolling, fetchStatus]);

  // Event listeners for window lifecycle events
  useEffect(() => {
    let unlistenRestarted: UnlistenFn | undefined;
    let unlistenUnresponsive: UnlistenFn | undefined;

    async function setupListeners() {
      unlistenRestarted = await listen<WindowRestartedEvent>(
        "window_restarted",
        () => {
          // Refresh status after restart
          fetchStatus();
        },
      );

      unlistenUnresponsive = await listen<WindowUnresponsiveEvent>(
        "window_unresponsive",
        (event) => {
          logger.warn(
            "WindowManager",
            `Window '${event.payload.label}' is unresponsive`,
          );
          // Refresh status
          fetchStatus();
        },
      );
    }

    setupListeners();

    return () => {
      unlistenRestarted?.();
      unlistenUnresponsive?.();
    };
  }, [fetchStatus]);

  return {
    status,
    isRestarting,
    restartControls,
    restartRenderer,
    focusControls,
    focusRenderer,
    toggleFullscreenControls,
    toggleFullscreenRenderer,
  };
}

export default useWindowManager;
