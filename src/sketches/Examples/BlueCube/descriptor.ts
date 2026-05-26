import type { SketchDescriptor } from "@/sketches/types";

/**
 * BlueCube Sketch Descriptor
 *
 * Defines all metadata and parameters for this sketch.
 * This is the single source of truth for BlueCube's configuration.
 */
export const descriptor: SketchDescriptor = {
  id: "blueCube",
  label: "Blue Cube",
  shortLabel: "Blue",
  description:
    "A rotating blue cube with wobble and tint controls. Primary demo sketch.",
  parameters: [
    {
      templateId: "brightness",
      label: "Brightness",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      color: "emerald",
      description: "Adjusts the brightness of the sketch.",
    },
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.6,
      color: "indigo",
      description: "Controls the cube rotation speed.",
    },
    {
      templateId: "wobble",
      label: "Wobble",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "emerald",
      description: "Controls how much the cube wobbles in X/Y over time.",
    },
    {
      templateId: "tint_lfo_depth",
      label: "Tint LFO Depth",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.2,
      color: "emerald",
      description: "Controls how strongly an LFO modulates the tint.",
    },
    {
      templateId: "tint",
      label: "Tint",
      group: "sketch",
      orderHint: 50,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "cyan",
      description: "Blends between base blue and cyan tint.",
    },
  ],
};
