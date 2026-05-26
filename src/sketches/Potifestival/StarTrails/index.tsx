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
  pow,
  time,
  uniform,
  fract,
  dot,
} from "three/tsl";

import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "@/lib/tsl/utils";

interface StarTrailsUniforms {
  colorA: { value: THREE.Vector3 };
  colorB: { value: THREE.Vector3 };
  colorTail: { value: THREE.Vector3 };
  trailLength: { value: number };
  trailFade: { value: number };
  starGlow: { value: number };
  starBrightness: { value: number };
  swirlSpeed: { value: number };
  swirlTightness: { value: number };
  orbitChaos: { value: number };
  trailSmoke: { value: number };
  trailBlend: { value: number };
  threeBody: { value: number };
  opacity: { value: number };
  // baked — requires shader rebuild
  starCount: number;
  trailSteps: number;
}

function buildMaterial(
  starCount: number,
  trailSteps: number,
  initialColors: {
    colorA: [number, number, number];
    colorB: [number, number, number];
    colorTail: [number, number, number];
  },
): {
  material: MeshBasicNodeMaterial;
  uniforms: StarTrailsUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uColorA = uniform(new THREE.Vector3(...initialColors.colorA));
  const uColorB = uniform(new THREE.Vector3(...initialColors.colorB));
  const uColorTail = uniform(new THREE.Vector3(...initialColors.colorTail));
  const uTrailLength = uniform(2.5);
  const uTrailFade = uniform(1.8);
  const uStarGlow = uniform(0.032);
  const uStarBright = uniform(3.5);
  const uSwirlSpeed = uniform(0.7);
  const uTightness = uniform(0.45);
  const uChaos = uniform(0.4);
  const uTrailSmoke = uniform(0.45);
  const uTrailBlend = uniform(0.0);
  const uThreeBody = uniform(0.0);
  const uOpacity = uniform(1.0);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // hash11: float → float  (cheap, single sin)
  const hash11 = Fn(([x]: [any]) =>
    fract(sin(float(x).mul(127.1)).mul(43758.5453)),
  );

  /**
   * starPos — returns the 2D position of star `idx` at time `tau`.
   *
   * Motion model:
   *   • Each star orbits a slowly drifting vortex center
   *   • Base orbit: ellipse (squished Y) so paths look like a tilted swirl
   *   • Chaos adds a Lissajous wobble (2× harmonic) and per-star speed variation
   *   • The vortex center itself drifts in a slow figure-8
   */
  const starPos = Fn(
    ([idx, tau, tightness, chaos, threeBody]: [any, any, any, any, any]) => {
      // Per-star seeds (hash evaluated at compile-time-fixed offsets)
      const sa = hash11(idx.mul(3.7)); // phase
      const sb = hash11(idx.mul(7.3)); // speed variation
      const sc = hash11(idx.mul(5.1)); // radius variation
      const sd = hash11(idx.mul(11.9)); // lissajous phase

      // Phase evenly distributes stars around the orbit + random jitter
      const phase = idx.mul(float(6.283 / starCount)).add(sa.mul(1.2));

      // Per-star angular speed: base + chaos-scaled variation
      const angSpeed = float(1.0).add(sb.sub(0.5).mul(float(chaos)).mul(1.4));

      // Orbital radius: base tightness ± slight per-star variation
      const r = float(tightness).mul(float(0.85).add(sc.mul(0.3)));

      const angle = phase.add(float(tau).mul(angSpeed));

      // Elliptical orbit (Y squished) + Lissajous wobble on Y for whirlwind feel
      const rx = float(r);
      const ry = float(r).mul(0.55);
      const wobble = float(r)
        .mul(float(chaos))
        .mul(0.18)
        .mul(sin(float(angle).mul(2.0).add(sd.mul(6.283))));

      const x = float(cos(angle)).mul(rx);
      const y = float(sin(angle)).mul(ry).add(wobble);

      // Slowly drifting vortex center (figure-8)
      const cx = sin(float(tau).mul(0.09)).mul(0.12);
      const cy = cos(float(tau).mul(0.07)).mul(0.08);

      // Extra hash seeds for chaotic frequency phases
      const s2a = hash11(idx.mul(2.3).add(0.1));
      const s2b = hash11(idx.mul(9.7).add(0.3));
      const s3a = hash11(idx.mul(4.1).add(0.7));
      const s3b = hash11(idx.mul(6.3).add(0.9));

      // Multi-frequency superposition with irrational ratios (1, φ=1.618, √2=1.4142, √3=1.7321)
      const tBase = float(tau).mul(angSpeed);
      const t1 = tBase;
      const t2 = tBase.mul(1.618);
      const t3 = tBase.mul(1.4142);
      const t4 = tBase.mul(1.7321);

      const chaoticX = float(r).mul(
        cos(t1.add(sa.mul(6.283)))
          .mul(0.5)
          .add(cos(t2.add(s2a.mul(6.283))).mul(0.3))
          .add(cos(t3.add(s3a.mul(6.283))).mul(0.14))
          .add(cos(t4.add(s3b.mul(6.283))).mul(0.06)),
      );
      const chaoticY = float(r).mul(
        sin(t1.add(sa.mul(6.283)))
          .mul(0.45)
          .add(sin(t2.add(s2b.mul(6.283))).mul(0.27))
          .add(sin(t3.add(s2a.mul(6.283))).mul(0.13))
          .add(sin(t4.add(s3a.mul(6.283))).mul(0.05)),
      );

      // Blend orbital ↔ chaotic
      const finalX = mix(x, chaoticX, float(threeBody));
      const finalY = mix(y, chaoticY, float(threeBody));

      return vec2(float(cx).add(float(finalX)), float(cy).add(float(finalY)));
    },
  );

  /**
   * segmentBrightness — contribution of segment [a,b] to pixel p.
   *
   * Uses perpendicular distance to the infinite line through a→b (no endpoint
   * rounding), gated by a smooth in/out mask so the segment fades cleanly at
   * both ends without creating bright caps where consecutive segments meet.
   */
  const segmentBrightness = Fn(
    ([p, a, b, glow, ageFactor, brightness, trailSmoke, trailBlend]: [
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
    ]) => {
      const pv = vec2(p);
      const av = vec2(a);
      const bv = vec2(b);
      const ab = bv.sub(av);
      const ap = pv.sub(av);
      const abLen2 = dot(ab, ab).add(float(0.00001));
      // Unclamped projection onto the line — t<0 is before a, t>1 is past b
      const tProj = dot(ap, ab).div(abLen2);
      // Perpendicular distance to the infinite line (no endpoint fallback)
      const dPerp = length(ap.sub(ab.mul(tProj)));
      // Soft gate: tail always fades out. Head fade is blended away as trailBlend→1:
      // at blend=0 the head fades in over 8% of the segment → visible dark gap at
      // each junction (segmented look). At blend=1 the head gate is 1 everywhere →
      // no dark gap → seamless continuous line.
      const headFade = smoothstep(float(0.0), float(0.08), tProj);
      const gateHead = mix(headFade, float(1.0), float(trailBlend));
      const gateTail = smoothstep(float(1.0), float(0.92), tProj);
      const gate = gateHead.mul(gateTail);
      const lineFall = exp(float(dPerp).div(float(glow)).mul(float(-3.0)));
      const smokeFall = exp(
        float(dPerp).div(float(glow).mul(7.0)).mul(float(-1.0)),
      )
        .mul(float(trailSmoke))
        .mul(0.18);
      return lineFall
        .add(smokeFall)
        .mul(gate)
        .mul(float(ageFactor))
        .mul(float(brightness));
    },
  );

  // ─── Main shader ───────────────────────────────────────────────────────────

  const starTrailsShader = Fn(() => {
    const t = time.mul(uSwirlSpeed);
    const uv = screenAspectUV().toVar();
    const accum = vec3(0.0).toVar();

    // Time step between trail samples
    const trailDt = uTrailLength.div(float(trailSteps));

    for (let i = 0; i < starCount; i++) {
      const starCol = i % 2 === 0 ? uColorA : uColorB;
      const glow = float(uStarGlow);

      // ── Comet head — bright point glow at the current position ──────────
      const headPos = starPos(float(i), t, uTightness, uChaos, uThreeBody);
      const headDist = length(uv.sub(headPos));
      // Tight gaussian for the bright nucleus
      const headGlow = exp(float(headDist).div(glow.mul(0.5)).mul(float(-3.0)))
        .mul(uStarBright)
        .mul(2.5);
      // Wider halo around the head (smoke scatter)
      const headSmoke = exp(float(headDist).div(glow.mul(5.0)).mul(float(-1.0)))
        .mul(uTrailSmoke)
        .mul(uStarBright)
        .mul(0.35);
      accum.addAssign(starCol.mul(headGlow.add(headSmoke)));

      // ── Comet tail — continuous line segments through past positions ─────
      for (let k = 0; k < trailSteps; k++) {
        // Segment runs from age k to age k+1 (head → tail)
        const ageMid = float(k + 0.5).div(float(trailSteps)); // midpoint age for brightness

        const posA = starPos(
          float(i),
          t.sub(float(k).mul(trailDt)),
          uTightness,
          uChaos,
          uThreeBody,
        );
        const posB = starPos(
          float(i),
          t.sub(float(k + 1).mul(trailDt)),
          uTightness,
          uChaos,
          uThreeBody,
        );

        const ageFactor = pow(float(1.0).sub(ageMid), uTrailFade);
        const seg = segmentBrightness(
          uv,
          posA,
          posB,
          glow,
          ageFactor,
          uStarBright,
          uTrailSmoke,
          uTrailBlend,
        );

        // Color: head color → tail tint along the trail
        const colorMix = smoothstep(float(0.0), float(0.75), ageMid);
        const segColor = mix(starCol, uColorTail, colorMix);

        accum.addAssign(segColor.mul(seg));
      }
    }

    // Reinhard tonemap
    const tonemapped = accum.div(accum.add(float(1.0)));

    // Saturation boost
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.4));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = starTrailsShader();

  return {
    material,
    uniforms: {
      colorA: uColorA,
      colorB: uColorB,
      colorTail: uColorTail,
      trailLength: uTrailLength,
      trailFade: uTrailFade,
      starGlow: uStarGlow,
      starBrightness: uStarBright,
      swirlSpeed: uSwirlSpeed,
      swirlTightness: uTightness,
      orbitChaos: uChaos,
      trailSmoke: uTrailSmoke,
      trailBlend: uTrailBlend,
      threeBody: uThreeBody,
      opacity: uOpacity,
      starCount,
      trailSteps,
    },
  };
}

export function StarTrails({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const { viewport } = useThree();

  const trailLength = params?.trailLength ?? 2.5;
  const trailFade = params?.trailFade ?? 1.8;
  const starGlow = params?.starGlow ?? 0.032;
  const starBrightness = params?.starBrightness ?? 3.5;
  const swirlSpeed = params?.swirlSpeed ?? 0.7;
  const swirlTightness = params?.swirlTightness ?? 0.45;
  const orbitChaos = params?.orbitChaos ?? 0.4;
  const trailSmoke = params?.trailSmoke ?? 0.45;
  const trailBlend = params?.trailBlend ?? 0.0;
  const threeBody = params?.threeBody ?? 0.0;
  const starCount = Math.round(params?.starCount ?? 5);
  const trailSteps = Math.round(params?.trailSteps ?? 16);

  const colorA: [number, number, number] = [
    (params?.colorPrimaryR ?? 120) / 255,
    (params?.colorPrimaryG ?? 60) / 255,
    (params?.colorPrimaryB ?? 255) / 255,
  ];
  const colorB: [number, number, number] = [
    (params?.colorSecondaryR ?? 0) / 255,
    (params?.colorSecondaryG ?? 200) / 255,
    (params?.colorSecondaryB ?? 255) / 255,
  ];
  const colorTail: [number, number, number] = [
    (params?.colorBgR ?? 255) / 255,
    (params?.colorBgG ?? 80) / 255,
    (params?.colorBgB ?? 160) / 255,
  ];

  const { material, uniforms } = useMemo(
    () => buildMaterial(starCount, trailSteps, { colorA, colorB, colorTail }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [starCount, trailSteps],
  );

  useEffect(() => {
    uniforms.trailLength.value = trailLength;
  }, [trailLength, uniforms]);
  useEffect(() => {
    uniforms.trailFade.value = trailFade;
  }, [trailFade, uniforms]);
  useEffect(() => {
    uniforms.starGlow.value = starGlow;
  }, [starGlow, uniforms]);
  useEffect(() => {
    uniforms.starBrightness.value = starBrightness;
  }, [starBrightness, uniforms]);
  useEffect(() => {
    uniforms.swirlSpeed.value = swirlSpeed;
  }, [swirlSpeed, uniforms]);
  useEffect(() => {
    uniforms.swirlTightness.value = swirlTightness;
  }, [swirlTightness, uniforms]);
  useEffect(() => {
    uniforms.orbitChaos.value = orbitChaos;
  }, [orbitChaos, uniforms]);
  useEffect(() => {
    uniforms.trailSmoke.value = trailSmoke;
  }, [trailSmoke, uniforms]);
  useEffect(() => {
    uniforms.trailBlend.value = trailBlend;
  }, [trailBlend, uniforms]);
  useEffect(() => {
    uniforms.threeBody.value = threeBody;
  }, [threeBody, uniforms]);
  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      uniforms.opacity.value = v;
    });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify([colorA, colorB, colorTail]);
  useEffect(() => {
    uniforms.colorA.value.set(colorA[0], colorA[1], colorA[2]);
    uniforms.colorB.value.set(colorB[0], colorB[1], colorB[2]);
    uniforms.colorTail.value.set(colorTail[0], colorTail[1], colorTail[2]);
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default StarTrails;
