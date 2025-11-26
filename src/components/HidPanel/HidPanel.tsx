/**
 * HidPanel
 *
 * Simplified control panel for HID device (DOIO Megalodon Macropad).
 * Shows connection status prominently with auto-connect indicator.
 *
 * Features:
 * - Prominent connection status with auto-connect searching animation
 * - Macropad state display (selected slot, last key/encoder)
 * - Collapsible debug section with events and raw reports
 */

import { useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  useHidDevice,
  useHidEncoderEvents,
  useHidKeyEvents,
  useHidRawReports,
  ENCODER_LABELS,
  type HidKeyEvent,
  type HidEncoderEvent,
} from "../../inputs/hid";
import styles from "./HidPanel.module.css";

/**
 * Connection status display with searching animation.
 */
function ConnectionStatus() {
  const {
    isConnected,
    isSearching,
    connectedDevice,
    error,
    autoConnectEnabled,
    setAutoConnect,
    disconnect,
  } = useHidDevice();

  // Determine status text and style
  let statusText: string;
  let statusClass: string;

  if (isConnected) {
    statusText = connectedDevice?.product ?? "DOIO Megalodon";
    statusClass = styles.connected;
  } else if (isSearching) {
    statusText = "Searching…";
    statusClass = styles.searching;
  } else {
    statusText = "Disconnected";
    statusClass = styles.disconnected;
  }

  return (
    <div className={styles.connectionStatus}>
      <div className={styles.statusRow}>
        <span
          className={`${styles.statusIndicator} ${statusClass}`}
          aria-label={
            isConnected
              ? "Connected"
              : isSearching
                ? "Searching"
                : "Disconnected"
          }
        />
        <span className={styles.statusText}>{statusText}</span>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.connectionActions}>
        <label className={styles.autoConnectLabel}>
          <input
            type="checkbox"
            checked={autoConnectEnabled}
            onChange={(e) => void setAutoConnect(e.target.checked)}
            className={styles.autoConnectCheckbox}
          />
          <span>Auto-connect</span>
        </label>

        {isConnected && (
          <button
            type="button"
            onClick={() => void disconnect()}
            className={styles.disconnectButton}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Display last key and encoder events for quick feedback.
 */
function ActivityDisplay() {
  const { lastEvent: lastEncoder } = useHidEncoderEvents();
  const { lastEvent: lastKey } = useHidKeyEvents();

  return (
    <div className={styles.activityDisplay}>
      <div className={styles.activityItem}>
        <span className={styles.activityLabel}>Last Key</span>
        <span className={styles.activityValue}>
          {lastKey ? formatKeyEvent(lastKey) : "—"}
        </span>
      </div>
      <div className={styles.activityItem}>
        <span className={styles.activityLabel}>Last Encoder</span>
        <span className={styles.activityValue}>
          {lastEncoder ? formatEncoderEvent(lastEncoder) : "—"}
        </span>
      </div>
    </div>
  );
}

function formatKeyEvent(event: HidKeyEvent): string {
  return `${event.key_name} ${event.pressed ? "↓" : "↑"}`;
}

function formatEncoderEvent(event: HidEncoderEvent): string {
  const label =
    ENCODER_LABELS[event.encoder_index] ?? `Encoder ${event.encoder_index}`;
  const direction = event.delta > 0 ? "→" : "←";
  return `${label} ${direction}`;
}

/**
 * Collapsible debug section with events and raw reports.
 */
function DebugSection() {
  const [isOpen, setIsOpen] = useState(false);
  const { events: keyEvents, clear: clearKeys } = useHidKeyEvents();
  const { events: encoderEvents, clear: clearEncoders } = useHidEncoderEvents();
  const { reports: rawReports, clear: clearReports } = useHidRawReports();

  return (
    <Collapsible.Root open={isOpen} onOpenChange={setIsOpen}>
      <Collapsible.Trigger asChild>
        <button type="button" className={styles.debugTrigger}>
          {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <span>Debug</span>
          <span className={styles.debugCount}>
            {keyEvents.length + encoderEvents.length + rawReports.length}
          </span>
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className={styles.debugContent}>
        {/* Key Events */}
        <div className={styles.debugGroup}>
          <div className={styles.debugGroupHeader}>
            <span>Key Events ({keyEvents.length})</span>
            {keyEvents.length > 0 && (
              <button
                type="button"
                onClick={clearKeys}
                className={styles.clearButton}
              >
                Clear
              </button>
            )}
          </div>
          {keyEvents.length === 0 ? (
            <p className={styles.emptyText}>No key events</p>
          ) : (
            <div className={styles.eventList}>
              {keyEvents.slice(0, 10).map((evt, idx) => (
                <div
                  key={`key-${evt.timestamp}-${idx}`}
                  className={styles.eventItem}
                >
                  <span className={styles.eventKey}>{evt.key_name}</span>
                  <span
                    className={
                      evt.pressed ? styles.eventPressed : styles.eventReleased
                    }
                  >
                    {evt.pressed ? "↓" : "↑"}
                  </span>
                  <span className={styles.eventCode}>
                    0x{evt.key_code.toString(16).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Encoder Events */}
        <div className={styles.debugGroup}>
          <div className={styles.debugGroupHeader}>
            <span>Encoder Events ({encoderEvents.length})</span>
            {encoderEvents.length > 0 && (
              <button
                type="button"
                onClick={clearEncoders}
                className={styles.clearButton}
              >
                Clear
              </button>
            )}
          </div>
          {encoderEvents.length === 0 ? (
            <p className={styles.emptyText}>No encoder events</p>
          ) : (
            <div className={styles.eventList}>
              {encoderEvents.slice(0, 10).map((evt, idx) => (
                <div
                  key={`enc-${evt.timestamp}-${idx}`}
                  className={styles.eventItem}
                >
                  <span className={styles.eventEncoder}>
                    {ENCODER_LABELS[evt.encoder_index] ??
                      `Encoder ${evt.encoder_index}`}
                  </span>
                  <span
                    className={
                      evt.delta > 0
                        ? styles.eventPositive
                        : styles.eventNegative
                    }
                  >
                    {evt.delta > 0 ? `+${evt.delta}` : evt.delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Raw Reports */}
        <div className={styles.debugGroup}>
          <div className={styles.debugGroupHeader}>
            <span>Raw Reports ({rawReports.length})</span>
            {rawReports.length > 0 && (
              <button
                type="button"
                onClick={clearReports}
                className={styles.clearButton}
              >
                Clear
              </button>
            )}
          </div>
          {rawReports.length === 0 ? (
            <p className={styles.emptyText}>No raw reports</p>
          ) : (
            <div className={styles.rawReportList}>
              {rawReports.slice(0, 5).map((report, idx) => (
                <div
                  key={`raw-${report.timestamp}-${idx}`}
                  className={styles.rawReportItem}
                >
                  <span className={styles.rawReportSize}>{report.size}B</span>
                  <code className={styles.rawReportHex}>{report.hex}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/**
 * Props for the HidPanel component.
 *
 * @property className - Optional class name for additional styling
 * @property selectedSlotIndex - Currently selected slot from macropad (for display)
 */
export interface HidPanelProps {
  className?: string;
  selectedSlotIndex?: number | null;
}

/**
 * HidPanel
 *
 * Simplified HID device panel with:
 * - Prominent connection status with auto-connect
 * - Activity display showing last events
 * - Collapsible debug section
 */
export function HidPanel({ className, selectedSlotIndex }: HidPanelProps) {
  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Macropad</h3>
        {selectedSlotIndex !== null && selectedSlotIndex !== undefined && (
          <span className={styles.selectedSlot}>
            Slot {selectedSlotIndex + 1}
          </span>
        )}
      </div>

      <ConnectionStatus />
      <ActivityDisplay />
      <DebugSection />
    </div>
  );
}

export default HidPanel;
