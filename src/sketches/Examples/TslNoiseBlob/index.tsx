import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  uniform,
  positionLocal,
  normalLocal,
  normalWorld,
  cameraPosition,
  positionWorld,
  mx_noise_float,
  vec3,
  vec4,
  float,
  mix,
  dot,
  max,
  normalize,
  sub,
  add,
  mul,
  pow,
  color,
  time,
  varying,
} from "three/tsl";
import { useFrame } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

/**
 * TslNoiseBlob Sketch Descriptor
 */
export const descriptor: SketchDescriptor = {
  id: "tslNoiseBlob",
  label: "TSL Noise Blob",
  shortLabel: "Blob",
  description:
    "Animated sphere with procedural noise displacement and color gradients (WebGPU/TSL).",
  parameters: [
    {
      templateId: "noise_scale",
      label: "Noise Scale",
      group: "sketch",
      orderHint: 10,
      min: 0.1,
      max: 5,
      step: 0.1,
      defaultValue: 1.5,
      color: "cyan",
      description: "Scale/frequency of the noise pattern.",
    },
    {
      templateId: "noise_speed",
      label: "Noise Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 0.5,
      color: "lime",
      description: "Animation speed of the noise displacement.",
    },
    {
      templateId: "color_mix",
      label: "Color Mix",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "rose",
      description:
        "Blend between warm (orange/pink) and cool (cyan/purple) palette.",
    },
  ],
};

interface NoiseBlobUniforms {
  noiseScale: { value: number };
  noiseSpeed: { value: number };
  colorMix: { value: number };
  opacity: { value: number };
}

function createTslNoiseBlobMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: NoiseBlobUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uNoiseScale = uniform(1.5);
  const uNoiseSpeed = uniform(0.5);
  const uColorMix = uniform(0.5);
  const uOpacity = uniform(1.0);

  // Pass noise from vertex to fragment shader via varying
  const vNoise = varying(float(0), "v_noise");

  // Vertex displacement using animated noise
  material.positionNode = Fn(() => {
    const animatedTime = time.mul(uNoiseSpeed);
    const noiseInput = positionLocal.mul(uNoiseScale).add(vec3(animatedTime));
    const noise = mx_noise_float(noiseInput);
    vNoise.assign(noise);
    const displacement = normalLocal.mul(noise).mul(0.3);
    return positionLocal.add(displacement);
  })();

  // Fragment color with soft shading (half-lambert style)
  material.colorNode = Fn(() => {
    const noise = vNoise;
    const dispFactor = noise.mul(0.5).add(0.5);

    const upDir = vec3(0.0, 1.0, 0.0);
    const normalFactor = dot(normalWorld, upDir).mul(0.5).add(0.5);

    // Color palettes
    const warmColor1 = color(0xff6622);
    const warmColor2 = color(0xff3399);
    const coolColor1 = color(0x19cce6);
    const coolColor2 = color(0x9933ff);

    const blendFactor = normalFactor.add(dispFactor.mul(0.3));
    const warmBlend = mix(warmColor1, warmColor2, blendFactor);
    const coolBlend = mix(coolColor1, coolColor2, blendFactor);
    const baseColor = mix(warmBlend, coolBlend, uColorMix);

    // Soft two-light shading (key + fill) with half-lambert wrap
    const lightDir1 = normalize(vec3(0.5, 0.8, 0.6));
    const diffuse1 = max(float(0.0), dot(normalWorld, lightDir1));
    const softDiffuse1 = diffuse1.mul(0.5).add(0.5);

    const lightDir2 = normalize(vec3(-0.4, -0.3, -0.5));
    const diffuse2 = max(float(0.0), dot(normalWorld, lightDir2));
    const softDiffuse2 = diffuse2.mul(0.3).add(0.2);

    const ambient = float(0.35);
    const lighting = ambient
      .add(softDiffuse1.mul(0.5))
      .add(softDiffuse2.mul(0.15));

    // Subtle rim highlight
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const rimDot = max(float(0.0), dot(normalWorld, viewDir));
    const rim = pow(sub(float(1.0), rimDot), float(2.0)).mul(0.25);
    const rimColor = mix(warmColor2, coolColor2, uColorMix);

    const litColor = mul(baseColor, lighting);
    const withRim = add(litColor, mul(rimColor, rim));
    const brightnessVar = add(float(0.9), mul(dispFactor, 0.2));
    const finalColor = mul(withRim, brightnessVar);

    return vec4(finalColor, uOpacity);
  })();

  return {
    material,
    uniforms: {
      noiseScale: uNoiseScale,
      noiseSpeed: uNoiseSpeed,
      colorMix: uColorMix,
      opacity: uOpacity,
    },
  };
}

export function TslNoiseBlob({ opacity, params }: SketchProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(0);

  const noiseScale = params?.noiseScale ?? 1.5;
  const noiseSpeed = params?.noiseSpeed ?? 0.5;
  const colorMix = params?.colorMix ?? 0.5;

  const { material, uniforms } = useMemo(() => {
    return createTslNoiseBlobMaterial();
  }, []);

  useEffect(() => {
    uniforms.noiseScale.value = noiseScale;
  }, [noiseScale, uniforms]);

  useEffect(() => {
    uniforms.noiseSpeed.value = noiseSpeed;
  }, [noiseSpeed, uniforms]);

  useEffect(() => {
    uniforms.colorMix.value = colorMix;
  }, [colorMix, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useFrame((_, delta) => {
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    if (meshRef.current) {
      meshRef.current.rotation.y += clampedDelta * 0.2;
      meshRef.current.rotation.x = Math.sin(timeRef.current * 0.3) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 32]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default TslNoiseBlob;
