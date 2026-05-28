import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Slot } from "@/slots/useSlots";
import type { SketchId } from "@/sketches";
import { buildSlotDefaultParameters } from "@/slots/slotTypes";
import { logger } from "@/lib/logger";
import type {
  ParameterStoreState,
  BackendParameter,
  SlotConfig,
} from "./useParameterStore";
import type { ParameterId } from "@/slots/slotTypes";

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
  const paramStoreRef = useRef(paramStore);
  useEffect(() => {
    paramStoreRef.current = paramStore;
  }, [paramStore]);

  // Pending target updates — populated by the parameter_changed listener,
  // flushed once per RAF frame as a single setMany call (one React render/frame).
  const pendingTargetsRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number>(0);

  const refreshBackendParameters = useCallback(async () => {
    paramStore.setIsLoading(true);
    paramStore.setError(null);
    try {
      const response = (await invoke("get_parameters")) as BackendParameter[];

      const slotConfig: SlotConfig[] = slots
        .filter((slot) => slot.sketchId !== null)
        .map((slot) => ({
          index: slot.index,
          sketchId: slot.sketchId as SketchId,
        }));

      paramStore.setCurrentSlots(slotConfig);
      paramStore.setBackendSnapshot(response);
      paramStore.applyBackendParams(response);

      const backendParamIds = new Set(response.map((p) => p.id));
      for (const slot of slots) {
        if (slot.sketchId !== null) {
          paramStore.initializeSlot(slot.index, slot.sketchId);
          const defaults = buildSlotDefaultParameters(
            slot.index,
            slot.sketchId,
          );
          for (const [id, value] of defaults) {
            if (
              /color_[a-z_]+_[rgb]$/.test(String(id)) &&
              !backendParamIds.has(String(id))
            ) {
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

  useEffect(() => {
    if (!isHydrated) return;
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    void refreshBackendParameters();
  }, [isHydrated, refreshBackendParameters]);

  // Subscribe to parameter_changed. Only update refs here — no React setState.
  // Target updates are batched and flushed once per RAF frame below.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            const updated = event.payload;
            const store = paramStoreRef.current;

            // Interpolated value goes straight to ref — no React render.
            store.setInterpolated(updated.id, updated.value);

            // Update backendSnapshot ref.
            const current = store.backendSnapshot ?? [];
            const idx = current.findIndex((p) => p.id === updated.id);
            if (idx === -1) {
              store.setBackendSnapshot([...current, updated]);
            } else {
              const next = current.slice();
              next[idx] = updated;
              store.setBackendSnapshot(next);
            }

            // Queue target update for RAF flush.
            const targetValue =
              updated.id === "crossfade" ? updated.value : updated.target;
            pendingTargetsRef.current.set(updated.id, targetValue);
          },
        );
      } catch (error) {
        logger.error("Controls", "subscribe parameter_changed failed", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // RAF flush: apply all pending target updates in one React render per frame.
  useEffect(() => {
    function flush() {
      if (pendingTargetsRef.current.size > 0) {
        const store = paramStoreRef.current;
        const updates: Array<[ParameterId, number]> = [];

        for (const [id, value] of pendingTargetsRef.current) {
          if (store.hasPendingUserInput(id as ParameterId)) continue;
          const current = store.parameters.get(id as ParameterId);
          if (current !== undefined && Math.abs(current - value) < 0.001)
            continue;
          updates.push([id as ParameterId, value]);
        }
        pendingTargetsRef.current.clear();

        if (updates.length > 0) {
          store.setMany(updates);
        }
      }
      rafRef.current = requestAnimationFrame(flush);
    }

    rafRef.current = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, isHydrated]);

  useEffect(() => {
    if (!isInitialized || !isHydrated) return;

    const allSlots = slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({
        index: slot.index,
        sketch_id: slot.sketchId as SketchId,
      }));

    void invoke("set_all_slots", {
      slots: allSlots,
      activeSlotIndex: activeIndex,
      crossfadeTargetIndex,
    }).catch((error) => {
      logger.error("Controls", "Failed to sync all slots to renderer", error);
    });
  }, [isInitialized, isHydrated, slots, activeIndex, crossfadeTargetIndex]);

  useEffect(() => {
    const slotConfig: SlotConfig[] = slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({
        index: slot.index,
        sketchId: slot.sketchId as SketchId,
      }));
    paramStore.setCurrentSlots(slotConfig);
  }, [slots, paramStore.setCurrentSlots]);

  return { isInitialized };
}
