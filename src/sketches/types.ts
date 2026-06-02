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

// Snake-case string identifier for a parameter template (e.g. "rotation_speed", "color_bg").
// Kept as a plain string so new sketches can define any parameter ID without touching this file.
export type ParameterTemplateId = string;

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
  inputType?: "slider" | "select" | "color" | "integer" | "toggle";
  unit?: string;
  defaultColorValue?: [number, number, number]; // for inputType: "color", RGB 0-255
  options?: Array<{ value: number; label: string }>;
}

export interface SketchDescriptor {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  thumbnail?: string;
  parameters: ParameterTemplate[];
  colorPalette?: {
    startColor: [number, number, number];
    midColor: [number, number, number];
    endColor: [number, number, number];
    background: [number, number, number, number];
  };
  /**
   * When set, color params with templateId matching `itemPrefix + N` (e.g. "color_item_3")
   * are shown/hidden dynamically based on the current value of `linkedParam`.
   */
  dynamicColorRange?: {
    linkedParam: string;
    itemPrefix: string;
  };
}

export interface SketchGroup {
  id: string;
  label: string;
  sketches: SketchDescriptor[];
  orderHint?: number;
}

export interface SketchProps {
  opacity: number;
  /** Called once on mount with a function that overrides the rendered opacity.
   *  Used by SlotPreviewCapture to force opacity=1 during preview capture. */
  setOpacityOverride?: (setter: (opacity: number) => void) => void;
  // Keyed by camelCase props name (derived from templateId via templateIdToPropsKey).
  // Open record so any sketch can pass any params without touching this file.
  params?: Partial<Record<string, number>>;
  colors?: {
    startColor?: [number, number, number];
    midColor?: [number, number, number];
    endColor?: [number, number, number];
    background?: [number, number, number, number];
  };
}

export type SketchComponent = ComponentType<SketchProps>;

export interface SketchModule {
  descriptor: SketchDescriptor;
  component: SketchComponent;
}
