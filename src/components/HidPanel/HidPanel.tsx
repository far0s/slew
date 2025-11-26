/**
 * HidPanel
 *
 * Control panel for HID device management (e.g., Megalodon Triple Knob Macropad).
 * Displays device connection status, encoder mappings, and activity.
 */

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  useHidDevice,
  useHidMappings,
  useHidEncoderEvents,
  useHidRawReports,
  ENCODER_LABELS,
  DEFAULT_ENCODER_PARAMS,
  DEFAULT_SENSITIVITY,
  type HidMapping,
} from "../../inputs/hid";
import styles from "./HidPanel.module.css";

/**
 * Activity indicator that pulses on encoder input.
 */
function HidActivityIndicator() {
  const { lastEvent, eventCount } = useHidEncoderEvents();

  const isActive = lastEvent !== null && eventCount > 0;

  return (
    <div className={styles.activityIndicator}>
      <span
        className={`${styles.activityDot} ${isActive ? styles.active : ""}`}
        aria-label={isActive ? "HID activity detected" : "No HID activity"}
      />
      <span className={styles.activityLabel}>
        {isActive ? `${eventCount} events` : "No activity"}
      </span>
    </div>
  );
}

/**
 * Device connection controls.
 */
function DeviceControls() {
  const {
    isConnected,
    connectedDevice,
    devices,
    error,
    isLoading,
    connect,
    disconnect,
    refresh,
  } = useHidDevice();

  const handleConnect = async (path?: string) => {
    try {
      await connect(path);
    } catch (e) {
      console.error("[HID] Connection error:", e);
    }
  };

  const handleConnectAll = async () => {
    try {
      // connect() without a path triggers connect_megalodon which connects all interfaces
      await connect();
    } catch (e) {
      console.error("[HID] Connection error:", e);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (e) {
      console.error("[HID] Disconnect error:", e);
    }
  };

  return (
    <div className={styles.deviceControls}>
      <div className={styles.deviceStatus}>
        <span
          className={`${styles.statusDot} ${isConnected ? styles.connected : ""}`}
          aria-label={isConnected ? "Device connected" : "No device connected"}
        />
        <span className={styles.statusText}>
          {isConnected
            ? `${connectedDevice?.product ?? "DOIO"} (All Interfaces)`
            : "No device connected"}
        </span>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {!isConnected && devices.length > 0 && (
        <div className={styles.interfaceList}>
          <button
            type="button"
            onClick={() => void handleConnectAll()}
            disabled={isLoading}
            className={styles.connectAllButton}
          >
            {isLoading ? "Connecting…" : "Connect All Interfaces (Recommended)"}
          </button>

          <p className={styles.interfaceListLabel}>
            Or connect to a specific interface:
          </p>
          {devices.map((dev, idx) => (
            <button
              key={`${dev.path}-${idx}`}
              type="button"
              onClick={() => void handleConnect(dev.path)}
              disabled={isLoading}
              className={styles.interfaceButton}
            >
              <span className={styles.interfaceName}>
                {dev.interface_description}
              </span>
              <span className={styles.interfaceDetails}>
                iface {dev.interface_number} • 0x
                {dev.usage_page.toString(16).padStart(4, "0")}:0x
                {dev.usage.toString(16).padStart(4, "0")}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.deviceActions}>
        {!isConnected ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className={styles.refreshButton}
            aria-label="Refresh device list"
          >
            {isLoading ? "…" : "⟳ Refresh"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={isLoading}
            className={styles.disconnectButton}
          >
            {isLoading ? "…" : "Disconnect"}
          </button>
        )}
      </div>

      {!isConnected && devices.length === 0 && (
        <p className={styles.hintText}>
          No Megalodon detected. Make sure it's plugged in and click Refresh.
        </p>
      )}
    </div>
  );
}

/**
 * Single encoder mapping row.
 */
function EncoderMappingRow({
  encoderIndex,
  mapping,
  onUpdate,
  onRemove,
}: {
  encoderIndex: number;
  mapping: HidMapping | undefined;
  onUpdate: (mapping: HidMapping) => Promise<void>;
  onRemove: (encoderIndex: number) => Promise<void>;
}) {
  const [parameterId, setParameterId] = useState(
    mapping?.parameter_id ?? DEFAULT_ENCODER_PARAMS[encoderIndex] ?? "",
  );
  const [sensitivity, setSensitivity] = useState(
    mapping?.sensitivity ?? DEFAULT_SENSITIVITY,
  );
  const [inverted, setInverted] = useState(mapping?.inverted ?? false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!parameterId.trim()) return;

    setIsSaving(true);
    try {
      await onUpdate({
        encoder_index: encoderIndex,
        parameter_id: parameterId.trim(),
        sensitivity,
        inverted,
      });
    } catch (e) {
      console.error("[HID] Failed to save mapping:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsSaving(true);
    try {
      await onRemove(encoderIndex);
      setParameterId(DEFAULT_ENCODER_PARAMS[encoderIndex] ?? "");
      setSensitivity(DEFAULT_SENSITIVITY);
      setInverted(false);
    } catch (e) {
      console.error("[HID] Failed to remove mapping:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    !mapping ||
    mapping.parameter_id !== parameterId.trim() ||
    mapping.sensitivity !== sensitivity ||
    mapping.inverted !== inverted;

  return (
    <div className={styles.encoderRow}>
      <div className={styles.encoderHeader}>
        <div className={styles.encoderLabel}>
          <span className={styles.encoderIndex}>{encoderIndex}</span>
          <span className={styles.encoderName}>
            {ENCODER_LABELS[encoderIndex]}
          </span>
        </div>
        <div className={styles.encoderActions}>
          {mapping && (
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={isSaving}
              className={styles.removeButton}
              aria-label="Remove mapping"
            >
              ×
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !parameterId.trim() || !hasChanges}
            className={styles.saveButton}
          >
            {isSaving ? "…" : mapping ? "Update" : "Set"}
          </button>
        </div>
      </div>

      <div className={styles.encoderMapping}>
        <input
          type="text"
          value={parameterId}
          onChange={(e) => setParameterId(e.target.value)}
          placeholder="parameter_id (e.g. crossfade)"
          className={styles.parameterInput}
          aria-label={`Parameter for ${ENCODER_LABELS[encoderIndex]}`}
        />
      </div>

      <div className={styles.encoderOptions}>
        <label className={styles.sensitivityLabel}>
          <span className={styles.sensitivityText}>Speed:</span>
          <input
            type="number"
            value={sensitivity}
            onChange={(e) => setSensitivity(parseFloat(e.target.value) || 0.01)}
            min={0.001}
            max={1}
            step={0.01}
            className={styles.sensitivityInput}
            aria-label="Sensitivity"
          />
        </label>

        <label className={styles.invertedLabel}>
          <input
            type="checkbox"
            checked={inverted}
            onChange={(e) => setInverted(e.target.checked)}
            className={styles.invertedCheckbox}
          />
          <span>Invert</span>
        </label>
      </div>
    </div>
  );
}

/**
 * Encoder mappings section.
 */
function MappingsSection() {
  const {
    mappings,
    isLoading,
    addMapping,
    removeMapping,
    setupDefaults,
    clearAll,
  } = useHidMappings();
  const [isSettingUp, setIsSettingUp] = useState(false);

  const getMappingForEncoder = (index: number) =>
    mappings.find((m) => m.encoder_index === index);

  const handleSetupDefaults = async () => {
    setIsSettingUp(true);
    try {
      await setupDefaults();
    } catch (e) {
      console.error("[HID] Failed to setup defaults:", e);
    } finally {
      setIsSettingUp(false);
    }
  };

  if (isLoading) {
    return <p className={styles.loadingText}>Loading mappings…</p>;
  }

  return (
    <div className={styles.mappingsSection}>
      <div className={styles.encodersList}>
        {[0, 1, 2].map((idx) => (
          <EncoderMappingRow
            key={idx}
            encoderIndex={idx}
            mapping={getMappingForEncoder(idx)}
            onUpdate={addMapping}
            onRemove={removeMapping}
          />
        ))}
      </div>

      <div className={styles.mappingsActions}>
        <button
          type="button"
          onClick={() => void handleSetupDefaults()}
          disabled={isSettingUp}
          className={styles.setupDefaultsButton}
        >
          {isSettingUp ? "…" : "Reset to Defaults"}
        </button>
        <button
          type="button"
          onClick={() => void clearAll()}
          className={styles.clearAllButton}
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

/**
 * Recent encoder events display.
 */
function RecentEvents() {
  const { events, clear } = useHidEncoderEvents();

  if (events.length === 0) {
    return (
      <p className={styles.emptyText}>
        No encoder events yet. Turn a knob on the connected device.
      </p>
    );
  }

  return (
    <div className={styles.recentEvents}>
      <div className={styles.eventsList}>
        {events.map((evt, idx) => (
          <div key={`${evt.timestamp}-${idx}`} className={styles.eventItem}>
            <span className={styles.eventEncoder}>
              {ENCODER_LABELS[evt.encoder_index] ??
                `Encoder ${evt.encoder_index}`}
            </span>
            <span
              className={`${styles.eventDelta} ${evt.delta > 0 ? styles.positive : styles.negative}`}
            >
              {evt.delta > 0 ? `+${evt.delta}` : evt.delta}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={clear}
        className={styles.clearEventsButton}
      >
        Clear
      </button>
    </div>
  );
}

/**
 * Raw HID reports display for debugging.
 */
function RawReports() {
  const { reports, clear } = useHidRawReports();

  if (reports.length === 0) {
    return (
      <p className={styles.emptyText}>
        No raw reports yet. Connect a device and interact with it.
      </p>
    );
  }

  return (
    <div className={styles.rawReports}>
      <div className={styles.rawReportsList}>
        {reports.map((report, idx) => (
          <div
            key={`${report.timestamp}-${idx}`}
            className={styles.rawReportItem}
          >
            <span className={styles.rawReportSize}>{report.size}B</span>
            <span className={styles.rawReportHex}>{report.hex}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={clear}
        className={styles.clearEventsButton}
      >
        Clear
      </button>
    </div>
  );
}

export interface HidPanelProps {
  /** Optional class name for additional styling */
  className?: string;
}

/**
 * HidPanel
 *
 * Complete HID device management panel with:
 * - Activity indicator
 * - Device connection controls
 * - Encoder mappings editor
 * - Recent events display
 */
export function HidPanel({ className }: HidPanelProps) {
  const [deviceOpen, setDeviceOpen] = useState(true);
  const [mappingsOpen, setMappingsOpen] = useState(true);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>HID / Macropad</h3>
        <HidActivityIndicator />
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

      <Collapsible.Root open={mappingsOpen} onOpenChange={setMappingsOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {mappingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Encoder Mappings</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <MappingsSection />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={eventsOpen} onOpenChange={setEventsOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {eventsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Recent Events</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <RecentEvents />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={rawOpen} onOpenChange={setRawOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {rawOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Raw Reports (Debug)</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <RawReports />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default HidPanel;
