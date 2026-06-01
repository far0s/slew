import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SketchId, SlotParameterId } from "./slotTypes";
import {
  ALL_SKETCH_IDS,
  buildSlotDefaultParameters,
  copySlotParameters,
  makeSlotParameterId,
  getSketchParameterTemplateIds,
} from "./slotTypes";

interface BackendSlotState {
  slots: Array<{ index: number; sketch_id: string }>;
  active_slot_index: number;
  crossfade_target_index: number | null;
}

export interface Slot {
  index: number;
  sketchId: SketchId | null;
}

export interface SlotsConfig {
  minSlots: number;
  maxSlots: number;
  initialSketches?: SketchId[];
}

export interface SlotInitParams {
  slotIndex: number;
  sketchId: SketchId;
  parameters: Map<SlotParameterId, number>;
}

export interface SlotsState {
  slots: Slot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  canAddSlot: boolean;
  canRemoveSlot: boolean;
  setSketch: (slotIndex: number, sketchId: SketchId) => SlotInitParams | null;
  clearSlot: (slotIndex: number) => boolean;
  copyToSlot: (
    sourceSlotIndex: number,
    targetSlotIndex: number,
    getParameterValue: (id: string) => number | undefined,
  ) => SlotInitParams | null;
  addSlot: (sketchId?: SketchId) => SlotInitParams | null;
  addSlotWithCopy: (
    sourceSlotIndex: number,
    getParameterValue: (id: string) => number | undefined,
  ) => SlotInitParams | null;
  removeSlot: (index: number) => boolean;
  setSlotSketch: (
    index: number,
    sketchId: SketchId,
    copyFromSlotIndex?: number,
    getParameterValue?: (id: string) => number | undefined,
  ) => SlotInitParams | null;
  startCrossfade: (targetIndex: number) => void;
  setCrossfadeValue: (value: number) => void;
  completeCrossfade: () => void;
  cancelCrossfade: () => void;
  getSketchId: (index: number) => SketchId | null | undefined;
  isActiveSlot: (index: number) => boolean;
  isCrossfadeTarget: (index: number) => boolean;
  findSlotsWithSketch: (sketchId: SketchId) => number[];
  getSlotParameterIds: (slotIndex: number) => SlotParameterId[];
  getFilledSlots: () => Slot[];
  isHydrated: boolean;
  suspendedSlots: Set<number>;
  suspendSlot: (index: number) => void;
  resumeSlot: (index: number) => void;
  isSlotSuspended: (index: number) => boolean;
  hydrateFromBackend: () => Promise<boolean>;
  setSlots: (slots: Slot[]) => void;
  setActiveIndex: (index: number) => void;
}

const DEFAULT_CONFIG: SlotsConfig = {
  minSlots: 8,
  maxSlots: 8,
};

const FIXED_SLOT_COUNT = 8;

// Hook for managing numbered slots with multi-instance support.
// Each slot has an index and a sketch ID (sketch types can be duplicated).
// One slot is "active" (being rendered to output).
// Crossfading transitions from active to a target slot.
// Each slot has independent parameters (prefixed with slot index).
export function useSlots(config: Partial<SlotsConfig> = {}): SlotsState {
  const { ...mergedConfig } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  void mergedConfig;

  const getInitialSlots = (): Slot[] => {
    const sketches = config.initialSketches ?? [ALL_SKETCH_IDS[0]];
    return Array.from({ length: FIXED_SLOT_COUNT }, (_, index) => ({
      index,
      sketchId: index < sketches.length ? sketches[index] : null,
    }));
  };

  const [slots, setSlots] = useState<Slot[]>(getInitialSlots);
  const [activeIndex, setActiveIndex] = useState(0);
  const [crossfadeTargetIndex, setCrossfadeTargetIndex] = useState<
    number | null
  >(null);
  const [crossfadeValue, setCrossfadeValue] = useState(0);
  const [isHydrated, setIsHydrated] = useState(false);
  const [suspendedSlots, setSuspendedSlots] = useState<Set<number>>(new Set());

  const hydrateFromBackend = useCallback(async (): Promise<boolean> => {
    try {
      const backendState = await invoke<BackendSlotState>("get_slot_state");

      if (backendState.slots && backendState.slots.length > 0) {
        const hydratedSlots: Slot[] = Array.from(
          { length: FIXED_SLOT_COUNT },
          (_, index) => {
            const backendSlot = backendState.slots.find(
              (s) => s.index === index,
            );
            return {
              index,
              sketchId: backendSlot?.sketch_id
                ? (backendSlot.sketch_id as SketchId)
                : null,
            };
          },
        );

        setSlots(hydratedSlots);
        setActiveIndex(backendState.active_slot_index);
        setCrossfadeTargetIndex(backendState.crossfade_target_index);
        setIsHydrated(true);
        return true;
      }
    } catch {
      // Hydration failure is non-critical - app will use defaults
    }

    setIsHydrated(true);
    return false;
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      void hydrateFromBackend();
    }
  }, [isHydrated, hydrateFromBackend]);

  const isCrossfading =
    crossfadeTargetIndex !== null &&
    crossfadeValue > 0.01 &&
    crossfadeValue < 0.99;
  const canAddSlot = false;
  const canRemoveSlot = false;

  const getFilledSlots = useCallback((): Slot[] => {
    return slots.filter(
      (slot): slot is Slot & { sketchId: SketchId } => slot.sketchId !== null,
    );
  }, [slots]);

  const findSlotsWithSketch = useCallback(
    (sketchId: SketchId): number[] => {
      return slots
        .filter((slot) => slot.sketchId === sketchId)
        .map((slot) => slot.index);
    },
    [slots],
  );

  const setSketch = useCallback(
    (slotIndex: number, sketchId: SketchId): SlotInitParams | null => {
      if (slotIndex < 0 || slotIndex >= FIXED_SLOT_COUNT) return null;

      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === slotIndex ? { ...slot, sketchId } : slot,
        ),
      );

      const parameters = buildSlotDefaultParameters(slotIndex, sketchId);
      return {
        slotIndex,
        sketchId,
        parameters,
      };
    },
    [],
  );

  const clearSlot = useCallback(
    (slotIndex: number): boolean => {
      if (slotIndex < 0 || slotIndex >= FIXED_SLOT_COUNT) return false;

      if (slotIndex === activeIndex) {
        const nextFilled = slots.find(
          (s) => s.index !== slotIndex && s.sketchId !== null,
        );
        if (nextFilled) {
          setActiveIndex(nextFilled.index);
        }
      }

      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === slotIndex ? { ...slot, sketchId: null } : slot,
        ),
      );

      if (crossfadeTargetIndex === slotIndex) {
        setCrossfadeTargetIndex(null);
        setCrossfadeValue(0);
      }

      return true;
    },
    [activeIndex, slots, crossfadeTargetIndex],
  );

  const copyToSlot = useCallback(
    (
      sourceSlotIndex: number,
      targetSlotIndex: number,
      getParameterValue: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      if (sourceSlotIndex < 0 || sourceSlotIndex >= FIXED_SLOT_COUNT)
        return null;
      if (targetSlotIndex < 0 || targetSlotIndex >= FIXED_SLOT_COUNT)
        return null;

      const sourceSlot = slots.find((s) => s.index === sourceSlotIndex);
      if (!sourceSlot || !sourceSlot.sketchId) return null;

      const sketchId = sourceSlot.sketchId;

      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === targetSlotIndex ? { ...slot, sketchId } : slot,
        ),
      );

      const parameters = copySlotParameters(
        sourceSlotIndex,
        targetSlotIndex,
        sketchId,
        getParameterValue,
      );
      return {
        slotIndex: targetSlotIndex,
        sketchId,
        parameters,
      };
    },
    [slots],
  );

  const getSlotParameterIds = useCallback(
    (slotIndex: number): SlotParameterId[] => {
      const slot = slots.find((s) => s.index === slotIndex);
      if (!slot || !slot.sketchId) return [];
      const templateIds = getSketchParameterTemplateIds(slot.sketchId);
      return templateIds.map((tid) => makeSlotParameterId(slotIndex, tid));
    },
    [slots],
  );

  const addSlot = useCallback(
    (sketchId?: SketchId): SlotInitParams | null => {
      const emptySlot = slots.find((s) => s.sketchId === null);
      if (!emptySlot) return null;

      const newSketchId = sketchId ?? ALL_SKETCH_IDS[0];
      return setSketch(emptySlot.index, newSketchId);
    },
    [slots, setSketch],
  );

  const addSlotWithCopy = useCallback(
    (
      sourceSlotIndex: number,
      getParameterValue: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      const emptySlot = slots.find((s) => s.sketchId === null);
      if (!emptySlot) return null;

      return copyToSlot(sourceSlotIndex, emptySlot.index, getParameterValue);
    },
    [slots, copyToSlot],
  );

  const removeSlot = useCallback(
    (index: number): boolean => {
      return clearSlot(index);
    },
    [clearSlot],
  );

  const setSlotSketch = useCallback(
    (
      index: number,
      sketchId: SketchId,
      copyFromSlotIndex?: number,
      getParameterValue?: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      if (index < 0 || index >= FIXED_SLOT_COUNT) return null;

      if (
        copyFromSlotIndex !== undefined &&
        getParameterValue &&
        slots[copyFromSlotIndex]?.sketchId === sketchId
      ) {
        return copyToSlot(copyFromSlotIndex, index, getParameterValue);
      }

      return setSketch(index, sketchId);
    },
    [slots, setSketch, copyToSlot],
  );

  const suspendSlot = useCallback((index: number) => {
    setSuspendedSlots((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const resumeSlot = useCallback((index: number) => {
    setSuspendedSlots((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }, []);

  const isSlotSuspended = useCallback(
    (index: number) => suspendedSlots.has(index),
    [suspendedSlots],
  );

  const startCrossfade = useCallback(
    (targetIndex: number) => {
      if (targetIndex === activeIndex) return;
      if (targetIndex < 0 || targetIndex >= FIXED_SLOT_COUNT) return;
      const targetSlot = slots.find((s) => s.index === targetIndex);
      if (!targetSlot || !targetSlot.sketchId) return;
      if (isCrossfading) return;

      setCrossfadeTargetIndex(targetIndex);
    },
    [activeIndex, slots, isCrossfading],
  );

  const completeCrossfade = useCallback(() => {
    if (crossfadeTargetIndex === null) return;

    setActiveIndex(crossfadeTargetIndex);
    setCrossfadeTargetIndex(null);
    setCrossfadeValue(0);
  }, [crossfadeTargetIndex]);

  const cancelCrossfade = useCallback(() => {
    setCrossfadeTargetIndex(null);
    setCrossfadeValue(0);
  }, []);

  const getSketchId = useCallback(
    (index: number): SketchId | null | undefined => {
      return slots.find((s) => s.index === index)?.sketchId;
    },
    [slots],
  );

  const isActiveSlot = useCallback(
    (index: number): boolean => {
      return index === activeIndex;
    },
    [activeIndex],
  );

  const isCrossfadeTarget = useCallback(
    (index: number): boolean => {
      return index === crossfadeTargetIndex;
    },
    [crossfadeTargetIndex],
  );

  return {
    slots,
    activeIndex,
    crossfadeTargetIndex,
    crossfadeValue,
    isCrossfading,
    canAddSlot,
    canRemoveSlot,
    setSketch,
    clearSlot,
    copyToSlot,
    addSlot,
    addSlotWithCopy,
    removeSlot,
    setSlotSketch,
    startCrossfade,
    setCrossfadeValue,
    completeCrossfade,
    cancelCrossfade,
    getSketchId,
    isActiveSlot,
    isCrossfadeTarget,
    findSlotsWithSketch,
    getSlotParameterIds,
    getFilledSlots,
    isHydrated,
    suspendedSlots,
    suspendSlot,
    resumeSlot,
    isSlotSuspended,
    hydrateFromBackend,
    setSlots,
    setActiveIndex,
  };
}
