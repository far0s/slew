import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchProps } from "../../types";
import { descriptor } from "./descriptor";

// Re-export descriptor for backward compatibility
export { descriptor };

/**
 * OrangeCube
 *
 * A rotating orange cube with brightness, rotation, tint, and scale controls.
 *
 * Parameters:
 * - opacity: 0..1, used for crossfade
 * - params.brightness: 0..2, overall brightness/emissive intensity
 * - params.rotationSpeed: radians/sec for rotation
 * - params.tint: 0..1, shifts color between red (0) and yellow (1)
 * - params.scale: 0.5..2, size multiplier for the cube
 */
export function OrangeCube({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const meshRef = React.useRef<THREE.Mesh | null>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const brightnessRef = useRef(params?.brightness ?? 1);

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
  const rotationSpeed = params?.rotationSpeed ?? 0.4;
  const tint = params?.tint ?? 0.5;
  const scale = params?.scale ?? 1;

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
        ref={materialRef}
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

export default OrangeCube;
