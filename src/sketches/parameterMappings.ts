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
  // LuminoSmoke specific
  smoke_density: "smokeDensity",
  halo_radius: "haloRadius",
  light_intensity: "lightIntensity",
  ls_speed: "lsSpeed",
  ls_count: "lsCount",
  scatter_falloff: "scatterFalloff",
  smoke_turbulence: "smokeTurbulence",
  chromatic_spread: "chromaticSpread",
  pulse_amount: "pulseAmount",
  // PrismLines specific
  line_glow: "lineGlow",
  prism_intensity: "prismIntensity",
  line_brightness: "lineBrightness",
  pl_speed: "plSpeed",
  pl_count: "plCount",
  prism_spread: "prismSpread",
  rotation_chaos: "rotationChaos",
  // StarTrails specific
  trail_length: "trailLength",
  trail_fade: "trailFade",
  star_glow: "starGlow",
  star_brightness: "starBrightness",
  swirl_speed: "swirlSpeed",
  swirl_tightness: "swirlTightness",
  orbit_chaos: "orbitChaos",
  trail_smoke: "trailSmoke",
  star_count: "starCount",
  trail_steps: "trailSteps",
  trail_blend: "trailBlend",
  three_body: "threeBody",
  // VortexBeam specific
  vb_speed: "vbSpeed",
  vb_glow: "vbGlow",
  vb_brightness: "vbBrightness",
  vb_tightness: "vbTightness",
  vb_reach: "vbReach",
  vb_trail: "vbTrail",
  vb_smoke: "vbSmoke",
  vb_chroma: "vbChroma",
  vb_pulse: "vbPulse",
  vb_arms: "vbArms",
  // Color parameters — logical IDs mapped to their camelCase prefix (sub-channels use suffix R/G/B)
  color_primary: "colorPrimary",
  color_secondary: "colorSecondary",
  color_bg: "colorBg",
};
