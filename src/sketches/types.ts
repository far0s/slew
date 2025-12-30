import type { ComponentType } from "react";

export type SliderColor =
  | "emerald"
  | "indigo"
  | "cyan"
  | "amber"
  | "rose"
  | "violet"
  | "lime"
  | "orange"
  | "sky"
  | "fuchsia";

export type ParameterTemplateId =
  // Slot-level parameters (independent of sketch)
  | "alpha"
  | "audio_reactivity"
  // Common parameters (used across sketches)
  | "brightness"
  | "rotation_speed"
  | "tint"
  // BlueCube specific
  | "wobble"
  | "tint_lfo_depth"
  // OrangeCube specific
  | "scale"
  // GreenPulse specific
  | "pulse_speed"
  // TslText3D specific
  | "hue_shift"
  | "glow_intensity"
  // TslNoiseBlob specific
  | "noise_scale"
  | "noise_speed"
  | "color_mix";

export interface ParameterTemplate {
  templateId: ParameterTemplateId;
  label: string;
  group?: "sketch" | "transition" | "global";
  orderHint?: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  color?: SliderColor;
  description?: string;
}

export interface SketchDescriptor {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  parameters: ParameterTemplate[];
}

export interface SketchGroup {
  id: string;
  label: string;
  sketches: SketchDescriptor[];
  orderHint?: number;
}

export interface SketchProps {
  opacity: number;
  params?: Partial<{
    // Common parameters
    brightness: number;
    rotationSpeed: number;
    tint: number;
    // BlueCube specific
    wobble: number;
    tintLfoDepth: number;
    // OrangeCube specific
    scale: number;
    // GreenPulse specific
    pulseSpeed: number;
    // TslText3D specific
    hueShift: number;
    glowIntensity: number;
    // TslNoiseBlob specific
    noiseScale: number;
    noiseSpeed: number;
    colorMix: number;
  }>;
}

export type SketchComponent = ComponentType<SketchProps>;

export interface SketchModule {
  descriptor: SketchDescriptor;
  component: SketchComponent;
}
