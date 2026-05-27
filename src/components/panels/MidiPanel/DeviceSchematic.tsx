/**
 * DeviceSchematic
 *
 * Modal overlay showing a top-down physical layout of a MIDI controller.
 * Each control is highlighted green (has a mapping) or grey (no mapping).
 * Clicking a control shows a popover with mapping info.
 */

import { useState, useEffect, useRef } from "react";
import type { MidiMapping } from "@/inputs/midi";
import {
  findLayout,
  buildGenericLayout,
  type ControlDef,
  type DeviceLayout,
} from "@/inputs/deviceLayouts";
import styles from "./DeviceSchematic.module.css";

// ============================================================================
// Helpers
// ============================================================================

function controlKey(c: ControlDef): string {
  if (c.cc !== undefined) return `cc:${c.cc}:${c.channel ?? "any"}`;
  if (c.note !== undefined) return `note:${c.note}:${c.channel ?? "any"}`;
  return `${c.col}:${c.row}`;
}

function mappingsForControl(
  control: ControlDef,
  mappings: MidiMapping[],
): MidiMapping[] {
  return mappings.filter((m) => {
    const ccMatch =
      control.cc !== undefined &&
      m.cc_number === control.cc &&
      (m.channel === null ||
        control.channel === null ||
        m.channel === control.channel);
    const noteMatch =
      control.note !== undefined &&
      m.note_number === control.note &&
      (m.channel === null ||
        control.channel === null ||
        m.channel === control.channel);
    return ccMatch || noteMatch;
  });
}

// ============================================================================
// ControlCell
// ============================================================================

function ControlCell({
  control,
  mappings,
  cellSize,
}: {
  control: ControlDef;
  mappings: MidiMapping[];
  cellSize: number;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const hasMappings = mappings.length > 0;

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPopover]);

  const kindClass =
    control.kind === "knob"
      ? styles.knob
      : control.kind === "fader"
        ? styles.fader
        : control.kind === "pad"
          ? styles.pad
          : styles.btn;

  return (
    <button
      ref={ref}
      type="button"
      className={`${styles.cell} ${kindClass} ${hasMappings ? styles.mapped : ""}`}
      style={{
        gridColumn: `${control.col + 1} / span ${control.colSpan ?? 1}`,
        gridRow: `${control.row + 1} / span ${control.rowSpan ?? 1}`,
        width: cellSize - 4,
        height: cellSize - 4,
      }}
      title={control.label}
      aria-label={control.label}
      aria-pressed={showPopover}
      onClick={() => setShowPopover((v) => !v)}
    >
      {control.kind === "knob" && <span className={styles.knobDot} />}
      {control.kind === "fader" && <span className={styles.faderTrack} />}

      {showPopover && (
        <div className={styles.popover} role="tooltip">
          <p className={styles.popoverLabel}>{control.label}</p>
          {hasMappings ? (
            <ul className={styles.popoverMappings}>
              {mappings.map((m) => (
                <li key={m.parameter_id} className={styles.popoverMapping}>
                  <span className={styles.popoverParam}>{m.parameter_id}</span>
                  <span className={styles.popoverRange}>
                    {m.min_value}–{m.max_value}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.popoverEmpty}>No mapping</p>
          )}
        </div>
      )}
    </button>
  );
}

// ============================================================================
// SchematicGrid
// ============================================================================

const CELL_SIZE = 36;
const CELL_SIZE_SMALL = 26;

function SchematicGrid({
  layout,
  mappings,
}: {
  layout: DeviceLayout;
  mappings: MidiMapping[];
}) {
  const cellSize = layout.gridCols > 8 ? CELL_SIZE_SMALL : CELL_SIZE;

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${layout.gridCols}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${layout.gridRows}, ${cellSize}px)`,
      }}
      role="group"
      aria-label={`${layout.name} schematic`}
    >
      {layout.controls.map((control) => {
        const ctrlMappings = mappingsForControl(control, mappings);
        return (
          <ControlCell
            key={controlKey(control)}
            control={control}
            mappings={ctrlMappings}
            cellSize={cellSize}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// DeviceSchematic (modal)
// ============================================================================

export interface DeviceSchematicProps {
  /** MIDI port name (used to resolve layout) */
  deviceName: string;
  /** All active MIDI mappings (will be filtered to this device) */
  mappings: MidiMapping[];
  /** Input device id for filtering device-specific mappings */
  inputDeviceId: string | null;
  /** CC numbers seen from this device (used for generic fallback layout) */
  seenCcs?: number[];
  onClose: () => void;
}

export function DeviceSchematic({
  deviceName,
  mappings,
  inputDeviceId,
  seenCcs,
  onClose,
}: DeviceSchematicProps) {
  const layout: DeviceLayout =
    findLayout(deviceName) ??
    buildGenericLayout(deviceName, seenCcs ?? []);

  const isGeneric = !findLayout(deviceName);

  // Filter mappings to this device (device-specific + any-device)
  const deviceMappings = mappings.filter(
    (m) => m.device_id === null || m.device_id === inputDeviceId,
  );

  const mappedCount = layout.controls.filter(
    (c) => mappingsForControl(c, deviceMappings).length > 0,
  ).length;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${deviceName} schematic`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{deviceName}</h2>
            {isGeneric && (
              <p className={styles.genericNote}>
                No layout definition — showing auto-generated grid
              </p>
            )}
          </div>
          <div className={styles.modalMeta}>
            <span className={styles.mappedBadge}>
              {mappedCount} / {layout.controls.length} mapped
            </span>
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Close schematic"
            >
              ×
            </button>
          </div>
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendMapped}`} />
            Mapped
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.legendUnmapped}`} />
            Unmapped
          </span>
        </div>

        <div className={styles.gridScroll}>
          {layout.controls.length === 0 ? (
            <p className={styles.noControls}>
              No controls detected yet. Send MIDI from this device to populate
              the grid.
            </p>
          ) : (
            <SchematicGrid layout={layout} mappings={deviceMappings} />
          )}
        </div>
      </div>
    </div>
  );
}
