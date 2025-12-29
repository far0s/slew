import { useCallback, useRef, useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";

import type { SketchId, SketchProps } from "../../sketches";
import type { Slot } from "../../scenes/useSceneSlots";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping } from "../../inputs/midi";
import { makeSlotParameterId } from "../../scenes/sceneTypes";
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
 * @property getValue - Get parameter value for a given parameter ID
 * @property setValue - Set parameter value
 * @property getSlotSketchParams - Get sketch params object for a slot (target values for sliders)
 * @property getSlotSketchParamsInterpolated - Get sketch params with interpolated values (for smooth previews)
 * @property audioMappings - Optional audio mappings for parameter indicators
 * @property modulationTargets - Optional modulation targets for parameter indicators
 * @property lfos - Optional LFO sources (for modulation indicator labels)
 * @property midiMappings - Optional MIDI mappings to disable direct input for mapped controls
 * @property onSlotSketchChange - Callback to change sketch in a slot
 * @property onCrossfade - Callback to start crossfade to a slot
 * @property onClearSlot - Callback to clear a slot (remove sketch)
 * @property onSetSketch - Callback to set a sketch in a specific slot
 * @property onCopyToSlot - Callback to copy parameters from one slot to another
 */
export interface ScenesAreaProps {
  slots: Slot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  macropadSelectedIndex?: number | null;
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
  midiMappings?: MidiMapping[];
  onSlotSketchChange: (slotIndex: number, sketchId: SketchId) => void;
  onCrossfade: (slotIndex: number) => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSketch: (slotIndex: number, sketchId: SketchId) => void;
  onCopyToSlot: (sourceSlotIndex: number, targetSlotIndex: number) => void;
}

/**
 * ScenesArea
 *
 * Horizontally scrollable container for slot columns.
 * Designed to show ~3.5 columns at once with the 4th peeking in.
 *
 * Features:
 * - Horizontal scroll for 8 fixed slots
 * - Empty slots show inline sketch browser directly (no extra click needed)
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
  getValue,
  setValue,
  getSlotSketchParams,
  getSlotSketchParamsInterpolated,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  onSlotSketchChange,
  onCrossfade,
  onClearSlot,
  onSetSketch,
  onCopyToSlot,
}: ScenesAreaProps) {
  // Get filled slots for "copy from" feature in inline browsers
  const filledSlots = slots.filter(
    (s): s is Slot & { sketchId: SketchId } => s.sketchId !== null,
  );

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
              {slots.map((slot) => {
                // Get alpha (master opacity) for this slot (only if has sketch)
                const alphaParamId = makeSlotParameterId(slot.index, "alpha");
                const alpha = slot.sketchId ? (getValue(alphaParamId) ?? 1) : 1;

                return (
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
                    canRemove={
                      slot.sketchId !== null && slot.index !== activeIndex
                    }
                    params={
                      slot.sketchId
                        ? getSlotSketchParams(slot.index, slot.sketchId)
                        : undefined
                    }
                    previewParams={
                      slot.sketchId
                        ? getSlotSketchParamsInterpolated?.(
                            slot.index,
                            slot.sketchId,
                          )
                        : undefined
                    }
                    alpha={alpha}
                    getValue={getValue}
                    setValue={setValue}
                    audioMappings={audioMappings}
                    modulationTargets={modulationTargets}
                    lfos={lfos}
                    midiMappings={midiMappings}
                    filledSlots={filledSlots}
                    onSketchChange={(sketchId) => {
                      // For empty slots, this is called when user picks a sketch
                      if (slot.sketchId === null) {
                        onSetSketch(slot.index, sketchId);
                      } else {
                        onSlotSketchChange(slot.index, sketchId);
                      }
                    }}
                    onCrossfade={() => onCrossfade(slot.index)}
                    onRemove={() => onClearSlot(slot.index)}
                    onCopyToSlot={(sourceSlotIndex) =>
                      onCopyToSlot(sourceSlotIndex, slot.index)
                    }
                  />
                );
              })}
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
