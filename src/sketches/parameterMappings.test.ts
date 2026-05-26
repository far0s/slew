import { describe, it, expect } from "vitest";
import { templateIdToPropsKey } from "./parameterMappings";
import { SKETCH_REGISTRY } from "./index";

describe("templateIdToPropsKey", () => {
  it("converts snake_case to camelCase", () => {
    expect(templateIdToPropsKey("rotation_speed")).toBe("rotationSpeed");
    expect(templateIdToPropsKey("tint_lfo_depth")).toBe("tintLfoDepth");
    expect(templateIdToPropsKey("pulse_speed")).toBe("pulseSpeed");
    expect(templateIdToPropsKey("hue_shift")).toBe("hueShift");
    expect(templateIdToPropsKey("noise_scale")).toBe("noiseScale");
    expect(templateIdToPropsKey("plasma_speed")).toBe("plasmaSpeed");
    expect(templateIdToPropsKey("plasma_color_cycle")).toBe("plasmaColorCycle");
    expect(templateIdToPropsKey("kaleid_segments")).toBe("kaleidSegments");
    expect(templateIdToPropsKey("tunnel_speed")).toBe("tunnelSpeed");
    expect(templateIdToPropsKey("wave_amplitude")).toBe("waveAmplitude");
    expect(templateIdToPropsKey("grain_intensity")).toBe("grainIntensity");
    expect(templateIdToPropsKey("audio_reactivity")).toBe("audioReactivity");
    expect(templateIdToPropsKey("color_primary")).toBe("colorPrimary");
    expect(templateIdToPropsKey("color_bg")).toBe("colorBg");
    expect(templateIdToPropsKey("vb_arms")).toBe("vbArms");
  });

  it("leaves single-word IDs unchanged", () => {
    expect(templateIdToPropsKey("alpha")).toBe("alpha");
    expect(templateIdToPropsKey("brightness")).toBe("brightness");
    expect(templateIdToPropsKey("tint")).toBe("tint");
    expect(templateIdToPropsKey("scale")).toBe("scale");
    expect(templateIdToPropsKey("wobble")).toBe("wobble");
    expect(templateIdToPropsKey("bloom")).toBe("bloom");
    expect(templateIdToPropsKey("complexity")).toBe("complexity");
    expect(templateIdToPropsKey("speed")).toBe("speed");
    expect(templateIdToPropsKey("distance")).toBe("distance");
    expect(templateIdToPropsKey("attenuation")).toBe("attenuation");
    expect(templateIdToPropsKey("seed")).toBe("seed");
  });

  it("handles all template IDs used by registered sketches without error", () => {
    for (const sketch of SKETCH_REGISTRY) {
      for (const param of sketch.parameters) {
        const result = templateIdToPropsKey(param.templateId);
        expect(typeof result).toBe("string");
        expect(result.length).toBeGreaterThan(0);
      }
    }
  });
});
