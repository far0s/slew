import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSlots } from "./useSlots";
import type { SketchId } from "./slotTypes";

// Mock the invoke function
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("useSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: no backend state
    mockInvoke.mockResolvedValue({
      slots: [],
      active_slot_index: 0,
      crossfade_target_index: null,
    });
  });

  // ===========================================================================
  // Initial state tests
  // ===========================================================================

  describe("initial state", () => {
    it("creates 8 slots", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.slots).toHaveLength(8);
    });

    it("initializes slots with correct indices", () => {
      const { result } = renderHook(() => useSlots());

      result.current.slots.forEach((slot, i) => {
        expect(slot.index).toBe(i);
      });
    });

    it("sets first slot with default sketch", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.slots[0].sketchId).not.toBeNull();
    });

    it("sets remaining slots to null", () => {
      const { result } = renderHook(() => useSlots());

      for (let i = 1; i < 8; i++) {
        expect(result.current.slots[i].sketchId).toBeNull();
      }
    });

    it("sets activeIndex to 0", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.activeIndex).toBe(0);
    });

    it("sets crossfadeTargetIndex to null", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.crossfadeTargetIndex).toBeNull();
    });

    it("sets crossfadeValue to 0", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.crossfadeValue).toBe(0);
    });

    it("sets isCrossfading to false", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.isCrossfading).toBe(false);
    });

    it("disables adding/removing slots (fixed 8-slot system)", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.canAddSlot).toBe(false);
      expect(result.current.canRemoveSlot).toBe(false);
    });
  });

  // ===========================================================================
  // Config tests
  // ===========================================================================

  describe("configuration", () => {
    it("accepts custom initial sketches", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      expect(result.current.slots[0].sketchId).toBe("blueCube");
      expect(result.current.slots[1].sketchId).toBe("orangeCube");
      expect(result.current.slots[2].sketchId).toBeNull();
    });
  });

  // ===========================================================================
  // setSketch tests
  // ===========================================================================

  describe("setSketch", () => {
    it("sets a sketch at a valid index", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setSketch(2, "blueCube" as SketchId);
      });

      expect(result.current.slots[2].sketchId).toBe("blueCube");
    });

    it("returns SlotInitParams with correct data", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.setSketch> = null;
      act(() => {
        initParams = result.current.setSketch(3, "orangeCube" as SketchId);
      });

      expect(initParams).not.toBeNull();
      expect(initParams!.slotIndex).toBe(3);
      expect(initParams!.sketchId).toBe("orangeCube");
      expect(initParams!.parameters).toBeInstanceOf(Map);
    });

    it("returns null for invalid index (negative)", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.setSketch> = null;
      act(() => {
        initParams = result.current.setSketch(-1, "blueCube" as SketchId);
      });

      expect(initParams).toBeNull();
    });

    it("returns null for invalid index (>= 8)", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.setSketch> = null;
      act(() => {
        initParams = result.current.setSketch(8, "blueCube" as SketchId);
      });

      expect(initParams).toBeNull();
    });

    it("can set same sketch in multiple slots", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setSketch(1, "blueCube" as SketchId);
        result.current.setSketch(2, "blueCube" as SketchId);
      });

      expect(result.current.slots[1].sketchId).toBe("blueCube");
      expect(result.current.slots[2].sketchId).toBe("blueCube");
    });
  });

  // ===========================================================================
  // clearSlot tests
  // ===========================================================================

  describe("clearSlot", () => {
    it("clears a non-active slot", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.clearSlot(1);
      });

      expect(result.current.slots[1].sketchId).toBeNull();
    });

    it("returns true on successful clear", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      let success: boolean;
      act(() => {
        success = result.current.clearSlot(1);
      });

      expect(success!).toBe(true);
    });

    it("cannot clear active slot", () => {
      const { result } = renderHook(() => useSlots());

      let success: boolean;
      act(() => {
        success = result.current.clearSlot(0); // Active slot
      });

      expect(success!).toBe(false);
      expect(result.current.slots[0].sketchId).not.toBeNull();
    });

    it("returns false for invalid index", () => {
      const { result } = renderHook(() => useSlots());

      let success: boolean;
      act(() => {
        success = result.current.clearSlot(-1);
      });

      expect(success!).toBe(false);
    });
  });

  // ===========================================================================
  // copyToSlot tests
  // ===========================================================================

  describe("copyToSlot", () => {
    it("copies sketch from source to target slot", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      const getParamValue = vi.fn().mockReturnValue(0.5);

      act(() => {
        result.current.copyToSlot(0, 1, getParamValue);
      });

      expect(result.current.slots[1].sketchId).toBe("blueCube");
    });

    it("returns SlotInitParams with copied parameters", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      const getParamValue = vi.fn().mockReturnValue(0.75);

      let initParams: ReturnType<typeof result.current.copyToSlot> = null;
      act(() => {
        initParams = result.current.copyToSlot(0, 2, getParamValue);
      });

      expect(initParams).not.toBeNull();
      expect(initParams!.slotIndex).toBe(2);
      expect(initParams!.sketchId).toBe("blueCube");
      expect(initParams!.parameters).toBeInstanceOf(Map);
    });

    it("returns null for invalid source index", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.copyToSlot> = null;
      act(() => {
        initParams = result.current.copyToSlot(-1, 1, vi.fn());
      });

      expect(initParams).toBeNull();
    });

    it("returns null for invalid target index", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.copyToSlot> = null;
      act(() => {
        initParams = result.current.copyToSlot(0, 8, vi.fn());
      });

      expect(initParams).toBeNull();
    });

    it("returns null when source slot is empty", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.copyToSlot> = null;
      act(() => {
        initParams = result.current.copyToSlot(5, 6, vi.fn()); // Slot 5 is empty
      });

      expect(initParams).toBeNull();
    });
  });

  // ===========================================================================
  // getSketchId tests
  // ===========================================================================

  describe("getSketchId", () => {
    it("returns sketch ID for filled slot", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      expect(result.current.getSketchId(0)).toBe("blueCube");
    });

    it("returns null for empty slot", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.getSketchId(5)).toBeNull();
    });

    it("returns undefined for non-existent slot", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.getSketchId(100)).toBeUndefined();
    });
  });

  // ===========================================================================
  // isActiveSlot tests
  // ===========================================================================

  describe("isActiveSlot", () => {
    it("returns true for active index", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.isActiveSlot(0)).toBe(true);
    });

    it("returns false for non-active index", () => {
      const { result } = renderHook(() => useSlots());

      expect(result.current.isActiveSlot(1)).toBe(false);
      expect(result.current.isActiveSlot(7)).toBe(false);
    });
  });

  // ===========================================================================
  // findSlotsWithSketch tests
  // ===========================================================================

  describe("findSlotsWithSketch", () => {
    it("finds all slots with a given sketch", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setSketch(0, "blueCube" as SketchId);
        result.current.setSketch(3, "blueCube" as SketchId);
        result.current.setSketch(5, "blueCube" as SketchId);
        result.current.setSketch(2, "orangeCube" as SketchId);
      });

      const trippySlots = result.current.findSlotsWithSketch(
        "blueCube" as SketchId,
      );
      expect(trippySlots).toEqual([0, 3, 5]);

      const plasmaSlots = result.current.findSlotsWithSketch(
        "orangeCube" as SketchId,
      );
      expect(plasmaSlots).toEqual([2]);
    });

    it("returns empty array when sketch not found", () => {
      const { result } = renderHook(() => useSlots());

      const slots = result.current.findSlotsWithSketch(
        "nonexistent" as SketchId,
      );
      expect(slots).toEqual([]);
    });
  });

  // ===========================================================================
  // getFilledSlots tests
  // ===========================================================================

  describe("getFilledSlots", () => {
    it("returns only slots with sketches", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      const filled = result.current.getFilledSlots();
      expect(filled).toHaveLength(2);
      expect(filled[0].sketchId).toBe("blueCube");
      expect(filled[1].sketchId).toBe("orangeCube");
    });

    it("returns empty array when no slots filled", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: [],
        }),
      );

      const filled = result.current.getFilledSlots();
      expect(filled).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getSlotParameterIds tests
  // ===========================================================================

  describe("getSlotParameterIds", () => {
    it("returns parameter IDs for filled slot", async () => {
      // Mock backend to return matching initial state
      mockInvoke.mockResolvedValueOnce({
        slots: [{ index: 0, sketch_id: "blueCube" }],
        active_slot_index: 0,
        crossfade_target_index: null,
      });

      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      // Wait for any hydration effects to settle
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });

      const ids = result.current.getSlotParameterIds(0);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids[0]).toMatch(/^slot_0_/);
    });

    it("returns empty array for empty slot", () => {
      const { result } = renderHook(() => useSlots());

      const ids = result.current.getSlotParameterIds(5);
      expect(ids).toEqual([]);
    });
  });

  // ===========================================================================
  // Crossfade tests
  // ===========================================================================

  describe("crossfade", () => {
    it("startCrossfade sets target index", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.startCrossfade(1);
      });

      expect(result.current.crossfadeTargetIndex).toBe(1);
    });

    it("startCrossfade does nothing for active slot", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.startCrossfade(0);
      });

      expect(result.current.crossfadeTargetIndex).toBeNull();
    });

    it("startCrossfade does nothing for empty slot", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.startCrossfade(5); // Empty slot
      });

      expect(result.current.crossfadeTargetIndex).toBeNull();
    });

    it("startCrossfade does nothing for invalid index", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.startCrossfade(-1);
      });

      expect(result.current.crossfadeTargetIndex).toBeNull();
    });

    it("setCrossfadeValue updates crossfade value", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.startCrossfade(1);
        result.current.setCrossfadeValue(0.5);
      });

      expect(result.current.crossfadeValue).toBe(0.5);
    });

    it("completeCrossfade sets active index and clears target", async () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      // Wait for hydration to complete
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });

      act(() => {
        result.current.startCrossfade(1);
      });

      act(() => {
        result.current.completeCrossfade();
      });

      expect(result.current.activeIndex).toBe(1);
      expect(result.current.crossfadeTargetIndex).toBeNull();
      expect(result.current.crossfadeValue).toBe(0);
    });

    it("cancelCrossfade clears target and value", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.startCrossfade(1);
        result.current.setCrossfadeValue(0.7);
        result.current.cancelCrossfade();
      });

      expect(result.current.crossfadeTargetIndex).toBeNull();
      expect(result.current.crossfadeValue).toBe(0);
      expect(result.current.activeIndex).toBe(0); // Unchanged
    });

    it("isCrossfadeTarget returns true for target slot", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.startCrossfade(1);
      });

      expect(result.current.isCrossfadeTarget(1)).toBe(true);
      expect(result.current.isCrossfadeTarget(0)).toBe(false);
    });
  });

  // ===========================================================================
  // addSlot tests
  // ===========================================================================

  describe("addSlot", () => {
    it("adds sketch to first empty slot", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      act(() => {
        result.current.addSlot("orangeCube" as SketchId);
      });

      expect(result.current.slots[1].sketchId).toBe("orangeCube");
    });

    it("returns SlotInitParams on success", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      let initParams: ReturnType<typeof result.current.addSlot> = null;
      act(() => {
        initParams = result.current.addSlot("orangeCube" as SketchId);
      });

      expect(initParams).not.toBeNull();
      expect(initParams!.slotIndex).toBe(1);
      expect(initParams!.sketchId).toBe("orangeCube");
    });

    it("returns null when all slots are full", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: [
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
            "blueCube" as SketchId,
          ],
        }),
      );

      let initParams: ReturnType<typeof result.current.addSlot> = null;
      act(() => {
        initParams = result.current.addSlot("orangeCube" as SketchId);
      });

      expect(initParams).toBeNull();
    });
  });

  // ===========================================================================
  // setSlotSketch tests
  // ===========================================================================

  describe("setSlotSketch", () => {
    it("sets sketch at specified index", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setSlotSketch(3, "blueCube" as SketchId);
      });

      expect(result.current.slots[3].sketchId).toBe("blueCube");
    });

    it("copies from another slot when same sketch and copyFromSlotIndex provided", async () => {
      // Mock backend to return the slot we want to copy from
      mockInvoke.mockResolvedValueOnce({
        slots: [{ index: 0, sketch_id: "blueCube" }],
        active_slot_index: 0,
        crossfade_target_index: null,
      });

      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId],
        }),
      );

      // Wait for hydration to complete so slots are initialized
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });

      // Verify slot 0 has trippy before copying
      expect(result.current.slots[0].sketchId).toBe("blueCube");

      const getParamValue = vi.fn().mockReturnValue(0.8);

      act(() => {
        result.current.setSlotSketch(
          2,
          "blueCube" as SketchId,
          0,
          getParamValue,
        );
      });

      expect(result.current.slots[2].sketchId).toBe("blueCube");
      // The copy path requires source slot to have the same sketchId
      expect(getParamValue).toHaveBeenCalled();
    });

    it("returns null for invalid index", () => {
      const { result } = renderHook(() => useSlots());

      let initParams: ReturnType<typeof result.current.setSlotSketch> = null;
      act(() => {
        initParams = result.current.setSlotSketch(10, "blueCube" as SketchId);
      });

      expect(initParams).toBeNull();
    });
  });

  // ===========================================================================
  // removeSlot tests
  // ===========================================================================

  describe("removeSlot", () => {
    it("clears the slot (alias for clearSlot)", () => {
      const { result } = renderHook(() =>
        useSlots({
          initialSketches: ["blueCube" as SketchId, "orangeCube" as SketchId],
        }),
      );

      act(() => {
        result.current.removeSlot(1);
      });

      expect(result.current.slots[1].sketchId).toBeNull();
    });
  });

  // ===========================================================================
  // Hydration tests
  // ===========================================================================

  describe("hydration", () => {
    it("hydrates from backend on mount", async () => {
      mockInvoke.mockResolvedValueOnce({
        slots: [
          { index: 0, sketch_id: "blueCube" },
          { index: 1, sketch_id: "orangeCube" },
        ],
        active_slot_index: 1,
        crossfade_target_index: null,
      });

      const { result } = renderHook(() => useSlots());

      // Wait for hydration
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });

      expect(result.current.slots[0].sketchId).toBe("blueCube");
      expect(result.current.slots[1].sketchId).toBe("orangeCube");
      expect(result.current.activeIndex).toBe(1);
    });

    it("sets isHydrated to true even on backend error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("Backend error"));

      const { result } = renderHook(() => useSlots());

      // Wait for hydration attempt
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });
    });

    it("can manually trigger hydration", async () => {
      // First call returns empty (auto-hydration), second call returns data
      mockInvoke
        .mockResolvedValueOnce({
          slots: [],
          active_slot_index: 0,
          crossfade_target_index: null,
        })
        .mockResolvedValueOnce({
          slots: [{ index: 0, sketch_id: "blueCube" }],
          active_slot_index: 0,
          crossfade_target_index: null,
        });

      const { result } = renderHook(() => useSlots());

      // Wait for initial hydration
      await vi.waitFor(() => {
        expect(result.current.isHydrated).toBe(true);
      });

      let success: boolean;
      await act(async () => {
        success = await result.current.hydrateFromBackend();
      });

      expect(success!).toBe(true);
    });
  });

  // ===========================================================================
  // Direct state setters tests
  // ===========================================================================

  describe("direct state setters", () => {
    it("setSlots updates slots array", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setSlots([
          { index: 0, sketchId: "orangeCube" as SketchId },
          { index: 1, sketchId: "blueCube" as SketchId },
          { index: 2, sketchId: null },
          { index: 3, sketchId: null },
          { index: 4, sketchId: null },
          { index: 5, sketchId: null },
          { index: 6, sketchId: null },
          { index: 7, sketchId: null },
        ]);
      });

      expect(result.current.slots[0].sketchId).toBe("orangeCube");
      expect(result.current.slots[1].sketchId).toBe("blueCube");
    });

    it("setActiveIndex updates active index", () => {
      const { result } = renderHook(() => useSlots());

      act(() => {
        result.current.setActiveIndex(5);
      });

      expect(result.current.activeIndex).toBe(5);
    });
  });
});
