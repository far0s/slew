import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SlotsState } from "@/slots/useSlots";
import { makeSlotParameterId } from "@/slots/slotTypes";
import { logger } from "@/lib/logger";
import type { ParameterStoreState } from "./useParameterStore";

interface UseCrossfadeParams {
  slotState: SlotsState;
  paramStore: ParameterStoreState;
}

export function useCrossfade({ slotState, paramStore }: UseCrossfadeParams) {
  const slotStateRef = useRef(slotState);
  slotStateRef.current = slotState;
  const paramSetRef = useRef(paramStore.set);
  paramSetRef.current = paramStore.set;

  const crossfadeValue = paramStore.get("crossfade");

  // Complete crossfade when interpolated value reaches the target end
  useEffect(() => {
    const ss = slotStateRef.current;
    if (ss.crossfadeTargetIndex === null) return;

    ss.setCrossfadeValue(crossfadeValue);

    if (crossfadeValue >= 0.99) {
      const oldActiveSlotIndex = ss.activeIndex;
      const newActiveSlotIndex = ss.crossfadeTargetIndex;
      const newActiveSketchId = ss.getSketchId(newActiveSlotIndex);

      void (async () => {
        try {
          const oldAlphaId = makeSlotParameterId(oldActiveSlotIndex, "alpha");
          await invoke("set_parameter", { id: oldAlphaId, value: 0, app: undefined });
          paramSetRef.current(oldAlphaId, 0);

          paramSetRef.current("crossfade", 0);
          await invoke("set_parameter", { id: "crossfade", value: 0, app: undefined });

          slotStateRef.current.completeCrossfade();

          if (newActiveSketchId) {
            await invoke("set_slot_pairing", {
              activeSlotIndex: newActiveSlotIndex,
              activeSceneId: newActiveSketchId,
              nextSlotIndex: newActiveSlotIndex,
              nextSceneId: newActiveSketchId,
            });
          }

          const newAlphaId = makeSlotParameterId(newActiveSlotIndex, "alpha");
          await invoke("set_parameter", { id: newAlphaId, value: 1, app: undefined });
          paramSetRef.current(newAlphaId, 1);
        } catch (error) {
          logger.error("Controls", "Failed to complete crossfade", error);
        }
      })();
    }
  // slotState primitives (not object) keep the effect reactive to crossfade state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfadeValue, slotState.crossfadeTargetIndex, slotState.activeIndex]);

  const handleCrossfade = useCallback(async (targetSlotIndex: number) => {
    const ss = slotStateRef.current;
    if (targetSlotIndex === ss.activeIndex) return;
    if (ss.isCrossfading) return;

    ss.startCrossfade(targetSlotIndex);

    try {
      const targetSketchId = ss.getSketchId(targetSlotIndex);
      const activeSketchId = ss.getSketchId(ss.activeIndex);
      if (targetSketchId && activeSketchId) {
        await invoke("set_slot_pairing", {
          activeSlotIndex: ss.activeIndex,
          activeSceneId: activeSketchId,
          nextSlotIndex: targetSlotIndex,
          nextSceneId: targetSketchId,
        });
      }

      const targetAlphaId = makeSlotParameterId(targetSlotIndex, "alpha");
      await invoke("set_parameter", { id: targetAlphaId, value: 1, app: undefined });
      paramSetRef.current(targetAlphaId, 1);

      await invoke("set_parameter", { id: "crossfade", value: 1, app: undefined });
      await invoke("forward_controls_event", {
        event: "crossfade",
        payload: JSON.stringify({ value: 1 }),
      });
    } catch (error) {
      logger.error("Controls", "Failed to start crossfade", error);
      slotStateRef.current.cancelCrossfade();
    }
  }, []); // stable — reads slotState/paramStore through refs at call time

  return { handleCrossfade };
}
