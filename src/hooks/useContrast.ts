import { useCallback, useSyncExternalStore } from "react";
import { createSimpleStorage } from "@/lib/storage";

// ==========================================================================
// Types
// ==========================================================================

export type ContrastLevel = "normal" | "high";

// ==========================================================================
// Constants
// ==========================================================================

const DEFAULT_CONTRAST: ContrastLevel = "normal";

const isValidContrast = (v: unknown): v is ContrastLevel =>
  v === "normal" || v === "high";

const contrastStorage = createSimpleStorage(
  "slew-contrast",
  DEFAULT_CONTRAST,
  isValidContrast,
);

// ==========================================================================
// External Store
// ==========================================================================

let currentContrast: ContrastLevel = DEFAULT_CONTRAST;
const subscribers = new Set<() => void>();

function applyContrast(level: ContrastLevel) {
  if (level === "high") {
    document.documentElement.setAttribute("data-contrast", "high");
  } else {
    document.documentElement.removeAttribute("data-contrast");
  }
}

if (typeof window !== "undefined") {
  currentContrast = contrastStorage.load();
  applyContrast(currentContrast);
}

function emitChange() {
  for (const subscriber of subscribers) {
    subscriber();
  }
}

function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot(): ContrastLevel {
  return currentContrast;
}

function getServerSnapshot(): ContrastLevel {
  return DEFAULT_CONTRAST;
}

function setContrastInternal(level: ContrastLevel) {
  if (currentContrast === level) return;
  currentContrast = level;
  contrastStorage.save(level);
  applyContrast(level);
  emitChange();
}

// ==========================================================================
// Hook
// ==========================================================================

export interface UseContrastResult {
  contrast: ContrastLevel;
  setContrast: (level: ContrastLevel) => void;
  toggleContrast: () => void;
}

/**
 * Hook for managing display contrast preference.
 * Persists to localStorage and applies [data-contrast="high"] to <html>.
 */
export function useContrast(): UseContrastResult {
  const contrast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setContrast = useCallback((level: ContrastLevel) => {
    setContrastInternal(level);
  }, []);

  const toggleContrast = useCallback(() => {
    setContrastInternal(currentContrast === "normal" ? "high" : "normal");
  }, []);

  return { contrast, setContrast, toggleContrast };
}

export default useContrast;
