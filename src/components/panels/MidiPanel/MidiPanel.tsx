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
  type MidiMapping,
  type MidiCombinedDeviceInfo,
} from "@/inputs/midi";
import styles from "./MidiPanel.module.css";

/**
 * Format a MIDI mapping for display.
 */
function formatMapping(mapping: MidiMapping): string {
  const channel =
    mapping.channel !== null ? `Ch ${mapping.channel + 1}` : "Any Ch";
  return `CC ${mapping.cc_number} @ ${channel}`;
}

/**
 * Single device row in the unified device list.
 */
function DeviceRow({
  device,
  onToggleConnection,
  onToggleFeedback,
  isConnecting,
}: {
  device: MidiCombinedDeviceInfo;
  onToggleConnection: (deviceName: string, isConnected: boolean) => void;
  onToggleFeedback: (deviceName: string, enabled: boolean) => void;
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
      </div>
    </div>
  );
}

/**
 * Unified device list with connect/disconnect controls.
 */
function DeviceList() {
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

  if (isLoading && devices.length === 0) {
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

  if (devices.length === 0) {
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
      {devices.map((device) => (
        <DeviceRow
          key={device.name}
          device={device}
          onToggleConnection={(name, isConnected) =>
            void handleToggleConnection(name, isConnected)
          }
          onToggleFeedback={handleToggleFeedback}
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
 * Mappings list showing all current MIDI→parameter bindings.
 */
function MappingsList() {
  const { mappings, isLoading, removeMapping } = useMidiMappings();
  const [removing, setRemoving] = useState<string | null>(null);

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

  if (isLoading) {
    return <p className={styles.loadingText}>Loading mappings…</p>;
  }

  if (mappings.length === 0) {
    return (
      <p className={styles.emptyText}>
        No MIDI mappings. Use the Learn button on a parameter to create one.
      </p>
    );
  }

  return (
    <div className={styles.mappingsList}>
      {mappings.map((mapping) => (
        <div key={mapping.parameter_id} className={styles.mappingItem}>
          <div className={styles.mappingInfo}>
            <span className={styles.mappingParameter}>
              {mapping.parameter_id}
            </span>
            <span className={styles.mappingDetails}>
              {formatMapping(mapping)}
            </span>
          </div>
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
      ))}
    </div>
  );
}

export interface MidiPanelProps {
  /** Optional class name for additional styling */
  className?: string;
}

/**
 * MidiPanel
 *
 * Complete MIDI management panel with:
 * - Activity indicator
 * - Unified device list with connect/disconnect and per-device feedback toggle
 * - Mappings overview with remove options
 */
export function MidiPanel({ className }: MidiPanelProps) {
  const [devicesOpen, setDevicesOpen] = useState(true);
  const [mappingsOpen, setMappingsOpen] = useState(true);
  const { mappings, clearAll } = useMidiMappings();

  const handleClearAll = async () => {
    if (mappings.length === 0) return;
    if (!window.confirm("Clear all MIDI mappings?")) return;
    try {
      await clearAll();
    } catch {
      // UI state already reflects failure
    }
  };

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>MIDI</h3>
      </div>

      <Collapsible.Root open={devicesOpen} onOpenChange={setDevicesOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {devicesOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Devices</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <DeviceList />
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
          <MappingsList />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default MidiPanel;
