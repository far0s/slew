import type { SketchDescriptor } from "@/sketches/types";
import thumbnail from "@/assets/sketches/plasma-thumb.png";

/**
 * Plasma Sketch Descriptor
 *
 * Classic demoscene plasma effect with animated color cycling and wave interference patterns.
 */
export const descriptor: SketchDescriptor = {
  thumbnail,
  id: "plasma",
  label: "Plasma",
  shortLabel: "Plasma",
  description:
    "Classic demoscene plasma effect with animated color cycling and wave interference patterns (WebGPU/TSL).",
  parameters: [
    {
      templateId: "plasma_speed",
      label: "Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      color: "cyan",
      description: "Animation speed of the plasma waves.",
    },
    {
      templateId: "plasma_scale",
      label: "Scale",
      group: "sketch",
      orderHint: 20,
      min: 1,
      max: 20,
      step: 0.5,
      defaultValue: 8,
      color: "violet",
      description: "Scale/frequency of the plasma pattern.",
    },
    {
      templateId: "plasma_complexity",
      label: "Complexity",
      group: "sketch",
      orderHint: 30,
      min: 1,
      max: 5,
      step: 0.1,
      defaultValue: 3,
      color: "rose",
      description: "Number of overlapping wave layers.",
    },
    {
      templateId: "plasma_color_cycle",
      label: "Color Cycle",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 2,
      step: 0.05,
      defaultValue: 1,
      color: "amber",
      description: "Speed of color palette cycling.",
    },
  ],
};
