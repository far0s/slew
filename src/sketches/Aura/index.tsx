import { useMemo, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  cos,
  normalize,
  length,
  log,
  clamp,
  smoothstep,
  min,
  max,
  time,
  Loop,
  select,
  mod,
  uniform,
  fract,
  dot,
} from "three/tsl";

import type { SketchProps } from "../types";
import { descriptor } from "./descriptor";

// Re-export descriptor for backward compatibility
export { descriptor };
import {
  screenAspectUV,
  tanh,
  reinhardTonemap,
  uncharted2Tonemap,
  acesTonemap,
  crossProcessTonemap,
  bleachBypassTonemap,
  technicolorTonemap,
  cinematicTonemap,
} from "../../lib/tsl/utils";

interface AuraUniforms {
  speed: { value: number };
  scaleBase: { value: number };
  bloom: { value: number };
  distance: { value: number };
  complexity: { value: number };
  sampleOffset: { value: number };
  attenuation: { value: number };
  seed: { value: number };
  colorInterp: { value: number };
  grainIntensity: { value: number };
  opacity: { value: number };
  // Colors (RGB)
  startColor: { value: THREE.Vector3 };
  midColor: { value: THREE.Vector3 };
  endColor: { value: THREE.Vector3 };
  background: { value: THREE.Vector4 };
  // Integer parameters (not uniforms in TSL, but tracked for shader rebuild)
  raySteps: number;
  tonemapMode: number;
}

/**
 * Create the Aura TSL material with all shader logic
 */
function createAuraMaterial(
  raySteps: number,
  tonemapMode: number,
  initialColors?: {
    startColor?: [number, number, number];
    midColor?: [number, number, number];
    endColor?: [number, number, number];
    background?: [number, number, number, number];
  },
): {
  material: MeshBasicNodeMaterial;
  uniforms: AuraUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Create TSL uniform nodes
  const uSpeed = uniform(0.3);
  const uScaleBase = uniform(1.0);
  const uBloom = uniform(3.2);
  const uDistance = uniform(2.0);
  const uComplexity = uniform(3.3);
  const uSampleOffset = uniform(0.15);
  const uAttenuation = uniform(0.15);
  const uSeed = uniform(0);
  const uColorInterp = uniform(0.9);
  const uGrainIntensity = uniform(0.05);
  const uOpacity = uniform(1);

  // Color uniforms - use initialColors from props, fallback to OG preset defaults
  const uStartColor = uniform(
    new THREE.Vector3(
      initialColors?.startColor?.[0] ?? 0.098,
      initialColors?.startColor?.[1] ?? 0.298,
      initialColors?.startColor?.[2] ?? 0.4,
    ),
  );
  const uMidColor = uniform(
    new THREE.Vector3(
      initialColors?.midColor?.[0] ?? 0.416,
      initialColors?.midColor?.[1] ?? 0.075,
      initialColors?.midColor?.[2] ?? 0.643,
    ),
  );
  const uEndColor = uniform(
    new THREE.Vector3(
      initialColors?.endColor?.[0] ?? 0.498,
      initialColors?.endColor?.[1] ?? 0.247,
      initialColors?.endColor?.[2] ?? 0.298,
    ),
  );
  const uBackground = uniform(
    new THREE.Vector4(
      initialColors?.background?.[0] ?? 0.043,
      initialColors?.background?.[1] ?? 0.008,
      initialColors?.background?.[2] ?? 0.086,
      initialColors?.background?.[3] ?? 1.0,
    ),
  );

  /**
   * mapSdf: Combines inline 2D rotation, warp transform, and compact noise
   * Returns pseudo-distance for volumetric raymarch
   */
  const mapSdf = Fn(
    ([p, t, speed, complexity, distance, seed]: [
      any,
      any,
      any,
      any,
      any,
      any,
    ]) => {
      // Inline rotate2D helper
      const rotate2D = (pt: any, angle: any) =>
        vec2(
          pt.x.mul(cos(angle)).sub(pt.y.mul(sin(angle))),
          pt.x.mul(sin(angle)).add(pt.y.mul(cos(angle))),
        );

      // Warp: apply time-driven rotations in XZ and XY
      const tt = t.mul(speed);
      const pv = vec3(p).toVar();

      // Rotation offset based on seed (different phase from frequency)
      const rotationSeedOffset = cos(seed.mul(0.08)).sub(1.0).mul(3.14159);

      // Wrap rotation angles to prevent precision loss (0-2π range)
      const angXZ = sin(mod(tt.mul(0.1).add(rotationSeedOffset), 6.283185));
      const angXY = cos(
        mod(tt.mul(0.4).add(rotationSeedOffset.mul(0.73)), 6.283185),
      );

      // Apply rotations
      const rxz = rotate2D(pv.xz, angXZ);
      pv.x.assign(rxz.x);
      pv.z.assign(rxz.y);
      const rxy = rotate2D(pv.xy, angXY);
      pv.x.assign(rxy.x);
      pv.y.assign(rxy.y);

      // Compact noise (formerly baseNoise)
      // Wrap tt to reasonable range for noise precision
      const wrappedTT = mod(tt, 100.0);

      // Frequency variation based on seed
      const frequencySeed = float(1.0)
        .add(sin(seed.mul(0.05)).mul(1.2))
        .add(cos(seed.mul(0.11)).sub(1.0).mul(0.4));

      const q = pv.mul(complexity).mul(frequencySeed).add(wrappedTT);

      // Time-based offset
      const timeOffset = mod(wrappedTT.mul(0.06), 6.283185);
      const sinOffset = vec3(sin(timeOffset));
      const posLen = length(pv.add(sinOffset));
      const lenPos = length(pv);
      const logComp = log(lenPos.add(0.9));
      const cosNoise = cos(q.x.add(sin(q.z.add(cos(q.y))))).mul(0.5);
      const n = posLen.mul(logComp).add(cosNoise);

      return n.sub(distance);
    },
  );

  /**
   * Main Aura shader function
   */
  const auraShader = Fn(() => {
    const _time = time.mul(uSpeed);
    const _uv = screenAspectUV().toVar();
    const a = _uv.mul(-3.0).mul(uScaleBase);
    const rayDir = normalize(vec3(a.x, a.y, -1.0));

    const accum = vec3(0.0).toVar();
    const stepCount = float(0.0).toVar();
    const d = float(2.5).toVar();

    // Raymarch loop
    Loop({ start: 0, end: raySteps }, () => {
      const p = vec3(0.0, 0.0, 4.0)
        .add(rayDir.mul(d))
        .mul(tanh(_time.mul(0.2)));

      const rz = mapSdf(p, _time, uSpeed, uComplexity, uDistance, uSeed);
      const rzOffset = mapSdf(
        p.add(uSampleOffset),
        _time,
        uSpeed,
        uComplexity,
        uDistance,
        uSeed,
      );

      const f = clamp(rz.sub(rzOffset).mul(0.5), -0.1, 0.1);

      // Build color from gradient
      const l = uStartColor
        .add(uMidColor.mul(5.0).mul(f).mul(uColorInterp))
        .add(uEndColor.mul(7.5).mul(f).mul(2.0).mul(uColorInterp));

      const presence = smoothstep(uBloom, float(0.0), rz);
      const contribution = l.mul(presence).mul(uAttenuation);
      const active = select(rz.lessThan(uBloom), float(1.0), float(0.0));

      accum.assign(accum.add(contribution.mul(active)));
      stepCount.addAssign(active);

      const stepSize = min(rz.abs(), 1.0);
      const safeStep = select(
        stepSize.lessThan(0.0001),
        float(0.001),
        stepSize,
      );
      d.addAssign(safeStep);
    });

    const hdr = vec3(min(vec3(1.0), accum));
    const finalComposite = vec3(
      max(uBackground.x, hdr.x),
      max(uBackground.y, hdr.y),
      max(uBackground.z, hdr.z),
    );

    // Apply tonemapping based on mode
    const outColor = vec3(finalComposite).toVar();

    if (tonemapMode === 1) {
      outColor.assign(reinhardTonemap(outColor));
    } else if (tonemapMode === 2) {
      outColor.assign(uncharted2Tonemap(outColor));
    } else if (tonemapMode === 3) {
      outColor.assign(acesTonemap(outColor));
    } else if (tonemapMode === 4) {
      outColor.assign(crossProcessTonemap(outColor));
    } else if (tonemapMode === 5) {
      outColor.assign(bleachBypassTonemap(outColor));
    } else if (tonemapMode === 6) {
      outColor.assign(technicolorTonemap(outColor));
    } else if (tonemapMode === 7) {
      outColor.assign(cinematicTonemap(outColor));
    }

    // Add static grain texture using mathematical noise
    // Uses _uv (screenAspectUV) to match original seb.cat implementation
    // Now that mesh no longer rotates, the grain will be static
    const grain = fract(
      sin(dot(_uv, vec2(12.9898, 78.233))).mul(43758.5453123),
    );
    const g = grain.mul(uGrainIntensity).mul(0.5);
    const finalColor = outColor.add(g);

    return vec4(finalColor, uOpacity);
  });

  material.colorNode = auraShader();

  return {
    material,
    uniforms: {
      speed: uSpeed,
      scaleBase: uScaleBase,
      bloom: uBloom,
      distance: uDistance,
      complexity: uComplexity,
      sampleOffset: uSampleOffset,
      attenuation: uAttenuation,
      seed: uSeed,
      colorInterp: uColorInterp,
      grainIntensity: uGrainIntensity,
      opacity: uOpacity,
      startColor: uStartColor,
      midColor: uMidColor,
      endColor: uEndColor,
      background: uBackground,
      raySteps,
      tonemapMode,
    },
  };
}

/**
 * Aura
 *
 * Volumetric raymarched noise shader with extensive control over colors,
 * motion, and tonemapping. Features HDR accumulation and multiple tonemapping modes.
 *
 * Parameters (see descriptor above for full details):
 * - Top 3 (MIDI Mix): bloom, complexity, sampleOffset
 * - Additional: speed, scaleBase, distance, attenuation, raySteps, seed,
 *   colorInterp, grainIntensity, tonemapMode
 */
export function Aura({ opacity, params, colors }: SketchProps) {
  const { viewport } = useThree();

  // Extract parameters with defaults
  const bloom = params?.bloom ?? 3.2;
  const complexity = params?.complexity ?? 3.3;
  const sampleOffset = params?.sampleOffset ?? 0.15;
  const speed = params?.speed ?? 0.3;
  const scaleBase = params?.scaleBase ?? 1.0;
  const distance = params?.distance ?? 2.0;
  const attenuation = params?.attenuation ?? 0.15;
  const raySteps = Math.round(params?.raySteps ?? 8);
  const seed = params?.seed ?? 0;
  const colorInterp = params?.colorInterp ?? 0.9;
  const grainIntensity = params?.grainIntensity ?? 0.05;
  const tonemapMode = Math.round(params?.tonemapMode ?? 0);

  // Resolve colors from params (0-255 → 0-1 floats for the shader).
  // buildSlotSceneParams / buildSlotParams guarantee these are populated
  // with the preset's defaultColorValue when the store is not yet initialised.
  const startColor: [number, number, number] = [
    (params?.colorPrimaryR ?? 25) / 255,
    (params?.colorPrimaryG ?? 76) / 255,
    (params?.colorPrimaryB ?? 102) / 255,
  ];

  const midColor: [number, number, number] = [
    (params?.colorSecondaryR ?? 106) / 255,
    (params?.colorSecondaryG ?? 19) / 255,
    (params?.colorSecondaryB ?? 164) / 255,
  ];

  const endColor: [number, number, number] = [
    (params?.colorBgR ?? 127) / 255,
    (params?.colorBgG ?? 63) / 255,
    (params?.colorBgB ?? 76) / 255,
  ];

  // Background kept from legacy colors prop (not a live param yet)
  const background = colors?.background ?? [0.043, 0.008, 0.086, 1.0];

  // Create material (recreate when raySteps or tonemapMode changes).
  // Pass current resolved colors so initial shader state is correct.
  const { material, uniforms } = useMemo(() => {
    return createAuraMaterial(raySteps, tonemapMode, {
      startColor,
      midColor,
      endColor,
      background: background as [number, number, number, number],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raySteps, tonemapMode]);

  // Update uniforms when parameters change
  useEffect(() => {
    uniforms.bloom.value = bloom;
  }, [bloom, uniforms]);

  useEffect(() => {
    uniforms.complexity.value = complexity;
  }, [complexity, uniforms]);

  useEffect(() => {
    uniforms.sampleOffset.value = sampleOffset;
  }, [sampleOffset, uniforms]);

  useEffect(() => {
    uniforms.speed.value = speed;
  }, [speed, uniforms]);

  useEffect(() => {
    uniforms.scaleBase.value = scaleBase;
  }, [scaleBase, uniforms]);

  useEffect(() => {
    uniforms.distance.value = distance;
  }, [distance, uniforms]);

  useEffect(() => {
    uniforms.attenuation.value = attenuation;
  }, [attenuation, uniforms]);

  useEffect(() => {
    uniforms.seed.value = seed;
  }, [seed, uniforms]);

  useEffect(() => {
    uniforms.colorInterp.value = colorInterp;
  }, [colorInterp, uniforms]);

  useEffect(() => {
    uniforms.grainIntensity.value = grainIntensity;
  }, [grainIntensity, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  // Update color uniforms when any resolved color changes
  const colorsKey = JSON.stringify([startColor, midColor, endColor, background]);
  useEffect(() => {
    uniforms.startColor.value.set(startColor[0], startColor[1], startColor[2]);
    uniforms.midColor.value.set(midColor[0], midColor[1], midColor[2]);
    uniforms.endColor.value.set(endColor[0], endColor[1], endColor[2]);
    uniforms.background.value.set(
      background[0],
      background[1],
      background[2],
      background[3] ?? 1.0,
    );
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default Aura;
