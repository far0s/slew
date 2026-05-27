/**
 * MidiClockStrip
 *
 * Compact horizontal strip showing MIDI Clock source, live BPM, and sync status.
 * Displayed at the top of the MIDI Panel when a clock source is active.
 */

import { useState, useCallback } from "react";
import { useMidiClock } from "@/inputs/bpmSource";
import styles from "./MidiClockStrip.module.css";

// ============================================================================
// Sync status derivation
// ============================================================================

type SyncStatus = "no_signal" | "locked" | "drifting";

function deriveSyncStatus(
  isConnected: boolean,
  bpm: number | null,
): SyncStatus {
  if (!isConnected || bpm === null) return "no_signal";
  // Simple heuristic: if we have a BPM, we're locked. Drift detection would
  // require tracking variance over time — left as a future enhancement.
  return "locked";
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  no_signal: "No Signal",
  locked: "Locked",
  drifting: "Drifting",
};

// ============================================================================
// MidiClockStrip
// ============================================================================

export function MidiClockStrip() {
  const { status, ports, isLoading, connect, disconnect } = useMidiClock();
  const [showSelector, setShowSelector] = useState(false);
  const [operating, setOperating] = useState(false);

  const syncStatus = deriveSyncStatus(status.is_connected, status.bpm);

  const connectedPort = ports.find((p) => p.id === status.device_id);
  const sourceName = connectedPort?.name ?? (status.device_id ? "Unknown" : "Internal");

  const handleConnect = useCallback(
    async (deviceId: string) => {
      setOperating(true);
      try {
        await connect(deviceId);
        setShowSelector(false);
      } finally {
        setOperating(false);
      }
    },
    [connect],
  );

  const handleDisconnect = useCallback(async () => {
    setOperating(true);
    try {
      await disconnect();
    } finally {
      setOperating(false);
    }
  }, [disconnect]);

  return (
    <div className={styles.strip}>
      {/* Left: source label */}
      <div className={styles.sourceBlock}>
        <span className={styles.stripLabel}>Clock</span>
        <button
          type="button"
          className={styles.sourceButton}
          onClick={() => setShowSelector((v) => !v)}
          aria-expanded={showSelector}
          aria-label="Change MIDI clock source"
          title={sourceName}
        >
          <span className={styles.sourceName}>{sourceName}</span>
          <span className={styles.chevron}>{showSelector ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Centre: BPM */}
      <div className={styles.bpmBlock}>
        {status.bpm !== null ? (
          <>
            <span className={styles.bpmValue}>
              {status.bpm.toFixed(1)}
            </span>
            <span className={styles.bpmUnit}>BPM</span>
          </>
        ) : (
          <span className={styles.bpmDash}>—</span>
        )}
      </div>

      {/* Right: sync badge + disconnect */}
      <div className={styles.statusBlock}>
        <span
          className={`${styles.syncBadge} ${styles[syncStatus]}`}
          aria-label={`Sync status: ${SYNC_LABELS[syncStatus]}`}
        >
          {SYNC_LABELS[syncStatus]}
        </span>
        {status.is_connected && (
          <button
            type="button"
            className={styles.disconnectButton}
            onClick={() => void handleDisconnect()}
            disabled={operating}
            aria-label="Disconnect MIDI clock"
            title="Disconnect"
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown selector */}
      {showSelector && (
        <div className={styles.selectorDropdown} role="listbox" aria-label="MIDI clock ports">
          {isLoading ? (
            <p className={styles.selectorLoading}>Scanning…</p>
          ) : ports.length === 0 ? (
            <p className={styles.selectorEmpty}>No MIDI devices available</p>
          ) : (
            ports.map((port) => (
              <button
                key={port.id}
                type="button"
                role="option"
                aria-selected={port.id === status.device_id}
                className={`${styles.selectorOption} ${port.id === status.device_id ? styles.selectorSelected : ""}`}
                onClick={() => void handleConnect(port.id)}
                disabled={operating}
              >
                {port.name}
                {port.id === status.device_id && (
                  <span className={styles.selectorCheck}>✓</span>
                )}
              </button>
            ))
          )}
          <button
            type="button"
            className={`${styles.selectorOption} ${!status.device_id ? styles.selectorSelected : ""}`}
            onClick={() => void handleDisconnect()}
            disabled={operating}
            role="option"
            aria-selected={!status.device_id}
          >
            Internal
            {!status.device_id && <span className={styles.selectorCheck}>✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
