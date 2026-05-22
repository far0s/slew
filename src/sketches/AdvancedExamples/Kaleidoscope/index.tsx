import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  cos,
  mod,
  atan,
  sqrt,
  time,
  floor,
  screenSize,
} from "three/tsl";
import { useFrame, useThree } from "@react-three/fiber";
import type { SketchProps } from "../../types";
import { descriptor } from "./descriptor";

// Re-export descriptor for backward compatibility
export { descriptor };

interface KaleidoscopeUniforms {
  segments: { value: number };
  zoom: { value: number };
  rotation: { value: number };
  patternSpeed: { value: number };
  opacity: { value: number };
}

function createKaleidoscopeMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: KaleidoscopeUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uSegments = uniform(6.0);
  const uZoom = uniform(2.0);
  const uRotation = uniform(0.5);
  const uPatternSpeed = uniform(1.0);
  const uOpacity = uniform(1.0);

  material.colorNode = Fn(() => {
    const t = time;
    const PI = float(3.14159265359);
    const TWO_PI = float(6.28318530718);

    // Aspect ratio correction
    const resolution = screenSize;
    const aspect = resolution.x.div(resolution.y);
    const baseUV = uv().sub(0.5).mul(2.0);
    const centeredUV = vec2(baseUV.x.mul(aspect), baseUV.y);

    // Convert to polar coordinates
    const radius = sqrt(
      centeredUV.x.mul(centeredUV.x).add(centeredUV.y.mul(centeredUV.y)),
    );
    const angle = atan(centeredUV.y, centeredUV.x);

    // Add rotation over time
    const rotatedAngle = angle.add(t.mul(uRotation));

    // Kaleidoscope effect: fold the angle into segments
    const segmentAngle = TWO_PI.div(uSegments);
    const foldedAngle = mod(rotatedAngle, segmentAngle);

    // Mirror every other segment
    const segmentIndex = floor(rotatedAngle.div(segmentAngle));
    const isOdd = mod(segmentIndex, float(2.0));
    const mirroredAngle = foldedAngle
      .mul(isOdd.mul(-2.0).add(1.0))
      .add(isOdd.mul(segmentAngle));

    // Convert back to cartesian for pattern sampling
    const patternX = cos(mirroredAngle).mul(radius).mul(uZoom);
    const patternY = sin(mirroredAngle).mul(radius).mul(uZoom);

    // Generate an interesting source pattern using layered noise-like functions
    const pt = t.mul(uPatternSpeed);

    // Layer 1: Flowing waves
    const wave1 = sin(patternX.mul(3.0).add(pt.mul(1.2))).mul(
      cos(patternY.mul(2.5).sub(pt)),
    );

    // Layer 2: Circular ripples
    const patternDist = patternX
      .mul(patternX)
      .add(patternY.mul(patternY))
      .sqrt();
    const ripple = sin(patternDist.mul(5.0).sub(pt.mul(2.0)));

    // Layer 3: Diagonal stripes
    const stripes = sin(patternX.add(patternY).mul(4.0).add(pt.mul(0.8)));

    // Combine patterns
    const pattern = wave1.add(ripple.mul(0.7)).add(stripes.mul(0.5)).mul(0.33);

    // Create vibrant colors from the pattern
    const colorPhase = pattern.mul(PI);
    const r = sin(colorPhase).mul(0.5).add(0.5);
    const g = sin(colorPhase.add(2.094)).mul(0.5).add(0.5);
    const b = sin(colorPhase.add(4.189)).mul(0.5).add(0.5);

    // Add radial brightness variation
    const radialBrightness = float(1.0).sub(radius.mul(0.3));
    const rFinal = r.mul(radialBrightness);
    const gFinal = g.mul(radialBrightness);
    const bFinal = b.mul(radialBrightness);

    return vec4(vec3(rFinal, gFinal, bFinal), uOpacity);
  })();

  return {
    material,
    uniforms: {
      segments: uSegments,
      zoom: uZoom,
      rotation: uRotation,
      patternSpeed: uPatternSpeed,
      opacity: uOpacity,
    },
  };
}

export function Kaleidoscope({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const segments = params?.kaleidSegments ?? 6;
  const zoom = params?.kaleidZoom ?? 2;
  const rotation = params?.kaleidRotation ?? 0.5;
  const patternSpeed = params?.kaleidPatternSpeed ?? 1;

  const { viewport } = useThree();

  const { material, uniforms } = useMemo(() => {
    return createKaleidoscopeMaterial();
  }, []);

  useEffect(() => {
    uniforms.segments.value = segments;
  }, [segments, uniforms]);

  useEffect(() => {
    uniforms.zoom.value = zoom;
  }, [zoom, uniforms]);

  useEffect(() => {
    uniforms.rotation.value = rotation;
  }, [rotation, uniforms]);

  useEffect(() => {
    uniforms.patternSpeed.value = patternSpeed;
  }, [patternSpeed, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      uniforms.opacity.value = v;
    });
  }, [setOpacityOverride, uniforms]);

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

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

export default Kaleidoscope;
