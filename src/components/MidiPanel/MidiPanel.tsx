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
  useMidiDevices,
  useMidiMappings,
  useMidiActivity,
  useMidiOutputDevices,
  useMidiOutputConfig,
  type MidiMapping,
} from "../../inputs/midi";
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
 * Activity indicator that pulses on MIDI input.
 */
function MidiActivityIndicator() {
  const { lastMessage, messageCount } = useMidiActivity();

  // Simple activity indicator - shows last message type
  const isActive = lastMessage !== null && messageCount > 0;

  return (
    <div className={styles.activityIndicator}>
      <span
        className={`${styles.activityDot} ${isActive ? styles.active : ""}`}
        aria-label={isActive ? "MIDI activity detected" : "No MIDI activity"}
      />
      <span className={styles.activityLabel}>
        {isActive ? `${messageCount} msgs` : "No activity"}
      </span>
    </div>
  );
}

/**
 * Device list with connect/disconnect controls.
 */
function DeviceList() {
  const {
    devices,
    isLoading,
    error,
    autoReconnect,
    retryWithDelay,
    connect,
    disconnect,
    setAutoReconnect,
  } = useMidiDevices();
  const [connecting, setConnecting] = useState<string | null>(null);
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
    deviceId: string,
    isConnected: boolean,
  ) => {
    setConnecting(deviceId);
    try {
      if (isConnected) {
        await disconnect(deviceId);
      } else {
        await connect(deviceId);
      }
    } catch (e) {
      console.error("[MIDI] Connection error:", e);
    } finally {
      setConnecting(null);
    }
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
        <div key={device.id} className={styles.deviceItem}>
          <div className={styles.deviceInfo}>
            <span
              className={`${styles.connectionStatus} ${device.is_connected ? styles.connected : ""}`}
              aria-label={device.is_connected ? "Connected" : "Disconnected"}
            />
            <span className={styles.deviceName} title={device.name}>
              {device.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              void handleToggleConnection(device.id, device.is_connected)
            }
            disabled={connecting === device.id}
            className={`${styles.connectButton} ${device.is_connected ? styles.disconnect : ""}`}
          >
            {connecting === device.id
              ? "…"
              : device.is_connected
                ? "Disconnect"
                : "Connect"}
          </button>
        </div>
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
 * Output device list with connect/disconnect controls.
 */
function OutputDeviceList() {
  const { devices, isLoading, error, refresh, connect, disconnect } =
    useMidiOutputDevices();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleToggleConnection = async (
    deviceId: string,
    isConnected: boolean,
  ) => {
    setConnecting(deviceId);
    try {
      if (isConnected) {
        await disconnect(deviceId);
      } else {
        await connect(deviceId);
      }
    } catch (e) {
      console.error("[MIDI Output] Connection error:", e);
    } finally {
      setConnecting(null);
    }
  };

  if (isLoading && devices.length === 0) {
    return <p className={styles.loadingText}>Scanning for output devices…</p>;
  }

  if (error) {
    return (
      <div className={styles.errorBlock}>
        <p className={styles.errorText}>{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className={styles.retryButton}
        >
          Retry
        </button>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>No MIDI output devices detected</p>
        <p className={styles.emptyHint}>
          Output devices will appear automatically when connected
        </p>
      </div>
    );
  }

  return (
    <div className={styles.deviceList}>
      {devices.map((device) => (
        <div key={device.id} className={styles.deviceItem}>
          <div className={styles.deviceInfo}>
            <span
              className={`${styles.connectionStatus} ${device.is_connected ? styles.connected : ""}`}
              aria-label={device.is_connected ? "Connected" : "Disconnected"}
            />
            <span className={styles.deviceName} title={device.name}>
              {device.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              void handleToggleConnection(device.id, device.is_connected)
            }
            disabled={connecting === device.id}
            className={`${styles.connectButton} ${device.is_connected ? styles.disconnect : ""}`}
          >
            {connecting === device.id
              ? "…"
              : device.is_connected
                ? "Disconnect"
                : "Connect"}
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Output configuration controls.
 */
function OutputConfig() {
  const { config, isLoading, setFeedbackEnabled } = useMidiOutputConfig();

  if (isLoading) {
    return <p className={styles.loadingText}>Loading config…</p>;
  }

  return (
    <div className={styles.configSection}>
      <label className={styles.autoReconnectToggle}>
        <input
          type="checkbox"
          checked={config.send_cc_feedback}
          onChange={(e) => void setFeedbackEnabled(e.target.checked)}
        />
        <span>Send CC feedback to controllers</span>
      </label>
      <p className={styles.configHint}>
        When enabled, parameter changes are sent back to MIDI controllers via
        their mapped CC numbers.
      </p>
    </div>
  );
}

/**
 * Mappings list showing all current MIDI→parameter bindings.
 */
function MappingsList() {
  const { mappings, isLoading, removeMapping, clearAll } = useMidiMappings();
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRemove = async (parameterId: string) => {
    setRemoving(parameterId);
    try {
      await removeMapping(parameterId);
    } catch (e) {
      console.error("[MIDI] Failed to remove mapping:", e);
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
      <button
        type="button"
        onClick={() => void clearAll()}
        className={styles.clearAllButton}
      >
        Clear All Mappings
      </button>
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
 * - Device list with connect/disconnect
 * - Mappings overview with remove options
 */
export function MidiPanel({ className }: MidiPanelProps) {
  const [devicesOpen, setDevicesOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(true);

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>MIDI</h3>
        <MidiActivityIndicator />
      </div>

      <Collapsible.Root open={devicesOpen} onOpenChange={setDevicesOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {devicesOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Input Devices</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <DeviceList />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={outputOpen} onOpenChange={setOutputOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {outputOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Output / Feedback</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <OutputDeviceList />
          <OutputConfig />
        </Collapsible.Content>
      </Collapsible.Root>

      <Collapsible.Root open={mappingsOpen} onOpenChange={setMappingsOpen}>
        <Collapsible.Trigger asChild>
          <button type="button" className={styles.sectionHeader}>
            {mappingsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <span>Mappings</span>
          </button>
        </Collapsible.Trigger>
        <Collapsible.Content className={styles.sectionContent}>
          <MappingsList />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default MidiPanel;
