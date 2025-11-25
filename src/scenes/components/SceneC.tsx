import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SceneProps } from "../sceneComponents";

/**
 * Scene C — Green Pulsing Cube
 *
 * A cool-toned cube with a pulsing scale and rotation.
 * Supports:
 * - sceneCBrightness: overall brightness/emissive intensity
 * - sceneCPulseSpeed: how fast the cube pulses in size
 * - sceneCRotationSpeed: how fast the cube rotates
 * - sceneCTint: shifts color from cyan (0) to lime (1)
 */
export function SceneC({ opacity, params }: SceneProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const timeRef = React.useRef(0);

  // Extract params with defaults
  const brightness = params?.sceneCBrightness ?? 1;
  const pulseSpeed = params?.sceneCPulseSpeed ?? 1.5;
  const rotationSpeed = params?.sceneCRotationSpeed ?? 0.4;
  const tint = params?.sceneCTint ?? 0.5;

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

export default SceneC;
