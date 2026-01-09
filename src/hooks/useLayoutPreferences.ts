import { useCallback, useSyncExternalStore } from "react";
import { createSimpleStorage } from "../lib/storage";

// ==========================================================================
// Types
// ==========================================================================

export type SidebarPosition = "left" | "right";

export interface LayoutPreferences {
  sidebarPosition: SidebarPosition;
  uiZoom: number;
}

export interface UseLayoutPreferencesResult {
  sidebarPosition: SidebarPosition;
  setSidebarPosition: (position: SidebarPosition) => void;
  toggleSidebarPosition: () => void;
  uiZoom: number;
  setUiZoom: (zoom: number) => void;
  increaseZoom: () => void;
  decreaseZoom: () => void;
  resetZoom: () => void;
}

// ==========================================================================
// Constants
// ==========================================================================

const DEFAULT_SIDEBAR_POSITION: SidebarPosition = "right";
const DEFAULT_UI_ZOOM = 100;
const MIN_ZOOM = 80;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

// Validators for type safety
const isValidSidebar = (v: unknown): v is SidebarPosition =>
  v === "left" || v === "right";
const isValidZoom = (v: unknown): v is number =>
  typeof v === "number" && v >= MIN_ZOOM && v <= MAX_ZOOM;

// Simple storage for layout preferences
const sidebarStorage = createSimpleStorage(
  "slew-sidebar-position",
  DEFAULT_SIDEBAR_POSITION,
  isValidSidebar,
);
const zoomStorage = createSimpleStorage(
  "slew-ui-zoom",
  DEFAULT_UI_ZOOM,
  isValidZoom,
);

// ==========================================================================
// External Store for Layout Preferences
// ==========================================================================

// In-memory state that all hook instances share
let currentSidebarPosition: SidebarPosition = DEFAULT_SIDEBAR_POSITION;
let currentUiZoom: number = DEFAULT_UI_ZOOM;

// Subscribers for state changes
const subscribers = new Set<() => void>();

// Initialize from storage on module load
if (typeof window !== "undefined") {
  currentSidebarPosition = sidebarStorage.load();
  currentUiZoom = zoomStorage.load();

  // Apply initial values to document
  document.documentElement.setAttribute("data-sidebar", currentSidebarPosition);
  document.documentElement.style.setProperty(
    "--ui-zoom",
    (currentUiZoom / 100).toString(),
  );
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
function getSidebarSnapshot(): SidebarPosition {
  return currentSidebarPosition;
}

function getZoomSnapshot(): number {
  return currentUiZoom;
}

// Server snapshots (for SSR, though we don't use it)
function getServerSidebarSnapshot(): SidebarPosition {
  return DEFAULT_SIDEBAR_POSITION;
}

function getServerZoomSnapshot(): number {
  return DEFAULT_UI_ZOOM;
}

// ==========================================================================
// State Setters
// ==========================================================================

function setSidebarPositionInternal(position: SidebarPosition) {
  if (currentSidebarPosition === position) return;

  currentSidebarPosition = position;
  sidebarStorage.save(position);
  document.documentElement.setAttribute("data-sidebar", position);
  emitChange();
}

function setUiZoomInternal(zoom: number) {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  if (currentUiZoom === clamped) return;

  currentUiZoom = clamped;
  zoomStorage.save(clamped);
  document.documentElement.style.setProperty(
    "--ui-zoom",
    (clamped / 100).toString(),
  );
  emitChange();
}

// ==========================================================================
// Hook
// ==========================================================================

/**
 * Hook for managing layout preferences: sidebar position and UI zoom.
 *
 * Uses useSyncExternalStore to ensure all components using this hook
 * stay in sync when preferences change.
 *
 * Preferences are persisted to localStorage and applied to the document.
 *
 * @example
 * ```tsx
 * const {
 *   sidebarPosition,
 *   toggleSidebarPosition,
 *   uiZoom,
 *   increaseZoom,
 *   decreaseZoom,
 *   resetZoom,
 * } = useLayoutPreferences();
 * ```
 */
export function useLayoutPreferences(): UseLayoutPreferencesResult {
  // Subscribe to external store for sidebar position
  const sidebarPosition = useSyncExternalStore(
    subscribe,
    getSidebarSnapshot,
    getServerSidebarSnapshot,
  );

  // Subscribe to external store for UI zoom
  const uiZoom = useSyncExternalStore(
    subscribe,
    getZoomSnapshot,
    getServerZoomSnapshot,
  );

  // ---------------------------------------------------------------------------
  // Sidebar Position Actions
  // ---------------------------------------------------------------------------

  const setSidebarPosition = useCallback((position: SidebarPosition) => {
    setSidebarPositionInternal(position);
  }, []);

  const toggleSidebarPosition = useCallback(() => {
    setSidebarPositionInternal(
      currentSidebarPosition === "left" ? "right" : "left",
    );
  }, []);

  // ---------------------------------------------------------------------------
  // UI Zoom Actions
  // ---------------------------------------------------------------------------

  const setUiZoom = useCallback((zoom: number) => {
    setUiZoomInternal(zoom);
  }, []);

  const increaseZoom = useCallback(() => {
    setUiZoomInternal(currentUiZoom + ZOOM_STEP);
  }, []);

  const decreaseZoom = useCallback(() => {
    setUiZoomInternal(currentUiZoom - ZOOM_STEP);
  }, []);

  const resetZoom = useCallback(() => {
    setUiZoomInternal(DEFAULT_UI_ZOOM);
  }, []);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    sidebarPosition,
    setSidebarPosition,
    toggleSidebarPosition,
    uiZoom,
    setUiZoom,
    increaseZoom,
    decreaseZoom,
    resetZoom,
  };
}

// Export constants for use in UI
export { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, DEFAULT_UI_ZOOM };
