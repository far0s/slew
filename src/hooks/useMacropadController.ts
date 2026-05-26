import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SlotsState } from "@/slots/useSlots";
import { useMacropad, DEFAULT_SENSITIVITY } from "@/inputs/hid";
import { makeSlotParameterId } from "@/slots/slotTypes";
import { getSketchDescriptor } from "@/sketches";
import { logger } from "@/lib/logger";
import type { ParameterStoreState } from "./useParameterStore";

interface UseMacropadControllerParams {
  slotState: SlotsState;
  paramStore: ParameterStoreState;
  handleCrossfade: (targetSlotIndex: number) => Promise<void>;
}

export function useMacropadController({
  slotState,
  paramStore,
  handleCrossfade,
}: UseMacropadControllerParams) {
  const [macropadSelectedIndex, setMacropadSelectedIndex] = useState<number | null>(null);

  const getTargetSceneParameters = useCallback(() => {
    const targetIndex = macropadSelectedIndex ?? slotState.activeIndex;
    const sketchId = slotState.getSketchId(targetIndex);
    if (!sketchId) return [];
    const descriptor = getSketchDescriptor(sketchId);
    if (!descriptor) return [];
    return [...descriptor.parameters]
      .sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0))
      .map((template) => ({
        ...template,
        slotIndex: targetIndex,
        parameterId: makeSlotParameterId(targetIndex, template.templateId),
      }));
  }, [macropadSelectedIndex, slotState]);

  const handleSlotSelect = useCallback(
    (slotIndex: number) => {
      if (slotIndex < slotState.slots.length) {
        setMacropadSelectedIndex(slotIndex);
      }
    },
    [slotState.slots.length],
  );

  const handleMacropadCrossfade = useCallback(() => {
    if (macropadSelectedIndex === null) return;
    if (macropadSelectedIndex === slotState.activeIndex) return;
    if (slotState.isCrossfading) return;
    void handleCrossfade(macropadSelectedIndex);
    setMacropadSelectedIndex(null);
  }, [macropadSelectedIndex, slotState.activeIndex, slotState.isCrossfading, handleCrossfade]);

  const handleEncoderChange = useCallback(
    (encoderIndex: number, delta: number) => {
      const params = getTargetSceneParameters();
      if (encoderIndex >= params.length) return;

      const param = params[encoderIndex];
      const currentValue = paramStore.get(param.parameterId);

      const sensitivityChange = Math.abs(delta) * DEFAULT_SENSITIVITY;
      const actualChange = Math.max(sensitivityChange, param.step) * Math.sign(delta);
      const newValue = Math.max(param.min, Math.min(param.max, currentValue + actualChange));
      const stepped = Math.round(newValue / param.step) * param.step;

      if (stepped === currentValue) return;

      paramStore.set(param.parameterId, stepped);
      void invoke("set_parameter", { id: param.parameterId, value: stepped, app: undefined }).catch(
        (error) => logger.error("Macropad", `Failed to set ${param.parameterId}:`, error),
      );
    },
    [getTargetSceneParameters, paramStore],
  );

  useMacropad(
    { onSlotSelect: handleSlotSelect, onCrossfade: handleMacropadCrossfade, onEncoderChange: handleEncoderChange },
    { maxSlots: slotState.slots.length },
  );

  return { macropadSelectedIndex };
}
