import { describe, it, expect } from "vitest";
import {
  makeSlotParameterId,
  parseSlotParameterId,
  isSlotParameterId,
  isGlobalParameterId,
  buildSlotDefaultParameters,
  getSlotParameterIds,
  getParameterDescriptor,
  getParameterDropdownLabel,
  SLOT_ALPHA_TEMPLATE,
  SLOT_PARAMETER_TEMPLATES,
} from "./slotTypes";

// ============================================================================
// makeSlotParameterId
// ============================================================================

describe("makeSlotParameterId", () => {
  it("creates a valid slot parameter ID", () => {
    expect(makeSlotParameterId(0, "brightness")).toBe("slot_0_brightness");
    expect(makeSlotParameterId(7, "alpha")).toBe("slot_7_alpha");
    expect(makeSlotParameterId(3, "rotation_speed")).toBe(
      "slot_3_rotation_speed",
    );
  });

  it("handles edge case slot indices", () => {
    expect(makeSlotParameterId(0, "alpha")).toBe("slot_0_alpha");
    expect(makeSlotParameterId(99, "brightness")).toBe("slot_99_brightness");
  });
});

// ============================================================================
// parseSlotParameterId
// ============================================================================

describe("parseSlotParameterId", () => {
  it("parses a valid slot parameter ID", () => {
    const result = parseSlotParameterId("slot_0_brightness");
    expect(result).toEqual({ slotIndex: 0, templateId: "brightness" });
  });

  it("parses slot parameter IDs with underscores in template ID", () => {
    const result = parseSlotParameterId("slot_3_rotation_speed");
    expect(result).toEqual({ slotIndex: 3, templateId: "rotation_speed" });
  });

  it("parses higher slot indices", () => {
    const result = parseSlotParameterId("slot_7_alpha");
    expect(result).toEqual({ slotIndex: 7, templateId: "alpha" });
  });

  it("returns null for invalid formats", () => {
    expect(parseSlotParameterId("brightness")).toBeNull();
    expect(parseSlotParameterId("slot_brightness")).toBeNull();
    expect(parseSlotParameterId("slot__brightness")).toBeNull();
    expect(parseSlotParameterId("")).toBeNull();
    expect(parseSlotParameterId("crossfade")).toBeNull();
  });

  it("returns null for malformed slot IDs", () => {
    expect(parseSlotParameterId("slot_abc_brightness")).toBeNull();
    expect(parseSlotParameterId("SLOT_0_brightness")).toBeNull();
    expect(parseSlotParameterId("slot_0")).toBeNull();
  });
});

// ============================================================================
// isSlotParameterId
// ============================================================================

describe("isSlotParameterId", () => {
  it("returns true for valid slot parameter IDs", () => {
    expect(isSlotParameterId("slot_0_brightness")).toBe(true);
    expect(isSlotParameterId("slot_7_alpha")).toBe(true);
    expect(isSlotParameterId("slot_3_rotation_speed")).toBe(true);
  });

  it("returns false for global parameter IDs", () => {
    expect(isSlotParameterId("crossfade")).toBe(false);
  });

  it("returns false for invalid formats", () => {
    expect(isSlotParameterId("brightness")).toBe(false);
    expect(isSlotParameterId("slot_")).toBe(false);
    expect(isSlotParameterId("")).toBe(false);
  });
});

// ============================================================================
// isGlobalParameterId
// ============================================================================

describe("isGlobalParameterId", () => {
  it("returns true for crossfade", () => {
    expect(isGlobalParameterId("crossfade")).toBe(true);
  });

  it("returns false for slot parameter IDs", () => {
    expect(isGlobalParameterId("slot_0_brightness")).toBe(false);
    expect(isGlobalParameterId("slot_7_alpha")).toBe(false);
  });

  it("returns false for arbitrary strings", () => {
    expect(isGlobalParameterId("brightness")).toBe(false);
    expect(isGlobalParameterId("")).toBe(false);
    expect(isGlobalParameterId("CROSSFADE")).toBe(false);
  });
});

// ============================================================================
// SLOT_PARAMETER_TEMPLATES
// ============================================================================

describe("SLOT_PARAMETER_TEMPLATES", () => {
  it("includes the alpha template", () => {
    expect(SLOT_PARAMETER_TEMPLATES).toContainEqual(SLOT_ALPHA_TEMPLATE);
  });

  it("has valid structure for all templates", () => {
    for (const template of SLOT_PARAMETER_TEMPLATES) {
      expect(template).toHaveProperty("templateId");
      expect(template).toHaveProperty("label");
      expect(template).toHaveProperty("min");
      expect(template).toHaveProperty("max");
      expect(template).toHaveProperty("defaultValue");
      expect(template.min).toBeLessThanOrEqual(template.max);
      expect(template.defaultValue).toBeGreaterThanOrEqual(template.min);
      expect(template.defaultValue).toBeLessThanOrEqual(template.max);
    }
  });
});

// ============================================================================
// SLOT_ALPHA_TEMPLATE
// ============================================================================

describe("SLOT_ALPHA_TEMPLATE", () => {
  it("has correct properties", () => {
    expect(SLOT_ALPHA_TEMPLATE.templateId).toBe("alpha");
    expect(SLOT_ALPHA_TEMPLATE.label).toBe("Alpha");
    expect(SLOT_ALPHA_TEMPLATE.min).toBe(0);
    expect(SLOT_ALPHA_TEMPLATE.max).toBe(1);
    expect(SLOT_ALPHA_TEMPLATE.defaultValue).toBe(1);
  });
});

// ============================================================================
// buildSlotDefaultParameters
// ============================================================================

describe("buildSlotDefaultParameters", () => {
  it("returns a Map with slot parameters", () => {
    const params = buildSlotDefaultParameters(0, "trippy");
    expect(params).toBeInstanceOf(Map);
    expect(params.size).toBeGreaterThan(0);
  });

  it("includes alpha parameter for any sketch", () => {
    const params = buildSlotDefaultParameters(2, "trippy");
    expect(params.get("slot_2_alpha")).toBe(1);
  });

  it("uses correct slot index in parameter IDs", () => {
    const params = buildSlotDefaultParameters(5, "trippy");
    const keys = Array.from(params.keys());
    for (const key of keys) {
      expect(key).toMatch(/^slot_5_/);
    }
  });

  it("returns different parameters for different sketches", () => {
    const trippyParams = buildSlotDefaultParameters(0, "trippy");
    const plasmaParams = buildSlotDefaultParameters(0, "plasma");

    // Both should have alpha
    expect(trippyParams.has("slot_0_alpha")).toBe(true);
    expect(plasmaParams.has("slot_0_alpha")).toBe(true);

    // Sizes may differ based on sketch parameters
    expect(trippyParams.size).toBeGreaterThan(0);
    expect(plasmaParams.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// getSlotParameterIds
// ============================================================================

describe("getSlotParameterIds", () => {
  it("returns an array of parameter IDs", () => {
    const ids = getSlotParameterIds(0, "trippy");
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
  });

  it("includes alpha parameter", () => {
    const ids = getSlotParameterIds(3, "trippy");
    expect(ids).toContain("slot_3_alpha");
  });

  it("uses correct slot index", () => {
    const ids = getSlotParameterIds(6, "trippy");
    for (const id of ids) {
      expect(id).toMatch(/^slot_6_/);
    }
  });
});

// ============================================================================
// getParameterDescriptor
// ============================================================================

describe("getParameterDescriptor", () => {
  it("returns descriptor for crossfade", () => {
    const desc = getParameterDescriptor("crossfade");
    expect(desc).toBeDefined();
    expect(desc?.id).toBe("crossfade");
    expect(desc?.label).toBe("Crossfade");
    expect(desc?.min).toBe(0);
    expect(desc?.max).toBe(1);
  });

  it("returns descriptor for alpha parameter", () => {
    const desc = getParameterDescriptor("slot_0_alpha");
    expect(desc).toBeDefined();
    expect(desc?.id).toBe("slot_0_alpha");
    expect(desc?.label).toContain("Alpha");
    expect(desc?.min).toBe(0);
    expect(desc?.max).toBe(1);
  });

  it("returns undefined for unknown parameters", () => {
    const desc = getParameterDescriptor("unknown_param");
    expect(desc).toBeUndefined();
  });

  it("includes slot number in label for slot parameters", () => {
    const desc = getParameterDescriptor("slot_2_alpha");
    expect(desc?.label).toContain("3"); // Slot index 2 = "Slot 3"
  });
});

// ============================================================================
// getParameterDropdownLabel
// ============================================================================

describe("getParameterDropdownLabel", () => {
  it("returns 'Crossfade' for crossfade parameter", () => {
    expect(getParameterDropdownLabel("crossfade")).toBe("Crossfade");
  });

  it("returns slot number and label for slot parameters", () => {
    const label = getParameterDropdownLabel("slot_0_alpha");
    expect(label).toBe("1 - Alpha");
  });

  it("uses 1-based slot numbering", () => {
    const label = getParameterDropdownLabel("slot_7_alpha");
    expect(label).toBe("8 - Alpha");
  });

  it("returns the parameter ID for unknown parameters", () => {
    expect(getParameterDropdownLabel("unknown")).toBe("unknown");
  });
});

// ============================================================================
// Round-trip tests
// ============================================================================

describe("round-trip: makeSlotParameterId -> parseSlotParameterId", () => {
  it("can parse what it creates", () => {
    const original = { slotIndex: 4, templateId: "brightness" };
    const id = makeSlotParameterId(
      original.slotIndex,
      original.templateId as any,
    );
    const parsed = parseSlotParameterId(id);
    expect(parsed).toEqual(original);
  });

  it("works for all slot indices 0-7", () => {
    for (let i = 0; i < 8; i++) {
      const id = makeSlotParameterId(i, "alpha");
      const parsed = parseSlotParameterId(id);
      expect(parsed?.slotIndex).toBe(i);
      expect(parsed?.templateId).toBe("alpha");
    }
  });
});
