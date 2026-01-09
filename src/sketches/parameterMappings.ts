import type { ParameterTemplateId } from "./types";

/**
 * Maps parameter template IDs (snake_case) to sketch props keys (camelCase).
 *
 * This is the single source of truth for the mapping between backend parameter
 * identifiers and frontend prop names. Used by:
 * - RendererRoot.tsx (building params for active sketches)
 * - useParameterStore.ts (building scene props for controls)
 * - RendererPreview.tsx (building params for preview rendering)
 */
export const TEMPLATE_ID_TO_PROPS_KEY: Record<ParameterTemplateId, string> = {
  // Slot-level parameters
  // Note: alpha and audio_reactivity are slot-level, handled separately from sketch params
  alpha: "alpha",
  audio_reactivity: "audioReactivity",

  // Common parameters (used across sketches)
  brightness: "brightness",
  rotation_speed: "rotationSpeed",
  tint: "tint",

  // BlueCube specific
  wobble: "wobble",
  tint_lfo_depth: "tintLfoDepth",

  // OrangeCube specific
  scale: "scale",

  // GreenPulse specific
  pulse_speed: "pulseSpeed",

  // TslText3D specific
  hue_shift: "hueShift",
  glow_intensity: "glowIntensity",

  // TslNoiseBlob specific
  noise_scale: "noiseScale",
  noise_speed: "noiseSpeed",
  color_mix: "colorMix",

  // Plasma specific
  plasma_speed: "plasmaSpeed",
  plasma_scale: "plasmaScale",
  plasma_complexity: "plasmaComplexity",
  plasma_color_cycle: "plasmaColorCycle",

  // Kaleidoscope specific
  kaleid_segments: "kaleidSegments",
  kaleid_zoom: "kaleidZoom",
  kaleid_rotation: "kaleidRotation",
  kaleid_pattern_speed: "kaleidPatternSpeed",

  // FeedbackTunnel specific
  tunnel_speed: "tunnelSpeed",
  tunnel_twist: "tunnelTwist",
  tunnel_layers: "tunnelLayers",
  tunnel_color_speed: "tunnelColorSpeed",

  // Waveform specific
  wave_speed: "waveSpeed",
  wave_amplitude: "waveAmplitude",
  wave_frequency: "waveFrequency",
  wave_glow: "waveGlow",

  // Aura specific
  bloom: "bloom",
  complexity: "complexity",
  sample_offset: "sampleOffset",
  speed: "speed",
  scale_base: "scaleBase",
  distance: "distance",
  attenuation: "attenuation",
  ray_steps: "raySteps",
  seed: "seed",
  color_interp: "colorInterp",
  grain_intensity: "grainIntensity",
  tonemap_mode: "tonemapMode",
};
