import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Slot } from "../slots/useSlots";
import type { SketchId } from "../sketches";
import { buildSlotDefaultParameters } from "../slots/slotTypes";
import { logger } from "../lib/logger";
import type { ParameterStoreState, BackendParameter, SlotConfig } from "./useParameterStore";

interface UseParameterBackendSyncParams {
  paramStore: ParameterStoreState;
  slots: Slot[];
  activeIndex: number;
  crossfadeTargetIndex: number | null;
  isHydrated: boolean;
  getSketchId: (index: number) => SketchId | null | undefined;
}

export function useParameterBackendSync({
  paramStore,
  slots,
  activeIndex,
  crossfadeTargetIndex,
  isHydrated,
  getSketchId,
}: UseParameterBackendSyncParams) {
  const [isInitialized, setIsInitialized] = useState(false);
  const hasHydratedRef = useRef(false);
  // Stable ref so the parameter_changed listener always reads the latest store
  const paramStoreRef = useRef(paramStore);
  useEffect(() => {
    paramStoreRef.current = paramStore;
  }, [paramStore]);

  const refreshBackendParameters = useCallback(async () => {
    paramStore.setIsLoading(true);
    paramStore.setError(null);
    try {
      const response = (await invoke("get_parameters")) as BackendParameter[];

      const slotConfig: SlotConfig[] = slots
        .filter((slot) => slot.sketchId !== null)
        .map((slot) => ({ index: slot.index, sketchId: slot.sketchId as SketchId }));

      paramStore.setCurrentSlots(slotConfig);
      paramStore.setBackendSnapshot(response);
      paramStore.applyBackendParams(response);

      const backendParamIds = new Set(response.map((p) => p.id));
      for (const slot of slots) {
        if (slot.sketchId !== null) {
          paramStore.initializeSlot(slot.index, slot.sketchId);
          // Push color sub-params that backend doesn't auto-create
          const defaults = buildSlotDefaultParameters(slot.index, slot.sketchId);
          for (const [id, value] of defaults) {
            if (/color_[a-z_]+_[rgb]$/.test(String(id)) && !backendParamIds.has(String(id))) {
              await invoke("set_parameter", { id, value, app: undefined });
            }
          }
        }
      }
    } catch (error) {
      paramStore.setError("Failed to load parameters from backend");
      logger.error("Controls", "get_parameters failed", error);
    } finally {
      paramStore.setIsLoading(false);
      setIsInitialized(true);
    }
  }, [slots, paramStore]);

  // Initial parameter load — run once after slot hydration
  useEffect(() => {
    if (!isHydrated) return;
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    void refreshBackendParameters();
  }, [isHydrated, refreshBackendParameters]);

  // Subscribe to parameter_changed events from the backend
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<BackendParameter>("parameter_changed", (event) => {
          const updated = event.payload;
          const store = paramStoreRef.current;

          store.setInterpolated(updated.id, updated.value);
          if (updated.id === "crossfade") {
            store.set("crossfade", updated.value);
          } else {
            store.setFromBackend(updated.id, updated.target);
          }

          const current = store.backendSnapshot ?? [];
          const idx = current.findIndex((p) => p.id === updated.id);
          if (idx === -1) {
            store.setBackendSnapshot([...current, updated]);
          } else {
            const next = current.slice();
            next[idx] = updated;
            store.setBackendSnapshot(next);
          }
        });
      } catch (error) {
        logger.error("Controls", "subscribe parameter_changed failed", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Sync initial slot pairing to Renderer on startup (once)
  useEffect(() => {
    if (!isInitialized || !isHydrated) return;
    const activeSketchId = getSketchId(activeIndex);
    if (activeSketchId) {
      void invoke("set_slot_pairing", {
        activeSlotIndex: activeIndex,
        activeSceneId: activeSketchId,
        nextSlotIndex: activeIndex,
        nextSceneId: activeSketchId,
      }).catch((error) => {
        logger.error("Controls", "Failed to sync initial slot pairing", error);
      });
    }
    // Intentionally only depends on init flags — runs once when both become true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, isHydrated]);

  // Sync all slots to Renderer for multi-layer alpha rendering
  useEffect(() => {
    if (!isInitialized || !isHydrated) return;

    const allSlots = slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({ index: slot.index, sketch_id: slot.sketchId as SketchId }));

    void invoke("set_all_slots", {
      slots: allSlots,
      activeSlotIndex: activeIndex,
      crossfadeTargetIndex,
    }).catch((error) => {
      logger.error("Controls", "Failed to sync all slots to renderer", error);
    });
  }, [isInitialized, isHydrated, slots, activeIndex, crossfadeTargetIndex]);

  // Keep paramStore slot config in sync with current slot state
  useEffect(() => {
    const slotConfig: SlotConfig[] = slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({ index: slot.index, sketchId: slot.sketchId as SketchId }));
    paramStore.setCurrentSlots(slotConfig);
  }, [slots, paramStore.setCurrentSlots]);

  return { isInitialized };
}
