import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SceneProps } from "../sceneComponents";

/**
 * Scene C — Experimental
 *
 * A cool-toned cube with a subtle pulsing scale and slow rotation.
 * Used to validate dynamic scene selection and crossfade behavior.
 */
export function SceneC({ opacity }: SceneProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const timeRef = React.useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    const pulse = 1 + 0.15 * Math.sin(timeRef.current * 1.5);
    meshRef.current.scale.setScalar(pulse);
    meshRef.current.rotation.y -= 0.4 * clampedDelta;
  });

  return (
    <mesh ref={meshRef} rotation={[0.2, -0.6, 0]}>
      <boxGeometry args={[1.1, 1.1, 1.1]} />
      <meshStandardMaterial
        color="#22c55e"
        metalness={0.3}
        roughness={0.3}
        transparent
        opacity={opacity}
        emissive="#22c55e"
        emissiveIntensity={0.25}
      />
    </mesh>
  );
}
