import { useRef, useState, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { FontLoader, Font } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import type { SketchDescriptor, SketchProps } from "../types";

/**
 * TslText3D Sketch Descriptor
 *
 * Defines all metadata and parameters for this WebGPU/TSL-powered sketch.
 * Features rotating 3D text with dynamic color and glow effects.
 */
export const descriptor: SketchDescriptor = {
  id: "tslText3D",
  label: "TSL 3D Text",
  shortLabel: "Text",
  description:
    "WebGPU/TSL-powered 3D text with dynamic hue shift and pulsing glow.",
  parameters: [
    {
      templateId: "rotation_speed",
      label: "Rotation Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 5,
      step: 0.05,
      defaultValue: 0.5,
      color: "indigo",
      description: "Controls how fast the text rotates.",
    },
    {
      templateId: "hue_shift",
      label: "Hue Shift",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
      color: "violet",
      description: "Shifts the color hue through the spectrum (0–360°).",
    },
    {
      templateId: "glow_intensity",
      label: "Glow Intensity",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 2,
      step: 0.01,
      defaultValue: 0.5,
      color: "amber",
      description: "Controls the pulsing glow effect intensity.",
    },
  ],
};

/**
 * TslText3D
 *
 * A rotating 3D "VJ" text with TSL-powered dynamic color and glow effects.
 *
 * Parameters:
 * - opacity: 0..1, used for crossfade
 * - params.rotationSpeed: 0..5, radians/sec for rotation
 * - params.hueShift: 0..1, shifts base color through the hue spectrum
 * - params.glowIntensity: 0..2, controls emissive pulse strength
 */
export function TslText3D({ opacity, params }: SketchProps) {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const timeRef = useRef(0);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [font, setFont] = useState<Font | null>(null);

  // Derive per-sketch values from the optional params bag, with sensible defaults
  const rotationSpeed = params?.rotationSpeed ?? 0.5;
  const hueShift = params?.hueShift ?? 0;
  const glowIntensity = params?.glowIntensity ?? 0.5;

  // Load font on mount
  useEffect(() => {
    const loader = new FontLoader();
    loader.load(
      "/fonts/helvetiker_bold.typeface.json",
      (loadedFont) => {
        setFont(loadedFont);
      },
      undefined,
      (error) => {
        console.error("[TslText3D] Failed to load font:", error);
      },
    );
  }, []);

  // Create geometry when font is loaded
  useEffect(() => {
    if (!font) return;

    const geo = new TextGeometry("VJ", {
      font,
      size: 1,
      depth: 0.3,
      curveSegments: 12,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.02,
      bevelSegments: 5,
    });

    // Compute bounding box and center the geometry
    geo.computeBoundingBox();
    geo.computeVertexNormals();

    if (geo.boundingBox) {
      const centerX = -0.5 * (geo.boundingBox.max.x - geo.boundingBox.min.x);
      const centerY = -0.5 * (geo.boundingBox.max.y - geo.boundingBox.min.y);
      const centerZ = -0.5 * (geo.boundingBox.max.z - geo.boundingBox.min.z);
      geo.translate(centerX, centerY, centerZ);
    }

    setGeometry(geo);

    return () => {
      geo.dispose();
    };
  }, [font]);

  // Calculate derived colors based on hue shift
  const { baseColor, emissiveColor } = useMemo(() => {
    // Start with a cyan-ish blue
    const baseHue = 0.55; // Cyan/blue hue
    const shiftedHue = (baseHue + hueShift) % 1;

    const base = new THREE.Color();
    base.setHSL(shiftedHue, 0.8, 0.5);

    const emissive = new THREE.Color();
    emissive.setHSL(shiftedHue, 0.9, 0.4);

    return { baseColor: base, emissiveColor: emissive };
  }, [hueShift]);

  // Animation loop
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Clamp delta to avoid huge jumps on tab switch
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    // Rotate the text
    groupRef.current.rotation.y += rotationSpeed * clampedDelta;
    groupRef.current.rotation.x = Math.sin(timeRef.current * 0.3) * 0.1;

    // Update material emissive intensity for pulsing effect
    if (materialRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(timeRef.current * 3);
      materialRef.current.emissiveIntensity = pulse * glowIntensity;
      materialRef.current.color.copy(baseColor);
      materialRef.current.emissive.copy(emissiveColor);
      materialRef.current.opacity = opacity;
    }
  });

  // Don't render until geometry is ready
  if (!geometry) {
    return null;
  }

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          metalness={0.3}
          roughness={0.4}
          transparent
          opacity={opacity}
          emissive={emissiveColor}
          emissiveIntensity={0.5 * glowIntensity}
        />
      </mesh>
    </group>
  );
}

export default TslText3D;
