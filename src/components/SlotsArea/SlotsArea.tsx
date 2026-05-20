import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { AnimatePresence } from "motion/react";

import type { SketchId, SketchProps } from "../../sketches";
import type { Slot } from "../../slots/useSlots";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping, MidiPickupState } from "../../inputs/midi";
import { makeSlotParameterId } from "../../slots/slotTypes";
import { SlotColumn, type PanelId } from "../SlotColumn";
import styles from "./SlotsArea.module.css";

// ============================================================================
// Drag-to-reorder hook
// ============================================================================

interface DragState {
  slotIndex: number;   // which slot is being dragged
  startX: number;      // pointer X at drag start (rebased on each swap)
  currentX: number;    // current pointer X
  columnWidth: number; // measured column width + gap
  originOrder: number[]; // displayOrder at drag start
  currentPos: number;  // current position index in displayOrder
}

function useDragReorder(slotCount: number) {
  const [displayOrder, setDisplayOrder] = useState<number[]>(() =>
    Array.from({ length: slotCount }, (_, i) => i),
  );

  // Keep displayOrder length in sync if slotCount changes
  useEffect(() => {
    setDisplayOrder((prev) => {
      if (prev.length === slotCount) return prev;
      return Array.from({ length: slotCount }, (_, i) => i);
    });
  }, [slotCount]);

  const dragRef = useRef<DragState | null>(null);
  const [draggingSlotIndex, setDraggingSlotIndex] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const startDrag = useCallback(
    (slotIndex: number, startX: number, columnWidth: number) => {
      const originPos = displayOrder.indexOf(slotIndex);
      dragRef.current = {
        slotIndex,
        startX,
        currentX: startX,
        columnWidth,
        originOrder: [...displayOrder],
        currentPos: originPos,
      };
      setDraggingSlotIndex(slotIndex);
      setDragOffsetX(0);
      document.body.style.userSelect = "none";
    },
    [displayOrder],
  );

  const moveDrag = useCallback((currentX: number) => {
    const drag = dragRef.current;
    if (!drag) return;

    drag.currentX = currentX;
    const delta = currentX - drag.startX;

    // Compute target position based on how far we've dragged from our current rebased origin
    const steps = Math.round(delta / drag.columnWidth);
    const targetPos = Math.max(
      0,
      Math.min(drag.originOrder.length - 1, drag.currentPos + steps),
    );

    if (targetPos !== drag.currentPos) {
      // Rebase startX before computing the new offset so both state updates
      // use the same rebased value — eliminates the one-frame flash.
      const posDelta = targetPos - drag.currentPos;
      drag.startX += posDelta * drag.columnWidth;
      drag.currentPos = targetPos;

      setDisplayOrder((prev) => {
        const newOrder = prev.filter((idx) => idx !== drag.slotIndex);
        newOrder.splice(targetPos, 0, drag.slotIndex);
        if (prev.join(",") === newOrder.join(",")) return prev;
        return newOrder;
      });
    }

    // Always update the visual offset using the (possibly just rebased) startX
    setDragOffsetX(currentX - drag.startX);
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingSlotIndex(null);
    setDragOffsetX(0);
    document.body.style.userSelect = "";
  }, []);

  return { displayOrder, draggingSlotIndex, dragOffsetX, startDrag, moveDrag, endDrag };
}

export interface SlotsAreaProps {
  slots: Slot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  macropadSelectedIndex?: number | null;
  /** Aspect ratio from the Renderer window (width/height). Defaults to 16/9. */
  rendererAspectRatio?: number;
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
  midiPickupStates?: Map<string, MidiPickupState>;
  onSlotSketchChange: (slotIndex: number, sketchId: SketchId) => void;
  onCrossfade: (slotIndex: number) => void;
  onClearSlot: (slotIndex: number) => void;
  onSetSketch: (slotIndex: number, sketchId: SketchId) => void;
  onCopyToSlot: (sourceSlotIndex: number, targetSlotIndex: number) => void;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (parameterId: string, paramMin: number, paramMax: number) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
  highlightedParamIds?: Set<string>;
  onHighlightParams?: (ids: Set<string>) => void;
}

const PANEL_SLOTS_KEY = "slew-panel-slots"; // localStorage — survives webview reloads

// Horizontally scrollable container for slot columns.
// Designed to show ~3.5 columns at once with the 4th peeking in.
export function SlotsArea({
  slots,
  activeIndex,
  crossfadeTargetIndex,
  crossfadeValue,
  isCrossfading,
  macropadSelectedIndex,
  rendererAspectRatio = 16 / 9,
  getValue,
  setValue,
  getSlotSketchParams,
  getSlotSketchParamsInterpolated,
  getSlotColors,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  midiPickupStates,
  onSlotSketchChange,
  onCrossfade,
  onClearSlot,
  onSetSketch,
  onCopyToSlot,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
  highlightedParamIds,
  onHighlightParams,
}: SlotsAreaProps) {
  const filledSlots = slots.filter(
    (s): s is Slot & { sketchId: SketchId } => s.sketchId !== null,
  );

  const { displayOrder, draggingSlotIndex, dragOffsetX, startDrag, moveDrag, endDrag } =
    useDragReorder(slots.length);

  const orderedSlots = useMemo(
    () => displayOrder.map((i) => slots[i]).filter(Boolean),
    [displayOrder, slots],
  );

  const [panelSlots, setPanelSlots] = useState<Record<number, PanelId | null>>(() => {
    try {
      const stored = localStorage.getItem(PANEL_SLOTS_KEY);
      return stored ? (JSON.parse(stored) as Record<number, PanelId | null>) : {};
    } catch {
      return {};
    }
  });

  const handleOpenPanel = useCallback((slotIndex: number, panelId: PanelId) => {
    setPanelSlots((prev) => {
      const next = { ...prev, [slotIndex]: panelId };
      try { localStorage.setItem(PANEL_SLOTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const handleClosePanel = useCallback((slotIndex: number) => {
    setPanelSlots((prev) => {
      const next = { ...prev, [slotIndex]: null };
      try { localStorage.setItem(PANEL_SLOTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const columnsWrapperRef = useRef<HTMLDivElement>(null);

  const handlePointerDown = useCallback(
    (slotIndex: number, e: React.PointerEvent) => {
      // Only drag on primary button, not on interactive children
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Don't start drag from buttons, inputs, selects or scrollable controls
      if (target.closest("button, input, select, [role='slider'], [data-nodrag]")) return;

      // Prevent text selection for the duration of the drag
      e.preventDefault();

      const wrapper = columnsWrapperRef.current;
      if (!wrapper) return;

      // Measure a column width (first child)
      const firstCol = wrapper.firstElementChild as HTMLElement | null;
      const columnWidth = firstCol
        ? firstCol.getBoundingClientRect().width + 12 // 12px = 0.75rem gap
        : 332;

      startDrag(slotIndex, e.clientX, columnWidth);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [startDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (draggingSlotIndex === null) return;
      moveDrag(e.clientX);
    },
    [draggingSlotIndex, moveDrag],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (draggingSlotIndex === null) return;
      endDrag();
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
    [draggingSlotIndex, endDrag],
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
          <div
            ref={columnsWrapperRef}
            className={styles.columnsWrapper}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <AnimatePresence mode="popLayout">
              {orderedSlots.map((slot) => {
                const alphaParamId = makeSlotParameterId(slot.index, "alpha");
                const alpha = slot.sketchId ? (getValue(alphaParamId) ?? 1) : 1;



                return (
                  <SlotColumn
                    key={slot.index}
                    slotIndex={slot.index}
                    sketchId={slot.sketchId}
                    isDragging={slot.index === draggingSlotIndex}
                    dragOffsetX={slot.index === draggingSlotIndex ? dragOffsetX : 0}
                    onDragStart={(e) => handlePointerDown(slot.index, e)}
                    isActive={slot.index === activeIndex}
                    isCrossfadeTarget={slot.index === crossfadeTargetIndex}
                    crossfadeProgress={getCrossfadeProgress(slot.index)}
                    isCrossfading={isCrossfading}
                    isMacropadSelected={slot.index === macropadSelectedIndex}
                    rendererAspectRatio={rendererAspectRatio}
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

                    getValue={getValue}
                    setValue={setValue}
                    audioMappings={audioMappings}
                    modulationTargets={modulationTargets}
                    lfos={lfos}
                    midiMappings={midiMappings}
                    midiPickupStates={midiPickupStates}
                    panelId={panelSlots[slot.index] ?? null}
                    onOpenPanel={(panelId) => handleOpenPanel(slot.index, panelId)}
                    onClosePanel={() => handleClosePanel(slot.index)}
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
                    onQuickBeat={onQuickBeat}
                    onQuickLfo={onQuickLfo}
                    onUnlinkBeat={onUnlinkBeat}
                    onUnlinkLfo={onUnlinkLfo}
                    highlightedParamIds={highlightedParamIds}
                    onHighlightParams={onHighlightParams}
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
