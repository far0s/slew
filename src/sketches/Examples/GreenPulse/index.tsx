import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

/**
 * GreenPulse Sketch Descriptor
 *
 * Defines all metadata and parameters for this sketch.
 * This is the single source of truth for GreenPulse's configuration.
 */
export const descriptor: SketchDescriptor = {
  id: "greenPulse",
  label: "Green Pulse",
  shortLabel: "Pulse",
  description:
    "A pulsing green cube with scale animation and tint controls. Tertiary demo sketch.",
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
      color: "lime",
      description: "Adjusts the brightness of the sketch.",
    },
    {
      templateId: "pulse_speed",
      label: "Pulse Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 1.5,
      color: "lime",
      description: "Controls how fast the cube pulses.",
    },
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.4,
      color: "emerald",
      description: "Controls the cube rotation speed.",
    },
    {
      templateId: "tint",
      label: "Tint",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "lime",
      description: "Shifts color between cyan and lime.",
    },
  ],
};

/**
 * GreenPulse
 *
 * A cool-toned cube with a pulsing scale and rotation.
 *
 * Parameters:
 * - opacity: 0..1, used for crossfade
 * - params.brightness: 0..2, overall brightness/emissive intensity
 * - params.pulseSpeed: 0..5, how fast the cube pulses in size
 * - params.rotationSpeed: 0..5, how fast the cube rotates
 * - params.tint: 0..1, shifts color from cyan (0) to lime (1)
 */
export function GreenPulse({ opacity, params }: SketchProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const timeRef = React.useRef(0);

  // Extract params with defaults
  const brightness = params?.brightness ?? 1;
  const pulseSpeed = params?.pulseSpeed ?? 1.5;
  const rotationSpeed = params?.rotationSpeed ?? 0.4;
  const tint = params?.tint ?? 0.5;

  // Interpolate between cyan (#22d3ee) and lime (#84cc16) based on tint
  const baseColor = React.useMemo(() => {
    const cyan = new THREE.Color("#22d3ee");
    const lime = new THREE.Color("#84cc16");
    return cyan.lerp(lime, tint);
  }, [tint]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    // Pulse effect controlled by pulseSpeed
    const pulse = 1 + 0.15 * Math.sin(timeRef.current * pulseSpeed);
    meshRef.current.scale.setScalar(pulse);

    // Rotation controlled by rotationSpeed
    meshRef.current.rotation.y -= rotationSpeed * clampedDelta;
  });

  return (
    <mesh ref={meshRef} rotation={[0.2, -0.6, 0]}>
      <boxGeometry args={[1.1, 1.1, 1.1]} />
      <meshStandardMaterial
        color={baseColor}
        metalness={0.3}
        roughness={0.3}
        transparent
        opacity={opacity * brightness}
        emissive={baseColor}
        emissiveIntensity={0.25 * brightness}
      />
    </mesh>
  );
}

export default GreenPulse;
