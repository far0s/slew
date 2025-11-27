import { useCallback } from "react";
import { CopyIcon, PlusIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";

import type { SketchId, SketchDescriptor } from "../../sketches";
import { SKETCH_REGISTRY, getSketchDescriptor } from "../../sketches";
import type { Slot } from "../../scenes/useSceneSlots";
import styles from "./SketchBrowser.module.css";

/**
 * Props for the SketchBrowser component.
 *
 * @property slots - Current slots (for "copy from" feature)
 * @property onSelectSketch - Callback when a sketch is selected to create a new slot
 * @property onCopySlot - Callback to copy an existing slot
 */
export interface SketchBrowserProps {
  slots: Slot[];
  onSelectSketch: (sketchId: SketchId) => void;
  onCopySlot: (sourceSlotIndex: number) => void;
}

/**
 * SketchListItem
 *
 * A single sketch option in the browser list.
 * Shows label and description.
 */
function SketchListItem({
  descriptor,
  onClick,
}: {
  descriptor: SketchDescriptor;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.sketchItem}
      onClick={onClick}
      aria-label={`Add new slot with ${descriptor.label}`}
    >
      <PlusIcon className={styles.sketchItemIcon} />
      <div className={styles.sketchItemInfo}>
        <span className={styles.sketchItemLabel}>{descriptor.shortLabel}</span>
        {descriptor.description && (
          <span className={styles.sketchItemDescription}>
            {descriptor.description}
          </span>
        )}
        {descriptor.parameters.length > 0 && (
          <span className={styles.sketchItemParams}>
            {descriptor.parameters.map((p) => p.label).join(" · ")}
          </span>
        )}
      </div>
    </button>
  );
}

/**
 * SketchBrowser
 *
 * A panel for browsing and selecting sketches to add as new slots.
 *
 * Features:
 * - Scrollable list of all available sketches
 * - Shows sketch label and description from descriptor
 * - Clicking a sketch creates a new slot with that sketch
 * - Optional "Copy from slot" section for duplicating existing slots
 */
export function SketchBrowser({
  slots,
  onSelectSketch,
  onCopySlot,
}: SketchBrowserProps) {
  const handleSelectSketch = useCallback(
    (sketchId: SketchId) => {
      onSelectSketch(sketchId);
    },
    [onSelectSketch],
  );

  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {/* Sketch List */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>Choose a sketch</span>
        <div className={styles.sketchList}>
          {SKETCH_REGISTRY.map((descriptor) => (
            <SketchListItem
              key={descriptor.id}
              descriptor={descriptor}
              onClick={() => handleSelectSketch(descriptor.id as SketchId)}
            />
          ))}
        </div>
      </div>

      {/* Copy from slot section */}
      {slots.length > 0 && (
        <div className={styles.section}>
          <div className={styles.divider} />
          <span className={styles.sectionLabel}>Or copy from slot</span>
          <div className={styles.copyOptions}>
            {slots.map((slot) => {
              const sketchLabel =
                getSketchDescriptor(slot.sketchId)?.shortLabel ?? slot.sketchId;
              return (
                <button
                  key={`copy-${slot.index}`}
                  type="button"
                  className={styles.copyButton}
                  onClick={() => onCopySlot(slot.index)}
                >
                  <CopyIcon className={styles.copyIcon} />
                  <span className={styles.copySlotNumber}>
                    Slot {slot.index + 1}
                  </span>
                  <span className={styles.copySketchName}>{sketchLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default SketchBrowser;
