import { useCallback, useRef, useState, useEffect } from "react";
import { PlusIcon, CopyIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";

import type { SketchId, SketchProps } from "../../sketches";
import { getSketchDescriptor } from "../../sketches";
import type { Slot } from "../../scenes/useSceneSlots";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import { SceneColumn } from "../SceneColumn";
import styles from "./ScenesArea.module.css";

/**
 * Props for the ScenesArea component.
 *
 * @property slots - Array of slots to render
 * @property activeIndex - Index of the active (output) slot
 * @property crossfadeTargetIndex - Index of crossfade target slot, or null
 * @property crossfadeValue - Current crossfade value (0-1)
 * @property isCrossfading - Whether crossfade is in progress
 * @property macropadSelectedIndex - Index of slot selected via macropad, or null
 * @property canAddSlot - Whether we can add more slots
 * @property canRemoveSlot - Whether we can remove slots
 * @property getValue - Get parameter value for a given parameter ID
 * @property setValue - Set parameter value
 * @property getSlotSketchParams - Get sketch params object for a slot (target values for sliders)
 * @property getSlotSketchParamsInterpolated - Get sketch params with interpolated values (for smooth previews)
 * @property audioMappings - Optional audio mappings for parameter indicators
 * @property modulationTargets - Optional modulation targets for parameter indicators
 * @property lfos - Optional LFO sources (for modulation indicator labels)
 * @property onSlotSketchChange - Callback to change sketch in a slot
 * @property onCrossfade - Callback to start crossfade to a slot
 * @property onRemoveSlot - Callback to remove a slot
 * @property onAddSlot - Callback to add a new slot with defaults
 * @property onCopySlot - Callback to add a new slot by copying an existing slot
 */
export interface ScenesAreaProps {
  slots: Slot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  macropadSelectedIndex?: number | null;
  canAddSlot: boolean;
  canRemoveSlot: boolean;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  getSlotSketchParams: (
    slotIndex: number,
    sketchId: SketchId,
  ) => SketchProps["params"];
  getSlotSketchParamsInterpolated?: (
    slotIndex: number,
    sketchId: SketchId,
  ) => SketchProps["params"];
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  onSlotSketchChange: (slotIndex: number, sketchId: SketchId) => void;
  onCrossfade: (slotIndex: number) => void;
  onRemoveSlot: (slotIndex: number) => void;
  onAddSlot: (sketchId?: SketchId) => void;
  onCopySlot: (sourceSlotIndex: number) => void;
}

/**
 * ScenesArea
 *
 * Horizontally scrollable container for slot columns.
 * Designed to show ~3.5 columns at once with the 4th peeking in.
 *
 * Features:
 * - Horizontal scroll for 4+ slots
 * - Add slot panel with "New Slot" and "Copy Slot" options
 * - Multi-instance support: same sketch type can exist in multiple slots
 * - Renders SceneColumn for each slot with slot-prefixed parameters
 * - AnimatePresence for enter/exit animations
 */
export function ScenesArea({
  slots,
  activeIndex,
  crossfadeTargetIndex,
  crossfadeValue,
  isCrossfading,
  macropadSelectedIndex,
  canAddSlot,
  canRemoveSlot,
  getValue,
  setValue,
  getSlotSketchParams,
  getSlotSketchParamsInterpolated,
  audioMappings,
  modulationTargets,
  lfos,
  onSlotSketchChange,
  onCrossfade,
  onRemoveSlot,
  onAddSlot,
  onCopySlot,
}: ScenesAreaProps) {
  // Calculate crossfade progress for a slot
  const getCrossfadeProgress = useCallback(
    (slotIndex: number): number => {
      if (slotIndex === activeIndex) {
        // Active slot: shows inverse of crossfade
        return (1 - crossfadeValue) * 100;
      }
      if (slotIndex === crossfadeTargetIndex) {
        // Target slot: shows crossfade progress
        return crossfadeValue * 100;
      }
      return 0;
    },
    [activeIndex, crossfadeTargetIndex, crossfadeValue],
  );

  // Track scroll position for edge fade gradients
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    // Add small threshold to account for sub-pixel rounding
    const threshold = 2;
    setCanScrollLeft(scrollLeft > threshold);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - threshold);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Initial check
    updateScrollState();

    // Listen to scroll events
    el.addEventListener("scroll", updateScrollState, { passive: true });

    // Also check on resize (content or viewport changes)
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState, slots.length]);

  return (
    <section className={styles.container} aria-label="Slot columns">
      <div className={styles.scrollWrapper}>
        {canScrollLeft && (
          <div className={styles.fadeLeft} aria-hidden="true" />
        )}
        <div ref={scrollRef} className={styles.scrollArea}>
          <div className={styles.columnsWrapper}>
            <AnimatePresence mode="popLayout">
              {slots.map((slot) => (
                <SceneColumn
                  key={slot.index}
                  slotIndex={slot.index}
                  sketchId={slot.sketchId}
                  isActive={slot.index === activeIndex}
                  isCrossfadeTarget={slot.index === crossfadeTargetIndex}
                  crossfadeProgress={getCrossfadeProgress(slot.index)}
                  isCrossfading={isCrossfading}
                  isMacropadSelected={slot.index === macropadSelectedIndex}
                  excludeSketchIds={[]}
                  canRemove={canRemoveSlot && slot.index !== activeIndex}
                  params={getSlotSketchParams(slot.index, slot.sketchId)}
                  previewParams={getSlotSketchParamsInterpolated?.(
                    slot.index,
                    slot.sketchId,
                  )}
                  getValue={getValue}
                  setValue={setValue}
                  audioMappings={audioMappings}
                  modulationTargets={modulationTargets}
                  lfos={lfos}
                  onSketchChange={(sketchId) =>
                    onSlotSketchChange(slot.index, sketchId)
                  }
                  onCrossfade={() => onCrossfade(slot.index)}
                  onRemove={() => onRemoveSlot(slot.index)}
                />
              ))}

              {/* Add Slot panel - inline options, no dropdown */}
              {canAddSlot && (
                <motion.div
                  key="add-slot-panel"
                  className={styles.addPanel}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className={styles.addPanelHeader}>
                    <PlusIcon className={styles.addPanelIcon} />
                    <span className={styles.addPanelTitle}>Add Slot</span>
                  </div>

                  <div className={styles.addPanelOptions}>
                    <button
                      type="button"
                      className={styles.addOptionButton}
                      onClick={() => void onAddSlot()}
                    >
                      <PlusIcon className={styles.addOptionIcon} />
                      <span>New Slot</span>
                    </button>

                    {slots.length > 0 && (
                      <>
                        <div className={styles.addPanelDivider} />
                        <span className={styles.addPanelLabel}>
                          Copy from slot
                        </span>
                        {slots.map((slot) => {
                          const sketchLabel =
                            getSketchDescriptor(slot.sketchId)?.shortLabel ??
                            slot.sketchId;
                          return (
                            <button
                              key={`copy-${slot.index}`}
                              type="button"
                              className={styles.addOptionButton}
                              onClick={() => void onCopySlot(slot.index)}
                            >
                              <CopyIcon className={styles.addOptionIcon} />
                              <span>Slot {slot.index + 1}</span>
                              <span className={styles.addOptionHint}>
                                {sketchLabel}
                              </span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {canScrollRight && (
          <div className={styles.fadeRight} aria-hidden="true" />
        )}
      </div>
    </section>
  );
}

export default ScenesArea;
