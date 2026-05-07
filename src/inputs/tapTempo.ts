/**
 * useTapTempo — Tap tempo BPM calculation hook
 *
 * Records tap timestamps, calculates BPM using weighted average of
 * last N intervals, and auto-resets if tapping stops for 3 seconds.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Constants
// ============================================================================

const TAP_HISTORY_SIZE = 8;   // Max tap intervals to keep
const MIN_TAPS = 2;           // Minimum taps needed to calculate BPM
const RESET_TIMEOUT_MS = 3000; // Reset after 3s of silence
const MIN_BPM = 20;
const MAX_BPM = 300;

// Minimum/maximum interval between taps (ms) — safety guard
const MIN_INTERVAL_MS = 1000 * 60 / MAX_BPM; // ~200ms at 300 BPM
const MAX_INTERVAL_MS = 1000 * 60 / MIN_BPM; // 3000ms at 20 BPM

// ============================================================================
// Module-level tap registration (allows App.tsx to trigger tap globally)
// ============================================================================

let _registeredTap: (() => void) | null = null;

/** Called by the global keyboard handler in App.tsx to fire a tap. */
export function globalTapTempo(): void {
  _registeredTap?.();
}

// ============================================================================
// Module-level BPM broadcast (drives BpmPulseOverlay from any tab)
// ============================================================================

let _bpm: number | null = null;
const _bpmListeners = new Set<(bpm: number | null) => void>();

function notifyBpm(bpm: number | null) {
  _bpm = bpm;
  _bpmListeners.forEach((cb) => cb(bpm));
}

/** Subscribe to BPM changes. Returns an unsubscribe function. */
export function subscribeBpm(cb: (bpm: number | null) => void): () => void {
  _bpmListeners.add(cb);
  cb(_bpm); // fire immediately with current value
  return () => _bpmListeners.delete(cb);
}

/**
 * useBpmBeat — fires a beat callback at the current tap-tempo BPM rate.
 * Mounts permanently (e.g. in App.tsx) to drive visual effects globally.
 */
export function useBpmBeat(onBeat: () => void): void {
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startInterval = (bpm: number) => {
      if (intervalId !== null) clearInterval(intervalId);
      const ms = (60 / bpm) * 1000;
      intervalId = setInterval(() => onBeatRef.current(), ms);
    };

    const stopInterval = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const unsub = subscribeBpm((bpm) => {
      if (bpm !== null) {
        startInterval(bpm);
      } else {
        stopInterval();
      }
    });

    return () => {
      unsub();
      stopInterval();
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

  // Timestamps of each tap (ms)
  const timestampsRef = useRef<number[]>([]);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const reset = useCallback(() => {
    clearResetTimer();
    timestampsRef.current = [];
    setBpm(null);
    setTapCount(0);
    setIsPulsing(false);
    notifyBpm(null);
    // Clear BPM in the modulation engine
    void invoke("set_manual_bpm", { bpm: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearResetTimer();
      if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();
    const timestamps = timestampsRef.current;

    // Check if too long since last tap (manual reset)
    if (
      timestamps.length > 0 &&
      now - timestamps[timestamps.length - 1] > MAX_INTERVAL_MS
    ) {
      timestamps.length = 0;
    }

    timestamps.push(now);

    // Keep only the last TAP_HISTORY_SIZE + 1 timestamps (to get TAP_HISTORY_SIZE intervals)
    if (timestamps.length > TAP_HISTORY_SIZE + 1) {
      timestamps.splice(0, timestamps.length - (TAP_HISTORY_SIZE + 1));
    }

    // Update tap count
    setTapCount(timestamps.length);

    // Trigger pulse
    setIsPulsing(true);
    if (pulseTimerRef.current !== null) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => setIsPulsing(false), 100);

    // Need at least 2 taps to calculate BPM
    if (timestamps.length >= MIN_TAPS) {
      // Calculate intervals between consecutive taps
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

    // Reset auto-clear timer
    clearResetTimer();
    resetTimerRef.current = setTimeout(reset, RESET_TIMEOUT_MS);
  }, [reset]);

  // Register this instance's tap function globally so App.tsx can call it
  useEffect(() => {
    _registeredTap = tap;
    return () => { _registeredTap = null; };
  }, [tap]);

  return { bpm, tapCount, isPulsing, tap, reset };
}
