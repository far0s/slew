/**
 * useTapTempo — Tap tempo BPM calculation hook
 *
 * Records tap timestamps, calculates BPM using weighted average of
 * last N intervals. BPM only clears via explicit reset().
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Constants
// ============================================================================

const TAP_HISTORY_SIZE = 8; // Max tap intervals to keep
const MIN_TAPS = 2;         // Minimum taps needed to calculate BPM
const MIN_BPM = 20;
const MAX_BPM = 300;

// Minimum/maximum interval between taps (ms) — safety guard
const MIN_INTERVAL_MS = (1000 * 60) / MAX_BPM; // ~200ms at 300 BPM
const MAX_INTERVAL_MS = (1000 * 60) / MIN_BPM; // 3000ms at 20 BPM

// ============================================================================
// Tap keyboard shortcut — persisted to localStorage
// ============================================================================

const SHORTCUT_STORAGE_KEY = "slew:tapShortcut";

export interface TapShortcut {
  /** The key value from KeyboardEvent.key */
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const DEFAULT_SHORTCUT: TapShortcut = {
  key: " ",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

function loadShortcut(): TapShortcut {
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as TapShortcut;
  } catch {
    // ignore
  }
  return DEFAULT_SHORTCUT;
}

let _tapShortcut: TapShortcut = loadShortcut();
const _shortcutListeners = new Set<(s: TapShortcut) => void>();

/** Returns the current tap keyboard shortcut. */
export function getTapShortcut(): TapShortcut {
  return _tapShortcut;
}

/** Returns true if the shortcut is the default (Space, no modifiers). */
export function isTapShortcutDefault(): boolean {
  const s = _tapShortcut;
  return (
    s.key === " " &&
    !s.ctrlKey &&
    !s.metaKey &&
    !s.altKey &&
    !s.shiftKey
  );
}

/** Formats a TapShortcut for display, e.g. "Ctrl+B" or "Space". */
export function formatTapShortcut(s: TapShortcut): string {
  const parts: string[] = [];
  if (s.ctrlKey) parts.push("Ctrl");
  if (s.metaKey) parts.push("⌘");
  if (s.altKey) parts.push("Alt");
  if (s.shiftKey) parts.push("Shift");
  const key = s.key === " " ? "Space" : s.key.length === 1 ? s.key.toUpperCase() : s.key;
  parts.push(key);
  return parts.join("+");
}

/** Set a new tap shortcut and persist it. */
export function setTapShortcut(shortcut: TapShortcut): void {
  _tapShortcut = shortcut;
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcut));
  } catch {
    // ignore
  }
  _shortcutListeners.forEach((cb) => cb(shortcut));
}

/** Reset to the default Space shortcut. */
export function resetTapShortcut(): void {
  setTapShortcut(DEFAULT_SHORTCUT);
}

/** Subscribe to shortcut changes. Returns an unsubscribe function. */
export function subscribeTapShortcut(cb: (s: TapShortcut) => void): () => void {
  _shortcutListeners.add(cb);
  cb(_tapShortcut);
  return () => _shortcutListeners.delete(cb);
}

/** Returns true if a KeyboardEvent matches the current tap shortcut. */
export function matchesTapShortcut(e: KeyboardEvent): boolean {
  const s = _tapShortcut;
  return (
    e.key === s.key &&
    e.ctrlKey === s.ctrlKey &&
    e.metaKey === s.metaKey &&
    e.altKey === s.altKey &&
    e.shiftKey === s.shiftKey
  );
}

// ============================================================================
// Module-level tap registration (allows App.tsx to trigger tap globally)
// ============================================================================

let _registeredTap: (() => void) | null = null;

/** Called by the global keyboard handler in App.tsx to fire a tap. */
export function globalTapTempo(): void {
  _registeredTap?.();
}

// ============================================================================
// Module-level BPM broadcast + tap-beat broadcast
// ============================================================================

let _bpm: number | null = null;
const _bpmListeners = new Set<(bpm: number | null) => void>();
const _tapListeners = new Set<() => void>();

function notifyBpm(bpm: number | null) {
  _bpm = bpm;
  _bpmListeners.forEach((cb) => cb(bpm));
}

function notifyTap() {
  _tapListeners.forEach((cb) => cb());
}

/** Subscribe to BPM changes. Returns an unsubscribe function. */
export function subscribeBpm(cb: (bpm: number | null) => void): () => void {
  _bpmListeners.add(cb);
  cb(_bpm); // fire immediately with current value
  return () => _bpmListeners.delete(cb);
}

/**
 * useBpmBeat — fires onBeat immediately on each tap, then reschedules
 * the next beat at the BPM interval from that tap. If no new tap arrives
 * before the interval elapses, fires automatically (metronome mode).
 * Phase-locks to the most recent tap.
 */
export function useBpmBeat(onBeat: () => void): void {
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearNext = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    // Schedule the next auto-beat using current _bpm
    const scheduleNext = () => {
      clearNext();
      if (_bpm === null) return;
      const ms = (60 / _bpm) * 1000;
      timeoutId = setTimeout(() => {
        onBeatRef.current();
        void invoke("notify_beat");
        scheduleNext(); // keep going
      }, ms);
    };

    // On each tap: fire beat immediately + reset timer from now
    const onTap = () => {
      onBeatRef.current();
      scheduleNext();
    };

    // On BPM cleared: stop
    const unsubBpm = subscribeBpm((bpm) => {
      if (bpm === null) clearNext();
      // When BPM changes mid-tap-sequence the next tap will reschedule anyway
    });

    _tapListeners.add(onTap);

    return () => {
      _tapListeners.delete(onTap);
      unsubBpm();
      clearNext();
    };
  }, []);
}

// ============================================================================
// Weighted average helper
// ============================================================================

/** Compute weighted mean of intervals — more recent taps have higher weight. */
function weightedAvgInterval(intervals: number[]): number {
  let weightSum = 0;
  let valueSum = 0;
  for (let i = 0; i < intervals.length; i++) {
    const weight = i + 1; // weight 1..N, most recent = highest
    weightSum += weight;
    valueSum += intervals[i] * weight;
  }
  return valueSum / weightSum;
}

// ============================================================================
// Hook
// ============================================================================

export interface TapTempoState {
  /** Current tapped BPM (null if fewer than 2 taps recorded) */
  bpm: number | null;
  /** Number of taps recorded in the current sequence */
  tapCount: number;
  /** True for one frame after each tap — for visual pulse feedback */
  isPulsing: boolean;
  /** Record a tap — call on button press */
  tap: () => void;
  /** Reset all tap history and clear BPM */
  reset: () => void;
}

export function useTapTempo(): TapTempoState {
  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);

  const timestampsRef = useRef<number[]>([]);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    timestampsRef.current = [];
    setBpm(null);
    setTapCount(0);
    setIsPulsing(false);
    notifyBpm(null);
    void invoke("set_manual_bpm", { bpm: null });
  }, []);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  // Keep hook state in sync with any external notifyBpm call (e.g. scroll-nudge)
  useEffect(() => {
    return subscribeBpm((newBpm) => {
      setBpm(newBpm);
    });
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();
    const timestamps = timestampsRef.current;

    // If the gap since last tap exceeds MAX_INTERVAL, start fresh
    if (
      timestamps.length > 0 &&
      now - timestamps[timestamps.length - 1] > MAX_INTERVAL_MS
    ) {
      timestamps.length = 0;
    }

    timestamps.push(now);

    if (timestamps.length > TAP_HISTORY_SIZE + 1) {
      timestamps.splice(0, timestamps.length - (TAP_HISTORY_SIZE + 1));
    }

    setTapCount(timestamps.length);

    // Button pulse
    setIsPulsing(true);
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setIsPulsing(false), 100);

    // Calculate BPM once we have at least 2 taps
    if (timestamps.length >= MIN_TAPS) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        const interval = timestamps[i] - timestamps[i - 1];
        if (interval >= MIN_INTERVAL_MS && interval <= MAX_INTERVAL_MS) {
          intervals.push(interval);
        }
      }
      if (intervals.length > 0) {
        const avgInterval = weightedAvgInterval(intervals);
        const calculatedBpm = Math.round(60000 / avgInterval);
        const clampedBpm = Math.max(MIN_BPM, Math.min(MAX_BPM, calculatedBpm));
        setBpm(clampedBpm);
        notifyBpm(clampedBpm);
        void invoke("set_manual_bpm", { bpm: clampedBpm });
      }
    }

    // Notify beat listeners (fires overlay pulse + reschedules metronome)
    notifyTap();
  }, []);

  // Register globally for App.tsx keyboard shortcut
  useEffect(() => {
    _registeredTap = tap;
    return () => {
      _registeredTap = null;
    };
  }, [tap]);

  return { bpm, tapCount, isPulsing, tap, reset };
}

/**
 * Directly set BPM from an external input (e.g. typed value or ÷2/×2 buttons).
 * Clears tap history so the new value wins cleanly, then notifies all listeners
 * and fires a beat-phase resync (same as a manual tap at time=now).
 */
export function setManualBpmDirect(bpm: number): void {
  const clamped = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
  notifyBpm(clamped);
  void invoke("set_manual_bpm", { bpm: clamped });
  notifyTap(); // snap phase to now
}

/**
 * Resync beat phase to now without changing BPM.
 * If no BPM is active this is a no-op.
 */
export function resyncBeatPhase(): void {
  if (_bpm === null) return;
  void invoke("set_manual_bpm", { bpm: _bpm });
  notifyTap();
}
