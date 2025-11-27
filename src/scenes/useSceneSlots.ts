import { useState, useCallback } from "react";
import type { SceneId, SlotParameterId } from "./sceneTypes";
import {
  ALL_SCENE_IDS,
  buildSlotDefaultParameters,
  copySlotParameters,
  makeSlotParameterId,
  getSceneParameterTemplateIds,
} from "./sceneTypes";

/**
 * Represents a single scene slot in the UI.
 *
 * @property index - Slot index (0-based, displayed as 1-based in UI)
 * @property sceneId - Which scene type is loaded in this slot
 */
export interface SceneSlot {
  index: number;
  sceneId: SceneId;
}

/**
 * Configuration for the scene slots system.
 *
 * @property minSlots - Minimum number of slots allowed
 * @property maxSlots - Maximum number of slots allowed
 * @property initialScenes - Initial scene IDs for slots (defaults to first scene)
 */
export interface SceneSlotsConfig {
  minSlots: number;
  maxSlots: number;
  initialScenes?: SceneId[];
}

/**
 * Parameters to initialize for a new slot.
 */
export interface SlotInitParams {
  slotIndex: number;
  sceneId: SceneId;
  parameters: Map<SlotParameterId, number>;
}

/**
 * Return type for the useSceneSlots hook.
 *
 * @property slots - Array of current scene slots
 * @property activeIndex - Index of the currently active (output) slot
 * @property crossfadeTargetIndex - Index of the slot we're crossfading to, or null if not crossfading
 * @property crossfadeValue - Current crossfade value (0 = fully active, 1 = fully target)
 * @property isCrossfading - Whether we're currently mid-crossfade
 * @property canAddSlot - Whether we can add more slots
 * @property canRemoveSlot - Whether we can remove slots (must have > minSlots)
 * @property addSlot - Add a new slot with default parameters
 * @property addSlotWithCopy - Add a new slot by copying an existing slot's parameters
 * @property removeSlot - Remove a slot by index (cannot remove active slot)
 * @property setSlotScene - Change the scene in a slot (resets to defaults or copies)
 * @property startCrossfade - Start crossfading to a target slot
 * @property setCrossfadeValue - Update the crossfade value (called during transition)
 * @property completeCrossfade - Complete the crossfade (swap active to target)
 * @property cancelCrossfade - Cancel an in-progress crossfade
 * @property getSceneId - Get the scene ID for a slot index
 * @property isActiveSlot - Check if a slot is the active slot
 * @property isCrossfadeTarget - Check if a slot is the crossfade target
 * @property findSlotsWithScene - Find all slot indices that have a given scene type
 * @property getSlotParameterIds - Get all parameter IDs for a slot
 */
export interface SceneSlotsState {
  slots: SceneSlot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  canAddSlot: boolean;
  canRemoveSlot: boolean;
  addSlot: (sceneId?: SceneId) => SlotInitParams | null;
  addSlotWithCopy: (
    sourceSlotIndex: number,
    getParameterValue: (id: string) => number | undefined,
  ) => SlotInitParams | null;
  removeSlot: (index: number) => boolean;
  setSlotScene: (
    index: number,
    sceneId: SceneId,
    copyFromSlotIndex?: number,
    getParameterValue?: (id: string) => number | undefined,
  ) => SlotInitParams | null;
  startCrossfade: (targetIndex: number) => void;
  setCrossfadeValue: (value: number) => void;
  completeCrossfade: () => void;
  cancelCrossfade: () => void;
  getSceneId: (index: number) => SceneId | undefined;
  isActiveSlot: (index: number) => boolean;
  isCrossfadeTarget: (index: number) => boolean;
  findSlotsWithScene: (sceneId: SceneId) => number[];
  getSlotParameterIds: (slotIndex: number) => SlotParameterId[];
}

const DEFAULT_CONFIG: SceneSlotsConfig = {
  minSlots: 1,
  maxSlots: 6,
};

/**
 * Hook for managing numbered scene slots with multi-instance support.
 *
 * Key concepts:
 * - Each slot has an index and a scene ID (scene types can be duplicated)
 * - One slot is "active" (being rendered to output)
 * - Crossfading transitions from active to a target slot
 * - Each slot has independent parameters (prefixed with slot index)
 * - New slots can copy parameters from existing slots of the same scene type
 */
export function useSceneSlots(
  config: Partial<SceneSlotsConfig> = {},
): SceneSlotsState {
  const { minSlots, maxSlots, initialScenes } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Initialize with default scenes
  const getInitialSlots = (): SceneSlot[] => {
    const scenes = initialScenes ?? [ALL_SCENE_IDS[0]];
    return scenes.slice(0, maxSlots).map((sceneId, index) => ({
      index,
      sceneId,
    }));
  };

  const [slots, setSlots] = useState<SceneSlot[]>(getInitialSlots);
  const [activeIndex, setActiveIndex] = useState(0);
  const [crossfadeTargetIndex, setCrossfadeTargetIndex] = useState<
    number | null
  >(null);
  const [crossfadeValue, setCrossfadeValue] = useState(0);

  // Derived state
  const isCrossfading =
    crossfadeTargetIndex !== null &&
    crossfadeValue > 0.01 &&
    crossfadeValue < 0.99;
  const canAddSlot = slots.length < maxSlots;
  const canRemoveSlot = slots.length > minSlots;

  // Find all slots with a given scene type
  const findSlotsWithScene = useCallback(
    (sceneId: SceneId): number[] => {
      return slots
        .filter((slot) => slot.sceneId === sceneId)
        .map((slot) => slot.index);
    },
    [slots],
  );

  // Get parameter IDs for a slot
  const getSlotParameterIds = useCallback(
    (slotIndex: number): SlotParameterId[] => {
      const slot = slots.find((s) => s.index === slotIndex);
      if (!slot) return [];
      const templateIds = getSceneParameterTemplateIds(slot.sceneId);
      return templateIds.map((tid) => makeSlotParameterId(slotIndex, tid));
    },
    [slots],
  );

  // Add a new slot with default parameters
  const addSlot = useCallback(
    (sceneId?: SceneId): SlotInitParams | null => {
      if (!canAddSlot) return null;

      const newSceneId = sceneId ?? ALL_SCENE_IDS[0];
      const newIndex = slots.length;

      setSlots((prev) => [...prev, { index: newIndex, sceneId: newSceneId }]);

      // Return the slot info and default parameters
      const parameters = buildSlotDefaultParameters(newIndex, newSceneId);
      return { slotIndex: newIndex, sceneId: newSceneId, parameters };
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
        { index: newIndex, sceneId: sourceSlot.sceneId },
      ]);

      // Copy parameters from source slot
      const parameters = copySlotParameters(
        sourceSlotIndex,
        newIndex,
        sourceSlot.sceneId,
        getParameterValue,
      );
      return { slotIndex: newIndex, sceneId: sourceSlot.sceneId, parameters };
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

  // Change scene in a slot (returns new parameters to initialize)
  const setSlotScene = useCallback(
    (
      index: number,
      sceneId: SceneId,
      copyFromSlotIndex?: number,
      getParameterValue?: (id: string) => number | undefined,
    ): SlotInitParams | null => {
      const currentSlot = slots.find((s) => s.index === index);
      if (!currentSlot) return null;

      // Update the slot's scene ID
      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === index ? { ...slot, sceneId } : slot,
        ),
      );

      // If copying from another slot and it has the same scene type
      if (
        copyFromSlotIndex !== undefined &&
        getParameterValue &&
        slots[copyFromSlotIndex]?.sceneId === sceneId
      ) {
        const parameters = copySlotParameters(
          copyFromSlotIndex,
          index,
          sceneId,
          getParameterValue,
        );
        return { slotIndex: index, sceneId, parameters };
      }

      // Otherwise return default parameters
      const parameters = buildSlotDefaultParameters(index, sceneId);
      return { slotIndex: index, sceneId, parameters };
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

  // Get scene ID for a slot
  const getSceneId = useCallback(
    (index: number): SceneId | undefined => {
      return slots.find((s) => s.index === index)?.sceneId;
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
    setSlotScene,
    startCrossfade,
    setCrossfadeValue,
    completeCrossfade,
    cancelCrossfade,
    getSceneId,
    isActiveSlot,
    isCrossfadeTarget,
    findSlotsWithScene,
    getSlotParameterIds,
  };
}
