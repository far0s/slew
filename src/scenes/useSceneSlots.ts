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
 * @property sketchId - Which sketch type is loaded in this slot
 */
export interface Slot {
  index: number;
  sketchId: SketchId;
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
 * @property addSlot - Add a new slot with default parameters
 * @property addSlotWithCopy - Add a new slot by copying an existing slot's parameters
 * @property removeSlot - Remove a slot by index (cannot remove active slot)
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
  getSketchId: (index: number) => SketchId | undefined;
  isActiveSlot: (index: number) => boolean;
  isCrossfadeTarget: (index: number) => boolean;
  findSlotsWithSketch: (sketchId: SketchId) => number[];
  getSlotParameterIds: (slotIndex: number) => SlotParameterId[];
  isHydrated: boolean;
  hydrateFromBackend: () => Promise<boolean>;
  setSlots: (slots: Slot[]) => void;
  setActiveIndex: (index: number) => void;
}

const DEFAULT_CONFIG: SlotsConfig = {
  minSlots: 1,
  maxSlots: 6,
};

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
  const { minSlots, maxSlots } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Initialize with default sketches
  const getInitialSlots = (): Slot[] => {
    const sketches = config.initialSketches ?? [ALL_SKETCH_IDS[0]];
    return sketches.slice(0, maxSlots).map((sketchId, index) => ({
      index,
      sketchId,
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
        const hydratedSlots: Slot[] = backendState.slots.map((s) => ({
          index: s.index,
          sketchId: s.sketch_id as SketchId,
        }));

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
  const canAddSlot = slots.length < maxSlots;
  const canRemoveSlot = slots.length > minSlots;

  // Find all slots with a given sketch type
  const findSlotsWithSketch = useCallback(
    (sketchId: SketchId): number[] => {
      return slots
        .filter((slot) => slot.sketchId === sketchId)
        .map((slot) => slot.index);
    },
    [slots],
  );

  // Get parameter IDs for a slot
  const getSlotParameterIds = useCallback(
    (slotIndex: number): SlotParameterId[] => {
      const slot = slots.find((s) => s.index === slotIndex);
      if (!slot) return [];
      const templateIds = getSketchParameterTemplateIds(slot.sketchId);
      return templateIds.map((tid) => makeSlotParameterId(slotIndex, tid));
    },
    [slots],
  );

  // Add a new slot with default parameters
  const addSlot = useCallback(
    (sketchId?: SketchId): SlotInitParams | null => {
      if (!canAddSlot) return null;

      const newSketchId = sketchId ?? ALL_SKETCH_IDS[0];
      const newIndex = slots.length;

      setSlots((prev) => [...prev, { index: newIndex, sketchId: newSketchId }]);

      // Return the slot info and default parameters
      const parameters = buildSlotDefaultParameters(newIndex, newSketchId);
      return {
        slotIndex: newIndex,
        sketchId: newSketchId,
        parameters,
      };
    },
    [canAddSlot, slots.length],
  );

  // Add a new slot by copying an existing slot's parameters
  const addSlotWithCopy = useCallback(
    (
      sourceSlotIndex: number,
      getParameterValue: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      if (!canAddSlot) return null;

      const sourceSlot = slots.find((s) => s.index === sourceSlotIndex);
      if (!sourceSlot) return null;

      const newIndex = slots.length;

      setSlots((prev) => [
        ...prev,
        {
          index: newIndex,
          sketchId: sourceSlot.sketchId,
        },
      ]);

      // Copy parameters from source slot
      const parameters = copySlotParameters(
        sourceSlotIndex,
        newIndex,
        sourceSlot.sketchId,
        getParameterValue,
      );
      return {
        slotIndex: newIndex,
        sketchId: sourceSlot.sketchId,
        parameters,
      };
    },
    [canAddSlot, slots],
  );

  // Remove a slot by index
  const removeSlot = useCallback(
    (index: number): boolean => {
      if (!canRemoveSlot) return false;
      if (index === activeIndex) return false; // Cannot remove active slot
      if (index < 0 || index >= slots.length) return false;

      setSlots((prev) => {
        const newSlots = prev
          .filter((_, i) => i !== index)
          .map((slot, i) => ({ ...slot, index: i }));
        return newSlots;
      });

      // Adjust active index if needed
      if (index < activeIndex) {
        setActiveIndex((prev) => prev - 1);
      }

      // Clear crossfade target if it was removed
      if (crossfadeTargetIndex !== null) {
        if (index === crossfadeTargetIndex) {
          setCrossfadeTargetIndex(null);
          setCrossfadeValue(0);
        } else if (index < crossfadeTargetIndex) {
          setCrossfadeTargetIndex((prev) => (prev !== null ? prev - 1 : null));
        }
      }

      return true;
    },
    [canRemoveSlot, activeIndex, slots.length, crossfadeTargetIndex],
  );

  // Change sketch in a slot (returns new parameters to initialize)
  const setSlotSketch = useCallback(
    (
      index: number,
      sketchId: SketchId,
      copyFromSlotIndex?: number,
      getParameterValue?: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      const currentSlot = slots.find((s) => s.index === index);
      if (!currentSlot) return null;

      // Update the slot's sketch ID
      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === index ? { ...slot, sketchId } : slot,
        ),
      );

      // If copying from another slot and it has the same sketch type
      if (
        copyFromSlotIndex !== undefined &&
        getParameterValue &&
        slots[copyFromSlotIndex]?.sketchId === sketchId
      ) {
        const parameters = copySlotParameters(
          copyFromSlotIndex,
          index,
          sketchId,
          getParameterValue,
        );
        return {
          slotIndex: index,
          sketchId,
          parameters,
        };
      }

      // Otherwise return default parameters
      const parameters = buildSlotDefaultParameters(index, sketchId);
      return {
        slotIndex: index,
        sketchId,
        parameters,
      };
    },
    [slots],
  );

  // Start crossfading to a target slot
  const startCrossfade = useCallback(
    (targetIndex: number) => {
      if (targetIndex === activeIndex) return;
      if (targetIndex < 0 || targetIndex >= slots.length) return;
      if (isCrossfading) return; // Already crossfading

      setCrossfadeTargetIndex(targetIndex);
      // Don't set crossfadeValue here - let the backend drive it
    },
    [activeIndex, slots.length, isCrossfading],
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
    (index: number): SketchId | undefined => {
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
    isHydrated,
    hydrateFromBackend,
    setSlots,
    setActiveIndex,
  };
}
