import { useCallback, useSyncExternalStore } from "react";
import { createSimpleStorage } from "../lib/storage";

// ==========================================================================
// Types
// ==========================================================================

export type ThemeMode = "dark" | "light";
export type ThemeAccent = "standard" | "neutral" | "amber";

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

const DEFAULT_MODE: ThemeMode = "dark";
const DEFAULT_ACCENT: ThemeAccent = "standard";

// Validators for type safety
const isValidMode = (v: unknown): v is ThemeMode =>
  v === "dark" || v === "light";
const isValidAccent = (v: unknown): v is ThemeAccent =>
  v === "standard" || v === "neutral" || v === "amber";

// Simple storage for theme preferences
const modeStorage = createSimpleStorage(
  "slew-theme-mode",
  DEFAULT_MODE,
  isValidMode,
);
const accentStorage = createSimpleStorage(
  "slew-theme-accent",
  DEFAULT_ACCENT,
  isValidAccent,
);

// ==========================================================================
// External Store for Theme Preferences
// ==========================================================================

// In-memory state that all hook instances share
let currentMode: ThemeMode = DEFAULT_MODE;
let currentAccent: ThemeAccent = DEFAULT_ACCENT;

// Subscribers for state changes
const subscribers = new Set<() => void>();

// Initialize from storage on module load
if (typeof window !== "undefined") {
  currentMode = modeStorage.load();
  currentAccent = accentStorage.load();

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
  modeStorage.save(mode);
  document.documentElement.setAttribute("data-theme", mode);
  emitChange();
}

function setAccentInternal(accent: ThemeAccent) {
  if (currentAccent === accent) return;

  currentAccent = accent;
  accentStorage.save(accent);
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
    const cycle: ThemeAccent[] = ["standard", "neutral", "amber"];
    const idx = cycle.indexOf(currentAccent);
    setAccentInternal(cycle[(idx + 1) % cycle.length]);
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
