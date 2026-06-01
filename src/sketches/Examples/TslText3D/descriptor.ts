import type { SketchDescriptor } from "@/sketches/types";
import thumbnail from "@/assets/sketches/text-thumb.png";

/**
 * TslText3D Sketch Descriptor
 *
 * Defines all metadata and parameters for this WebGPU/TSL-powered sketch.
 * Features rotating 3D text with dynamic color and glow effects.
 */
export const descriptor: SketchDescriptor = {
  thumbnail,
  id: "tslText3D",
  label: "TSL 3D Text",
  shortLabel: "Text",
  description:
    "WebGPU/TSL-powered 3D text with dynamic hue shift and pulsing glow.",
  parameters: [
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.5,
      color: "indigo",
      description: "Controls how fast the text rotates.",
    },
    {
      templateId: "hue_shift",
      label: "Hue Shift",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "violet",
      description: "Shifts the color hue through the spectrum (0–360°).",
    },
    {
      templateId: "glow_intensity",
      label: "Glow Intensity",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 0.5,
      color: "amber",
      description: "Controls the pulsing glow effect intensity.",
    },
  ],
};
