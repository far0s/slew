/**
 * MidiClockStrip
 *
 * Compact horizontal strip showing MIDI Clock source, live BPM, and sync status.
 * Also provides a phase nudge slider and a MIDI Clock send (master) section.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useMidiClock } from "@/inputs/bpmSource";
import {
  setMidiClockPhaseOffset,
  enableMidiClockOut,
  disableMidiClockOut,
  getMidiClockOutStatus,
  listMidiClockOutPorts,
  type MidiClockOutStatus,
  type MidiDeviceInfo,
} from "@/inputs/bpmSource";
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
  return "locked";
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  no_signal: "No Signal",
  locked: "Locked",
  drifting: "Drifting",
};

// ============================================================================
// Phase nudge slider
// ============================================================================

interface PhaseNudgeProps {
  value: number; // -0.5..0.5
  onChange: (v: number) => void;
}

function PhaseNudge({ value, onChange }: PhaseNudgeProps) {
  const sign = value >= 0 ? "+" : "";
  const label = `${sign}${value.toFixed(2)}`;

  return (
    <div className={styles.nudgeRow}>
      <span className={styles.nudgeLabel}>Phase</span>
      <input
        type="range"
        className={styles.nudgeSlider}
        min={-0.5}
        max={0.5}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-label="MIDI clock phase offset"
        title={`Phase offset: ${label} beats`}
      />
      <span className={styles.nudgeValue}>{label}</span>
      <span className={styles.nudgeUnit}>beats</span>
      {value !== 0 && (
        <button
          type="button"
          className={styles.nudgeReset}
          onClick={() => onChange(0)}
          title="Reset phase offset to 0"
          aria-label="Reset phase offset"
        >
          ↺
        </button>
      )}
    </div>
  );
}

// ============================================================================
// Clock send (master) section
// ============================================================================

interface ClockSendSectionProps {
  outStatus: MidiClockOutStatus;
  onRefresh: () => void;
}

function ClockSendSection({ outStatus, onRefresh }: ClockSendSectionProps) {
  const [showOutSelector, setShowOutSelector] = useState(false);
  const [outPorts, setOutPorts] = useState<MidiDeviceInfo[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [operating, setOperating] = useState(false);

  const openSelector = useCallback(async () => {
    setShowOutSelector((v) => {
      if (v) return false;
      return true;
    });
    setLoadingPorts(true);
    try {
      const ports = await listMidiClockOutPorts();
      setOutPorts(ports);
    } finally {
      setLoadingPorts(false);
    }
  }, []);

  const handleEnable = useCallback(
    async (deviceId: string) => {
      setOperating(true);
      try {
        await enableMidiClockOut(deviceId);
        setShowOutSelector(false);
        onRefresh();
      } finally {
        setOperating(false);
      }
    },
    [onRefresh],
  );

  const handleDisable = useCallback(async () => {
    setOperating(true);
    try {
      await disableMidiClockOut();
      onRefresh();
    } finally {
      setOperating(false);
    }
  }, [onRefresh]);

  return (
    <div className={styles.sendSection}>
      <div className={styles.sendRow}>
        <span className={styles.sendLabel}>↑ Send</span>

        {outStatus.enabled ? (
          <>
            <span
              className={styles.sendDeviceName}
              title={outStatus.device_name ?? undefined}
            >
              {outStatus.device_name ?? outStatus.device_id ?? "Unknown"}
            </span>
            <span className={`${styles.sendBadge} ${styles.sendActive}`}>
              On
            </span>
            <button
              type="button"
              className={styles.sendStopButton}
              onClick={() => void handleDisable()}
              disabled={operating}
              aria-label="Stop MIDI clock send"
            >
              Stop
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.sendSelectButton}
              onClick={() => void openSelector()}
              aria-expanded={showOutSelector}
              aria-label="Select MIDI output for clock send"
            >
              Select output…
              <span className={styles.chevron}>
                {showOutSelector ? "▲" : "▼"}
              </span>
            </button>
            <span className={`${styles.sendBadge} ${styles.sendInactive}`}>
              Off
            </span>
          </>
        )}
      </div>

      {showOutSelector && (
        <div
          className={styles.sendSelectorDropdown}
          role="listbox"
          aria-label="MIDI output ports"
        >
          {loadingPorts ? (
            <p className={styles.selectorLoading}>Scanning…</p>
          ) : outPorts.length === 0 ? (
            <p className={styles.selectorEmpty}>
              No MIDI output devices available
            </p>
          ) : (
            outPorts.map((port) => (
              <button
                key={port.id}
                type="button"
                role="option"
                aria-selected={port.id === outStatus.device_id}
                className={`${styles.selectorOption} ${
                  port.id === outStatus.device_id ? styles.selectorSelected : ""
                }`}
                onClick={() => void handleEnable(port.id)}
                disabled={operating}
              >
                {port.name}
                {port.id === outStatus.device_id && (
                  <span className={styles.selectorCheck}>✓</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MidiClockStrip
// ============================================================================

const DEFAULT_OUT_STATUS: MidiClockOutStatus = {
  enabled: false,
  device_id: null,
  device_name: null,
};

export function MidiClockStrip() {
  const { status, ports, isLoading, connect, disconnect } = useMidiClock();
  const [showSelector, setShowSelector] = useState(false);
  const [operating, setOperating] = useState(false);

  // Phase offset — local optimistic state, synced from status.
  const [phaseOffset, setPhaseOffsetLocal] = useState(status.phase_offset ?? 0);
  const phaseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync phase offset when status updates from backend.
  useEffect(() => {
    setPhaseOffsetLocal(status.phase_offset ?? 0);
  }, [status.phase_offset]);

  // MIDI clock out status.
  const [outStatus, setOutStatus] =
    useState<MidiClockOutStatus>(DEFAULT_OUT_STATUS);

  useEffect(() => {
    getMidiClockOutStatus()
      .then(setOutStatus)
      .catch(() => {});
  }, []);

  const refreshOutStatus = useCallback(() => {
    getMidiClockOutStatus()
      .then(setOutStatus)
      .catch(() => {});
  }, []);

  const syncStatus = deriveSyncStatus(status.is_connected, status.bpm);
  const connectedPort = ports.find((p) => p.id === status.device_id);
  const sourceName =
    connectedPort?.name ?? (status.device_id ? "Unknown" : "Internal");

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

  const handlePhaseChange = useCallback((value: number) => {
    setPhaseOffsetLocal(value);
    // Debounce backend call to avoid flooding on drag.
    if (phaseDebounceRef.current) clearTimeout(phaseDebounceRef.current);
    phaseDebounceRef.current = setTimeout(() => {
      void setMidiClockPhaseOffset(value);
    }, 80);
  }, []);

  return (
    <div className={styles.strip}>
      {/* ── Main row ── */}
      <div className={styles.mainRow}>
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
              <span className={styles.bpmValue}>{status.bpm.toFixed(1)}</span>
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
      </div>

      {/* ── Phase nudge slider (only when connected) ── */}
      {status.is_connected && (
        <PhaseNudge value={phaseOffset} onChange={handlePhaseChange} />
      )}

      {/* ── Clock send (master) section ── */}
      <ClockSendSection outStatus={outStatus} onRefresh={refreshOutStatus} />

      {/* ── Input source selector dropdown ── */}
      {showSelector && (
        <div
          className={styles.selectorDropdown}
          role="listbox"
          aria-label="MIDI clock ports"
        >
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
                className={`${styles.selectorOption} ${
                  port.id === status.device_id ? styles.selectorSelected : ""
                }`}
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
            className={`${styles.selectorOption} ${
              !status.device_id ? styles.selectorSelected : ""
            }`}
            onClick={() => void handleDisconnect()}
            disabled={operating}
            role="option"
            aria-selected={!status.device_id}
          >
            Internal
            {!status.device_id && (
              <span className={styles.selectorCheck}>✓</span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
