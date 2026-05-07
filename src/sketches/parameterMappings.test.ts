import { describe, it, expect } from "vitest";
import { TEMPLATE_ID_TO_PROPS_KEY } from "./parameterMappings";
import { SKETCH_REGISTRY } from "./index";
import type { ParameterTemplateId } from "./types";

// All ParameterTemplateIds from types.ts
// This list must be kept in sync with the type definition
const ALL_PARAMETER_TEMPLATE_IDS: ParameterTemplateId[] = [
  // Slot-level parameters
  "alpha",
  "audio_reactivity",
  // Common parameters
  "brightness",
  "rotation_speed",
  "tint",
  // BlueCube specific
  "wobble",
  "tint_lfo_depth",
  // OrangeCube specific
  "scale",
  // GreenPulse specific
  "pulse_speed",
  // TslText3D specific
  "hue_shift",
  "glow_intensity",
  // TslNoiseBlob specific
  "noise_scale",
  "noise_speed",
  "color_mix",
  // Plasma specific
  "plasma_speed",
  "plasma_scale",
  "plasma_complexity",
  "plasma_color_cycle",
  // Kaleidoscope specific
  "kaleid_segments",
  "kaleid_zoom",
  "kaleid_rotation",
  "kaleid_pattern_speed",
  // FeedbackTunnel specific
  "tunnel_speed",
  "tunnel_twist",
  "tunnel_layers",
  "tunnel_color_speed",
  // Waveform specific
  "wave_speed",
  "wave_amplitude",
  "wave_frequency",
  "wave_glow",
  // Aura specific
  "bloom",
  "complexity",
  "sample_offset",
  "speed",
  "scale_base",
  "distance",
  "attenuation",
  "ray_steps",
  "seed",
  "color_interp",
  "grain_intensity",
  "tonemap_mode",
  // LuminoSmoke specific
  "smoke_density",
  "halo_radius",
  "light_intensity",
  "ls_speed",
  "ls_count",
  "scatter_falloff",
  "smoke_turbulence",
  "chromatic_spread",
  "pulse_amount",
  // PrismLines specific
  "line_glow",
  "prism_intensity",
  "line_brightness",
  "pl_speed",
  "pl_count",
  "prism_spread",
  "rotation_chaos",
  // StarTrails specific
  "trail_length",
  "trail_fade",
  "star_glow",
  "star_brightness",
  "swirl_speed",
  "swirl_tightness",
  "orbit_chaos",
  "trail_smoke",
  "star_count",
  "trail_steps",
  "trail_blend",
  "three_body",
  // VortexBeam specific
  "vb_speed",
  "vb_glow",
  "vb_brightness",
  "vb_tightness",
  "vb_reach",
  "vb_trail",
  "vb_smoke",
  "vb_chroma",
  "vb_pulse",
  "vb_arms",
  // Color parameters
  "color_primary",
  "color_secondary",
  "color_bg",
];

describe("TEMPLATE_ID_TO_PROPS_KEY", () => {
  it("covers all ParameterTemplateId values", () => {
    const mappingKeys = Object.keys(TEMPLATE_ID_TO_PROPS_KEY);

    for (const templateId of ALL_PARAMETER_TEMPLATE_IDS) {
      expect(
        mappingKeys,
        `Missing mapping for "${templateId}"`,
      ).toContain(templateId);
    }
  });

  it("has no extra keys beyond ParameterTemplateId values", () => {
    const mappingKeys = Object.keys(TEMPLATE_ID_TO_PROPS_KEY);

    for (const key of mappingKeys) {
      expect(
        ALL_PARAMETER_TEMPLATE_IDS,
        `Extra key "${key}" not in ParameterTemplateId`,
      ).toContain(key);
    }
  });

  it("has the same count as ParameterTemplateId values", () => {
    const mappingKeys = Object.keys(TEMPLATE_ID_TO_PROPS_KEY);
    expect(mappingKeys.length).toBe(ALL_PARAMETER_TEMPLATE_IDS.length);
  });

  it("maps snake_case to camelCase correctly", () => {
    // Test a sample of known mappings
    expect(TEMPLATE_ID_TO_PROPS_KEY.rotation_speed).toBe("rotationSpeed");
    expect(TEMPLATE_ID_TO_PROPS_KEY.tint_lfo_depth).toBe("tintLfoDepth");
    expect(TEMPLATE_ID_TO_PROPS_KEY.pulse_speed).toBe("pulseSpeed");
    expect(TEMPLATE_ID_TO_PROPS_KEY.hue_shift).toBe("hueShift");
    expect(TEMPLATE_ID_TO_PROPS_KEY.noise_scale).toBe("noiseScale");
    expect(TEMPLATE_ID_TO_PROPS_KEY.plasma_speed).toBe("plasmaSpeed");
    expect(TEMPLATE_ID_TO_PROPS_KEY.kaleid_segments).toBe("kaleidSegments");
    expect(TEMPLATE_ID_TO_PROPS_KEY.tunnel_speed).toBe("tunnelSpeed");
    expect(TEMPLATE_ID_TO_PROPS_KEY.wave_amplitude).toBe("waveAmplitude");
    expect(TEMPLATE_ID_TO_PROPS_KEY.grain_intensity).toBe("grainIntensity");
    expect(TEMPLATE_ID_TO_PROPS_KEY.audio_reactivity).toBe("audioReactivity");
  });

  it("maps single-word keys to themselves", () => {
    expect(TEMPLATE_ID_TO_PROPS_KEY.alpha).toBe("alpha");
    expect(TEMPLATE_ID_TO_PROPS_KEY.brightness).toBe("brightness");
    expect(TEMPLATE_ID_TO_PROPS_KEY.tint).toBe("tint");
    expect(TEMPLATE_ID_TO_PROPS_KEY.scale).toBe("scale");
    expect(TEMPLATE_ID_TO_PROPS_KEY.wobble).toBe("wobble");
    expect(TEMPLATE_ID_TO_PROPS_KEY.bloom).toBe("bloom");
    expect(TEMPLATE_ID_TO_PROPS_KEY.complexity).toBe("complexity");
    expect(TEMPLATE_ID_TO_PROPS_KEY.speed).toBe("speed");
    expect(TEMPLATE_ID_TO_PROPS_KEY.distance).toBe("distance");
    expect(TEMPLATE_ID_TO_PROPS_KEY.attenuation).toBe("attenuation");
    expect(TEMPLATE_ID_TO_PROPS_KEY.seed).toBe("seed");
  });

  it("covers all template IDs used by registered sketches", () => {
    // Collect all template IDs actually used by sketches
    const usedTemplateIds = new Set<string>();
    for (const sketch of SKETCH_REGISTRY) {
      for (const param of sketch.parameters) {
        usedTemplateIds.add(param.templateId);
      }
    }

    // Verify all used IDs are in the mapping
    for (const templateId of usedTemplateIds) {
      expect(
        TEMPLATE_ID_TO_PROPS_KEY,
        `Sketch uses "${templateId}" but it's not in the mapping`,
      ).toHaveProperty(templateId);
    }
  });
});
