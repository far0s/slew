import type { SketchDescriptor } from "../../types";

/**
 * GreenPulse Sketch Descriptor
 *
 * Defines all metadata and parameters for this sketch.
 * This is the single source of truth for GreenPulse's configuration.
 */
export const descriptor: SketchDescriptor = {
  id: "greenPulse",
  label: "Green Pulse",
  shortLabel: "Pulse",
  description:
    "A pulsing green cube with scale animation and tint controls. Tertiary demo sketch.",
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
      color: "lime",
      description: "Adjusts the brightness of the sketch.",
    },
    {
      templateId: "pulse_speed",
      label: "Pulse Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1.5,
      color: "lime",
      description: "Controls how fast the cube pulses.",
    },
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.4,
      color: "emerald",
      description: "Controls the cube rotation speed.",
    },
    {
      templateId: "tint",
      label: "Tint",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "lime",
      description: "Shifts color between cyan and lime.",
    },
  ],
};
