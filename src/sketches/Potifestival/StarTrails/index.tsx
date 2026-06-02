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

const MAX_STARS = 8;

const DEFAULT_STAR_COLORS: [number, number, number][] = [
  [120, 60, 255],
  [0, 200, 255],
  [255, 60, 120],
  [60, 255, 180],
  [255, 180, 0],
  [180, 60, 255],
  [0, 255, 100],
  [255, 100, 60],
];

interface StarTrailsUniforms {
  starColors: { value: THREE.Vector3 }[];
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
  initialStarColors: [number, number, number][],
  initialColorTail: [number, number, number],
): {
  material: MeshBasicNodeMaterial;
  uniforms: StarTrailsUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Create MAX_STARS uniforms so color changes never require a rebuild
  const uStarColors = Array.from({ length: MAX_STARS }, (_, i) =>
    uniform(new THREE.Vector3(...(initialStarColors[i] ?? DEFAULT_STAR_COLORS[i] ?? [1, 1, 1]))),
  );
  const uColorTail = uniform(new THREE.Vector3(...initialColorTail));
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

  const hash11 = Fn(([x]: [any]) =>
    fract(sin(float(x).mul(127.1)).mul(43758.5453)),
  );

  const starPos = Fn(
    ([idx, tau, tightness, chaos, threeBody]: [any, any, any, any, any]) => {
      const sa = hash11(idx.mul(3.7));
      const sb = hash11(idx.mul(7.3));
      const sc = hash11(idx.mul(5.1));
      const sd = hash11(idx.mul(11.9));

      const phase = idx.mul(float(6.283 / starCount)).add(sa.mul(1.2));
      const angSpeed = float(1.0).add(sb.sub(0.5).mul(float(chaos)).mul(1.4));
      const r = float(tightness).mul(float(0.85).add(sc.mul(0.3)));
      const angle = phase.add(float(tau).mul(angSpeed));

      const rx = float(r);
      const ry = float(r).mul(0.55);
      const wobble = float(r)
        .mul(float(chaos))
        .mul(0.18)
        .mul(sin(float(angle).mul(2.0).add(sd.mul(6.283))));

      const x = float(cos(angle)).mul(rx);
      const y = float(sin(angle)).mul(ry).add(wobble);

      const cx = sin(float(tau).mul(0.09)).mul(0.12);
      const cy = cos(float(tau).mul(0.07)).mul(0.08);

      const s2a = hash11(idx.mul(2.3).add(0.1));
      const s2b = hash11(idx.mul(9.7).add(0.3));
      const s3a = hash11(idx.mul(4.1).add(0.7));
      const s3b = hash11(idx.mul(6.3).add(0.9));

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

      const finalX = mix(x, chaoticX, float(threeBody));
      const finalY = mix(y, chaoticY, float(threeBody));

      return vec2(float(cx).add(float(finalX)), float(cy).add(float(finalY)));
    },
  );

  const segmentBrightness = Fn(
    ([p, a, b, glow, ageFactor, brightness, trailSmoke, trailBlend]: [
      any, any, any, any, any, any, any, any,
    ]) => {
      const pv = vec2(p);
      const av = vec2(a);
      const bv = vec2(b);
      const ab = bv.sub(av);
      const ap = pv.sub(av);
      const abLen2 = dot(ab, ab).add(float(0.00001));
      const tProj = dot(ap, ab).div(abLen2);
      const dPerp = length(ap.sub(ab.mul(tProj)));
      const headFade = smoothstep(float(0.0), float(0.08), tProj);
      const gateHead = mix(headFade, float(1.0), float(trailBlend));
      const gateTail = smoothstep(float(1.0), float(0.92), tProj);
      const gate = gateHead.mul(gateTail);
      const lineFall = exp(float(dPerp).div(float(glow)).mul(float(-3.0)));
      const smokeFall = exp(float(dPerp).div(float(glow).mul(7.0)).mul(float(-1.0)))
        .mul(float(trailSmoke))
        .mul(0.18);
      return lineFall.add(smokeFall).mul(gate).mul(float(ageFactor)).mul(float(brightness));
    },
  );

  // ─── Main shader ───────────────────────────────────────────────────────────

  const starTrailsShader = Fn(() => {
    const t = time.mul(uSwirlSpeed);
    const uv = screenAspectUV().toVar();
    const accum = vec3(0.0).toVar();

    const trailDt = uTrailLength.div(float(trailSteps));

    for (let i = 0; i < starCount; i++) {
      const starCol = uStarColors[i];
      const glow = float(uStarGlow);

      const headPos = starPos(float(i), t, uTightness, uChaos, uThreeBody);
      const headDist = length(uv.sub(headPos));
      const headGlow = exp(float(headDist).div(glow.mul(0.5)).mul(float(-3.0)))
        .mul(uStarBright)
        .mul(2.5);
      const headSmoke = exp(float(headDist).div(glow.mul(5.0)).mul(float(-1.0)))
        .mul(uTrailSmoke)
        .mul(uStarBright)
        .mul(0.35);
      accum.addAssign(starCol.mul(headGlow.add(headSmoke)));

      for (let k = 0; k < trailSteps; k++) {
        const ageMid = float(k + 0.5).div(float(trailSteps));

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

        const colorMix = smoothstep(float(0.0), float(0.75), ageMid);
        const segColor = mix(starCol, uColorTail, colorMix);

        accum.addAssign(segColor.mul(seg));
      }
    }

    const tonemapped = accum.div(accum.add(float(1.0)));
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.4));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = starTrailsShader();

  return {
    material,
    uniforms: {
      starColors: uStarColors,
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

  const perStarColors: [number, number, number][] = Array.from({ length: MAX_STARS }, (_, i) => {
    const n = i + 1;
    const def = DEFAULT_STAR_COLORS[i];
    return [
      (params?.[`colorItem${n}R`] ?? def[0]) / 255,
      (params?.[`colorItem${n}G`] ?? def[1]) / 255,
      (params?.[`colorItem${n}B`] ?? def[2]) / 255,
    ];
  });

  const colorTail: [number, number, number] = [
    (params?.colorBgR ?? 255) / 255,
    (params?.colorBgG ?? 80) / 255,
    (params?.colorBgB ?? 160) / 255,
  ];

  const { material, uniforms } = useMemo(
    () => buildMaterial(starCount, trailSteps, perStarColors, colorTail),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [starCount, trailSteps],
  );

  useEffect(() => { uniforms.trailLength.value = trailLength; }, [trailLength, uniforms]);
  useEffect(() => { uniforms.trailFade.value = trailFade; }, [trailFade, uniforms]);
  useEffect(() => { uniforms.starGlow.value = starGlow; }, [starGlow, uniforms]);
  useEffect(() => { uniforms.starBrightness.value = starBrightness; }, [starBrightness, uniforms]);
  useEffect(() => { uniforms.swirlSpeed.value = swirlSpeed; }, [swirlSpeed, uniforms]);
  useEffect(() => { uniforms.swirlTightness.value = swirlTightness; }, [swirlTightness, uniforms]);
  useEffect(() => { uniforms.orbitChaos.value = orbitChaos; }, [orbitChaos, uniforms]);
  useEffect(() => { uniforms.trailSmoke.value = trailSmoke; }, [trailSmoke, uniforms]);
  useEffect(() => { uniforms.trailBlend.value = trailBlend; }, [trailBlend, uniforms]);
  useEffect(() => { uniforms.threeBody.value = threeBody; }, [threeBody, uniforms]);
  useEffect(() => { uniforms.opacity.value = opacity; }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => { uniforms.opacity.value = v; });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify([...perStarColors, colorTail]);
  useEffect(() => {
    for (let i = 0; i < MAX_STARS; i++) {
      uniforms.starColors[i].value.set(perStarColors[i][0], perStarColors[i][1], perStarColors[i][2]);
    }
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
