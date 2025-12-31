import { useCallback, useRef, useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";

import type { SketchId, SketchProps } from "../../sketches";
import type { Slot } from "../../slots/useSlots";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping } from "../../inputs/midi";
import { makeSlotParameterId } from "../../slots/slotTypes";
import { SlotColumn } from "../SlotColumn";
import styles from "./SlotsArea.module.css";

export interface SlotsAreaProps {
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
  getSlotColors?: (slotIndex: number) => SketchProps["colors"];
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

// Horizontally scrollable container for slot columns.
// Designed to show ~3.5 columns at once with the 4th peeking in.
export function SlotsArea({
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
  getSlotColors,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  onSlotSketchChange,
  onCrossfade,
  onClearSlot,
  onSetSketch,
  onCopyToSlot,
}: SlotsAreaProps) {
  const filledSlots = slots.filter(
    (s): s is Slot & { sketchId: SketchId } => s.sketchId !== null,
  );

  const getCrossfadeProgress = useCallback(
    (slotIndex: number): number => {
      if (slotIndex === activeIndex) {
        return (1 - crossfadeValue) * 100;
      }
      if (slotIndex === crossfadeTargetIndex) {
        return crossfadeValue * 100;
      }
      return 0;
    },
    [activeIndex, crossfadeTargetIndex, crossfadeValue],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const threshold = 2;
    setCanScrollLeft(scrollLeft > threshold);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - threshold);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener("scroll", updateScrollState, { passive: true });

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
                const alphaParamId = makeSlotParameterId(slot.index, "alpha");
                const alpha = slot.sketchId ? (getValue(alphaParamId) ?? 1) : 1;

                const audioReactivityParamId = makeSlotParameterId(
                  slot.index,
                  "audio_reactivity",
                );
                const audioReactivity = slot.sketchId
                  ? (getValue(audioReactivityParamId) ?? 1)
                  : 1;

                return (
                  <SlotColumn
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
                    colors={
                      slot.sketchId ? getSlotColors?.(slot.index) : undefined
                    }
                    alpha={alpha}
                    audioReactivity={audioReactivity}
                    getValue={getValue}
                    setValue={setValue}
                    audioMappings={audioMappings}
                    modulationTargets={modulationTargets}
                    lfos={lfos}
                    midiMappings={midiMappings}
                    filledSlots={filledSlots}
                    onSketchChange={(sketchId) => {
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

export default SlotsArea;
