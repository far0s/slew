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
  add,
  mul,
  time,
  screenSize,
} from "three/tsl";
import { useFrame, useThree } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

export const descriptor: SketchDescriptor = {
  id: "plasma",
  label: "Plasma",
  shortLabel: "Plasma",
  description:
    "Classic demoscene plasma effect with animated color cycling and wave interference patterns (WebGPU/TSL).",
  parameters: [
    {
      templateId: "plasma_speed",
      label: "Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      color: "cyan",
      description: "Animation speed of the plasma waves.",
    },
    {
      templateId: "plasma_scale",
      label: "Scale",
      group: "sketch",
      orderHint: 20,
      min: 1,
      max: 20,
      step: 0.5,
      defaultValue: 8,
      color: "violet",
      description: "Scale/frequency of the plasma pattern.",
    },
    {
      templateId: "plasma_complexity",
      label: "Complexity",
      group: "sketch",
      orderHint: 30,
      min: 1,
      max: 5,
      step: 0.1,
      defaultValue: 3,
      color: "rose",
      description: "Number of overlapping wave layers.",
    },
    {
      templateId: "plasma_color_cycle",
      label: "Color Cycle",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 2,
      step: 0.05,
      defaultValue: 1,
      color: "amber",
      description: "Speed of color palette cycling.",
    },
  ],
};

interface PlasmaUniforms {
  speed: { value: number };
  scale: { value: number };
  complexity: { value: number };
  colorCycle: { value: number };
  opacity: { value: number };
}

function createPlasmaMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: PlasmaUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uSpeed = uniform(1.0);
  const uScale = uniform(8.0);
  const uComplexity = uniform(3.0);
  const uColorCycle = uniform(1.0);
  const uOpacity = uniform(1.0);

  material.colorNode = Fn(() => {
    const t = time.mul(uSpeed);

    // Aspect ratio correction
    const resolution = screenSize;
    const aspect = resolution.x.div(resolution.y);
    const centeredUV = uv().sub(0.5);
    const aspectCorrectedUV = vec2(centeredUV.x.mul(aspect), centeredUV.y);

    const coords = aspectCorrectedUV.mul(uScale);
    const x = coords.x;
    const y = coords.y;

    // Classic plasma: sum of sine waves at different angles and phases
    const v1 = sin(add(x, t));
    const v2 = sin(add(y, t.mul(0.7)));
    const v3 = sin(add(add(x, y), t.mul(1.3)));

    // Circular wave from center
    const cx = x;
    const cy = y;
    const dist = cx.mul(cx).add(cy.mul(cy)).sqrt();
    const v4 = sin(add(dist.mul(uComplexity), t.mul(0.5)));

    // Diagonal wave
    const v5 = sin(mul(add(x.mul(0.5), y.mul(0.5)), uComplexity).add(t));

    // Combine all waves
    const combined = add(add(add(add(v1, v2), v3), v4), v5).mul(0.2);

    // Map to colors using color cycling
    const colorPhase = combined.add(t.mul(uColorCycle).mul(0.3));

    // Create vibrant RGB from phase-shifted sines
    const r = sin(colorPhase.mul(3.14159)).mul(0.5).add(0.5);
    const g = sin(colorPhase.mul(3.14159).add(2.094)).mul(0.5).add(0.5); // +2π/3
    const b = sin(colorPhase.mul(3.14159).add(4.189)).mul(0.5).add(0.5); // +4π/3

    // Boost saturation
    const brightness = r.add(g).add(b).div(3);
    const satBoost = float(1.3);
    const rFinal = brightness.add(r.sub(brightness).mul(satBoost));
    const gFinal = brightness.add(g.sub(brightness).mul(satBoost));
    const bFinal = brightness.add(b.sub(brightness).mul(satBoost));

    return vec4(vec3(rFinal, gFinal, bFinal), uOpacity);
  })();

  return {
    material,
    uniforms: {
      speed: uSpeed,
      scale: uScale,
      complexity: uComplexity,
      colorCycle: uColorCycle,
      opacity: uOpacity,
    },
  };
}

export function Plasma({ opacity, params }: SketchProps) {
  const speed = params?.plasmaSpeed ?? 1;
  const scale = params?.plasmaScale ?? 8;
  const complexity = params?.plasmaComplexity ?? 3;
  const colorCycle = params?.plasmaColorCycle ?? 1;

  const { viewport } = useThree();

  const { material, uniforms } = useMemo(() => {
    return createPlasmaMaterial();
  }, []);

  useEffect(() => {
    uniforms.speed.value = speed;
  }, [speed, uniforms]);

  useEffect(() => {
    uniforms.scale.value = scale;
  }, [scale, uniforms]);

  useEffect(() => {
    uniforms.complexity.value = complexity;
  }, [complexity, uniforms]);

  useEffect(() => {
    uniforms.colorCycle.value = colorCycle;
  }, [colorCycle, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

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

export default Plasma;
