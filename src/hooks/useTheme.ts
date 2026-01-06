import { useCallback, useSyncExternalStore } from "react";

// ==========================================================================
// Types
// ==========================================================================

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "standard" | "amber";

export interface ThemePreferences {
  mode: ThemeMode;
  accent: ThemeAccent;
}

export interface UseThemeResult {
  mode: ThemeMode;
  accent: ThemeAccent;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: ThemeAccent) => void;
  toggleMode: () => void;
  toggleAccent: () => void;
}

// ==========================================================================
// Constants
// ==========================================================================

const STORAGE_KEY_MODE = "slew-theme-mode";
const STORAGE_KEY_ACCENT = "slew-theme-accent";

const DEFAULT_MODE: ThemeMode = "dark";
const DEFAULT_ACCENT: ThemeAccent = "standard";

// ==========================================================================
// External Store for Theme Preferences
// ==========================================================================

// In-memory state that all hook instances share
let currentMode: ThemeMode = DEFAULT_MODE;
let currentAccent: ThemeAccent = DEFAULT_ACCENT;

// Subscribers for state changes
const subscribers = new Set<() => void>();

// Initialize from localStorage on module load
if (typeof window !== "undefined") {
  const storedMode = localStorage.getItem(STORAGE_KEY_MODE);
  if (storedMode === "dark" || storedMode === "light") {
    currentMode = storedMode;
  }

  const storedAccent = localStorage.getItem(STORAGE_KEY_ACCENT);
  if (storedAccent === "standard" || storedAccent === "amber") {
    currentAccent = storedAccent;
  }

  // Apply initial values to document
  document.documentElement.setAttribute("data-theme", currentMode);
  document.documentElement.setAttribute("data-accent", currentAccent);
}

// Notify all subscribers of state change
function emitChange() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

// Subscribe function for useSyncExternalStore
function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// Snapshot functions for useSyncExternalStore
function getModeSnapshot(): ThemeMode {
  return currentMode;
}

function getAccentSnapshot(): ThemeAccent {
  return currentAccent;
}

// Server snapshots (for SSR, though we don't use it)
function getServerModeSnapshot(): ThemeMode {
  return DEFAULT_MODE;
}

function getServerAccentSnapshot(): ThemeAccent {
  return DEFAULT_ACCENT;
}

// ==========================================================================
// State Setters
// ==========================================================================

function setModeInternal(mode: ThemeMode) {
  if (currentMode === mode) return;

  currentMode = mode;
  localStorage.setItem(STORAGE_KEY_MODE, mode);
  document.documentElement.setAttribute("data-theme", mode);
  emitChange();
}

function setAccentInternal(accent: ThemeAccent) {
  if (currentAccent === accent) return;

  currentAccent = accent;
  localStorage.setItem(STORAGE_KEY_ACCENT, accent);
  document.documentElement.setAttribute("data-accent", accent);
  emitChange();
}

// ==========================================================================
// Hook
// ==========================================================================

/**
 * Hook for managing theme preferences: mode (dark/light) and accent (standard/amber).
 *
 * Uses useSyncExternalStore to ensure all components using this hook
 * stay in sync when preferences change.
 *
 * Preferences are persisted to localStorage and applied to the document.
 *
 * @example
 * ```tsx
 * const { mode, accent, toggleMode, toggleAccent } = useTheme();
 *
 * return (
 *   <div>
 *     <button onClick={toggleMode}>
 *       {mode === "dark" ? "Switch to Light" : "Switch to Dark"}
 *     </button>
 *     <button onClick={toggleAccent}>
 *       {accent === "standard" ? "Use Amber" : "Use Standard"}
 *     </button>
 *   </div>
 * );
 * ```
 */
export function useTheme(): UseThemeResult {
  // Subscribe to external store for mode
  const mode = useSyncExternalStore(
    subscribe,
    getModeSnapshot,
    getServerModeSnapshot,
  );

  // Subscribe to external store for accent
  const accent = useSyncExternalStore(
    subscribe,
    getAccentSnapshot,
    getServerAccentSnapshot,
  );

  // ---------------------------------------------------------------------------
  // Mode Actions
  // ---------------------------------------------------------------------------

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeInternal(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeInternal(currentMode === "dark" ? "light" : "dark");
  }, []);

  // ---------------------------------------------------------------------------
  // Accent Actions
  // ---------------------------------------------------------------------------

  const setAccent = useCallback((newAccent: ThemeAccent) => {
    setAccentInternal(newAccent);
  }, []);

  const toggleAccent = useCallback(() => {
    setAccentInternal(currentAccent === "standard" ? "amber" : "standard");
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    mode,
    accent,
    setMode,
    setAccent,
    toggleMode,
    toggleAccent,
  };
}

export default useTheme;
