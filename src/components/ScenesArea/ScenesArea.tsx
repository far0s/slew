import { useCallback, useRef, useState, useEffect } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import type { SceneId } from "../../scenes/sceneTypes";
import type { SceneSlot } from "../../scenes/useSceneSlots";
import type { SceneProps } from "../../scenes/sceneComponents";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import { SceneColumn } from "../SceneColumn";
import styles from "./ScenesArea.module.css";

/**
 * Props for the ScenesArea component.
 *
 * @property slots - Array of scene slots to render
 * @property activeIndex - Index of the active (output) slot
 * @property crossfadeTargetIndex - Index of crossfade target slot, or null
 * @property crossfadeValue - Current crossfade value (0-1)
 * @property isCrossfading - Whether crossfade is in progress
 * @property macropadSelectedIndex - Index of slot selected via macropad, or null
 * @property canAddSlot - Whether we can add more slots
 * @property canRemoveSlot - Whether we can remove slots
 * @property getValue - Get parameter value for a given parameter ID
 * @property setValue - Set parameter value
 * @property getSceneParams - Get scene params object for a scene ID
 * @property audioMappings - Optional audio mappings for parameter indicators
 * @property modulationTargets - Optional modulation targets for parameter indicators
 * @property lfos - Optional LFO sources (for modulation indicator labels)
 * @property onSlotSceneChange - Callback to change scene in a slot
 * @property onCrossfade - Callback to start crossfade to a slot
 * @property onRemoveSlot - Callback to remove a slot
 * @property onAddSlot - Callback to add a new slot
 */
export interface ScenesAreaProps {
  slots: SceneSlot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  macropadSelectedIndex?: number | null;
  canAddSlot: boolean;
  canRemoveSlot: boolean;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  getSceneParams: (sceneId: SceneId) => SceneProps["params"];
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  onSlotSceneChange: (slotIndex: number, sceneId: SceneId) => void;
  onCrossfade: (slotIndex: number) => void;
  onRemoveSlot: (slotIndex: number) => void;
  onAddSlot: () => void;
}

/**
 * ScenesArea
 *
 * Horizontally scrollable container for scene columns.
 * Designed to show ~3.5 columns at once with the 4th peeking in.
 *
 * Features:
 * - Horizontal scroll for 4+ scenes
 * - Add scene button when < maxSlots (same size as columns)
 * - Renders SceneColumn for each slot
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
  getSceneParams,
  audioMappings,
  modulationTargets,
  lfos,
  onSlotSceneChange,
  onCrossfade,
  onRemoveSlot,
  onAddSlot,
}: ScenesAreaProps) {
  // Get list of scene IDs in use (for exclusion in dropdowns)
  const usedSceneIds = slots.map((s) => s.sceneId);

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
    <section className={styles.container} aria-label="Scene columns">
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
                  sceneId={slot.sceneId}
                  isActive={slot.index === activeIndex}
                  isCrossfadeTarget={slot.index === crossfadeTargetIndex}
                  crossfadeProgress={getCrossfadeProgress(slot.index)}
                  isCrossfading={isCrossfading}
                  isMacropadSelected={slot.index === macropadSelectedIndex}
                  excludeSceneIds={usedSceneIds.filter(
                    (id) => id !== slot.sceneId,
                  )}
                  canRemove={canRemoveSlot && slot.index !== activeIndex}
                  params={getSceneParams(slot.sceneId)}
                  getValue={getValue}
                  setValue={setValue}
                  audioMappings={audioMappings}
                  modulationTargets={modulationTargets}
                  lfos={lfos}
                  onSceneChange={(sceneId) =>
                    onSlotSceneChange(slot.index, sceneId)
                  }
                  onCrossfade={() => onCrossfade(slot.index)}
                  onRemove={() => onRemoveSlot(slot.index)}
                />
              ))}

              {/* Add Scene button - same size as columns */}
              {canAddSlot && (
                <motion.button
                  key="add-scene-button"
                  type="button"
                  className={styles.addButton}
                  onClick={onAddSlot}
                  aria-label="Add scene slot"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  layout
                >
                  <PlusIcon className={styles.addIcon} />
                  <span className={styles.addLabel}>Add Scene</span>
                </motion.button>
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
