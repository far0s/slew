import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Slot } from "@/slots/useSlots";
import type { SketchProps } from "@/sketches";
import { getSketchDescriptor } from "@/sketches";
import { logger } from "@/lib/logger";

type SlotColor = {
  startColor?: [number, number, number];
  midColor?: [number, number, number];
  endColor?: [number, number, number];
  background?: [number, number, number, number];
};

export function useSlotColors(slots: Slot[]) {
  const [slotColors, setSlotColors] = useState<Map<number, SlotColor>>(new Map());
  const prevSketchIds = useRef<Map<number, string | null>>(new Map());

  useEffect(() => {
    const changes: Array<{
      slotIndex: number;
      colorPalette: {
        startColor: [number, number, number];
        midColor: [number, number, number];
        endColor: [number, number, number];
        background: [number, number, number, number];
      };
    }> = [];
    const clears: number[] = [];

    for (const slot of slots) {
      const prev = prevSketchIds.current.get(slot.index);
      if (slot.sketchId && slot.sketchId !== prev) {
        const descriptor = getSketchDescriptor(slot.sketchId);
        if (descriptor?.colorPalette) {
          changes.push({ slotIndex: slot.index, colorPalette: descriptor.colorPalette });
        }
      } else if (!slot.sketchId && prev) {
        clears.push(slot.index);
      }
    }

    if (changes.length > 0 || clears.length > 0) {
      setSlotColors((prev) => {
        const next = new Map(prev);
        for (const { slotIndex, colorPalette } of changes) {
          next.set(slotIndex, colorPalette);
        }
        for (const slotIndex of clears) {
          next.delete(slotIndex);
        }
        return next;
      });
    }

    for (const slot of slots) {
      prevSketchIds.current.set(slot.index, slot.sketchId);
    }
  }, [slots]);

  useEffect(() => {
    const handleColorChange = (event: Event) => {
      const { slotIndex, colorType, color } = (
        event as CustomEvent<{
          slotIndex: number;
          colorType: "startColor" | "midColor" | "endColor" | "background";
          color: [number, number, number] | [number, number, number, number];
        }>
      ).detail;

      setSlotColors((prev) => {
        const next = new Map(prev);
        next.set(slotIndex, { ...(next.get(slotIndex) ?? {}), [colorType]: color });
        return next;
      });

      invoke("forward_controls_event", {
        event: "sketch-color-changed",
        payload: JSON.stringify({ slotIndex, colorType, color }),
      }).catch((err) => logger.error("Controls", "Failed to forward color change:", err));
    };

    window.addEventListener("sketch-color-changed", handleColorChange);
    return () => window.removeEventListener("sketch-color-changed", handleColorChange);
  }, []);

  const getSlotColors = useCallback(
    (slotIndex: number): SketchProps["colors"] | undefined => slotColors.get(slotIndex),
    [slotColors],
  );

  return { getSlotColors };
}
