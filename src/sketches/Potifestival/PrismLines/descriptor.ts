import type { SketchDescriptor } from "@/sketches/types";
import thumbnail from "@/assets/sketches/prismLines-thumb.png";

/**
 * PrismLines Sketch Descriptor
 *
 * Glowing lines drifting and rotating through darkness, scattering light into
 * simulated smoke. Where lines intersect, they collide and emit prismatic flares —
 * a rainbow burst of refracted light. Designed for smoky DJ backdrops.
 */
export const descriptor: SketchDescriptor = {
  thumbnail,
  id: "prismLines",
  label: "PrismLines",
  shortLabel: "PrismLines",
  description:
    "Glowing fog lines that crash and merge with prismatic flares at intersections (WebGPU/TSL).",
  colorPalette: {
    startColor: [0, 180, 255],
    midColor: [220, 0, 255],
    endColor: [0, 255, 120],
    background: [0, 0, 0, 1],
  },
  parameters: [
    {
      templateId: "color_primary",
      label: "Line A Color",
      group: "sketch",
      orderHint: 5,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [0, 180, 255],
      description: "Base color tint for odd-numbered lines.",
    },
    {
      templateId: "color_secondary",
      label: "Line B Color",
      group: "sketch",
      orderHint: 6,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [220, 0, 255],
      description: "Base color tint for even-numbered lines.",
    },
    {
      templateId: "color_bg",
      label: "Prism Tint",
      group: "sketch",
      orderHint: 7,
      min: 0,
      max: 255,
      step: 1,
      defaultValue: 0,
      inputType: "color",
      defaultColorValue: [255, 220, 80],
      description: "Color tint added to the intersection / collision flare.",
    },
    // Top 3 — main live controls
    {
      templateId: "line_glow",
      label: "Line Glow",
      group: "sketch",
      orderHint: 10,
      min: 0.001,
      max: 0.12,
      step: 0.001,
      defaultValue: 0.02,
      description:
        "Thickness / glow radius of each line. Very low = razor-thin light saber, high = fat fog beam.",
    },
    {
      templateId: "prism_intensity",
      label: "Prism Intensity",
      group: "sketch",
      orderHint: 20,
      min: 0.0,
      max: 5.0,
      step: 0.05,
      defaultValue: 2.2,
      description:
        "Strength of the rainbow flare emitted when two lines intersect.",
    },
    {
      templateId: "line_brightness",
      label: "Brightness",
      group: "sketch",
      orderHint: 30,
      min: 0.5,
      max: 8.0,
      step: 0.1,
      defaultValue: 1.0,
      description: "Overall brightness of the lines and flares.",
    },
    // Secondary controls
    {
      templateId: "pl_speed",
      label: "Drift Speed",
      group: "sketch",
      orderHint: 40,
      min: 0.0,
      max: 2.0,
      step: 0.05,
      defaultValue: 0.25,
      description: "How fast lines drift and rotate across the scene.",
    },
    {
      templateId: "pl_count",
      label: "Line Count",
      group: "sketch",
      orderHint: 50,
      min: 2,
      max: 8,
      step: 1,
      defaultValue: 4,
      inputType: "integer",
      description: "Number of light lines. More lines = more intersections.",
    },
    {
      templateId: "smoke_density",
      label: "Smoke Density",
      group: "sketch",
      orderHint: 60,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      defaultValue: 0.3,
      description: "How much the fog scatters light sideways along each beam.",
    },
    {
      templateId: "prism_spread",
      label: "Prism Spread",
      group: "sketch",
      orderHint: 70,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      defaultValue: 0.35,
      description:
        "How wide the prismatic rainbow fans out from the intersection point.",
    },
    {
      templateId: "rotation_chaos",
      label: "Rotation Chaos",
      group: "sketch",
      orderHint: 80,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      defaultValue: 0.5,
      description:
        "Each line rotates at its own speed. Higher = more chaotic angles and frequent crossings.",
    },
    {
      templateId: "chromatic_spread",
      label: "Chroma Spread",
      group: "sketch",
      orderHint: 90,
      min: 0.0,
      max: 0.15,
      step: 0.005,
      defaultValue: 0.02,
      description:
        "RGB channel separation on the lines — makes beams look refracted.",
    },
  ],
};
