/**
 * InputsPanel
 *
 * Unified panel listing all input devices (MIDI controllers, OSC server,
 * audio sources, HID controllers) as expandable device cards.
 * Replaces the individual MIDI / OSC / Audio / HID tabs.
 */

import { useState, useCallback } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import { MidiPanel } from "@/components/panels/MidiPanel";
import { OscPanel } from "@/components/panels/OscPanel";
import { AudioPanel } from "@/components/panels/AudioPanel";
import { HidPanel } from "@/components/panels/HidPanel";
import { useInputDevices } from "@/devices/useInputDevices";
import type { InputDevice, InputDeviceType, DeviceStatus } from "@/devices/types";
import type { Slot } from "@/slots/useSlots";
import styles from "./InputsPanel.module.css";

// ============================================================================
// Type labels
// ============================================================================

const DEVICE_TYPE_LABELS: Record<InputDeviceType, string> = {
  midi_controller: "MIDI",
  osc_listener: "OSC",
  audio_source: "Audio",
  hid_device: "HID",
};

// ============================================================================
// Status badge
// ============================================================================

function StatusLabel({ status }: { status: DeviceStatus }) {
  const labels: Record<DeviceStatus, string> = {
    connected: "Connected",
    active: "Active",
    disconnected: "Not connected",
    searching: "Searching…",
    error: "Error",
  };
  return <span className={`${styles.statusLabel} ${styles[`status_${status}`]}`}>{labels[status]}</span>;
}

// ============================================================================
// Device card
// ============================================================================

interface DeviceCardProps {
  device: InputDevice;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function DeviceCard({ device, expanded, onToggle, children }: DeviceCardProps) {
  return (
    <div className={`${styles.deviceCard} ${expanded ? styles.cardExpanded : ""}`}>
      <button
        type="button"
        className={styles.cardHeader}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={styles.deviceTypeLabel}>
          {DEVICE_TYPE_LABELS[device.type]}
        </span>

        <div className={styles.cardInfo}>
          <span className={styles.cardName}>{device.name}</span>
          {device.mappingCount > 0 && (
            <span className={styles.mappingCount}>
              {device.mappingCount} mapping{device.mappingCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <StatusLabel status={device.status} />

        {expanded ? (
          <ChevronDownIcon className={styles.chevron} />
        ) : (
          <ChevronRightIcon className={styles.chevron} />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className={styles.cardBody}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Panel
// ============================================================================

export interface InputsPanelProps {
  slots?: Slot[];
  macropadSelectedIndex?: number | null;
}

export function InputsPanel({ slots, macropadSelectedIndex }: InputsPanelProps) {
  const devices = useInputDevices();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (devices.length === 0) {
    return (
      <div className={styles.emptyState}>No input devices detected.</div>
    );
  }

  return (
    <div className={styles.panel}>
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={device}
          expanded={expandedId === device.id}
          onToggle={() => handleToggle(device.id)}
        >
          {device.type === "midi_controller" && (
            <MidiPanel deviceName={device.name} />
          )}
          {device.type === "osc_listener" && <OscPanel slots={slots} />}
          {device.type === "audio_source" && <AudioPanel slots={slots} />}
          {device.type === "hid_device" && (
            <HidPanel selectedSlotIndex={macropadSelectedIndex} />
          )}
        </DeviceCard>
      ))}
    </div>
  );
}
