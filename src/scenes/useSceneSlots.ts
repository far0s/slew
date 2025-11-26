import { useState, useCallback, useMemo } from "react";
import type { SceneId } from "./sceneTypes";
import { ALL_SCENE_IDS } from "./sceneTypes";

/**
 * Represents a single scene slot in the UI.
 *
 * @property index - Slot index (0-based, displayed as 1-based in UI)
 * @property sceneId - Which scene is loaded in this slot
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
 * @property initialScenes - Initial scene IDs for slots (defaults to first N scenes)
 */
export interface SceneSlotsConfig {
  minSlots: number;
  maxSlots: number;
  initialScenes?: SceneId[];
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
 * @property addSlot - Add a new slot with the given scene ID
 * @property removeSlot - Remove a slot by index (cannot remove active slot)
 * @property setSlotScene - Change the scene in a slot
 * @property startCrossfade - Start crossfading to a target slot
 * @property setCrossfadeValue - Update the crossfade value (called during transition)
 * @property completeCrossfade - Complete the crossfade (swap active to target)
 * @property cancelCrossfade - Cancel an in-progress crossfade
 * @property getSceneId - Get the scene ID for a slot index
 * @property isActiveSlot - Check if a slot is the active slot
 * @property isCrossfadeTarget - Check if a slot is the crossfade target
 * @property usedSceneIds - Get all scene IDs currently in use (for exclusion in dropdowns)
 * @property availableSceneIds - Get available scene IDs not currently in use
 */
export interface SceneSlotsState {
  slots: SceneSlot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  crossfadeValue: number;
  isCrossfading: boolean;
  canAddSlot: boolean;
  canRemoveSlot: boolean;
  addSlot: (sceneId?: SceneId) => void;
  removeSlot: (index: number) => boolean;
  setSlotScene: (index: number, sceneId: SceneId) => void;
  startCrossfade: (targetIndex: number) => void;
  setCrossfadeValue: (value: number) => void;
  completeCrossfade: () => void;
  cancelCrossfade: () => void;
  getSceneId: (index: number) => SceneId | undefined;
  isActiveSlot: (index: number) => boolean;
  isCrossfadeTarget: (index: number) => boolean;
  usedSceneIds: SceneId[];
  availableSceneIds: SceneId[];
}

const DEFAULT_CONFIG: SceneSlotsConfig = {
  minSlots: 1,
  maxSlots: 4,
};

/**
 * Hook for managing numbered scene slots.
 *
 * This replaces the old "Active/Next" paradigm with a more flexible
 * system supporting 1-4 numbered slots.
 *
 * Key concepts:
 * - Each slot has an index (0-3) and a scene ID
 * - One slot is "active" (being rendered to output)
 * - Crossfading transitions from active to a target slot
 * - When crossfade completes, the target becomes the new active
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
    const scenes = initialScenes ?? ALL_SCENE_IDS.slice(0, 2);
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

  // Get scene IDs in use
  const usedSceneIds = useMemo(
    () => slots.map((slot) => slot.sceneId),
    [slots],
  );

  // Get available scene IDs
  const availableSceneIds = useMemo(
    () => ALL_SCENE_IDS.filter((id) => !usedSceneIds.includes(id)),
    [usedSceneIds],
  );

  // Add a new slot
  const addSlot = useCallback(
    (sceneId?: SceneId) => {
      if (!canAddSlot) return;

      const newSceneId = sceneId ?? availableSceneIds[0] ?? ALL_SCENE_IDS[0];

      setSlots((prev) => {
        const newIndex = prev.length;
        return [...prev, { index: newIndex, sceneId: newSceneId }];
      });
    },
    [canAddSlot, availableSceneIds],
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

  // Change scene in a slot
  const setSlotScene = useCallback((index: number, sceneId: SceneId) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.index === index ? { ...slot, sceneId } : slot)),
    );
  }, []);

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
    removeSlot,
    setSlotScene,
    startCrossfade,
    setCrossfadeValue,
    completeCrossfade,
    cancelCrossfade,
    getSceneId,
    isActiveSlot,
    isCrossfadeTarget,
    usedSceneIds,
    availableSceneIds,
  };
}
