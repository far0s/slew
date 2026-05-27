import { useCallback, useRef, useState, useEffect, useMemo, memo } from "react";
import { AnimatePresence } from "motion/react";

import type { SketchId, SketchProps } from "@/sketches";
import type { Slot } from "@/slots/useSlots";
import type { AudioMapping } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import { makeSlotParameterId } from "@/slots/slotTypes";
import { SlotColumn, type PanelId } from "@/components/slots/SlotColumn";
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

// Maps legacy panel IDs (pre-Inputs/Outputs unification) to current ones
const LEGACY_PANEL_MAP: Record<string, PanelId> = {
  midi: "inputs",
  audio: "inputs",
  osc: "inputs",
  hid: "inputs",
};

// Stable empty array — avoids new reference on every render
const EMPTY_SKETCH_IDS: SketchId[] = [];

// Horizontally scrollable container for slot columns.
// Designed to show ~3.5 columns at once with the 4th peeking in.
export const SlotsArea = memo(function SlotsArea({
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
  const filledSlots = useMemo(
    () => slots.filter((s): s is Slot & { sketchId: SketchId } => s.sketchId !== null),
    [slots],
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
      if (!stored) return {};
      const raw = JSON.parse(stored) as Record<number, string | null>;
      const result: Record<number, PanelId | null> = {};
      for (const [k, v] of Object.entries(raw)) {
        result[Number(k)] = v === null ? null : (LEGACY_PANEL_MAP[v] ?? (v as PanelId));
      }
      return result;
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

  // Stable refs for parent callbacks — lets perSlotHandlers avoid recreating on every render
  const handlePointerDownRef = useRef(handlePointerDown);
  handlePointerDownRef.current = handlePointerDown;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const onSlotSketchChangeRef = useRef(onSlotSketchChange);
  onSlotSketchChangeRef.current = onSlotSketchChange;
  const onSetSketchRef = useRef(onSetSketch);
  onSetSketchRef.current = onSetSketch;
  const onCrossfadeRef = useRef(onCrossfade);
  onCrossfadeRef.current = onCrossfade;
  const onClearSlotRef = useRef(onClearSlot);
  onClearSlotRef.current = onClearSlot;
  const onCopyToSlotRef = useRef(onCopyToSlot);
  onCopyToSlotRef.current = onCopyToSlot;

  // Stable per-slot handlers — recreate only when slot count changes
  const perSlotHandlers = useMemo(() => {
    const map = new Map<number, {
      onDragStart: (e: React.PointerEvent) => void;
      onSketchChange: (sketchId: SketchId) => void;
      onCrossfade: () => void;
      onRemove: () => void;
      onCopyToSlot: (sourceSlotIndex: number) => void;
      onOpenPanel: (panelId: PanelId) => void;
      onClosePanel: () => void;
    }>();
    for (const slot of slots) {
      const idx = slot.index;
      map.set(idx, {
        onDragStart: (e) => handlePointerDownRef.current(idx, e),
        onSketchChange: (sketchId) => {
          const current = slotsRef.current.find((s) => s.index === idx);
          if (current?.sketchId === null) {
            onSetSketchRef.current(idx, sketchId);
          } else {
            onSlotSketchChangeRef.current(idx, sketchId);
          }
        },
        onCrossfade: () => onCrossfadeRef.current(idx),
        onRemove: () => onClearSlotRef.current(idx),
        onCopyToSlot: (sourceSlotIndex) => onCopyToSlotRef.current(sourceSlotIndex, idx),
        onOpenPanel: (panelId) => handleOpenPanel(idx, panelId),
        onClosePanel: () => handleClosePanel(idx),
      });
    }
    return map;
  // handleOpenPanel and handleClosePanel have stable [] deps; recreate only when slot count changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.length, handleOpenPanel, handleClosePanel]);

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
                const handlers = perSlotHandlers.get(slot.index)!;
                const slotDisplayPosition = displayOrder.indexOf(slot.index);

                return (
                  <SlotColumn
                    key={slot.index}
                    slotIndex={slot.index}
                    sketchId={slot.sketchId}
                    isDragging={slot.index === draggingSlotIndex}
                    dragOffsetX={slot.index === draggingSlotIndex ? dragOffsetX : 0}
                    onDragStart={handlers.onDragStart}
                    layoutDependency={slotDisplayPosition}
                    isActive={slot.index === activeIndex}
                    isCrossfadeTarget={slot.index === crossfadeTargetIndex}
                    crossfadeProgress={getCrossfadeProgress(slot.index)}
                    isCrossfading={isCrossfading}
                    isMacropadSelected={slot.index === macropadSelectedIndex}
                    rendererAspectRatio={rendererAspectRatio}
                    excludeSketchIds={EMPTY_SKETCH_IDS}
                    canRemove={
                      slot.sketchId !== null && slot.index !== activeIndex
                    }
                    getSlotSketchParams={getSlotSketchParams}
                    getSlotSketchParamsInterpolated={getSlotSketchParamsInterpolated}
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
                    onOpenPanel={handlers.onOpenPanel}
                    onClosePanel={handlers.onClosePanel}
                    filledSlots={filledSlots}
                    onSketchChange={handlers.onSketchChange}
                    onCrossfade={handlers.onCrossfade}
                    onRemove={handlers.onRemove}
                    onCopyToSlot={handlers.onCopyToSlot}
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
});

export default SlotsArea;
