import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  uniform,
  uv,
  vec3,
  vec4,
  float,
  sin,
  abs,
  smoothstep,
  time,
  screenSize,
} from "three/tsl";
import { useFrame, useThree } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

export const descriptor: SketchDescriptor = {
  id: "waveform",
  label: "Waveform",
  shortLabel: "Wave",
  description:
    "Animated audio-style waveform visualization with multiple frequency bands and glow effects (WebGPU/TSL).",
  parameters: [
    {
      templateId: "wave_speed",
      label: "Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      color: "cyan",
      description: "Animation speed of the waveform.",
    },
    {
      templateId: "wave_amplitude",
      label: "Amplitude",
      group: "sketch",
      orderHint: 20,
      min: 0.1,
      max: 1,
      step: 0.05,
      defaultValue: 0.4,
      color: "lime",
      description: "Height/amplitude of the waves.",
    },
    {
      templateId: "wave_frequency",
      label: "Frequency",
      group: "sketch",
      orderHint: 30,
      min: 1,
      max: 10,
      step: 0.5,
      defaultValue: 4,
      color: "violet",
      description: "Number of wave cycles across the screen.",
    },
    {
      templateId: "wave_glow",
      label: "Glow",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.5,
      color: "amber",
      description: "Intensity of the glow effect around waves.",
    },
  ],
};

interface WaveformUniforms {
  speed: { value: number };
  amplitude: { value: number };
  frequency: { value: number };
  glow: { value: number };
  opacity: { value: number };
}

function createWaveformMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: WaveformUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uSpeed = uniform(1.0);
  const uAmplitude = uniform(0.4);
  const uFrequency = uniform(4.0);
  const uGlow = uniform(0.5);
  const uOpacity = uniform(1.0);

  material.colorNode = Fn(() => {
    const t = time.mul(uSpeed);
    const PI = float(3.14159265359);

    // Aspect ratio correction - scale amplitude to maintain visual proportion
    const resolution = screenSize;
    const aspect = resolution.x.div(resolution.y);

    // UV coordinates
    const baseUV = uv();
    const x = baseUV.x; // Keep x in 0-1 range for wave drawing across full width
    const y = baseUV.y.sub(0.5); // Center vertically (-0.5 to 0.5)

    // Scale amplitude by aspect ratio so waves look proportional on wide screens
    const aspectScale = aspect.max(1.0);

    // Create multiple wave layers at different frequencies
    const baseFreq = uFrequency.mul(PI.mul(2.0));

    // Adjusted amplitude that accounts for aspect ratio
    const adjustedAmplitude = uAmplitude.div(aspectScale);

    // Wave 1: Main wave
    const wave1 = sin(x.mul(baseFreq).add(t.mul(2.0))).mul(
      adjustedAmplitude.mul(0.4),
    );

    // Wave 2: Faster harmonic
    const wave2 = sin(x.mul(baseFreq.mul(2.0)).sub(t.mul(3.0))).mul(
      adjustedAmplitude.mul(0.2),
    );

    // Wave 3: Slower bass wave
    const wave3 = sin(x.mul(baseFreq.mul(0.5)).add(t)).mul(
      adjustedAmplitude.mul(0.3),
    );

    // Wave 4: High frequency detail
    const wave4 = sin(x.mul(baseFreq.mul(4.0)).add(t.mul(4.0))).mul(
      adjustedAmplitude.mul(0.1),
    );

    // Combine waves
    const combinedWave = wave1.add(wave2).add(wave3).add(wave4);

    // Calculate distance from wave line
    const distFromWave = abs(y.sub(combinedWave));

    // Create sharp line with glow
    const lineWidth = float(0.01);
    const glowWidth = uGlow.mul(0.15);

    // Sharp inner line
    const innerLine = smoothstep(lineWidth, float(0.0), distFromWave);

    // Soft outer glow
    const outerGlow = smoothstep(glowWidth, float(0.0), distFromWave).mul(0.5);

    // Combine line and glow
    const lineIntensity = innerLine.add(outerGlow.mul(uGlow));

    // Create color gradient based on x position and time
    const colorPhase = x.mul(PI).add(t.mul(0.5));
    const r = sin(colorPhase).mul(0.3).add(0.7);
    const g = sin(colorPhase.add(2.094)).mul(0.3).add(0.5);
    const b = sin(colorPhase.add(4.189)).mul(0.3).add(0.8);

    // Add vertical gradient for "reflection" effect
    const verticalGrad = float(1.0).sub(abs(y).mul(1.5));

    // Create second wave (reflection) below - also uses adjusted amplitude
    const reflectionWave = combinedWave.mul(-0.6);
    const distFromReflection = abs(y.sub(reflectionWave));
    const reflectionLine = smoothstep(
      lineWidth.mul(1.5),
      float(0.0),
      distFromReflection,
    ).mul(0.3);
    const reflectionGlow = smoothstep(glowWidth, float(0.0), distFromReflection)
      .mul(0.15)
      .mul(uGlow);

    const reflectionIntensity = reflectionLine.add(reflectionGlow);

    // Combine main wave and reflection
    const totalIntensity = lineIntensity.add(reflectionIntensity);

    // Final color
    const finalR = r.mul(totalIntensity);
    const finalG = g.mul(totalIntensity);
    const finalB = b.mul(totalIntensity);

    // Add subtle background gradient
    const bgIntensity = float(0.02);
    const bgR = finalR.add(bgIntensity.mul(verticalGrad));
    const bgG = finalG.add(bgIntensity.mul(verticalGrad).mul(0.5));
    const bgB = finalB.add(bgIntensity.mul(verticalGrad));

    return vec4(vec3(bgR, bgG, bgB), uOpacity);
  })();

  return {
    material,
    uniforms: {
      speed: uSpeed,
      amplitude: uAmplitude,
      frequency: uFrequency,
      glow: uGlow,
      opacity: uOpacity,
    },
  };
}

export function Waveform({ opacity, params }: SketchProps) {
  const speed = params?.waveSpeed ?? 1;
  const amplitude = params?.waveAmplitude ?? 0.4;
  const frequency = params?.waveFrequency ?? 4;
  const glow = params?.waveGlow ?? 0.5;

  const { viewport } = useThree();

  const { material, uniforms } = useMemo(() => {
    return createWaveformMaterial();
  }, []);

  useEffect(() => {
    uniforms.speed.value = speed;
  }, [speed, uniforms]);

  useEffect(() => {
    uniforms.amplitude.value = amplitude;
  }, [amplitude, uniforms]);

  useEffect(() => {
    uniforms.frequency.value = frequency;
  }, [frequency, uniforms]);

  useEffect(() => {
    uniforms.glow.value = glow;
  }, [glow, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useFrame(() => {
    // Material handles animation via time uniform
  });

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default Waveform;
