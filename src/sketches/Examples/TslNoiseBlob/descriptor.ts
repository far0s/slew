import type { SketchDescriptor } from "@/sketches/types";

/**
 * TslNoiseBlob Sketch Descriptor
 */
export const descriptor: SketchDescriptor = {
  id: "tslNoiseBlob",
  label: "TSL Noise Blob",
  shortLabel: "Blob",
  description:
    "Animated sphere with procedural noise displacement and color gradients (WebGPU/TSL).",
  parameters: [
    {
      templateId: "noise_scale",
      label: "Noise Scale",
      group: "sketch",
      orderHint: 10,
      min: 0.1,
      max: 5,
      step: 0.1,
      defaultValue: 1.5,
      color: "cyan",
      description: "Scale/frequency of the noise pattern.",
    },
    {
      templateId: "noise_speed",
      label: "Noise Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 0.5,
      color: "lime",
      description: "Animation speed of the noise displacement.",
    },
    {
      templateId: "color_mix",
      label: "Color Mix",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "rose",
      description:
        "Blend between warm (orange/pink) and cool (cyan/purple) palette.",
    },
  ],
};
