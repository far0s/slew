import type { SketchDescriptor } from "@/sketches/types";
import thumbnail from "@/assets/sketches/luminoSmoke-thumb.png";

/**
 * LuminoSmoke Sketch Descriptor
 *
 * Animated light sources floating in darkness, each emitting volumetric halos
 * that scatter and diffuse through simulated smoke/fog. Designed for DJ backdrops
 * where real smoke machines amplify the effect.
 */
export const descriptor: SketchDescriptor = {
  thumbnail,
  id: "luminoSmoke",
  label: "LuminoSmoke",
  shortLabel: "LuminoSmoke",
  description:
    "Floating light sources with volumetric fog scatter — designed for smoky DJ backdrops (WebGPU/TSL).",
  colorPalette: {
    startColor: [0, 120, 255],
    midColor: [255, 0, 180],
    endColor: [0, 255, 160],
    background: [0, 0, 0, 1],
  },
  parameters: [
    // Color params — the 3 light-source colors
    {
      templateId: "color_primary",
      label: "Light A Color",
      group: "sketch",
      orderHint: 5,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [0, 120, 255],
      description: "Color of the first light source.",
    },
    {
      templateId: "color_secondary",
      label: "Light B Color",
      group: "sketch",
      orderHint: 6,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [255, 0, 180],
      description: "Color of the second light source.",
    },
    {
      templateId: "color_bg",
      label: "Light C Color",
      group: "sketch",
      orderHint: 7,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [0, 255, 160],
      description: "Color of the third light source.",
    },
    // Top 3 — main live controls
    {
      templateId: "smoke_density",
      label: "Smoke Density",
      group: "sketch",
      orderHint: 10,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      defaultValue: 1.0,
      description:
        "How thick the simulated fog is. Higher = more light scatter, denser halos.",
    },
    {
      templateId: "halo_radius",
      label: "Halo Radius",
      group: "sketch",
      orderHint: 20,
      min: 0.002,
      max: 1.5,
      step: 0.002,
      defaultValue: 0.0,
      description: "Size of the volumetric glow around each light source.",
    },
    {
      templateId: "light_intensity",
      label: "Intensity",
      group: "sketch",
      orderHint: 30,
      min: 0.5,
      max: 8.0,
      step: 0.1,
      defaultValue: 2.5,
      description: "Brightness of the light sources.",
    },
    // Secondary controls
    {
      templateId: "ls_speed",
      label: "Drift Speed",
      group: "sketch",
      orderHint: 40,
      min: 0.0,
      max: 2.0,
      step: 0.05,
      defaultValue: 0.3,
      description: "How fast the light sources drift around the scene.",
    },
    {
      templateId: "ls_count",
      label: "Light Count",
      group: "sketch",
      orderHint: 50,
      min: 1,
      max: 6,
      step: 1,
      defaultValue: 4,
      inputType: "integer",
      description: "Number of active floating light sources.",
    },
    {
      templateId: "scatter_falloff",
      label: "Scatter Falloff",
      group: "sketch",
      orderHint: 60,
      min: 0.5,
      max: 4.0,
      step: 0.05,
      defaultValue: 3.0,
      description:
        "How quickly the halo fades from center outward. Low = wide soft glow, high = tight core.",
    },
    {
      templateId: "smoke_turbulence",
      label: "Turbulence",
      group: "sketch",
      orderHint: 70,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      defaultValue: 0.4,
      description:
        "Adds animated noise to the fog layer, simulating air currents moving the smoke.",
    },
    {
      templateId: "chromatic_spread",
      label: "Chroma Spread",
      group: "sketch",
      orderHint: 90,
      min: 0.0,
      max: 0.15,
      step: 0.005,
      defaultValue: 0.15,
      description:
        "Chromatic aberration — separates RGB channels for a prismatic edge.",
    },
  ],
};
