import React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SceneProps } from "../sceneComponents";

/**
 * Scene B — orange cube used as the default "next" scene in crossfades.
 *
 * Parameters consumed from `params`:
 * - `sceneBBrightness` — overall brightness/emissive intensity
 * - `sceneBRotationSpeed` — how fast the cube rotates
 * - `sceneBTint` — shifts color between red (0) and yellow (1)
 * - `sceneBScale` — size multiplier for the cube
 */
export function SceneB({ opacity, params }: SceneProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);

  // Extract params with defaults
  const brightness = params?.sceneBBrightness ?? 1;
  const rotationSpeed = params?.sceneBRotationSpeed ?? 0.4;
  const tint = params?.sceneBTint ?? 0.5;
  const scale = params?.sceneBScale ?? 1;

  // Compute color based on tint: 0 = red-orange, 0.5 = orange, 1 = yellow-orange
  const baseColor = React.useMemo(() => {
    // Orange base: #f97316 (249, 115, 22)
    // At tint 0: shift towards red #ef4444
    // At tint 1: shift towards yellow #eab308
    const orange = new THREE.Color("#f97316");
    const red = new THREE.Color("#ef4444");
    const yellow = new THREE.Color("#eab308");

    if (tint < 0.5) {
      // Lerp from red to orange
      return red.clone().lerp(orange, tint * 2);
    } else {
      // Lerp from orange to yellow
      return orange.clone().lerp(yellow, (tint - 0.5) * 2);
    }
  }, [tint]);

  // Apply brightness to emissive
  const emissiveIntensity = brightness * 0.3;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const clampedDelta = Math.min(delta, 1 / 30);
    meshRef.current.rotation.y += rotationSpeed * clampedDelta;
    meshRef.current.rotation.x += rotationSpeed * 0.5 * clampedDelta;
  });

  return (
    <mesh ref={meshRef} rotation={[0.3, -0.4, 0]} scale={scale}>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial
        color={baseColor}
        metalness={0.4}
        roughness={0.25}
        transparent
        opacity={opacity * brightness}
        emissive={baseColor}
        emissiveIntensity={emissiveIntensity}
      />
    </mesh>
  );
}

export default SceneB;
