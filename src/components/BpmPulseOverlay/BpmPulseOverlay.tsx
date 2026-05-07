/**
 * BpmPulseOverlay
 *
 * A subtle full-window radial gradient that pulses at the tap tempo BPM rate.
 * Mounted permanently in App.tsx — works regardless of which panel is active.
 */

import { useState, useCallback } from "react";
import { useBpmBeat, subscribeBpm } from "../../inputs/tapTempo";
import { useEffect } from "react";
import styles from "./BpmPulseOverlay.module.css";

export function BpmPulseOverlay() {
  const [beatKey, setBeatKey] = useState(0);
  const [hasBpm, setHasBpm] = useState(false);

  // Track whether BPM is active
  useEffect(() => subscribeBpm((bpm) => setHasBpm(bpm !== null)), []);

  const onBeat = useCallback(() => {
    setBeatKey((k) => k + 1);
  }, []);

  useBpmBeat(onBeat);

  if (!hasBpm) return null;

  return (
    <div
      key={beatKey}
      className={styles.overlay}
      aria-hidden="true"
    />
  );
}
