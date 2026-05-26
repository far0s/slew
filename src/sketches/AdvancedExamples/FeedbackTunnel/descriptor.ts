import type { SketchDescriptor } from "@/sketches/types";

/**
 * FeedbackTunnel Sketch Descriptor
 */
export const descriptor: SketchDescriptor = {
  id: "feedbackTunnel",
  label: "Feedback Tunnel",
  shortLabel: "Tunnel",
  description:
    "Infinite zoom tunnel effect with hypnotic color cycling and depth layers (WebGPU/TSL).",
  parameters: [
    {
      templateId: "tunnel_speed",
      label: "Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      color: "cyan",
      description: "Speed of the tunnel zoom.",
    },
    {
      templateId: "tunnel_twist",
      label: "Twist",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.1,
      defaultValue: 2,
      color: "violet",
      description: "Amount of spiral twist in the tunnel.",
    },
    {
      templateId: "tunnel_layers",
      label: "Layers",
      group: "sketch",
      orderHint: 30,
      min: 2,
      max: 12,
      step: 1,
      defaultValue: 6,
      color: "rose",
      inputType: "integer",
      description: "Number of visible tunnel layers/rings.",
    },
    {
      templateId: "tunnel_color_speed",
      label: "Color Speed",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 0.5,
      color: "amber",
      description: "Speed of the color cycling effect.",
    },
  ],
};
