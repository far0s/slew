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
  abs,
  exp,
  length,
  clamp,
  smoothstep,
  mix,
  time,
  uniform,
  fract,
  dot,
  atan,
} from "three/tsl";

import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "@/lib/tsl/utils";

const MAX_LINES = 8;

const DEFAULT_COLORS: [number, number, number][] = [
  [0, 180, 255],
  [220, 0, 255],
  [0, 255, 120],
  [255, 100, 0],
  [255, 0, 120],
  [0, 220, 180],
  [255, 220, 0],
  [100, 0, 255],
];

interface PrismLinesUniforms {
  lineColors: { value: THREE.Vector3 }[];
  colorPrism: { value: THREE.Vector3 };
  lineGlow: { value: number };
  prismIntensity: { value: number };
  lineBrightness: { value: number };
  plSpeed: { value: number };
  smokeDensity: { value: number };
  prismSpread: { value: number };
  rotationChaos: { value: number };
  chromaticSpread: { value: number };
  opacity: { value: number };
  // baked
  lineCount: number;
}

function buildMaterial(
  lineCount: number,
  initialLineColors: [number, number, number][],
  initialColorPrism: [number, number, number],
): {
  material: MeshBasicNodeMaterial;
  uniforms: PrismLinesUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Create MAX_LINES uniforms so color changes never require a rebuild
  const uLineColors = Array.from({ length: MAX_LINES }, (_, i) =>
    uniform(new THREE.Vector3(...(initialLineColors[i] ?? DEFAULT_COLORS[i] ?? [1, 1, 1]))),
  );
  const uColorPrism = uniform(new THREE.Vector3(...initialColorPrism));

  const uLineGlow = uniform(0.018);
  const uPrismIntensity = uniform(2.2);
  const uLineBrightness = uniform(3.0);
  const uPlSpeed = uniform(0.3);
  const uSmokeDensity = uniform(0.5);
  const uPrismSpread = uniform(0.35);
  const uRotationChaos = uniform(0.4);
  const uChromaticSpread = uniform(0.025);

  const uOpacity = uniform(1.0);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const hash11 = Fn(([x]: [any]) => {
    return fract(sin(float(x).mul(127.1)).mul(43758.5453));
  });

  const distToLine = Fn(([p, dir]: [any, any]) => {
    const pv = vec2(p);
    const dv = vec2(dir);
    const proj = dv.mul(dot(pv, dv));
    return length(pv.sub(proj));
  });

  const lineAngle = Fn(([idx, t]: [any, any]) => {
    const seed = hash11(idx.mul(3.7));
    const baseAngle = seed.mul(6.283);
    const rotSpeed = hash11(idx.mul(7.3))
      .mul(uRotationChaos)
      .mul(0.6)
      .add(0.05);
    return baseAngle.add(t.mul(rotSpeed));
  });

  const lineOffset = Fn(([idx, t]: [any, any]) => {
    const sx = hash11(idx.mul(5.1));
    const sy = hash11(idx.mul(9.3));
    const driftX = sin(t.mul(sx.mul(0.4).add(0.15)).add(sx.mul(6.283))).mul(0.6);
    const driftY = cos(t.mul(sy.mul(0.35).add(0.1)).add(sy.mul(6.283))).mul(0.45);
    return vec2(driftX, driftY);
  });

  const hue2rgb = Fn(([h]: [any]) => {
    const hv = fract(float(h));
    const r = clamp(abs(hv.mul(6.0).sub(3.0)).sub(1.0), float(0.0), float(1.0));
    const g = clamp(float(2.0).sub(abs(hv.mul(6.0).sub(2.0))), float(0.0), float(1.0));
    const b = clamp(float(2.0).sub(abs(hv.mul(6.0).sub(4.0))), float(0.0), float(1.0));
    return vec3(r, g, b);
  });

  const intersectionDist = Fn(
    ([p, ang1, off1, ang2, off2]: [any, any, any, any, any]) => {
      const d1 = vec2(cos(ang1), sin(ang1));
      const d2 = vec2(cos(ang2), sin(ang2));
      const cross = d1.x.mul(d2.y).sub(d1.y.mul(d2.x));
      const safeCross = cross.add(float(0.0001).mul(sign2(cross)));
      const delta = vec2(off2).sub(vec2(off1));
      const t = delta.x.mul(d2.y).sub(delta.y.mul(d2.x)).div(safeCross);
      const isect = vec2(off1).add(d1.mul(t));
      return length(vec2(p).sub(isect));
    },
  );

  const sign2 = (x: any) =>
    float(x).greaterThan(0.0).select(float(1.0), float(-1.0));

  const lineContrib = Fn(
    ([
      p,
      idx,
      t,
      lineColor,
      lineGlow,
      lineBrightness,
      smokeDensity,
      chromaticSpread,
    ]: [any, any, any, any, any, any, any, any]) => {
      const angle = lineAngle(idx, t);
      const offset = lineOffset(idx, t);
      const dir = vec2(cos(angle), sin(angle));
      const lp = vec2(p).sub(offset);

      const perp = vec2(dir.y.negate(), dir.x);
      const lpR = lp.add(perp.mul(float(chromaticSpread)));
      const lpB = lp.sub(perp.mul(float(chromaticSpread)));

      const distCenter = distToLine(lp, dir);
      const distR = distToLine(lpR, dir);
      const distB2 = distToLine(lpB, dir);

      const brightness = float(lineBrightness);
      const glowWidth = float(lineGlow);

      const glowScalar = exp(float(distCenter).div(glowWidth).mul(float(-3.0))).mul(brightness);
      const glowR = exp(float(distR).div(glowWidth).mul(float(-3.0))).mul(brightness);
      const glowB2 = exp(float(distB2).div(glowWidth).mul(float(-3.0))).mul(brightness);

      const smokeHalo = exp(
        float(distCenter).div(glowWidth.mul(float(8.0))).mul(float(-1.0)),
      )
        .mul(float(smokeDensity))
        .mul(brightness)
        .mul(0.25);

      const colR = vec3(lineColor).mul(glowR);
      const colG = vec3(lineColor).mul(glowScalar);
      const colB2 = vec3(lineColor).mul(glowB2);
      const caBlend = float(0.5);
      const rgbGlow = colG
        .add(colR.sub(colG).mul(caBlend).mul(vec3(1.0, 0.0, 0.0)))
        .add(colB2.sub(colG).mul(caBlend).mul(vec3(0.0, 0.0, 1.0)));
      const smokeContrib = vec3(lineColor).mul(smokeHalo);

      return rgbGlow.add(smokeContrib);
    },
  );

  const prismFlare = Fn(
    ([p, idx1, idx2, t, prismIntensity, prismSpread, prismTint]: [
      any, any, any, any, any, any, any,
    ]) => {
      const ang1 = lineAngle(idx1, t);
      const off1 = lineOffset(idx1, t);
      const ang2 = lineAngle(idx2, t);
      const off2 = lineOffset(idx2, t);

      const relAngle = abs(sin(ang1.sub(ang2)));
      const collisionStrength = smoothstep(float(0.05), float(0.4), relAngle);

      const dIsect = intersectionDist(p, ang1, off1, ang2, off2);

      const d1 = vec2(cos(ang1), sin(ang1));
      const d2 = vec2(cos(ang2), sin(ang2));
      const cross = d1.x.mul(d2.y).sub(d1.y.mul(d2.x));
      const safeCross = cross.add(float(0.0001).mul(sign2(cross)));
      const delta = off2.sub(off1);
      const tParam = delta.x.mul(d2.y).sub(delta.y.mul(d2.x)).div(safeCross);
      const isectPt = off1.add(d1.mul(tParam));

      const toP = vec2(p).sub(isectPt);
      const hue = atan(toP.y, toP.x)
        .mul(float(1.0 / (2.0 * Math.PI)))
        .add(t.mul(0.15));

      const rainbow = hue2rgb(hue);
      const flareColor = mix(rainbow, vec3(prismTint), float(0.25));

      const flareRadius = float(prismSpread).mul(0.5).add(0.05);
      const flareFalloff = exp(float(dIsect).div(flareRadius).mul(float(-3.5)));

      const rayAngle = atan(toP.y, toP.x);
      const numSpikes = float(6.0);
      const spikes = sin(rayAngle.mul(numSpikes).add(t.mul(0.8))).mul(0.5).add(0.5);
      const spikeRadius = float(prismSpread).mul(0.3).add(0.03);
      const spikeFalloff = exp(float(dIsect).div(spikeRadius).mul(float(-5.0)));

      const flareTotal = flareFalloff.add(spikes.mul(spikeFalloff).mul(0.5));

      return flareColor.mul(flareTotal).mul(float(prismIntensity)).mul(collisionStrength);
    },
  );

  // ─── Main shader ───────────────────────────────────────────────────────────

  const prismLinesShader = Fn(() => {
    const t = time.mul(uPlSpeed);
    const uv = screenAspectUV().toVar();

    const accum = vec3(0.0).toVar();

    for (let i = 0; i < lineCount; i++) {
      const c = lineContrib(
        uv,
        float(i),
        t,
        uLineColors[i],
        uLineGlow,
        uLineBrightness,
        uSmokeDensity,
        uChromaticSpread,
      );
      accum.addAssign(c);
    }

    for (let i = 0; i < lineCount; i++) {
      for (let j = i + 1; j < lineCount; j++) {
        const f = prismFlare(
          uv,
          float(i),
          float(j),
          t,
          uPrismIntensity,
          uPrismSpread,
          uColorPrism,
        );
        accum.addAssign(f);
      }
    }

    const tonemapped = accum.div(accum.add(float(1.0)));
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.4));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = prismLinesShader();

  return {
    material,
    uniforms: {
      lineColors: uLineColors,
      colorPrism: uColorPrism,
      lineGlow: uLineGlow,
      prismIntensity: uPrismIntensity,
      lineBrightness: uLineBrightness,
      plSpeed: uPlSpeed,
      smokeDensity: uSmokeDensity,
      prismSpread: uPrismSpread,
      rotationChaos: uRotationChaos,
      chromaticSpread: uChromaticSpread,
      opacity: uOpacity,
      lineCount,
    },
  };
}

export function PrismLines({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const { viewport } = useThree();

  const lineGlow = params?.lineGlow ?? 0.018;
  const prismIntensity = params?.prismIntensity ?? 2.2;
  const lineBrightness = params?.lineBrightness ?? 3.0;
  const plSpeed = params?.plSpeed ?? 0.3;
  const lineCount = Math.round(params?.plCount ?? 4);
  const smokeDensity = params?.smokeDensity ?? 0.5;
  const prismSpread = params?.prismSpread ?? 0.35;
  const rotationChaos = params?.rotationChaos ?? 0.4;
  const chromaticSpread = params?.chromaticSpread ?? 0.025;

  const perLineColors: [number, number, number][] = Array.from({ length: MAX_LINES }, (_, i) => {
    const n = i + 1;
    const def = DEFAULT_COLORS[i];
    return [
      (params?.[`colorItem${n}R`] ?? def[0]) / 255,
      (params?.[`colorItem${n}G`] ?? def[1]) / 255,
      (params?.[`colorItem${n}B`] ?? def[2]) / 255,
    ];
  });

  const colorPrism: [number, number, number] = [
    (params?.colorBgR ?? 255) / 255,
    (params?.colorBgG ?? 220) / 255,
    (params?.colorBgB ?? 80) / 255,
  ];

  const { material, uniforms } = useMemo(
    () => buildMaterial(lineCount, perLineColors, colorPrism),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineCount],
  );

  useEffect(() => { uniforms.lineGlow.value = lineGlow; }, [lineGlow, uniforms]);
  useEffect(() => { uniforms.prismIntensity.value = prismIntensity; }, [prismIntensity, uniforms]);
  useEffect(() => { uniforms.lineBrightness.value = lineBrightness; }, [lineBrightness, uniforms]);
  useEffect(() => { uniforms.plSpeed.value = plSpeed; }, [plSpeed, uniforms]);
  useEffect(() => { uniforms.smokeDensity.value = smokeDensity; }, [smokeDensity, uniforms]);
  useEffect(() => { uniforms.prismSpread.value = prismSpread; }, [prismSpread, uniforms]);
  useEffect(() => { uniforms.rotationChaos.value = rotationChaos; }, [rotationChaos, uniforms]);
  useEffect(() => { uniforms.chromaticSpread.value = chromaticSpread; }, [chromaticSpread, uniforms]);
  useEffect(() => { uniforms.opacity.value = opacity; }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => { uniforms.opacity.value = v; });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify([...perLineColors, colorPrism]);
  useEffect(() => {
    for (let i = 0; i < MAX_LINES; i++) {
      uniforms.lineColors[i].value.set(perLineColors[i][0], perLineColors[i][1], perLineColors[i][2]);
    }
    uniforms.colorPrism.value.set(colorPrism[0], colorPrism[1], colorPrism[2]);
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default PrismLines;
