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
  exp,
  length,
  clamp,
  smoothstep,
  mix,
  time,
  uniform,
  fract,
  dot,
  pow,
  max,
  mod,
  floor,
} from "three/tsl";

import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "@/lib/tsl/utils";

interface LuminoSmokeUniforms {
  // Colors
  colorA: { value: THREE.Vector3 };
  colorB: { value: THREE.Vector3 };
  colorC: { value: THREE.Vector3 };
  // Parameters
  smokeDensity: { value: number };
  haloRadius: { value: number };
  lightIntensity: { value: number };
  lsSpeed: { value: number };
  scatterFalloff: { value: number };
  smokeTurbulence: { value: number };
  chromaticSpread: { value: number };
  pulseAmount: { value: number };
  opacity: { value: number };
  // integer — needs shader rebuild
  lightCount: number;
}

/**
 * Hash function for pseudo-random values
 */
function buildMaterial(
  lightCount: number,
  initialColors: {
    colorA: [number, number, number];
    colorB: [number, number, number];
    colorC: [number, number, number];
  },
): {
  material: MeshBasicNodeMaterial;
  uniforms: LuminoSmokeUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Uniforms
  const uColorA = uniform(new THREE.Vector3(...initialColors.colorA));
  const uColorB = uniform(new THREE.Vector3(...initialColors.colorB));
  const uColorC = uniform(new THREE.Vector3(...initialColors.colorC));

  const uSmokeDensity = uniform(0.55);
  const uHaloRadius = uniform(0.45);
  const uLightIntensity = uniform(3.5);
  const uLsSpeed = uniform(0.35);
  const uScatterFalloff = uniform(1.8);
  const uSmokeTurbulence = uniform(0.3);
  const uChromaticSpread = uniform(0.03);
  const uPulseAmount = uniform(0.25);
  const uOpacity = uniform(1.0);

  // ─── Utility helpers ────────────────────────────────────────────────────────

  /**
   * hash21 – 2D → 1D pseudo-random
   */
  const hash21 = Fn(([p]: [any]) => {
    // p must be vec2; use explicit construction
    const pv = vec2(p);
    const q = fract(pv.mul(vec2(127.1, 311.7)));
    const r = q.add(q.yx);
    return fract(sin(dot(r, vec2(127.1, 311.7))).mul(43758.5453));
  });

  /**
   * hash22 – 2D → 2D pseudo-random (seed as vec2)
   */
  const hash22 = Fn(([p]: [any]) => {
    const n = sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453);
    return fract(
      vec2(
        sin(n.mul(12.9898)).mul(43758.5453),
        sin(n.mul(78.233)).mul(43758.5453),
      ),
    );
  });

  /**
   * 2D smooth noise [0,1]
   */
  const noise2D = Fn(([p]: [any]) => {
    const pv = vec2(p);
    const i = floor(pv);
    const f = fract(pv);
    const ux = f.x.mul(f.x).mul(float(3.0).sub(f.x.mul(2.0)));
    const uy = f.y.mul(f.y).mul(float(3.0).sub(f.y.mul(2.0)));

    const a = hash21(i);
    const b = hash21(i.add(vec2(1.0, 0.0)));
    const c = hash21(i.add(vec2(0.0, 1.0)));
    const d = hash21(i.add(vec2(1.0, 1.0)));

    return mix(mix(a, b, ux), mix(c, d, ux), uy);
  });

  /**
   * Fractal Brownian Motion — layered noise for smoke turbulence
   */
  const fbm = Fn(([p]: [any]) => {
    const result = float(0.0).toVar();
    const amplitude = float(0.5).toVar();
    const freq = float(1.0).toVar();
    const pp = vec2(p).toVar();

    // 4 octaves
    result.addAssign(noise2D(pp.mul(freq)).mul(amplitude));
    pp.assign(pp.mul(2.1).add(vec2(1.7, 9.2)));
    amplitude.mulAssign(0.5);
    freq.mulAssign(2.0);

    result.addAssign(noise2D(pp.mul(freq)).mul(amplitude));
    pp.assign(pp.mul(2.1).add(vec2(1.7, 9.2)));
    amplitude.mulAssign(0.5);
    freq.mulAssign(2.0);

    result.addAssign(noise2D(pp.mul(freq)).mul(amplitude));
    pp.assign(pp.mul(2.1).add(vec2(1.7, 9.2)));
    amplitude.mulAssign(0.5);
    freq.mulAssign(2.0);

    result.addAssign(noise2D(pp.mul(freq)).mul(amplitude));

    return result;
  });

  /**
   * Compute position of light source i at time t
   * Each light has unique Lissajous-like path seeded by its index
   */
  const lightPos = Fn(([idx, t]: [any, any]) => {
    // Unique seed per light — use hash to get different frequencies/phases
    const seed = hash22(vec2(idx.mul(3.7), idx.mul(7.3)));

    // Frequencies: slow drift, each light has different orbit speed
    const freqX = seed.x.mul(0.8).add(0.3);
    const freqY = seed.y.mul(0.6).add(0.25);
    const phaseX = seed.x.mul(6.283);
    const phaseY = seed.y.mul(6.283);

    const x = sin(t.mul(freqX).add(phaseX)).mul(0.72);
    const y = cos(t.mul(freqY).add(phaseY))
      .mul(0.5)
      .add(sin(t.mul(freqX.mul(0.31))).mul(0.2));

    return vec2(x, y);
  });

  /**
   * Sample a single light's contribution at UV position p
   * Returns RGB contribution
   */
  const lightContrib = Fn(
    ([
      p,
      lightIdx,
      t,
      colorA,
      colorB,
      colorC,
      smokeDensity,
      haloRadius,
      lightIntensity,
      scatterFalloff,
      pulseAmount,
      smokeTurbulence,
    ]: [any, any, any, any, any, any, any, any, any, any, any, any]) => {
      const lpos = lightPos(lightIdx, t);

      // Pick color based on light index mod 3
      const mod3 = mod(lightIdx, float(3.0));
      const col = vec3(colorA).toVar();
      // smooth blending would require dynamic branching; use lerp chain instead
      const blendAB = smoothstep(float(0.4), float(0.6), mod3.sub(0.0));
      const blendBC = smoothstep(float(1.4), float(1.6), mod3.sub(1.0));
      col.assign(mix(col, colorB, blendAB));
      col.assign(mix(col, colorC, blendBC));

      // Per-light pulse
      const pulseSeed = hash21(vec2(lightIdx.mul(5.1), float(0.0)));
      const pulse = float(1.0).add(
        sin(t.mul(float(1.8).add(pulseSeed.mul(1.2))))
          .mul(pulseAmount)
          .mul(0.5),
      );

      // Turbulence offset on the light position
      const turbOffset = vec2(
        fbm(p.add(vec2(t.mul(0.12), lightIdx.mul(0.37)))).sub(0.5),
        fbm(p.add(vec2(lightIdx.mul(0.53), t.mul(0.09)))).sub(0.5),
      )
        .mul(smokeTurbulence)
        .mul(0.18);

      const dp = p.sub(lpos).sub(turbOffset);
      const dist = length(dp);

      // Core halo — Gaussian-like scatter through smoke
      // Beer-Lambert: light is attenuated exponentially through fog
      const beerLambert = exp(
        float(dist).mul(float(smokeDensity)).mul(float(-3.5)),
      );
      const haloFalloff = pow(
        max(float(1.0).sub(float(dist).div(float(haloRadius))), float(0.0)),
        float(scatterFalloff),
      );
      const scatter = beerLambert
        .mul(haloFalloff)
        .mul(lightIntensity)
        .mul(pulse);

      // Soft core glow (bright center point)
      const coreGlow = float(0.012)
        .div(max(dist.mul(dist), float(0.0001)))
        .mul(lightIntensity)
        .mul(0.15);

      const total = scatter.add(coreGlow);

      return col.mul(total);
    },
  );

  /**
   * Main shader
   */
  const luminoSmokeShader = Fn(() => {
    const t = time.mul(uLsSpeed);
    const uv = screenAspectUV().toVar();

    const accum = vec3(0.0).toVar();

    // Accumulate all lights — single pass, no per-light CA loop
    for (let i = 0; i < lightCount; i++) {
      const idx = float(i);
      const c = lightContrib(
        uv,
        idx,
        t,
        uColorA,
        uColorB,
        uColorC,
        uSmokeDensity,
        uHaloRadius,
        uLightIntensity,
        uScatterFalloff,
        uPulseAmount,
        uSmokeTurbulence,
      );
      accum.addAssign(c);
    }

    // Cheap post-process chromatic aberration:
    // Shift R warm at edges (outward = more of the inward light), B cool at center.
    // This is O(1) rather than O(lightCount) — avoids blowing up shader complexity.
    const uvDist = length(uv);
    const caAmount = uvDist.mul(uChromaticSpread).mul(3.0);
    const hdr = vec3(
      accum.x.mul(float(1.0).add(caAmount)),
      accum.y,
      accum.z.mul(float(1.0).sub(caAmount.mul(0.5))),
    );

    // Reinhard-style tonemapping to keep vibrant colors from clipping harshly
    const tonemapped = hdr.div(hdr.add(float(1.0)));
    // Boost saturation slightly post-tonemap
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.35));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = luminoSmokeShader();

  return {
    material,
    uniforms: {
      colorA: uColorA,
      colorB: uColorB,
      colorC: uColorC,
      smokeDensity: uSmokeDensity,
      haloRadius: uHaloRadius,
      lightIntensity: uLightIntensity,
      lsSpeed: uLsSpeed,
      scatterFalloff: uScatterFalloff,
      smokeTurbulence: uSmokeTurbulence,
      chromaticSpread: uChromaticSpread,
      pulseAmount: uPulseAmount,
      opacity: uOpacity,
      lightCount,
    },
  };
}

/**
 * LuminoSmoke
 *
 * Floating light sources drifting in darkness, each emitting volumetric halos
 * through simulated smoke/fog. Includes god rays, chromatic aberration, turbulence,
 * and Mie-inspired scatter for a realistic "light through smoke" look.
 */
export function LuminoSmoke({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const { viewport } = useThree();

  // Parameters with defaults
  const smokeDensity = params?.smokeDensity ?? 0.55;
  const haloRadius = params?.haloRadius ?? 0.45;
  const lightIntensity = params?.lightIntensity ?? 3.5;
  const lsSpeed = params?.lsSpeed ?? 0.35;
  const lightCount = Math.round(params?.lsCount ?? 3);
  const scatterFalloff = params?.scatterFalloff ?? 1.8;
  const smokeTurbulence = params?.smokeTurbulence ?? 0.3;
  const chromaticSpread = params?.chromaticSpread ?? 0.03;
  const pulseAmount = params?.pulseAmount ?? 0.25;

  // Colors (0-255 → 0-1)
  const colorA: [number, number, number] = [
    (params?.colorPrimaryR ?? 0) / 255,
    (params?.colorPrimaryG ?? 120) / 255,
    (params?.colorPrimaryB ?? 255) / 255,
  ];
  const colorB: [number, number, number] = [
    (params?.colorSecondaryR ?? 255) / 255,
    (params?.colorSecondaryG ?? 0) / 255,
    (params?.colorSecondaryB ?? 180) / 255,
  ];
  const colorC: [number, number, number] = [
    (params?.colorBgR ?? 0) / 255,
    (params?.colorBgG ?? 255) / 255,
    (params?.colorBgB ?? 160) / 255,
  ];

  // Rebuild when lightCount changes (baked into shader)
  const { material, uniforms } = useMemo(
    () => buildMaterial(lightCount, { colorA, colorB, colorC }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightCount],
  );

  // Update uniforms
  useEffect(() => {
    uniforms.smokeDensity.value = smokeDensity;
  }, [smokeDensity, uniforms]);
  useEffect(() => {
    uniforms.haloRadius.value = haloRadius;
  }, [haloRadius, uniforms]);
  useEffect(() => {
    uniforms.lightIntensity.value = lightIntensity;
  }, [lightIntensity, uniforms]);
  useEffect(() => {
    uniforms.lsSpeed.value = lsSpeed;
  }, [lsSpeed, uniforms]);
  useEffect(() => {
    uniforms.scatterFalloff.value = scatterFalloff;
  }, [scatterFalloff, uniforms]);
  useEffect(() => {
    uniforms.smokeTurbulence.value = smokeTurbulence;
  }, [smokeTurbulence, uniforms]);
  useEffect(() => {
    uniforms.chromaticSpread.value = chromaticSpread;
  }, [chromaticSpread, uniforms]);
  useEffect(() => {
    uniforms.pulseAmount.value = pulseAmount;
  }, [pulseAmount, uniforms]);
  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      uniforms.opacity.value = v;
    });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify([colorA, colorB, colorC]);
  useEffect(() => {
    uniforms.colorA.value.set(colorA[0], colorA[1], colorA[2]);
    uniforms.colorB.value.set(colorB[0], colorB[1], colorB[2]);
    uniforms.colorC.value.set(colorC[0], colorC[1], colorC[2]);
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default LuminoSmoke;
