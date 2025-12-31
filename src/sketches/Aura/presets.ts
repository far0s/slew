/**
 * Aura Preset Sketches
 *
 * Each preset from seb.cat is exported as a separate sketch descriptor
 * with pre-configured default values. All presets share the same Aura component.
 *
 * Values sourced from: seb.cat/components/aura-controls/presets.ts
 */

import type { SketchGroup, SketchDescriptor } from "../types";
import { descriptor as baseDescriptor } from "./index";

/**
 * Helper to create a preset descriptor by overriding default values
 */
function createPresetDescriptor(
  id: string,
  name: string,
  shortLabel: string,
  overrides: Record<string, number>,
  colorPalette?: {
    startColor: [number, number, number];
    midColor: [number, number, number];
    endColor: [number, number, number];
    background: [number, number, number, number];
  },
): SketchDescriptor {
  return {
    ...baseDescriptor,
    id,
    label: `Aura: ${name}`,
    shortLabel,
    description: `${name} preset - ${baseDescriptor.description}`,
    parameters: baseDescriptor.parameters.map((param) => {
      const override = overrides[param.templateId];
      if (override !== undefined) {
        return {
          ...param,
          defaultValue: override,
        };
      }
      return param;
    }),
    colorPalette,
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
    startColor: [0.09803921568627451, 0.2980392156862745, 0.4],
    midColor: [0.41568627450980394, 0.07450980392156863, 0.6431372549019608],
    endColor: [0.4980392156862745, 0.24705882352941178, 0.2980392156862745],
    background: [
      0.043137254901960784, 0.00784313725490196, 0.08627450980392157, 1,
    ],
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
    startColor: [0.9176470588235294, 0.5333333333333333, 0.1607843137254902],
    midColor: [0.5607843137254902, 0.592156862745098, 0.7843137254901961],
    endColor: [0.5882352941176471, 0.17647058823529413, 0.611764705882353],
    background: [
      0.043137254901960784, 0.00784313725490196, 0.08627450980392157, 1,
    ],
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
    startColor: [0.11372549019607843, 0.20784313725490197, 0.7411764705882353],
    midColor: [0.1411764705882353, 0.6549019607843137, 0.33725490196078434],
    endColor: [0.34901960784313724, 0.2235294117647059, 0.7372549019607844],
    background: [
      0.043137254901960784, 0.00784313725490196, 0.08627450980392157, 1.0,
    ],
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
    startColor: [0.8705882352941177, 0.16862745098039217, 0.043137254901960784],
    midColor: [1.0, 0.8666666666666667, 0.5882352941176471],
    endColor: [0.12941176470588237, 0.06274509803921569, 0.09803921568627451],
    background: [0.023529411764705882, 0.0, 0.06274509803921569, 1.0],
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
    startColor: [0.8509803921568627, 0.984313725490196, 0.9568627450980393],
    midColor: [0.1607843137254902, 0.2980392156862745, 0.19215686274509805],
    endColor: [0.5607843137254902, 0.6470588235294118, 0.5607843137254902],
    background: [
      0.12941176470588237, 0.09803921568627451, 0.09411764705882353, 1.0,
    ],
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
    startColor: [0.027450980392156862, 0.6392156862745098, 0.4588235294117647],
    midColor: [0.13333333333333333, 0.5098039215686274, 0.16862745098039217],
    endColor: [0.8117647058823529, 0.12549019607843137, 0.9098039215686274],
    background: [
      0.0196078431372549, 0.1450980392156863, 0.15294117647058825, 1.0,
    ],
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
    startColor: [0.09803921568627451, 0.2980392156862745, 0.4],
    midColor: [0.41568627450980394, 0.07450980392156863, 0.6431372549019608],
    endColor: [0.4980392156862745, 0.24705882352941178, 0.2980392156862745],
    background: [
      0.043137254901960784, 0.00784313725490196, 0.08627450980392157, 1.0,
    ],
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
    grain_intensity: 0.1,
    tonemap_mode: 5, // Bleach bypass
  },
  {
    startColor: [0.5647058823529412, 0.28627450980392155, 0.5882352941176471],
    midColor: [1.0, 0.7333333333333333, 0.06274509803921569],
    endColor: [0.7568627450980392, 0.027450980392156862, 0.050980392156862744],
    background: [
      0.01568627450980392, 0.058823529411764705, 0.4745098039215686, 1.0,
    ],
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
