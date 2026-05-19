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
  mod,
} from "three/tsl";

import type { SketchProps } from "../../types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "../../lib/tsl/utils";

interface PrismLinesUniforms {
  colorA: { value: THREE.Vector3 };
  colorB: { value: THREE.Vector3 };
  colorPrism: { value: THREE.Vector3 };
  lineGlow: { value: number };
  prismIntensity: { value: number };
  lineBrightness: { value: number };
  plSpeed: { value: number };
  smokeDensity: { value: number };
  prismSpread: { value: number };
  rotationChaos: { value: number };
  chromaticSpread: { value: number };
  pulseAmount: { value: number };
  opacity: { value: number };
  // baked
  lineCount: number;
}

function buildMaterial(
  lineCount: number,
  initialColors: {
    colorA: [number, number, number];
    colorB: [number, number, number];
    colorPrism: [number, number, number];
  },
): {
  material: MeshBasicNodeMaterial;
  uniforms: PrismLinesUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uColorA = uniform(new THREE.Vector3(...initialColors.colorA));
  const uColorB = uniform(new THREE.Vector3(...initialColors.colorB));
  const uColorPrism = uniform(new THREE.Vector3(...initialColors.colorPrism));

  const uLineGlow = uniform(0.018);
  const uPrismIntensity = uniform(2.2);
  const uLineBrightness = uniform(3.0);
  const uPlSpeed = uniform(0.3);
  const uSmokeDensity = uniform(0.5);
  const uPrismSpread = uniform(0.35);
  const uRotationChaos = uniform(0.4);
  const uChromaticSpread = uniform(0.025);
  const uPulseAmount = uniform(0.2);
  const uOpacity = uniform(1.0);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // hash11: float → float
  const hash11 = Fn(([x]: [any]) => {
    return fract(sin(float(x).mul(127.1)).mul(43758.5453));
  });

  /**
   * Unsigned distance from point p to an infinite line through origin
   * with direction dir (unit vector).
   */
  const distToLine = Fn(([p, dir]: [any, any]) => {
    const pv = vec2(p);
    const dv = vec2(dir);
    // perpendicular distance = |p - (p·d)d|
    const proj = dv.mul(dot(pv, dv));
    return length(pv.sub(proj));
  });

  /**
   * For line i, return its [angle, offset_x, offset_y] at time t.
   * Lines rotate slowly and drift, creating crossings.
   */
  const lineAngle = Fn(([idx, t]: [any, any]) => {
    const seed = hash11(idx.mul(3.7));
    const baseAngle = seed.mul(6.283);
    // rotation speed varies per line, scaled by rotationChaos
    const rotSpeed = hash11(idx.mul(7.3)).mul(uRotationChaos).mul(0.6).add(0.05);
    return baseAngle.add(t.mul(rotSpeed));
  });

  const lineOffset = Fn(([idx, t]: [any, any]) => {
    const sx = hash11(idx.mul(5.1));
    const sy = hash11(idx.mul(9.3));
    const driftX = sin(t.mul(sx.mul(0.4).add(0.15)).add(sx.mul(6.283))).mul(0.6);
    const driftY = cos(t.mul(sy.mul(0.35).add(0.1)).add(sy.mul(6.283))).mul(0.45);
    return vec2(driftX, driftY);
  });

  /**
   * Hue → RGB (HSV with S=1, V=1)
   */
  const hue2rgb = Fn(([h]: [any]) => {
    const hv = fract(float(h));
    const r = clamp(abs(hv.mul(6.0).sub(3.0)).sub(1.0), float(0.0), float(1.0));
    const g = clamp(float(2.0).sub(abs(hv.mul(6.0).sub(2.0))), float(0.0), float(1.0));
    const b = clamp(float(2.0).sub(abs(hv.mul(6.0).sub(4.0))), float(0.0), float(1.0));
    return vec3(r, g, b);
  });

  /**
   * Distance from p to the intersection point of two infinite lines.
   * Line i: origin offset[i], direction dir[i]
   * Returns a float (large if lines are parallel).
   */
  const intersectionDist = Fn(([p, ang1, off1, ang2, off2]: [any, any, any, any, any]) => {
    const d1 = vec2(cos(ang1), sin(ang1));
    const d2 = vec2(cos(ang2), sin(ang2));
    // Solve o1 + t*d1 = o2 + s*d2 for t
    // cross product of d1, d2
    const cross = d1.x.mul(d2.y).sub(d1.y.mul(d2.x));
    // Avoid degenerate (parallel) case
    const safeCross = cross.add(float(0.0001).mul(sign2(cross)));
    const delta = vec2(off2).sub(vec2(off1));
    const t = delta.x.mul(d2.y).sub(delta.y.mul(d2.x)).div(safeCross);
    const isect = vec2(off1).add(d1.mul(t));
    return length(vec2(p).sub(isect));
  });

  // sign helper (TSL doesn't export sign directly for scalars in all versions)
  const sign2 = (x: any) => float(x).greaterThan(0.0).select(float(1.0), float(-1.0));

  /**
   * Contribution of a single line to the pixel.
   * Returns (color * brightness) as vec3.
   */
  const lineContrib = Fn(([p, idx, t, colorA, colorB, lineGlow, lineBrightness, smokeDensity, pulseAmount, chromaticSpread]: [
    any, any, any, any, any, any, any, any, any, any
  ]) => {
    const angle = lineAngle(idx, t);
    const offset = lineOffset(idx, t);

    // Direction vector of the line
    const dir = vec2(cos(angle), sin(angle));

    // Shift p by line offset, then compute perp distance
    const lp = vec2(p).sub(offset);

    // Chromatic aberration: R offset outward along normal, B inward
    const perp = vec2(dir.y.negate(), dir.x); // perpendicular to line
    const lpR = lp.add(perp.mul(float(chromaticSpread)));
    const lpB = lp.sub(perp.mul(float(chromaticSpread)));

    const distCenter = distToLine(lp, dir);
    const distR = distToLine(lpR, dir);
    const distB2 = distToLine(lpB, dir);

    const brightness = float(lineBrightness);
    const glowWidth = float(lineGlow);

    // Fog-scattered glow: Beer-Lambert falloff (scalar, then colored)
    const glowScalar = exp(float(distCenter).div(glowWidth).mul(float(-3.0))).mul(brightness);
    const glowR = exp(float(distR).div(glowWidth).mul(float(-3.0))).mul(brightness);
    const glowB2 = exp(float(distB2).div(glowWidth).mul(float(-3.0))).mul(brightness);

    // Smoke scatter: secondary wider halo (scalar)
    const smokeHalo = exp(float(distCenter).div(glowWidth.mul(float(8.0))).mul(float(-1.0)))
      .mul(float(smokeDensity)).mul(brightness).mul(0.25);

    // Per-line color: alternate A/B based on index parity
    const parity = mod(idx, float(2.0));
    const lineCol = mix(vec3(colorA), vec3(colorB), smoothstep(float(0.3), float(0.7), parity));

    // Per-line pulse
    const pulseSeed = hash11(idx.mul(4.7));
    const pulse = float(1.0).add(
      sin(t.mul(float(1.5).add(pulseSeed.mul(1.0)))).mul(float(pulseAmount)).mul(0.5)
    );

    // Chromatic R/B channels via scalar multiply
    const colR = lineCol.mul(glowR).mul(pulse);
    const colG = lineCol.mul(glowScalar).mul(pulse);
    const colB2 = lineCol.mul(glowB2).mul(pulse);
    // Blend: mostly center, with slight R/B offset for prism edge
    const caBlend = float(0.5);
    const rgbGlow = colG.add(colR.sub(colG).mul(caBlend).mul(vec3(1.0, 0.0, 0.0)))
                       .add(colB2.sub(colG).mul(caBlend).mul(vec3(0.0, 0.0, 1.0)));
    const smokeContrib = lineCol.mul(smokeHalo).mul(pulse);

    return rgbGlow.add(smokeContrib);
  });

  /**
   * Prism flare at intersection of lines i and j.
   * Rainbow hue rotates around the intersection point.
   */
  const prismFlare = Fn(([p, idx1, idx2, t, prismIntensity, prismSpread, prismTint]: [
    any, any, any, any, any, any, any
  ]) => {
    const ang1 = lineAngle(idx1, t);
    const off1 = lineOffset(idx1, t);
    const ang2 = lineAngle(idx2, t);
    const off2 = lineOffset(idx2, t);

    // Angle between lines (determines how "head-on" the collision is)
    const relAngle = abs(sin(ang1.sub(ang2)));
    // Low relative angle = nearly parallel, flare is weak
    const collisionStrength = smoothstep(float(0.05), float(0.4), relAngle);

    // Distance to intersection point
    const dIsect = intersectionDist(p, ang1, off1, ang2, off2);

    // Radial rainbow: hue varies by angle from intersection center
    const d1 = vec2(cos(ang1), sin(ang1));
    const d2 = vec2(cos(ang2), sin(ang2));
    const cross = d1.x.mul(d2.y).sub(d1.y.mul(d2.x));
    const safeCross = cross.add(float(0.0001).mul(sign2(cross)));
    const delta = off2.sub(off1);
    const tParam = delta.x.mul(d2.y).sub(delta.y.mul(d2.x)).div(safeCross);
    const isectPt = off1.add(d1.mul(tParam));

    const toP = vec2(p).sub(isectPt);
    const hue = atan(toP.y, toP.x).mul(float(1.0 / (2.0 * Math.PI))).add(t.mul(0.15));

    // Rainbow color at this angle
    const rainbow = hue2rgb(hue);

    // Blend prism tint with rainbow
    const flareColor = mix(rainbow, vec3(prismTint), float(0.25));

    // Falloff from intersection point — prismSpread controls the fan width
    const flareRadius = float(prismSpread).mul(0.5).add(0.05);
    const flareFalloff = exp(float(dIsect).div(flareRadius).mul(float(-3.5)));

    // Additional angular burst: spiky rays at intersection
    const rayAngle = atan(toP.y, toP.x);
    const numSpikes = float(6.0);
    const spikes = sin(rayAngle.mul(numSpikes).add(t.mul(0.8))).mul(0.5).add(0.5);
    const spikeRadius = float(prismSpread).mul(0.3).add(0.03);
    const spikeFalloff = exp(float(dIsect).div(spikeRadius).mul(float(-5.0)));

    const flareTotal = flareFalloff.add(spikes.mul(spikeFalloff).mul(0.5));

    return flareColor.mul(flareTotal).mul(float(prismIntensity)).mul(collisionStrength);
  });

  // ─── Main shader ───────────────────────────────────────────────────────────

  const prismLinesShader = Fn(() => {
    const t = time.mul(uPlSpeed);
    const uv = screenAspectUV().toVar();

    const accum = vec3(0.0).toVar();

    // Line contributions
    for (let i = 0; i < lineCount; i++) {
      const c = lineContrib(
        uv, float(i), t,
        uColorA, uColorB,
        uLineGlow, uLineBrightness, uSmokeDensity, uPulseAmount, uChromaticSpread
      );
      accum.addAssign(c);
    }

    // Prism flares at every pair of lines
    for (let i = 0; i < lineCount; i++) {
      for (let j = i + 1; j < lineCount; j++) {
        const f = prismFlare(
          uv, float(i), float(j), t,
          uPrismIntensity, uPrismSpread, uColorPrism
        );
        accum.addAssign(f);
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

  material.colorNode = prismLinesShader();

  return {
    material,
    uniforms: {
      colorA: uColorA,
      colorB: uColorB,
      colorPrism: uColorPrism,
      lineGlow: uLineGlow,
      prismIntensity: uPrismIntensity,
      lineBrightness: uLineBrightness,
      plSpeed: uPlSpeed,
      smokeDensity: uSmokeDensity,
      prismSpread: uPrismSpread,
      rotationChaos: uRotationChaos,
      chromaticSpread: uChromaticSpread,
      pulseAmount: uPulseAmount,
      opacity: uOpacity,
      lineCount,
    },
  };
}

/**
 * PrismLines
 *
 * Glowing infinite lines rotating and drifting through darkness.
 * At each intersection, a prismatic rainbow flare bursts outward.
 * Fog scatter creates wide soft halos along the beams.
 */
export function PrismLines({ opacity, params }: SketchProps) {
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
  const pulseAmount = params?.pulseAmount ?? 0.2;
  const colorA: [number, number, number] = [
    (params?.colorPrimaryR ?? 0) / 255,
    (params?.colorPrimaryG ?? 180) / 255,
    (params?.colorPrimaryB ?? 255) / 255,
  ];
  const colorB: [number, number, number] = [
    (params?.colorSecondaryR ?? 220) / 255,
    (params?.colorSecondaryG ?? 0) / 255,
    (params?.colorSecondaryB ?? 255) / 255,
  ];
  const colorPrism: [number, number, number] = [
    (params?.colorBgR ?? 255) / 255,
    (params?.colorBgG ?? 220) / 255,
    (params?.colorBgB ?? 80) / 255,
  ];

  const { material, uniforms } = useMemo(
    () => buildMaterial(lineCount, { colorA, colorB, colorPrism }),
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
  useEffect(() => { uniforms.pulseAmount.value = pulseAmount; }, [pulseAmount, uniforms]);
  useEffect(() => { uniforms.opacity.value = opacity; }, [opacity, uniforms]);

  const colorsKey = JSON.stringify([colorA, colorB, colorPrism]);
  useEffect(() => {
    uniforms.colorA.value.set(colorA[0], colorA[1], colorA[2]);
    uniforms.colorB.value.set(colorB[0], colorB[1], colorB[2]);
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
