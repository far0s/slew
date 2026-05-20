import { useSyncExternalStore } from "react";

// ==========================================================================
// Types
// ==========================================================================

interface HistoryEntry {
  id: string;
  before: number;
  after: number;
}

interface UndoHistoryState {
  history: HistoryEntry[];
  cursor: number;
  canUndo: boolean;
  canRedo: boolean;
}

type Subscriber = () => void;

// ==========================================================================
// Constants
// ==========================================================================

const MAX_HISTORY = 50;

// ==========================================================================
// External Store (module-level singleton)
// ==========================================================================

let state: UndoHistoryState = {
  history: [],
  cursor: -1,
  canUndo: false,
  canRedo: false,
};

const subscribers = new Set<Subscriber>();

function getSnapshot(): UndoHistoryState {
  return state;
}

function getServerSnapshot(): UndoHistoryState {
  return state;
}

function subscribe(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function emitChange(): void {
  for (const sub of subscribers) {
    sub();
  }
}

function computeFlags(history: HistoryEntry[], cursor: number) {
  return {
    canUndo: cursor >= 0,
    canRedo: cursor < history.length - 1,
  };
}

// ==========================================================================
// Actions
// ==========================================================================

export function pushUndoEntry(id: string, before: number, after: number): void {
  if (before === after) return;

  // Slice off any "future" entries beyond current cursor, then append
  const trimmed = state.history.slice(0, state.cursor + 1);
  trimmed.push({ id, before, after });

  // Enforce max size by dropping oldest entries
  const clamped =
    trimmed.length > MAX_HISTORY ? trimmed.slice(trimmed.length - MAX_HISTORY) : trimmed;

  const cursor = clamped.length - 1;

  state = { history: clamped, cursor, ...computeFlags(clamped, cursor) };
  emitChange();
}

export function applyUndo(): { id: string; value: number } | null {
  if (!state.canUndo) return null;

  const entry = state.history[state.cursor];
  const cursor = state.cursor - 1;

  state = { history: state.history, cursor, ...computeFlags(state.history, cursor) };
  emitChange();

  return { id: entry.id, value: entry.before };
}

export function applyRedo(): { id: string; value: number } | null {
  if (!state.canRedo) return null;

  const cursor = state.cursor + 1;
  const entry = state.history[cursor];

  state = { history: state.history, cursor, ...computeFlags(state.history, cursor) };
  emitChange();

  return { id: entry.id, value: entry.after };
}

// ==========================================================================
// Hook
// ==========================================================================

export function useUndoHistory(): UndoHistoryState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useUndoHistory;
