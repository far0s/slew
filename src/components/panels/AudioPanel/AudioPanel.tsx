/**
 * AudioPanel
 *
 * Control panel for audio input management, device selection,
 * real-time level visualization, and audio → parameter mappings.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import {
  useAudioCapture,
  useAudioLevels,
  useAudioMappings,
  generateMappingId,
  AUDIO_SOURCES,
  AUDIO_SOURCE_LABELS,
  AUDIO_SOURCE_SHORT_LABELS,
  AUDIO_SOURCE_COLORS,
  AUDIO_MAPPING_MODES,
  AUDIO_MAPPING_MODE_LABELS,
  type AudioSource,
  type AudioMapping,
  type AudioMappingMode,
  setBeatSensitivity,
} from "@/inputs/audio";
import {
  useActiveBpmSource,
  useMidiClock,
  useLinkStatus,
  BPM_SOURCE_LABELS,
} from "@/inputs/bpmSource";
import {
  SpectrumAnalyzer,
  type VisualizerMode,
} from "@/components/panels/SpectrumAnalyzer";
import {
  getAllSlotParameterIds,
  getParameterDescriptor,
  getParameterDropdownLabel,
  type ParameterId,
} from "@/slots/slotTypes";
import type { Slot } from "@/slots/useSlots";
import styles from "./AudioPanel.module.css";

/** Spring config for snappy level bar animations */
const levelBarSpring = {
  type: "spring" as const,
  stiffness: 800,
  damping: 35,
  mass: 0.5,
};

/**
 * Level meter bar component with motion animations.
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
        <motion.div
          className={`${styles.levelBar} ${styles[`levelBar${capitalize(color)}`]}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: clampedValue }}
          transition={levelBarSpring}
          style={{ transformOrigin: "left" }}
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
 * Small colored dot indicating the active BPM source.
 */
const BPM_SOURCE_DOT_COLORS: Record<string, string> = {
  microphone: "#6b7280",  // gray
  osc: "#a855f7",          // purple
  midi_clock: "#3b82f6",  // blue
  manual: "#22c55e",       // green
  link: "#f59e0b",         // amber
};

/**
 * Row showing the currently active BPM source with a colored dot.
 */
function BpmSourceRow() {
  const { source: activeSource } = useActiveBpmSource();
  const dotColor = BPM_SOURCE_DOT_COLORS[activeSource] ?? "#6b7280";

  return (
    <div className={styles.bpmSourceRow}>
      <span className={styles.bpmSourceDot} style={{ backgroundColor: dotColor }} />
      <span className={styles.bpmSourceText}>
        {BPM_SOURCE_LABELS[activeSource] ?? activeSource}
      </span>
      <span className={styles.bpmSourceSuffix}>driving BPM</span>
    </div>
  );
}

/**
 * Compact MIDI Clock connection sub-section.
 */
function MidiClockSection() {
  const { status, ports, isLoading, connect, disconnect } = useMidiClock();
  const [selectedPortId, setSelectedPortId] = useState("");

  // Auto-connect when exactly one port is available and nothing is connected
  const autoConnectedRef = useRef(false);
  useEffect(() => {
    if (
      !autoConnectedRef.current &&
      !status.is_connected &&
      !isLoading &&
      ports.length === 1
    ) {
      autoConnectedRef.current = true;
      setSelectedPortId(ports[0].id);
      void connect(ports[0].id);
    }
  }, [ports, status.is_connected, isLoading, connect]);

  return (
    <div className={styles.midiClockSection}>
      <div className={styles.midiClockHeader}>
        <span
          className={`${styles.midiClockDot} ${
            status.is_connected ? styles.midiClockDotActive : ""
          }`}
        />
        <span className={styles.midiClockTitle}>MIDI Clock</span>
        {status.is_connected && status.bpm !== null && (
          <span className={styles.midiClockBpm}>{status.bpm} BPM</span>
        )}
      </div>

      <div className={styles.midiClockControls}>
        <select
          className={styles.midiClockSelect}
          value={status.device_id ?? selectedPortId}
          onChange={(e) => setSelectedPortId(e.target.value)}
          disabled={status.is_connected || isLoading}
          aria-label="MIDI Clock port"
        >
          <option value="">Select port…</option>
          {ports.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {status.is_connected ? (
          <button
            type="button"
            onClick={() => void disconnect()}
            disabled={isLoading}
            className={`${styles.midiClockButton} ${styles.midiClockButtonStop}`}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (selectedPortId) void connect(selectedPortId);
            }}
            className={`${styles.midiClockButton} ${styles.midiClockButtonStart}`}
            disabled={isLoading || ports.length === 0 || !selectedPortId}
          >
            Connect
          </button>
        )}
      </div>

      <p className={styles.midiClockStatus}>
        {status.is_connected
          ? `Connected — ${
              ports.find((p) => p.id === status.device_id)?.name ??
              status.device_id
            }`
          : ports.length === 0
            ? "No MIDI ports available"
            : "Not connected"}
      </p>
    </div>
  );
}

/**
 * Compact Ableton Link enable/disable sub-section.
 */
function AbletonLinkSection() {
  const { status, setEnabled } = useLinkStatus();

  return (
    <div className={styles.midiClockSection}>
      <div className={styles.midiClockHeader}>
        <span
          className={`${styles.midiClockDot} ${
            status.enabled ? styles.midiClockDotActive : ""
          }`}
          style={
            status.enabled
              ? { background: "#f59e0b", boxShadow: "0 0 5px rgb(245 158 11 / 0.5)" }
              : undefined
          }
        />
        <span className={styles.midiClockTitle}>Ableton Link</span>
        {status.enabled && status.bpm !== null && (
          <span className={`${styles.midiClockBpm} ${styles.midiClockBpmLink}`}>
            {status.bpm} BPM
          </span>
        )}
      </div>

      {!status.available ? (
        <p className={styles.midiClockStatus}>Not available in this build</p>
      ) : (
        <>
          <div className={styles.midiClockControls}>
            <button
              type="button"
              onClick={() => void setEnabled(!status.enabled)}
              className={`${styles.midiClockButton} ${
                status.enabled
                  ? styles.midiClockButtonStop
                  : styles.midiClockButtonStart
              }`}
            >
              {status.enabled ? "Disable" : "Enable"}
            </button>
            {status.enabled && (
              <span
                className={styles.midiClockStatus}
                style={{ marginLeft: "auto", fontStyle: "normal" }}
              >
                {status.peer_count === 0
                  ? "No peers"
                  : status.peer_count === 1
                    ? "1 peer"
                    : `${status.peer_count} peers`}
              </span>
            )}
          </div>

          <p className={styles.midiClockStatus}>
            {status.enabled ? "Link session active" : "Link disabled"}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Beat indicator with BPM display.
 */
function BeatIndicator({ beat, bpm }: { beat: boolean; bpm: number | null }) {
  return (
    <div className={styles.beatIndicator}>
      <div className={styles.beatVisual}>
        <span
          className={`${styles.beatDot} ${beat ? styles.beatActive : ""}`}
          aria-label={beat ? "Beat detected" : "No beat"}
        />
        <span
          className={`${styles.beatRing} ${beat ? styles.beatRingActive : ""}`}
        />
      </div>
      <span className={styles.bpmDisplay}>
        {bpm !== null ? (
          <>
            <span className={styles.bpmValue}>{bpm}</span>
            <span className={styles.bpmUnit}>BPM</span>
          </>
        ) : (
          <span className={styles.bpmWaiting}>Detecting…</span>
        )}
      </span>
    </div>
  );
}

/**
 * Audio levels visualization with RMS, peak, and frequency bands.
 */
function LevelsDisplay() {
  const { rms, peak, bands, beat, bpm, levelsRef } = useAudioLevels();
  const [vizMode, setVizMode] = useState<VisualizerMode>("spectrum");
  // 0 = most sensitive, 1 = least sensitive; default 0.4 ≈ threshold 1.5×
  const [sensitivity, setSensitivity] = useState(0.4);

  const handleSensitivityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setSensitivity(val);
      void setBeatSensitivity(val);
    },
    [],
  );

  return (
    <div className={styles.levelsDisplay}>
      {/* Visualizer toggle + canvas */}
      <div className={styles.levelsSection}>
        <div className={styles.levelsVisualizerHeader}>
          <h4 className={styles.levelsSectionTitle}>Visualizer</h4>
          <div className={styles.vizModeToggle}>
            {(["spectrum", "waveform", "both"] as VisualizerMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.vizModeBtn} ${vizMode === m ? styles.vizModeBtnActive : ""}`}
                onClick={() => setVizMode(m)}
              >
                {m === "both" ? "Both" : m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <SpectrumAnalyzer
          levelsRef={levelsRef}
          mode={vizMode}
          height={vizMode === "both" ? 36 : 48}
          className={styles.vizCanvas}
        />
      </div>

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
        <BeatIndicator beat={beat} bpm={bpm} />
        <div className={styles.sensitivityRow}>
          <label className={styles.sensitivityLabel} htmlFor="beat-sensitivity">
            Sensitivity
          </label>
          <input
            id="beat-sensitivity"
            type="range"
            className={styles.formRange}
            min={0}
            max={1}
            step={0.01}
            value={sensitivity}
            onChange={handleSensitivityChange}
          />
          <span className={styles.sensitivityValue}>
            {sensitivity < 0.33
              ? "High"
              : sensitivity < 0.67
                ? "Med"
                : "Low"}
          </span>
        </div>
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
    autoReconnect,
    refresh,
    start,
    stop,
    setAutoReconnect,
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
    } catch {
      // UI state already reflects failure
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

      {error && (
        <div className={styles.errorBlock}>
          <p className={styles.errorText}>{error}</p>
          {autoReconnect && (
            <p className={styles.reconnectHint}>Auto-reconnect is enabled</p>
          )}
        </div>
      )}

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

      <label className={styles.autoReconnectToggle}>
        <input
          type="checkbox"
          checked={autoReconnect}
          onChange={(e) => void setAutoReconnect(e.target.checked)}
        />
        <span>Auto-reconnect on disconnect</span>
      </label>
    </div>
  );
}

/**
 * Colored dot indicator for an audio source.
 */
function SourceColorDot({ source }: { source: AudioSource }) {
  return (
    <span
      className={styles.sourceColorDot}
      style={{ backgroundColor: AUDIO_SOURCE_COLORS[source] }}
      aria-hidden="true"
    />
  );
}

/**
 * Single mapping row with enable/disable, edit, and delete.
 */
function MappingRow({
  mapping,
  onToggle,
  onEdit,
  onDelete,
}: {
  mapping: AudioMapping;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (mapping: AudioMapping) => void;
  onDelete: (id: string) => void;
}) {
  const paramLabel = getParameterDropdownLabel(
    mapping.parameter_id as ParameterId,
  );

  return (
    <div
      className={`${styles.mappingRow} ${!mapping.enabled ? styles.mappingDisabled : ""}`}
    >
      <button
        type="button"
        onClick={() => onToggle(mapping.id, !mapping.enabled)}
        className={`${styles.mappingToggle} ${mapping.enabled ? styles.enabled : ""}`}
        aria-label={mapping.enabled ? "Disable mapping" : "Enable mapping"}
      >
        {mapping.enabled ? "●" : "○"}
      </button>

      <button
        type="button"
        onClick={() => onEdit(mapping)}
        className={styles.mappingInfo}
        aria-label="Edit mapping"
      >
        <SourceColorDot source={mapping.source} />
        <span
          className={styles.mappingSource}
          style={{ color: AUDIO_SOURCE_COLORS[mapping.source] }}
        >
          {AUDIO_SOURCE_SHORT_LABELS[mapping.source]}
        </span>
        <span className={styles.mappingArrow}>→</span>
        <span className={styles.mappingTarget}>{paramLabel}</span>
        {mapping.mode !== "continuous" && (
          <span className={styles.mappingMode}>
            ({AUDIO_MAPPING_MODE_LABELS[mapping.mode]})
          </span>
        )}
      </button>

      <div className={styles.mappingRange}>
        {mapping.min_output.toFixed(2)} – {mapping.max_output.toFixed(2)}
      </div>

      <button
        type="button"
        onClick={() => onDelete(mapping.id)}
        className={styles.mappingDelete}
        aria-label="Delete mapping"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * Form to create or edit an audio mapping.
 */
function MappingForm({
  editingMapping,
  slots,
  onSave,
  onCancel,
}: {
  editingMapping: AudioMapping | null;
  slots: Slot[];
  onSave: (mapping: AudioMapping) => void;
  onCancel: () => void;
}) {
  const isEditing = editingMapping !== null;

  const [source, setSource] = useState<AudioSource>(
    editingMapping?.source ?? "bass",
  );
  const [parameterId, setParameterId] = useState<string>(
    editingMapping?.parameter_id ?? "",
  );
  const [mode, setMode] = useState<AudioMappingMode>(
    editingMapping?.mode ?? "continuous",
  );
  const [minOutput, setMinOutput] = useState(editingMapping?.min_output ?? 0);
  const [maxOutput, setMaxOutput] = useState(editingMapping?.max_output ?? 1);
  const [smoothing, setSmoothing] = useState(editingMapping?.smoothing ?? 0.3);

  // Get parameter IDs only for active slots (filter out empty slots)
  const allParameterIds = useMemo(
    () =>
      getAllSlotParameterIds(
        slots
          .filter((s) => s.sketchId !== null)
          .map((s) => ({ index: s.index, sketchId: s.sketchId as string })),
      ),
    [slots],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!parameterId) {
      return;
    }

    const mapping: AudioMapping = {
      id: editingMapping?.id ?? generateMappingId(),
      source,
      parameter_id: parameterId,
      min_input: 0,
      max_input: 1,
      min_output: minOutput,
      max_output: maxOutput,
      mode,
      smoothing,
      enabled: editingMapping?.enabled ?? true,
    };

    onSave(mapping);
  };

  // Get parameter descriptor for range hints
  const selectedParamDescriptor = parameterId
    ? getParameterDescriptor(parameterId as ParameterId)
    : null;

  // Auto-fill output range from parameter descriptor (only when adding new)
  const handleParameterChange = (newParamId: string) => {
    setParameterId(newParamId);
    if (!isEditing) {
      const desc = getParameterDescriptor(newParamId as ParameterId);
      if (desc) {
        if (source === "beat") {
          setMode("trigger");
          setMinOutput(0);
          setMaxOutput(desc.max);
        } else {
          setMinOutput(desc.min);
          setMaxOutput(desc.max);
        }
      }
    }
  };

  // Apply smart defaults when switching to "beat" source
  const handleSourceChange = (newSource: AudioSource) => {
    setSource(newSource);
    if (newSource === "beat") {
      setMode("trigger");
      if (parameterId) {
        const desc = getParameterDescriptor(parameterId as ParameterId);
        if (desc) {
          setMinOutput(0);
          setMaxOutput(desc.max);
        }
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.newMappingForm}>
      <div className={styles.formHeader}>
        {isEditing ? "Edit Mapping" : "New Mapping"}
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Source:</span>
          <div className={styles.sourceSelectWrapper}>
            <SourceColorDot source={source} />
            <select
              value={source}
              onChange={(e) => handleSourceChange(e.target.value as AudioSource)}
              className={styles.formSelect}
            >
              {AUDIO_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {AUDIO_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Parameter:</span>
          <select
            value={parameterId}
            onChange={(e) => handleParameterChange(e.target.value)}
            className={styles.formSelect}
            required
          >
            <option value="">Select parameter…</option>
            {allParameterIds.map((id) => (
              <option key={id} value={id}>
                {getParameterDropdownLabel(id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Mode:</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AudioMappingMode)}
            className={styles.formSelect}
          >
            {AUDIO_MAPPING_MODES.map((m) => (
              <option key={m} value={m}>
                {AUDIO_MAPPING_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Output Range:</span>
          <div className={styles.rangeInputs}>
            <input
              type="number"
              value={minOutput}
              onChange={(e) => setMinOutput(parseFloat(e.target.value) || 0)}
              step={selectedParamDescriptor?.step ?? 0.01}
              className={styles.formInput}
              aria-label="Minimum output"
            />
            <span className={styles.rangeSeparator}>–</span>
            <input
              type="number"
              value={maxOutput}
              onChange={(e) => setMaxOutput(parseFloat(e.target.value) || 1)}
              step={selectedParamDescriptor?.step ?? 0.01}
              className={styles.formInput}
              aria-label="Maximum output"
            />
          </div>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Smoothing: {(smoothing * 100).toFixed(0)}%
          </span>
          <input
            type="range"
            min={0}
            max={0.95}
            step={0.05}
            value={smoothing}
            onChange={(e) => setSmoothing(parseFloat(e.target.value))}
            className={styles.formRange}
          />
        </label>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          onClick={onCancel}
          className={styles.cancelButton}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!parameterId}
          className={styles.submitButton}
        >
          {isEditing ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}

/**
 * Audio mappings management section.
 */
interface MappingsSectionProps {
  slots: Slot[];
}

function MappingsSection({ slots }: MappingsSectionProps) {
  const { mappings, add, remove, setEnabled } = useAudioMappings();
  const [editingMapping, setEditingMapping] = useState<AudioMapping | null>(
    null,
  );

  const handleSave = async (mapping: AudioMapping) => {
    try {
      await add(mapping);
      setEditingMapping(null);
    } catch {
      // UI state already reflects failure
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch {
      // UI state already reflects failure
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await setEnabled(id, enabled);
    } catch {
      // UI state already reflects failure
    }
  };

  // Show form if editing
  if (editingMapping !== null) {
    return (
      <div className={styles.mappingsSection}>
        <MappingForm
          editingMapping={editingMapping}
          slots={slots}
          onSave={handleSave}
          onCancel={() => setEditingMapping(null)}
        />
      </div>
    );
  }

  return (
    <div className={styles.mappingsSection}>
      {mappings.length > 0 ? (
        <div className={styles.mappingsList}>
          {mappings.map((mapping) => (
            <MappingRow
              key={mapping.id}
              mapping={mapping}
              onToggle={handleToggle}
              onEdit={setEditingMapping}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <p className={styles.noMappings}>
          No mappings. Add one to make parameters react to audio.
        </p>
      )}
    </div>
  );
}

export interface AudioPanelProps {
  /** Optional class name for additional styling */
  className?: string;
  /** Active slots for parameter filtering */
  slots?: Slot[];
}

/**
 * AudioPanel
 *
 * Complete audio input management panel with:
 * - Device selection and capture controls
 * - Real-time level meters (RMS, peak)
 * - Frequency band visualization
 * - Beat detection with BPM
 * - Audio → parameter mappings
 */
export function AudioPanel({ className, slots = [] }: AudioPanelProps) {
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const { isRunning } = useAudioCapture();
  const { mappings, add, clear } = useAudioMappings();

  const handleClearAll = async () => {
    if (mappings.length === 0) return;
    try {
      await clear();
    } catch {
      // UI state already reflects failure
    }
  };

  const handleAddMapping = async (mapping: AudioMapping) => {
    try {
      await add(mapping);
      setShowAddForm(false);
    } catch {
      // UI state already reflects failure
    }
  };

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

      <div className={styles.sectionContent}>
        <BpmSourceRow />
        <MidiClockSection />
        <AbletonLinkSection />
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

      <Collapsible.Root open={mappingsOpen} onOpenChange={setMappingsOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {mappingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>Mappings</span>
              {mappings.length > 0 && (
                <span className={styles.mappingsBadge}>{mappings.length}</span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddForm(true);
              setMappingsOpen(true);
            }}
            className={styles.headerAddButton}
            aria-label="Add mapping"
          >
            + Add
          </button>
          {mappings.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleClearAll();
              }}
              className={styles.clearButton}
              aria-label="Clear all mappings"
            >
              Clear All
            </button>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          {showAddForm ? (
            <div className={styles.mappingsSection}>
              <MappingForm
                editingMapping={null}
                slots={slots}
                onSave={handleAddMapping}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          ) : (
            <MappingsSection slots={slots} />
          )}
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default AudioPanel;
