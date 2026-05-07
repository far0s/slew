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
  | "color_mix"
  // Plasma specific
  | "plasma_speed"
  | "plasma_scale"
  | "plasma_complexity"
  | "plasma_color_cycle"
  // Kaleidoscope specific
  | "kaleid_segments"
  | "kaleid_zoom"
  | "kaleid_rotation"
  | "kaleid_pattern_speed"
  // FeedbackTunnel specific
  | "tunnel_speed"
  | "tunnel_twist"
  | "tunnel_layers"
  | "tunnel_color_speed"
  // Waveform specific
  | "wave_speed"
  | "wave_amplitude"
  | "wave_frequency"
  | "wave_glow"
  // Aura specific
  | "bloom"
  | "complexity"
  | "sample_offset"
  | "speed"
  | "scale_base"
  | "distance"
  | "attenuation"
  | "ray_steps"
  | "seed"
  | "color_interp"
  | "grain_intensity"
  | "tonemap_mode"
  // LuminoSmoke specific
  | "smoke_density"
  | "halo_radius"
  | "light_intensity"
  | "ls_speed"
  | "ls_count"
  | "scatter_falloff"
  | "smoke_turbulence"
  | "chromatic_spread"
  | "pulse_amount"
  // PrismLines specific
  | "line_glow"
  | "prism_intensity"
  | "line_brightness"
  | "pl_speed"
  | "pl_count"
  | "prism_spread"
  | "rotation_chaos"
  // StarTrails specific
  | "trail_length"
  | "trail_fade"
  | "star_glow"
  | "star_brightness"
  | "swirl_speed"
  | "swirl_tightness"
  | "orbit_chaos"
  | "trail_smoke"
  | "star_count"
  | "trail_steps"
  | "trail_blend"
  | "three_body"
  // VortexBeam specific
  | "vb_speed"
  | "vb_glow"
  | "vb_brightness"
  | "vb_tightness"
  | "vb_reach"
  | "vb_trail"
  | "vb_smoke"
  | "vb_chroma"
  | "vb_pulse"
  | "vb_arms"
  // Color parameters (logical IDs — expand to _r/_g/_b sub-params in the store)
  | "color_primary"
  | "color_secondary"
  | "color_bg";

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
  inputType?: "slider" | "select" | "color";
  defaultColorValue?: [number, number, number]; // for inputType: "color", RGB 0-255
  options?: Array<{ value: number; label: string }>;
}

export interface SketchDescriptor {
  id: string;
  label: string;
  shortLabel: string;
  description?: string;
  parameters: ParameterTemplate[];
  colorPalette?: {
    startColor: [number, number, number];
    midColor: [number, number, number];
    endColor: [number, number, number];
    background: [number, number, number, number];
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
    // Plasma specific
    plasmaSpeed: number;
    plasmaScale: number;
    plasmaComplexity: number;
    plasmaColorCycle: number;
    // Kaleidoscope specific
    kaleidSegments: number;
    kaleidZoom: number;
    kaleidRotation: number;
    kaleidPatternSpeed: number;
    // FeedbackTunnel specific
    tunnelSpeed: number;
    tunnelTwist: number;
    tunnelLayers: number;
    tunnelColorSpeed: number;
    // Waveform specific
    waveSpeed: number;
    waveAmplitude: number;
    waveFrequency: number;
    waveGlow: number;
    // Aura specific
    bloom: number;
    complexity: number;
    sampleOffset: number;
    speed: number;
    scaleBase: number;
    distance: number;
    attenuation: number;
    raySteps: number;
    seed: number;
    colorInterp: number;
    grainIntensity: number;
    tonemapMode: number;
    // LuminoSmoke specific
    smokeDensity: number;
    haloRadius: number;
    lightIntensity: number;
    lsSpeed: number;
    lsCount: number;
    scatterFalloff: number;
    smokeTurbulence: number;
    chromaticSpread: number;
    pulseAmount: number;
    // PrismLines specific
    lineGlow: number;
    prismIntensity: number;
    lineBrightness: number;
    plSpeed: number;
    plCount: number;
    prismSpread: number;
    rotationChaos: number;
    // StarTrails specific
    trailLength: number;
    trailFade: number;
    starGlow: number;
    starBrightness: number;
    swirlSpeed: number;
    swirlTightness: number;
    orbitChaos: number;
    trailSmoke: number;
    trailBlend: number;
    threeBody: number;
    starCount: number;
    trailSteps: number;
    // VortexBeam specific
    vbSpeed: number;
    vbGlow: number;
    vbBrightness: number;
    vbTightness: number;
    vbReach: number;
    vbTrail: number;
    vbSmoke: number;
    vbChroma: number;
    vbPulse: number;
    vbArms: number;
    // Color parameters — individual channels produced from color-type ParameterTemplates
    colorPrimaryR?: number;
    colorPrimaryG?: number;
    colorPrimaryB?: number;
    colorSecondaryR?: number;
    colorSecondaryG?: number;
    colorSecondaryB?: number;
    colorBgR?: number;
    colorBgG?: number;
    colorBgB?: number;
  }>;
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
