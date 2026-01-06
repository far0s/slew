import { useState, useCallback, useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";

/**
 * Renderer settings that can be configured from the Controls window
 * and applied in the Renderer window.
 */
export interface RendererSettings {
  /** Device pixel ratio (1 = performance, 2 = quality on Retina displays) */
  dpr: number;
  /** Preview stream FPS (15, 30, 45, or 60) */
  previewStreamFps: number;
}

/**
 * Performance stats from the renderer
 */
export interface RendererStats {
  /** Current frames per second */
  fps: number;
  /** Frame time in milliseconds */
  frameTimeMs: number;
  /** Number of draw calls */
  drawCalls: number;
  /** Number of triangles rendered */
  triangles: number;
  /** Number of textures in memory */
  textures: number;
  /** Number of geometries in memory */
  geometries: number;
}

/**
 * Renderer info reported from the Renderer window
 */
export interface RendererInfo {
  /** Current window width in CSS pixels */
  windowWidth: number;
  /** Current window height in CSS pixels */
  windowHeight: number;
  /** Actual render width in physical pixels */
  renderWidth: number;
  /** Actual render height in physical pixels */
  renderHeight: number;
  /** Device's native pixel ratio */
  nativePixelRatio: number;
  /** Currently applied DPR setting */
  appliedDpr: number;
  /** Renderer backend (webgpu or webgl2) */
  backend: "webgpu" | "webgl2" | "unknown";
  /** Performance stats (updated periodically) */
  stats?: RendererStats;
}

const STORAGE_KEY = "slew-renderer-settings";
const SETTINGS_EVENT = "renderer-settings-changed";
const INFO_EVENT = "renderer-info-updated";

const DEFAULT_SETTINGS: RendererSettings = {
  dpr: 1, // Default to 1x for performance
  previewStreamFps: 30, // Default to 30fps for smooth previews
};

/**
 * Load settings from localStorage
 */
function loadSettings(): RendererSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn("[RendererSettings] Failed to load settings:", e);
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: RendererSettings): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("[RendererSettings] Failed to save settings:", e);
  }
}

export interface UseRendererSettingsResult {
  /** Current renderer settings */
  settings: RendererSettings;
  /** Info reported from the Renderer window (null if not yet received) */
  info: RendererInfo | null;
  /** Update the DPR setting */
  setDpr: (dpr: number) => void;
  /** Update the preview stream FPS setting */
  setPreviewStreamFps: (fps: number) => void;
  /** Broadcast current settings (useful for initial sync) */
  broadcastSettings: () => void;
  /** Report renderer info (called from Renderer window) */
  reportInfo: (info: RendererInfo) => void;
}

/**
 * Hook for managing renderer settings with cross-window communication.
 *
 * Use in Controls window to change settings.
 * Use in Renderer window to receive settings and report info.
 *
 * Settings are persisted to localStorage and broadcast via Tauri events
 * so both windows stay in sync.
 */
export function useRendererSettings(): UseRendererSettingsResult {
  const [settings, setSettings] = useState<RendererSettings>(loadSettings);
  const [info, setInfo] = useState<RendererInfo | null>(null);

  // Throttle info updates to avoid excessive IPC
  const lastEmitTimeRef = useRef(0);
  const INFO_EMIT_INTERVAL_MS = 250; // Update stats 4 times per second

  // Broadcast settings to all windows
  const broadcastSettings = useCallback(() => {
    emit(SETTINGS_EVENT, settings).catch((e) => {
      console.warn("[RendererSettings] Failed to emit settings:", e);
    });
  }, [settings]);

  // Update DPR and broadcast
  const setDpr = useCallback((dpr: number) => {
    const clampedDpr = Math.max(0.25, Math.min(3, dpr));
    setSettings((prev) => {
      const next = { ...prev, dpr: clampedDpr };
      saveSettings(next);
      // Broadcast after state update
      emit(SETTINGS_EVENT, next).catch((e) => {
        console.warn("[RendererSettings] Failed to emit settings:", e);
      });
      return next;
    });
  }, []);

  // Update preview stream FPS and broadcast
  const setPreviewStreamFps = useCallback((fps: number) => {
    // Only allow valid FPS values
    const validFps = [15, 30, 45, 60].includes(fps) ? fps : 30;
    setSettings((prev) => {
      const next = { ...prev, previewStreamFps: validFps };
      saveSettings(next);
      // Broadcast after state update
      emit(SETTINGS_EVENT, next).catch((e) => {
        console.warn("[RendererSettings] Failed to emit settings:", e);
      });
      return next;
    });
  }, []);

  // Report renderer info (called from Renderer window)
  // Throttled to avoid excessive IPC traffic
  const reportInfo = useCallback((newInfo: RendererInfo) => {
    const now = performance.now();
    if (now - lastEmitTimeRef.current < INFO_EMIT_INTERVAL_MS) {
      return; // Skip this update, too soon
    }
    lastEmitTimeRef.current = now;

    emit(INFO_EVENT, newInfo).catch((e) => {
      console.warn("[RendererSettings] Failed to emit info:", e);
    });
  }, []);

  // Listen for settings changes from other windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      unlisten = await listen<RendererSettings>(SETTINGS_EVENT, (event) => {
        setSettings(event.payload);
        saveSettings(event.payload);
      });
    }

    subscribe();

    return () => {
      unlisten?.();
    };
  }, []);

  // Listen for info updates from Renderer window
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      unlisten = await listen<RendererInfo>(INFO_EVENT, (event) => {
        setInfo(event.payload);
      });
    }

    subscribe();

    return () => {
      unlisten?.();
    };
  }, []);

  return {
    settings,
    info,
    setDpr,
    setPreviewStreamFps,
    broadcastSettings,
    reportInfo,
  };
}

export default useRendererSettings;
