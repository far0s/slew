import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import {
  generateLfoName,
  generateModulationId,
  createLfo,
  createTarget,
  createAudioModulation,
  getTargetsForParameter,
  getTargetsForLfo,
  getAudioModulationsForLfo,
  hasActiveModulation,
  LFO_SHAPES,
  DEFAULT_LFO,
  DEFAULT_AUDIO_MODULATION,
  LFO_SHAPE_LABELS,
} from "./modulation";

// ============================================================================
// generateLfoName
// ============================================================================

describe("generateLfoName", () => {
  it("formats rate >= 1 with one decimal", () => {
    expect(generateLfoName("sine", 1.0)).toBe("Sine 1.0 Hz");
    expect(generateLfoName("triangle", 2.5)).toBe("Triangle 2.5 Hz");
  });

  it("formats rate < 1 with two decimals", () => {
    expect(generateLfoName("saw", 0.5)).toBe("Saw 0.50 Hz");
    expect(generateLfoName("square", 0.25)).toBe("Square 0.25 Hz");
  });

  it("uses shape label from LFO_SHAPE_LABELS", () => {
    expect(generateLfoName("smooth_random", 1.0)).toBe("Random (smooth) 1.0 Hz");
  });
});

// ============================================================================
// generateModulationId
// ============================================================================

describe("generateModulationId", () => {
  it("uses default prefix 'mod'", () => {
    expect(generateModulationId()).toMatch(/^mod_/);
  });

  it("uses provided prefix", () => {
    expect(generateModulationId("lfo")).toMatch(/^lfo_/);
  });

  it("generates unique IDs", () => {
    const a = generateModulationId();
    const b = generateModulationId();
    expect(a).not.toBe(b);
  });
});

// ============================================================================
// createLfo
// ============================================================================

describe("createLfo", () => {
  it("returns an LfoSource with all DEFAULT_LFO fields", () => {
    const lfo = createLfo();
    expect(lfo.shape).toBe(DEFAULT_LFO.shape);
    expect(lfo.rate).toBe(DEFAULT_LFO.rate);
    expect(lfo.enabled).toBe(true);
    expect(lfo.id).toMatch(/^lfo_/);
  });

  it("applies overrides", () => {
    const lfo = createLfo({ shape: "square", rate: 2.0 });
    expect(lfo.shape).toBe("square");
    expect(lfo.rate).toBe(2.0);
    // un-overridden defaults survive
    expect(lfo.enabled).toBe(true);
  });
});

// ============================================================================
// createTarget
// ============================================================================

describe("createTarget", () => {
  it("sets source_id and parameter_id", () => {
    const t = createTarget("lfo-1", "param-A");
    expect(t.source_id).toBe("lfo-1");
    expect(t.parameter_id).toBe("param-A");
    expect(t.id).toMatch(/^target_/);
  });

  it("applies overrides", () => {
    const t = createTarget("lfo-1", "param-A", { depth: 0.1, bipolar: false });
    expect(t.depth).toBe(0.1);
    expect(t.bipolar).toBe(false);
  });
});

// ============================================================================
// createAudioModulation
// ============================================================================

describe("createAudioModulation", () => {
  it("sets lfo_id", () => {
    const m = createAudioModulation("lfo-1");
    expect(m.lfo_id).toBe("lfo-1");
    expect(m.id).toMatch(/^audiomod_/);
  });

  it("applies overrides", () => {
    const m = createAudioModulation("lfo-1", { amount: 0.5 });
    expect(m.amount).toBe(0.5);
    expect(m.source).toBe(DEFAULT_AUDIO_MODULATION.source);
  });
});

// ============================================================================
// Filter helpers and hasActiveModulation
// ============================================================================

describe("filter helpers", () => {
  const targets = [
    { id: "t1", source_id: "lfo-1", parameter_id: "param-A", depth: 0.5, bipolar: true, enabled: true },
    { id: "t2", source_id: "lfo-2", parameter_id: "param-A", depth: 0.5, bipolar: true, enabled: false },
    { id: "t3", source_id: "lfo-1", parameter_id: "param-B", depth: 0.5, bipolar: true, enabled: true },
  ];

  const audioMods = [
    { id: "a1", source: "rms" as const, lfo_id: "lfo-1", property: "rate" as const, amount: 1, min_output: 0, max_output: 1, enabled: true },
    { id: "a2", source: "rms" as const, lfo_id: "lfo-2", property: "depth" as const, amount: 1, min_output: 0, max_output: 1, enabled: true },
  ];

  describe("getTargetsForParameter", () => {
    it("returns targets matching parameterId", () => {
      expect(getTargetsForParameter(targets, "param-A")).toHaveLength(2);
    });

    it("returns empty array for unknown parameter", () => {
      expect(getTargetsForParameter(targets, "param-Z")).toHaveLength(0);
    });
  });

  describe("getTargetsForLfo", () => {
    it("returns targets matching lfoId", () => {
      expect(getTargetsForLfo(targets, "lfo-1")).toHaveLength(2);
    });

    it("returns empty array for unknown LFO", () => {
      expect(getTargetsForLfo(targets, "lfo-99")).toHaveLength(0);
    });
  });

  describe("getAudioModulationsForLfo", () => {
    it("returns audio modulations matching lfoId", () => {
      expect(getAudioModulationsForLfo(audioMods, "lfo-1")).toHaveLength(1);
    });

    it("returns empty array for unknown LFO", () => {
      expect(getAudioModulationsForLfo(audioMods, "lfo-99")).toHaveLength(0);
    });
  });

  describe("hasActiveModulation", () => {
    it("returns true when at least one enabled target matches", () => {
      expect(hasActiveModulation(targets, "param-A")).toBe(true);
    });

    it("returns false when matching target is disabled", () => {
      const disabledOnly = [
        { id: "t4", source_id: "lfo-1", parameter_id: "param-C", depth: 0.5, bipolar: true, enabled: false },
      ];
      expect(hasActiveModulation(disabledOnly, "param-C")).toBe(false);
    });

    it("returns false for unknown parameter", () => {
      expect(hasActiveModulation(targets, "param-Z")).toBe(false);
    });
  });
});

// ============================================================================
// Constants sanity checks
// ============================================================================

describe("LFO_SHAPES", () => {
  it("contains all six shapes", () => {
    expect(LFO_SHAPES).toHaveLength(6);
    expect(LFO_SHAPES).toContain("sine");
    expect(LFO_SHAPES).toContain("smooth_random");
  });
});

describe("LFO_SHAPE_LABELS", () => {
  it("has a label for every shape", () => {
    for (const shape of LFO_SHAPES) {
      expect(LFO_SHAPE_LABELS[shape]).toBeTruthy();
    }
  });
});
