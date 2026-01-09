import type { SketchDescriptor } from "../../types";

/**
 * OrangeCube Sketch Descriptor
 *
 * Defines all metadata and parameters for this sketch.
 * This is the single source of truth for OrangeCube's configuration.
 */
export const descriptor: SketchDescriptor = {
  id: "orangeCube",
  label: "Orange Cube",
  shortLabel: "Orange",
  description:
    "A rotating orange cube with tint and scale controls. Secondary demo sketch.",
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
      color: "amber",
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
      defaultValue: 0.4,
      color: "orange",
      description: "Controls the cube rotation speed.",
    },
    {
      templateId: "tint",
      label: "Tint",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "amber",
      description: "Shifts color between red and yellow.",
    },
    {
      templateId: "scale",
      label: "Scale",
      group: "sketch",
      orderHint: 40,
      min: 0.5,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      color: "orange",
      description: "Adjusts the size of the cube.",
    },
  ],
};
