/**
 * MidiPanel
 *
 * Control panel for MIDI device management, connection status,
 * mappings overview, and output feedback configuration.
 * Displays in the Debug column or as a tab.
 */

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  useMidiCombinedDevices,
  useMidiMappings,
  isCcMapping,
  isNoteMapping,
  type MidiMapping,
  type NoteMappingMode,
  type MidiCombinedDeviceInfo,
} from "@/inputs/midi";
import { DeviceSchematic } from "./DeviceSchematic";
import { MidiClockStrip } from "./MidiClockStrip";
import { KNOWN_LAYOUTS } from "@/inputs/deviceLayouts";
import styles from "./MidiPanel.module.css";

/**
 * Format a MIDI mapping for display.
 */
function formatMapping(mapping: MidiMapping): string {
  const channel =
    mapping.channel !== null ? `Ch ${mapping.channel + 1}` : "Any Ch";
  if (isCcMapping(mapping)) {
    return `CC ${mapping.cc_number} @ ${channel}`;
  }
  if (isNoteMapping(mapping)) {
    const modeLabel = mapping.note_mode === "trigger" ? "Trigger" : "Velocity";
    return `Note ${mapping.note_number} @ ${channel} (${modeLabel})`;
  }
  return channel;
}

/** Note names for display (C4 = middle C, MIDI note 60). */
const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function noteLabel(note: number): string {
  const name = NOTE_NAMES[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave} (${note})`;
}

/**
 * Single device row in the unified device list.
 */
function DeviceRow({
  device,
  onToggleConnection,
  onToggleFeedback,
  onViewSchematic,
  isConnecting,
}: {
  device: MidiCombinedDeviceInfo;
  onToggleConnection: (deviceName: string, isConnected: boolean) => void;
  onToggleFeedback: (deviceName: string, enabled: boolean) => void;
  onViewSchematic: (deviceName: string) => void;
  isConnecting: boolean;
}) {
  const isConnected = device.inputConnected || device.outputConnected;
  const isBothConnected = device.inputConnected && device.outputConnected;

  // Connection status label
  let statusLabel = "Disconnected";
  if (isBothConnected) {
    statusLabel = "In/Out";
  } else if (device.inputConnected) {
    statusLabel = "Input only";
  } else if (device.outputConnected) {
    statusLabel = "Output only";
  }

  return (
    <div className={styles.deviceItem}>
      <div className={styles.deviceInfo}>
        <span
          className={`${styles.connectionStatus} ${isConnected ? styles.connected : ""}`}
          aria-label={isConnected ? "Connected" : "Disconnected"}
        />
        <div className={styles.deviceDetails}>
          <span className={styles.deviceName} title={device.name}>
            {device.name}
          </span>
          {isConnected && (
            <span className={styles.deviceStatus}>{statusLabel}</span>
          )}
        </div>
      </div>

      <div className={styles.deviceActions}>
        {/* Feedback toggle - only show when connected and has output */}
        {isConnected && device.output && (
          <label
            className={styles.feedbackToggle}
            title="Send CC feedback to this device"
          >
            <input
              type="checkbox"
              checked={device.feedbackEnabled}
              onChange={(e) => onToggleFeedback(device.name, e.target.checked)}
            />
            <span className={styles.feedbackLabel}>Feedback</span>
          </label>
        )}

        <button
          type="button"
          onClick={() => onToggleConnection(device.name, isConnected)}
          disabled={isConnecting}
          className={`${styles.connectButton} ${isConnected ? styles.disconnect : ""}`}
        >
          {isConnecting ? "…" : isConnected ? "Disconnect" : "Connect"}
        </button>
        {isConnected && (
          <button
            type="button"
            onClick={() => onViewSchematic(device.name)}
            className={styles.viewDeviceButton}
            aria-label={`View ${device.name} schematic`}
            title="View device layout"
          >
            ⊞
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Unified device list with connect/disconnect controls.
 */
function DeviceList({
  deviceName,
  onViewSchematic,
}: {
  deviceName?: string;
  onViewSchematic: (name: string) => void;
}) {
  const {
    devices,
    isLoading,
    error,
    autoReconnect,
    connect,
    disconnect,
    setDeviceFeedbackEnabled,
    setAutoReconnect,
    retryWithDelay,
  } = useMidiCombinedDevices();

  const visibleDevices = deviceName
    ? devices.filter((d) => d.name === deviceName)
    : devices;

  const [connectingDevice, setConnectingDevice] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryWithDelay(1500);
    } finally {
      setRetrying(false);
    }
  };

  const handleToggleConnection = async (
    deviceName: string,
    isConnected: boolean,
  ) => {
    setConnectingDevice(deviceName);
    try {
      if (isConnected) {
        await disconnect(deviceName);
      } else {
        await connect(deviceName);
      }
    } catch {
      // UI state already reflects failure
    } finally {
      setConnectingDevice(null);
    }
  };

  const handleToggleFeedback = (deviceName: string, enabled: boolean) => {
    setDeviceFeedbackEnabled(deviceName, enabled);
  };

  if (isLoading && visibleDevices.length === 0) {
    return <p className={styles.loadingText}>Scanning for MIDI devices…</p>;
  }

  if (error) {
    const isMidiInitError =
      error.includes("MIDI support could not be initialized") ||
      error.includes("Failed to create MIDI");
    return (
      <div className={styles.errorBlock}>
        <p className={styles.errorText}>{error}</p>
        {isMidiInitError && (
          <p className={styles.emptyHint}>
            This can happen if the MIDI system hasn't fully initialized. Try
            waiting a moment and retrying.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleRetry()}
          disabled={retrying}
          className={styles.retryButton}
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  if (visibleDevices.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>No MIDI devices detected</p>
        <p className={styles.emptyHint}>
          Devices will appear automatically when connected
        </p>
      </div>
    );
  }

  return (
    <div className={styles.deviceList}>
      {visibleDevices.map((device) => (
        <DeviceRow
          key={device.name}
          device={device}
          onToggleConnection={(name, isConnected) =>
            void handleToggleConnection(name, isConnected)
          }
          onToggleFeedback={handleToggleFeedback}
          onViewSchematic={onViewSchematic}
          isConnecting={connectingDevice === device.name}
        />
      ))}
      <label className={styles.autoReconnectToggle}>
        <input
          type="checkbox"
          checked={autoReconnect}
          onChange={(e) => void setAutoReconnect(e.target.checked)}
        />
        <span>Auto-reconnect devices</span>
      </label>
    </div>
  );
}

/**
 * Mappings list showing MIDI→parameter bindings, optionally scoped to one device.
 * deviceInputId=undefined → show all; null → show any-device mappings only; string → show device + any-device
 */
function MappingsList({ deviceInputId }: { deviceInputId?: string | null }) {
  const { mappings, isLoading, removeMapping, addMapping } = useMidiMappings();

  const visibleMappings =
    deviceInputId !== undefined
      ? mappings.filter(
          (m) => m.device_id === null || m.device_id === deviceInputId,
        )
      : mappings;
  const [removing, setRemoving] = useState<string | null>(null);
  const [togglingMode, setTogglingMode] = useState<string | null>(null);
  const [showAddNote, setShowAddNote] = useState(false);

  const handleRemove = async (parameterId: string) => {
    setRemoving(parameterId);
    try {
      await removeMapping(parameterId);
    } catch {
      // UI state already reflects failure
    } finally {
      setRemoving(null);
    }
  };

  const handleToggleNoteMode = async (mapping: MidiMapping) => {
    if (!isNoteMapping(mapping)) return;
    const newMode: NoteMappingMode =
      mapping.note_mode === "trigger" ? "velocity" : "trigger";
    setTogglingMode(mapping.parameter_id);
    try {
      await addMapping({ ...mapping, note_mode: newMode });
    } catch {
      // UI state already reflects failure
    } finally {
      setTogglingMode(null);
    }
  };

  if (isLoading) {
    return <p className={styles.loadingText}>Loading mappings…</p>;
  }

  return (
    <>
      <div className={styles.mappingsList}>
        {visibleMappings.length === 0 ? (
          <p className={styles.emptyText}>
            No MIDI mappings. Use the Learn button on a parameter to create one.
          </p>
        ) : (
          visibleMappings.map((mapping) => (
            <div key={mapping.parameter_id} className={styles.mappingItem}>
              <div className={styles.mappingInfo}>
                <span className={styles.mappingParameter}>
                  {mapping.parameter_id}
                </span>
                <span className={styles.mappingDetails}>
                  {formatMapping(mapping)}
                </span>
              </div>
              <div className={styles.mappingActions}>
                {isNoteMapping(mapping) && (
                  <button
                    type="button"
                    onClick={() => void handleToggleNoteMode(mapping)}
                    disabled={togglingMode === mapping.parameter_id}
                    className={styles.modeToggleButton}
                    title={`Switch to ${
                      mapping.note_mode === "trigger" ? "velocity" : "trigger"
                    } mode`}
                    aria-label={`Toggle note mode for ${mapping.parameter_id}`}
                  >
                    {togglingMode === mapping.parameter_id
                      ? "…"
                      : mapping.note_mode === "trigger"
                        ? "Trig"
                        : "Vel"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleRemove(mapping.parameter_id)}
                  disabled={removing === mapping.parameter_id}
                  className={styles.removeButton}
                  aria-label={`Remove mapping for ${mapping.parameter_id}`}
                >
                  {removing === mapping.parameter_id ? "…" : "×"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className={styles.addNoteSection}>
        {showAddNote ? (
          <AddNoteMappingForm
            onAdd={async (mapping) => {
              await addMapping(mapping);
              setShowAddNote(false);
            }}
            onCancel={() => setShowAddNote(false)}
          />
        ) : (
          <button
            type="button"
            className={styles.addNoteButton}
            onClick={() => setShowAddNote(true)}
          >
            + Add note mapping
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Form for manually creating a note→parameter mapping without Learn mode.
 */
function AddNoteMappingForm({
  onAdd,
  onCancel,
}: {
  onAdd: (mapping: MidiMapping) => Promise<void>;
  onCancel: () => void;
}) {
  const [parameterId, setParameterId] = useState("");
  const [noteNumber, setNoteNumber] = useState(60);
  const [channel, setChannel] = useState<number | null>(null);
  const [mode, setMode] = useState<NoteMappingMode>("velocity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = parameterId.trim();
    if (!trimmed) {
      setError("Parameter ID is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        parameter_id: trimmed,
        channel,
        note_number: noteNumber,
        note_mode: mode,
        min_value: 0,
        max_value: 1,
        device_id: null,
      });
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <form className={styles.addNoteForm} onSubmit={(e) => void handleSubmit(e)}>
      <div className={styles.addNoteRow}>
        <label className={styles.addNoteLabel} htmlFor="midi-note-param">
          Parameter
        </label>
        <input
          id="midi-note-param"
          type="text"
          className={styles.addNoteInput}
          placeholder="e.g. slot_0_alpha"
          value={parameterId}
          onChange={(e) => setParameterId(e.target.value)}
          autoFocus
        />
      </div>
      <div className={styles.addNoteRow}>
        <label className={styles.addNoteLabel} htmlFor="midi-note-number">
          Note
        </label>
        <select
          id="midi-note-number"
          className={styles.addNoteSelect}
          value={noteNumber}
          onChange={(e) => setNoteNumber(Number(e.target.value))}
        >
          {Array.from({ length: 128 }, (_, i) => (
            <option key={i} value={i}>
              {noteLabel(i)}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.addNoteRow}>
        <label className={styles.addNoteLabel} htmlFor="midi-note-channel">
          Channel
        </label>
        <select
          id="midi-note-channel"
          className={styles.addNoteSelect}
          value={channel ?? ""}
          onChange={(e) =>
            setChannel(e.target.value === "" ? null : Number(e.target.value))
          }
        >
          <option value="">Any</option>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={i}>
              Ch {i + 1}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.addNoteRow}>
        <span className={styles.addNoteLabel}>Mode</span>
        <div className={styles.modeRadioGroup}>
          <label className={styles.modeRadioLabel}>
            <input
              type="radio"
              name="midi-note-mode"
              value="velocity"
              checked={mode === "velocity"}
              onChange={() => setMode("velocity")}
            />
            Velocity
          </label>
          <label className={styles.modeRadioLabel}>
            <input
              type="radio"
              name="midi-note-mode"
              value="trigger"
              checked={mode === "trigger"}
              onChange={() => setMode("trigger")}
            />
            Trigger
          </label>
        </div>
      </div>
      {error && <p className={styles.addNoteError}>{error}</p>}
      <div className={styles.addNoteFooter}>
        <button
          type="button"
          className={styles.addNoteCancelButton}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.addNoteSaveButton}
          disabled={saving}
        >
          {saving ? "Saving…" : "Add mapping"}
        </button>
      </div>
    </form>
  );
}

/**
 * Debug: browse all built-in device schematics without hardware connected.
 */
function SchematicBrowser() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <>
      <Collapsible.Root open={open} onOpenChange={setOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Schematic Browser</span>
            <span className={styles.mappingsBadge}>{KNOWN_LAYOUTS.length}</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <div className={styles.schematicBrowserList}>
            {KNOWN_LAYOUTS.map((layout) => (
              <button
                key={layout.name}
                type="button"
                className={styles.schematicBrowserItem}
                onClick={() => setPreview(layout.name)}
              >
                <span className={styles.schematicBrowserName}>
                  {layout.name}
                </span>
                <span className={styles.schematicBrowserMeta}>
                  {layout.gridCols}×{layout.gridRows} · {layout.controls.length}{" "}
                  controls
                </span>
              </button>
            ))}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

      {preview && (
        <DeviceSchematic
          deviceName={preview}
          mappings={[]}
          inputDeviceId={null}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export interface MidiPanelProps {
  /** Optional class name for additional styling */
  className?: string;
  /** When set, scope the panel to this device name only */
  deviceName?: string;
}

/**
 * MidiPanel
 *
 * Complete MIDI management panel with:
 * - Unified device list with connect/disconnect and per-device feedback toggle
 * - Mappings overview with remove options
 *
 * When `deviceName` is provided, only that device and its mappings are shown.
 */
export function MidiPanel({ className, deviceName }: MidiPanelProps) {
  const [devicesOpen, setDevicesOpen] = useState(true);
  const [mappingsOpen, setMappingsOpen] = useState(true);
  const [schematicDevice, setSchematicDevice] = useState<string | null>(null);
  const { mappings, clearAll } = useMidiMappings();
  const { devices: allDevices } = useMidiCombinedDevices();

  // Derive the MIDI input device ID for scoped mapping filtering
  const scopedDevice = deviceName
    ? allDevices.find((d) => d.name === deviceName)
    : null;
  const scopedInputId = scopedDevice?.input?.id ?? null;

  const visibleMappings =
    deviceName !== undefined
      ? mappings.filter(
          (m) => m.device_id === null || m.device_id === scopedInputId,
        )
      : mappings;

  const handleClearAll = async () => {
    if (mappings.length === 0) return;
    if (!window.confirm("Clear all MIDI mappings?")) return;
    try {
      await clearAll();
    } catch {
      // UI state already reflects failure
    }
  };

  // Resolve the input device id for the schematic modal
  const schematicInputId = schematicDevice
    ? (allDevices.find((d) => d.name === schematicDevice)?.input?.id ?? null)
    : null;

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      {!deviceName && (
        <div className={styles.header}>
          <h3 className={styles.title}>MIDI</h3>
        </div>
      )}

      {/* MIDI Clock strip — always visible */}
      <MidiClockStrip />

      <Collapsible.Root open={devicesOpen} onOpenChange={setDevicesOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {devicesOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Devices</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <DeviceList
            deviceName={deviceName}
            onViewSchematic={(name) => setSchematicDevice(name)}
          />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={mappingsOpen} onOpenChange={setMappingsOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {mappingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>Mappings</span>
              {visibleMappings.length > 0 && (
                <span className={styles.mappingsBadge}>
                  {visibleMappings.length}
                </span>
              )}
            </button>
          </Collapsible.Trigger>
          {!deviceName && visibleMappings.length > 0 && (
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
          <MappingsList
            deviceInputId={deviceName !== undefined ? scopedInputId : undefined}
          />
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Device schematic modal */}
      {schematicDevice && (
        <DeviceSchematic
          deviceName={schematicDevice}
          mappings={mappings}
          inputDeviceId={schematicInputId}
          onClose={() => setSchematicDevice(null)}
        />
      )}

      {/* Debug: schematic browser (no hardware required) */}
      <SchematicBrowser />
    </div>
  );
}

export default MidiPanel;
