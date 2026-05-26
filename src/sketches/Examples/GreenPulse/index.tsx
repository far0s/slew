import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

// Re-export descriptor for backward compatibility
export { descriptor };

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
export function GreenPulse({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const brightnessRef = useRef(params?.brightness ?? 1);
  const timeRef = React.useRef(0);

  // Extract params with defaults
  const brightness = params?.brightness ?? 1;

  useEffect(() => {
    brightnessRef.current = brightness;
  }, [brightness]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      if (materialRef.current)
        materialRef.current.opacity = v * brightnessRef.current;
    });
  }, [setOpacityOverride]);
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
        ref={materialRef}
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
