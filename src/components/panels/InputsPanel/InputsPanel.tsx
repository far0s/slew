/**
 * InputsPanel
 *
 * Unified panel listing all input devices (MIDI controllers, OSC server,
 * audio sources, HID controllers) as expandable device cards.
 * Replaces the individual MIDI / OSC / Audio / HID tabs.
 */

import { useState, useCallback } from "react";
import { MidiPanel } from "@/components/panels/MidiPanel";
import { OscPanel } from "@/components/panels/OscPanel";
import { AudioPanel } from "@/components/panels/AudioPanel";
import { HidPanel } from "@/components/panels/HidPanel";
import { useInputDevices } from "@/devices/useInputDevices";
import type { InputDeviceType, DeviceStatus } from "@/devices/types";
import type { Slot } from "@/slots/useSlots";
import { DeviceCard, type DeviceStatusTone } from "@/components/layout/DeviceCard";
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

const STATUS_LABELS: Record<DeviceStatus, string> = {
  connected: "Connected",
  active: "Active",
  disconnected: "Not connected",
  searching: "Searching…",
  error: "Error",
};

const STATUS_TONES: Record<DeviceStatus, DeviceStatusTone> = {
  connected: "success",
  active: "success",
  disconnected: "muted",
  searching: "warning",
  error: "danger",
};

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
          tag={DEVICE_TYPE_LABELS[device.type]}
          name={device.name}
          meta={device.mappingCount > 0 ? `${device.mappingCount} mapping${device.mappingCount !== 1 ? "s" : ""}` : undefined}
          status={STATUS_LABELS[device.status]}
          statusTone={STATUS_TONES[device.status]}
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
