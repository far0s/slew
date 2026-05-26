import { useEffect, useCallback } from "react";
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
  const crossfadeValue = paramStore.get("crossfade");

  // Complete crossfade when interpolated value reaches the target end
  useEffect(() => {
    if (slotState.crossfadeTargetIndex === null) return;

    slotState.setCrossfadeValue(crossfadeValue);

    if (crossfadeValue >= 0.99) {
      const oldActiveSlotIndex = slotState.activeIndex;
      const newActiveSlotIndex = slotState.crossfadeTargetIndex;
      const newActiveSketchId = slotState.getSketchId(newActiveSlotIndex);

      // Ordered sequence: alpha=0 on old slot → crossfade=0 → completeCrossfade → slot_pairing → alpha=1 on new slot.
      // Order matters — see comments in handleCrossfade for the reasoning.
      void (async () => {
        try {
          const oldAlphaId = makeSlotParameterId(oldActiveSlotIndex, "alpha");
          await invoke("set_parameter", { id: oldAlphaId, value: 0, app: undefined });
          paramStore.set(oldAlphaId, 0);

          paramStore.set("crossfade", 0);
          await invoke("set_parameter", { id: "crossfade", value: 0, app: undefined });

          slotState.completeCrossfade();

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
          paramStore.set(newAlphaId, 1);
        } catch (error) {
          logger.error("Controls", "Failed to complete crossfade", error);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfadeValue, slotState.crossfadeTargetIndex, slotState.activeIndex]);

  const handleCrossfade = useCallback(
    async (targetSlotIndex: number) => {
      if (targetSlotIndex === slotState.activeIndex) return;
      if (slotState.isCrossfading) return;

      slotState.startCrossfade(targetSlotIndex);

      try {
        // Set slot pairing BEFORE changing crossfade value so the Renderer
        // knows which slots to show before the fade starts.
        const targetSketchId = slotState.getSketchId(targetSlotIndex);
        const activeSketchId = slotState.getSketchId(slotState.activeIndex);
        if (targetSketchId && activeSketchId) {
          await invoke("set_slot_pairing", {
            activeSlotIndex: slotState.activeIndex,
            activeSceneId: activeSketchId,
            nextSlotIndex: targetSlotIndex,
            nextSceneId: targetSketchId,
          });
        }

        const targetAlphaId = makeSlotParameterId(targetSlotIndex, "alpha");
        await invoke("set_parameter", { id: targetAlphaId, value: 1, app: undefined });
        paramStore.set(targetAlphaId, 1);

        await invoke("set_parameter", { id: "crossfade", value: 1, app: undefined });
        await invoke("forward_controls_event", {
          event: "crossfade",
          payload: JSON.stringify({ value: 1 }),
        });
      } catch (error) {
        logger.error("Controls", "Failed to start crossfade", error);
        slotState.cancelCrossfade();
      }
    },
    [slotState, paramStore],
  );

  return { handleCrossfade };
}
