/**
 * Aura Preset Sketches
 *
 * Each preset from seb.cat is exported as a separate sketch descriptor
 * with pre-configured default values. All presets share the same Aura component.
 *
 * Values sourced from: seb.cat/components/aura-controls/presets.ts
 *
 * Imports descriptor from separate file to enable lazy loading of the Aura component.
 */

import type { SketchGroup, SketchDescriptor } from "@/sketches/types";
import { descriptor as baseDescriptor } from "./descriptor";

/**
 * Helper to create a preset descriptor by overriding default values
 */
function createPresetDescriptor(
  id: string,
  name: string,
  shortLabel: string,
  overrides: Record<string, number>,
  colorOverrides?: Record<string, [number, number, number]>,
): SketchDescriptor {
  return {
    ...baseDescriptor,
    id,
    label: `Aura: ${name}`,
    shortLabel,
    description: `${name} preset - ${baseDescriptor.description}`,
    parameters: baseDescriptor.parameters.map((param) => {
      // Handle color param overrides
      if (param.inputType === "color" && colorOverrides?.[param.templateId]) {
        return {
          ...param,
          defaultColorValue: colorOverrides[param.templateId],
        };
      }
      // Handle numeric param overrides
      const override = overrides[param.templateId];
      if (override !== undefined) {
        return {
          ...param,
          defaultValue: override,
        };
      }
      return param;
    }),
  };
}

/**
 * Aura OG (Original) - The classic default preset
 * Source: seb.cat preset "aura-og"
 */
export const auraOgDescriptor = createPresetDescriptor(
  "auraOg",
  "Aura OG",
  "Aura OG",
  {
    bloom: 3.2,
    complexity: 3.3,
    sample_offset: 0.15,
    speed: 0.3,
    scale_base: 1.0,
    distance: 2.0,
    attenuation: 0.15,
    ray_steps: 8,
    seed: 0,
    color_interp: 0.9,
    grain_intensity: 0.05,
    tonemap_mode: 7, // Cinematic
  },
  {
    color_primary: [25, 76, 102],
    color_secondary: [106, 19, 164],
    color_bg: [127, 63, 76],
  },
);

/**
 * Rose Gold - Warm metallic palette
 * Source: seb.cat preset "rose-gold"
 */
export const auraRoseGoldDescriptor = createPresetDescriptor(
  "auraRoseGold",
  "Rose Gold",
  "Rose Gold",
  {
    bloom: 3.2,
    complexity: 3.3,
    sample_offset: 0.15,
    speed: 0.3,
    scale_base: 1.0,
    distance: 2.0,
    attenuation: 0.15,
    ray_steps: 8,
    seed: 0,
    color_interp: 0.9,
    grain_intensity: 0.05,
    tonemap_mode: 4, // Cross-process
  },
  {
    color_primary: [234, 136, 41],
    color_secondary: [143, 151, 200],
    color_bg: [150, 45, 156],
  },
);

/**
 * Deep Blue - Cool oceanic tones
 * Source: seb.cat preset "deep-blue"
 */
export const auraDeepBlueDescriptor = createPresetDescriptor(
  "auraDeepBlue",
  "Deep Blue",
  "Deep Blue",
  {
    bloom: 3.2,
    complexity: 3.3,
    sample_offset: 0.15,
    speed: 0.3,
    scale_base: 1.0,
    distance: 2.0,
    attenuation: 0.15,
    ray_steps: 8,
    seed: 0,
    color_interp: 0.9,
    grain_intensity: 0.05,
    tonemap_mode: 0, // None
  },
  {
    color_primary: [29, 53, 189],
    color_secondary: [36, 167, 86],
    color_bg: [89, 57, 188],
  },
);

/**
 * Solar Plume - Intense fire and energy
 * Source: seb.cat preset "solar-plume"
 */
export const auraSolarPlumeDescriptor = createPresetDescriptor(
  "auraSolarPlume",
  "Solar Plume",
  "Solar Plume",
  {
    bloom: 0.36,
    complexity: 1.57,
    sample_offset: 0.219,
    speed: 0.3,
    scale_base: 0.26,
    distance: 3.05,
    attenuation: 0.31,
    ray_steps: 8,
    seed: 3598,
    color_interp: 1.2,
    grain_intensity: 0.05,
    tonemap_mode: 4, // Cross-process
  },
  {
    color_primary: [222, 43, 11],
    color_secondary: [255, 221, 150],
    color_bg: [33, 16, 25],
  },
);

/**
 * Ghost-Like - Ethereal pale aesthetic
 * Source: seb.cat preset "ghost-like"
 */
export const auraGhostLikeDescriptor = createPresetDescriptor(
  "auraGhostLike",
  "Ghost Like",
  "Ghost Like",
  {
    bloom: 1.33,
    complexity: 2.64,
    sample_offset: 0.073,
    speed: 0.3,
    scale_base: 0.24,
    distance: 1.98,
    attenuation: 0.08,
    ray_steps: 6,
    seed: 28,
    color_interp: 1.0,
    grain_intensity: 0.05,
    tonemap_mode: 7, // Cinematic
  },
  {
    color_primary: [217, 251, 244],
    color_secondary: [41, 76, 49],
    color_bg: [143, 165, 143],
  },
);

/**
 * Forest Clearing - Organic green tones
 * Source: seb.cat preset "forest-clearing"
 */
export const auraForestClearingDescriptor = createPresetDescriptor(
  "auraForestClearing",
  "Forest Clearing",
  "Forest Clearing",
  {
    bloom: 0.29,
    complexity: 2.2,
    sample_offset: 0.209,
    speed: 0.2,
    scale_base: 0.15,
    distance: 1.98,
    attenuation: 0.17,
    ray_steps: 9,
    seed: 28,
    color_interp: 0.83,
    grain_intensity: 0.05,
    tonemap_mode: 7, // Cinematic
  },
  {
    color_primary: [7, 163, 117],
    color_secondary: [34, 130, 43],
    color_bg: [207, 32, 232],
  },
);

/**
 * Default Intense - Vivid and detailed
 * Source: seb.cat preset "Default Intense"
 */
export const auraDefaultIntenseDescriptor = createPresetDescriptor(
  "auraDefaultIntense",
  "Aura Intense",
  "Aura Intense",
  {
    bloom: 1.57,
    complexity: 2.48,
    sample_offset: 0.218,
    speed: 0.3,
    scale_base: 0.25,
    distance: 2.35,
    attenuation: 0.25,
    ray_steps: 11,
    seed: 3578,
    color_interp: 0.9,
    grain_intensity: 0.05,
    tonemap_mode: 7, // Cinematic
  },
  {
    color_primary: [25, 76, 102],
    color_secondary: [106, 19, 164],
    color_bg: [127, 63, 76],
  },
);

/**
 * Blush Nebula - Pink and warm cosmic vibes
 * Source: seb.cat preset "blush-nebula"
 */
export const auraBlushNebulaDescriptor = createPresetDescriptor(
  "auraBlushNebula",
  "Blush Nebula",
  "Blush Nebula",
  {
    bloom: 3.0,
    complexity: 2.5,
    sample_offset: 0.5,
    speed: 0.5,
    scale_base: 0.2,
    distance: 2.5,
    attenuation: 0.1,
    ray_steps: 10,
    seed: 10,
    color_interp: 1.01,
    grain_intensity: 0.05,
    tonemap_mode: 5, // Bleach bypass
  },
  {
    color_primary: [144, 73, 150],
    color_secondary: [255, 187, 16],
    color_bg: [193, 7, 13],
  },
);

/**
 * Aura Sketch Group
 * Contains the base Aura sketch plus all preset variations
 */
export const auraGroup: SketchGroup = {
  id: "aura",
  label: "Aura",
  orderHint: 10,
  sketches: [
    auraOgDescriptor,
    auraRoseGoldDescriptor,
    auraDeepBlueDescriptor,
    auraSolarPlumeDescriptor,
    auraGhostLikeDescriptor,
    auraForestClearingDescriptor,
    auraDefaultIntenseDescriptor,
    auraBlushNebulaDescriptor,
  ],
};
