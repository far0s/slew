import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

/**
 * BlueCube Sketch Descriptor
 *
 * Defines all metadata and parameters for this sketch.
 * This is the single source of truth for BlueCube's configuration.
 */
export const descriptor: SketchDescriptor = {
  id: "blueCube",
  label: "Blue Cube",
  shortLabel: "Blue",
  description:
    "A rotating blue cube with wobble and tint controls. Primary demo sketch.",
  parameters: [
    {
      templateId: "brightness",
      label: "Brightness",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 1,
      color: "emerald",
      description: "Adjusts the brightness of the sketch.",
    },
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.6,
      color: "indigo",
      description: "Controls the cube rotation speed.",
    },
    {
      templateId: "wobble",
      label: "Wobble",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "emerald",
      description: "Controls how much the cube wobbles in X/Y over time.",
    },
    {
      templateId: "tint_lfo_depth",
      label: "Tint LFO Depth",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.2,
      color: "emerald",
      description: "Controls how strongly an LFO modulates the tint.",
    },
    {
      templateId: "tint",
      label: "Tint",
      group: "sketch",
      orderHint: 50,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "cyan",
      description: "Blends between base blue and cyan tint.",
    },
  ],
};

/**
 * BlueCube
 *
 * A rotating blue cube with brightness, rotation, wobble, and tint controls.
 *
 * Parameters:
 * - opacity: 0..1, used for crossfade
 * - params.brightness: 0..2, scales emissive intensity
 * - params.rotationSpeed: radians/sec for base rotation
 * - params.wobble: 0..1, controls wobble amplitude
 * - params.tint: 0..1, blends base blue → cyan for color/emissive
 * - params.tintLfoDepth: 0..1, LFO modulation depth for tint
 */
export function BlueCube({ opacity, params }: SketchProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const timeRef = React.useRef(0);

  // Derive per-sketch values from the optional params bag, with sensible defaults.
  const brightness = params?.brightness ?? 1;
  const rotationSpeed = params?.rotationSpeed ?? 0.6;
  const wobble = params?.wobble ?? 0;
  const tint = params?.tint ?? 0;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    // Speed in radians per second; clamp delta to avoid huge jumps on tab switch.
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    const wobbleAmount = Math.max(0, Math.min(1, wobble));
    const wobbleOffsetX = wobbleAmount * 0.15 * Math.sin(timeRef.current * 1.3);
    const wobbleOffsetY = wobbleAmount * 0.1 * Math.cos(timeRef.current * 0.9);

    meshRef.current.rotation.y += rotationSpeed * clampedDelta;
    meshRef.current.rotation.x += rotationSpeed * 0.4 * clampedDelta;

    meshRef.current.position.x = wobbleOffsetX;
    meshRef.current.position.y = wobbleOffsetY;
  });

  const clampedBrightness = Math.max(0, Math.min(2, brightness));
  const clampedTint = Math.max(0, Math.min(1, tint));

  const baseColor = new THREE.Color("#38bdf8");
  const tintedColor = new THREE.Color("#22d3ee");
  const finalColor = baseColor.clone().lerp(tintedColor, clampedTint);

  const baseEmissive = new THREE.Color("#38bdf8");
  const tintedEmissive = new THREE.Color("#22d3ee");
  const finalEmissive = baseEmissive.clone().lerp(tintedEmissive, clampedTint);

  return (
    <mesh ref={meshRef} rotation={[0.5, 0.8, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={finalColor}
        metalness={0.2}
        roughness={0.1}
        transparent
        opacity={opacity}
        emissive={finalEmissive}
        emissiveIntensity={0.3 * clampedBrightness * (0.7 + 0.6 * clampedTint)}
      />
    </mesh>
  );
}

export default BlueCube;
