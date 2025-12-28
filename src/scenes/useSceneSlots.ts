import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SketchId, SlotParameterId } from "./sceneTypes";
import {
  ALL_SKETCH_IDS,
  buildSlotDefaultParameters,
  copySlotParameters,
  makeSlotParameterId,
  getSketchParameterTemplateIds,
} from "./sceneTypes";

/**
 * Backend slot state returned from get_slot_state command.
 */
interface BackendSlotState {
  slots: Array<{ index: number; sketch_id: string }>;
  active_slot_index: number;
  crossfade_target_index: number | null;
}

/**
 * Represents a single slot in the UI.
 *
 * @property index - Slot index (0-based, displayed as 1-based in UI)
 * @property sketchId - Which sketch type is loaded in this slot, or null if empty
 */
export interface Slot {
  index: number;
  sketchId: SketchId | null;
}

/**
 * Configuration for the slots system.
 *
 * @property minSlots - Minimum number of slots allowed
 * @property maxSlots - Maximum number of slots allowed
 * @property initialSketches - Initial sketch IDs for slots (defaults to first sketch)
 */
export interface SlotsConfig {
  minSlots: number;
  maxSlots: number;
  initialSketches?: SketchId[];
}

/**
 * Parameters to initialize for a new slot.
 */
export interface SlotInitParams {
  slotIndex: number;
  sketchId: SketchId;
  parameters: Map<SlotParameterId, number>;
}

/**
 * Return type for the useSceneSlots hook.
 *
 * @property slots - Array of current slots
 * @property activeIndex - Index of the currently active (output) slot
 * @property crossfadeTargetIndex - Index of the slot we're crossfading to, or null if not crossfading
 * @property crossfadeValue - Current crossfade value (0 = fully active, 1 = fully target)
 * @property isCrossfading - Whether we're currently mid-crossfade
 * @property canAddSlot - Whether we can add more slots
 * @property canRemoveSlot - Whether we can remove slots (must have > minSlots)
 * @property setSketch - Set the sketch in a specific slot (creates parameters if needed)
 * @property clearSlot - Clear a slot (set sketchId to null)
 * @property copyToSlot - Copy parameters from one slot to another
 * @property addSlot - Add a new slot with default parameters (legacy, for dynamic slot creation)
 * @property addSlotWithCopy - Add a new slot by copying an existing slot's parameters (legacy)
 * @property removeSlot - Remove a slot by index (cannot remove active slot) (legacy)
 * @property setSlotSketch - Change the sketch in a slot (resets to defaults or copies)
 * @property startCrossfade - Start crossfading to a target slot
 * @property setCrossfadeValue - Update the crossfade value (called during transition)
 * @property completeCrossfade - Complete the crossfade (swap active to target)
 * @property cancelCrossfade - Cancel an in-progress crossfade
 * @property getSketchId - Get the sketch ID for a slot index
 * @property isActiveSlot - Check if a slot is the active slot
 * @property isCrossfadeTarget - Check if a slot is the crossfade target
 * @property findSlotsWithSketch - Find all slot indices that have a given sketch type
 * @property getSlotParameterIds - Get all parameter IDs for a slot
 * @property getFilledSlots - Get only slots that have a sketch loaded
 * @property isHydrated - Whether the slot state has been hydrated from backend
 * @property hydrateFromBackend - Manually trigger hydration from backend state
 * @property setSlots - Directly set slots array (for hydration)
 * @property setActiveIndex - Directly set active index (for hydration)
 */
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
  hydrateFromBackend: () => Promise<boolean>;
  setSlots: (slots: Slot[]) => void;
  setActiveIndex: (index: number) => void;
}

const DEFAULT_CONFIG: SlotsConfig = {
  minSlots: 8,
  maxSlots: 8,
};

/** Number of fixed slots (always visible) */
const FIXED_SLOT_COUNT = 8;

/**
 * Hook for managing numbered slots with multi-instance support.
 *
 * Key concepts:
 * - Each slot has an index and a sketch ID (sketch types can be duplicated)
 * - One slot is "active" (being rendered to output)
 * - Crossfading transitions from active to a target slot
 * - Each slot has independent parameters (prefixed with slot index)
 * - New slots can copy parameters from existing slots of the same sketch type
 */
export function useSceneSlots(config: Partial<SlotsConfig> = {}): SlotsState {
  const { ...mergedConfig } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  // Use mergedConfig to avoid unused variable warnings
  void mergedConfig;

  // Initialize with fixed number of slots (first with default sketch, rest empty)
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

  // Hydrate slot state from backend on mount
  const hydrateFromBackend = useCallback(async (): Promise<boolean> => {
    try {
      const backendState = await invoke<BackendSlotState>("get_slot_state");

      // If backend has valid slot state, use it
      if (backendState.slots && backendState.slots.length > 0) {
        // Ensure we always have FIXED_SLOT_COUNT slots
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

        console.log(
          `[useSceneSlots] Hydrated ${hydratedSlots.length} slots from backend, active: ${backendState.active_slot_index}`,
        );
        return true;
      }
    } catch (e) {
      console.warn("[useSceneSlots] Failed to hydrate from backend:", e);
    }

    // Mark as hydrated even if we used defaults (first run)
    setIsHydrated(true);
    return false;
  }, []);

  // Auto-hydrate on mount
  useEffect(() => {
    if (!isHydrated) {
      void hydrateFromBackend();
    }
  }, [isHydrated, hydrateFromBackend]);

  // Derived state
  const isCrossfading =
    crossfadeTargetIndex !== null &&
    crossfadeValue > 0.01 &&
    crossfadeValue < 0.99;
  // With fixed slots, these are always false (no dynamic add/remove)
  const canAddSlot = false;
  const canRemoveSlot = false;

  // Get only slots that have a sketch loaded
  const getFilledSlots = useCallback((): Slot[] => {
    return slots.filter(
      (slot): slot is Slot & { sketchId: SketchId } => slot.sketchId !== null,
    );
  }, [slots]);

  // Find all slots with a given sketch type
  const findSlotsWithSketch = useCallback(
    (sketchId: SketchId): number[] => {
      return slots
        .filter((slot) => slot.sketchId === sketchId)
        .map((slot) => slot.index);
    },
    [slots],
  );

  // Set a sketch in a specific slot
  const setSketch = useCallback(
    (slotIndex: number, sketchId: SketchId): SlotInitParams | null => {
      if (slotIndex < 0 || slotIndex >= FIXED_SLOT_COUNT) return null;

      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === slotIndex ? { ...slot, sketchId } : slot,
        ),
      );

      // Return default parameters for the new sketch
      const parameters = buildSlotDefaultParameters(slotIndex, sketchId);
      return {
        slotIndex,
        sketchId,
        parameters,
      };
    },
    [],
  );

  // Clear a slot (set sketchId to null)
  const clearSlot = useCallback(
    (slotIndex: number): boolean => {
      if (slotIndex < 0 || slotIndex >= FIXED_SLOT_COUNT) return false;
      if (slotIndex === activeIndex) return false; // Cannot clear active slot

      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === slotIndex ? { ...slot, sketchId: null } : slot,
        ),
      );

      // Clear crossfade target if it was the cleared slot
      if (crossfadeTargetIndex === slotIndex) {
        setCrossfadeTargetIndex(null);
        setCrossfadeValue(0);
      }

      return true;
    },
    [activeIndex, crossfadeTargetIndex],
  );

  // Copy parameters from one slot to another
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

      // Copy parameters from source slot
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

  // Get parameter IDs for a slot
  const getSlotParameterIds = useCallback(
    (slotIndex: number): SlotParameterId[] => {
      const slot = slots.find((s) => s.index === slotIndex);
      if (!slot || !slot.sketchId) return [];
      const templateIds = getSketchParameterTemplateIds(slot.sketchId);
      return templateIds.map((tid) => makeSlotParameterId(slotIndex, tid));
    },
    [slots],
  );

  // Add a new slot with default parameters (legacy - finds first empty slot)
  const addSlot = useCallback(
    (sketchId?: SketchId): SlotInitParams | null => {
      // Find first empty slot
      const emptySlot = slots.find((s) => s.sketchId === null);
      if (!emptySlot) return null;

      const newSketchId = sketchId ?? ALL_SKETCH_IDS[0];
      return setSketch(emptySlot.index, newSketchId);
    },
    [slots, setSketch],
  );

  // Add a new slot by copying an existing slot's parameters (legacy - finds first empty slot)
  const addSlotWithCopy = useCallback(
    (
      sourceSlotIndex: number,
      getParameterValue: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      // Find first empty slot
      const emptySlot = slots.find((s) => s.sketchId === null);
      if (!emptySlot) return null;

      return copyToSlot(sourceSlotIndex, emptySlot.index, getParameterValue);
    },
    [slots, copyToSlot],
  );

  // Remove a slot by index (legacy - now just clears the slot)
  const removeSlot = useCallback(
    (index: number): boolean => {
      return clearSlot(index);
    },
    [clearSlot],
  );

  // Change sketch in a slot (returns new parameters to initialize)
  const setSlotSketch = useCallback(
    (
      index: number,
      sketchId: SketchId,
      copyFromSlotIndex?: number,
      getParameterValue?: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      if (index < 0 || index >= FIXED_SLOT_COUNT) return null;

      // If copying from another slot and it has the same sketch type
      if (
        copyFromSlotIndex !== undefined &&
        getParameterValue &&
        slots[copyFromSlotIndex]?.sketchId === sketchId
      ) {
        return copyToSlot(copyFromSlotIndex, index, getParameterValue);
      }

      // Otherwise use setSketch for default parameters
      return setSketch(index, sketchId);
    },
    [slots, setSketch, copyToSlot],
  );

  // Start crossfading to a target slot
  const startCrossfade = useCallback(
    (targetIndex: number) => {
      if (targetIndex === activeIndex) return;
      if (targetIndex < 0 || targetIndex >= FIXED_SLOT_COUNT) return;
      // Target slot must have a sketch loaded
      const targetSlot = slots.find((s) => s.index === targetIndex);
      if (!targetSlot || !targetSlot.sketchId) return;
      if (isCrossfading) return; // Already crossfading

      setCrossfadeTargetIndex(targetIndex);
      // Don't set crossfadeValue here - let the backend drive it
    },
    [activeIndex, slots, isCrossfading],
  );

  // Complete crossfade (swap active to target)
  const completeCrossfade = useCallback(() => {
    if (crossfadeTargetIndex === null) return;

    setActiveIndex(crossfadeTargetIndex);
    setCrossfadeTargetIndex(null);
    setCrossfadeValue(0);
  }, [crossfadeTargetIndex]);

  // Cancel crossfade
  const cancelCrossfade = useCallback(() => {
    setCrossfadeTargetIndex(null);
    setCrossfadeValue(0);
  }, []);

  // Get sketch ID for a slot
  const getSketchId = useCallback(
    (index: number): SketchId | null | undefined => {
      return slots.find((s) => s.index === index)?.sketchId;
    },
    [slots],
  );

  // Check if slot is active
  const isActiveSlot = useCallback(
    (index: number): boolean => {
      return index === activeIndex;
    },
    [activeIndex],
  );

  // Check if slot is crossfade target
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
    hydrateFromBackend,
    setSlots,
    setActiveIndex,
  };
}
