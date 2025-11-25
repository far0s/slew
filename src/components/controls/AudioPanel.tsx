/**
 * AudioPanel
 *
 * Control panel for audio input management, device selection,
 * and real-time level visualization. Displays in the Debug column or as a tab.
 */

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { useAudioCapture, useAudioLevels } from "../../inputs/audio";
import styles from "./AudioPanel.module.css";

/**
 * Level meter bar component.
 */
function LevelMeter({
  value,
  label,
  color = "emerald",
}: {
  value: number;
  label: string;
  color?: "emerald" | "amber" | "cyan" | "purple";
}) {
  const clampedValue = Math.max(0, Math.min(1, value));
  const percentage = clampedValue * 100;

  return (
    <div className={styles.levelMeter}>
      <span className={styles.levelLabel}>{label}</span>
      <div className={styles.levelTrack}>
        <div
          className={`${styles.levelBar} ${styles[`levelBar${capitalize(color)}`]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={styles.levelValue}>{percentage.toFixed(0)}%</span>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Beat indicator that flashes on beat detection.
 */
function BeatIndicator({
  beat,
  beatCount,
}: {
  beat: boolean;
  beatCount: number;
}) {
  return (
    <div className={styles.beatIndicator}>
      <span
        className={`${styles.beatDot} ${beat ? styles.beatActive : ""}`}
        aria-label={beat ? "Beat detected" : "No beat"}
      />
      <span className={styles.beatLabel}>
        {beatCount > 0 ? `${beatCount} beats` : "No beats"}
      </span>
    </div>
  );
}

/**
 * Audio levels visualization with RMS, peak, and frequency bands.
 */
function LevelsDisplay() {
  const { rms, peak, bands, beat, beatCount } = useAudioLevels();

  return (
    <div className={styles.levelsDisplay}>
      <div className={styles.levelsSection}>
        <h4 className={styles.levelsSectionTitle}>Amplitude</h4>
        <LevelMeter value={rms} label="RMS" color="emerald" />
        <LevelMeter value={peak} label="Peak" color="amber" />
      </div>

      <div className={styles.levelsSection}>
        <h4 className={styles.levelsSectionTitle}>Frequency Bands</h4>
        <LevelMeter value={bands.bass} label="Bass" color="purple" />
        <LevelMeter value={bands.low_mid} label="Low-Mid" color="cyan" />
        <LevelMeter value={bands.high_mid} label="High-Mid" color="emerald" />
        <LevelMeter value={bands.treble} label="Treble" color="amber" />
      </div>

      <div className={styles.levelsSection}>
        <h4 className={styles.levelsSectionTitle}>Beat Detection</h4>
        <BeatIndicator beat={beat} beatCount={beatCount} />
      </div>
    </div>
  );
}

/**
 * Device selector and capture controls.
 */
function DeviceControls() {
  const {
    devices,
    isRunning,
    deviceName,
    sampleRate,
    error,
    isLoading,
    refresh,
    start,
    stop,
  } = useAudioCapture();
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>(
    undefined,
  );

  const handleToggle = async () => {
    try {
      if (isRunning) {
        await stop();
      } else {
        await start(selectedDevice);
      }
    } catch (e) {
      console.error("[Audio] Capture toggle error:", e);
    }
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedDevice(value === "" ? undefined : value);
  };

  // Find default device for display
  const defaultDevice = devices.find((d) => d.is_default);

  return (
    <div className={styles.deviceControls}>
      <div className={styles.deviceStatus}>
        <span
          className={`${styles.statusDot} ${isRunning ? styles.running : ""}`}
          aria-label={isRunning ? "Capture running" : "Capture stopped"}
        />
        <span className={styles.statusText}>
          {isRunning ? `${deviceName} @ ${sampleRate}Hz` : "Capture stopped"}
        </span>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.deviceForm}>
        <label className={styles.deviceLabel}>
          <span className={styles.deviceLabelText}>Device:</span>
          <select
            value={selectedDevice ?? ""}
            onChange={handleDeviceChange}
            disabled={isRunning || isLoading}
            className={styles.deviceSelect}
            aria-label="Audio input device"
          >
            <option value="">
              {defaultDevice
                ? `Default (${defaultDevice.name})`
                : "Default device"}
            </option>
            {devices.map((device) => (
              <option key={device.name} value={device.name}>
                {device.name}
                {device.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          className={styles.refreshButton}
          aria-label="Refresh device list"
        >
          ↻
        </button>

        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={isLoading}
          className={`${styles.toggleButton} ${isRunning ? styles.stop : styles.start}`}
        >
          {isLoading ? "…" : isRunning ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}

export interface AudioPanelProps {
  /** Optional class name for additional styling */
  className?: string;
}

/**
 * AudioPanel
 *
 * Complete audio input management panel with:
 * - Device selection and capture controls
 * - Real-time level meters (RMS, peak)
 * - Frequency band visualization
 * - Beat detection indicator
 */
export function AudioPanel({ className }: AudioPanelProps) {
  const [deviceOpen, setDeviceOpen] = useState(true);
  const [levelsOpen, setLevelsOpen] = useState(true);
  const { isRunning } = useAudioCapture();

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Audio</h3>
        <span
          className={`${styles.statusBadge} ${isRunning ? styles.active : ""}`}
        >
          {isRunning ? "Capturing" : "Stopped"}
        </span>
      </div>

      <Collapsible.Root open={deviceOpen} onOpenChange={setDeviceOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {deviceOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Device</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <DeviceControls />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={levelsOpen} onOpenChange={setLevelsOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {levelsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Levels</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <LevelsDisplay />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default AudioPanel;
