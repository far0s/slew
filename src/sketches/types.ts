/**
 * Sketch System Types
 *
 * This file defines the core types for self-contained sketches.
 * Each sketch module exports a descriptor and component conforming to these types.
 */

import type { ComponentType } from "react";

/**
 * Available slider color themes for parameter UI.
 */
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

/**
 * Template ID for a parameter (without slot prefix).
 * These are the base names used in parameter templates.
 */
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

/**
 * Lightweight description of a parameter template.
 * This defines the parameter's metadata without the slot prefix.
 *
 * @property templateId - Unique identifier for this parameter type
 * @property label - Human-readable label used in UI
 * @property group - Optional group hint for UI organization
 * @property orderHint - Optional ordering hint (lower numbers appear first)
 * @property min - Minimum value for UI sliders
 * @property max - Maximum value for UI sliders
 * @property step - Step size for slider increments
 * @property defaultValue - Default value for the parameter
 * @property color - Optional color theme for the slider UI
 * @property description - Optional description/tooltip for the parameter
 */
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

/**
 * Descriptor for a single visual sketch.
 * Each sketch module must export a descriptor conforming to this interface.
 *
 * @property id - Stable ID for the sketch type (used in persistence)
 * @property label - Full label for UI (sketch picker, inspector headings)
 * @property shortLabel - Short label for compact UI (column headers)
 * @property description - Short description for docs/tooltips
 * @property parameters - Parameter templates for this sketch
 */
export interface SketchDescriptor {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  parameters: ParameterTemplate[];
}

/**
 * Props passed from the renderer into all sketch components.
 *
 * @property opacity - Crossfade weight (0 = invisible, 1 = fully visible)
 * @property params - Optional bag of additional parameters
 */
export interface SketchProps {
  /**
   * Crossfade weight for this sketch.
   * - 0 → fully invisible
   * - 1 → fully visible
   */
  opacity: number;

  /**
   * Optional bag of additional parameters.
   * These are generic parameter names; each sketch uses whichever are relevant.
   */
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

/**
 * All sketch components must accept SketchProps.
 * This allows the renderer to treat them uniformly.
 */
export type SketchComponent = ComponentType<SketchProps>;

/**
 * A sketch module exports both the descriptor and the component.
 */
export interface SketchModule {
  descriptor: SketchDescriptor;
  component: SketchComponent;
}
