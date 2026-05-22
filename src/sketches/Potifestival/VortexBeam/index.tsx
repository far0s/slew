import { useMemo, useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  vec3,
  vec4,
  float,
  sin,
  exp,
  log,
  abs,
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
  pow,
  max,
} from "three/tsl";

import type { SketchProps } from "../../types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "../../../lib/tsl/utils";

interface VortexBeamUniforms {
  colorBeam: { value: THREE.Vector3 };
  colorTip: { value: THREE.Vector3 };
  colorCore: { value: THREE.Vector3 };
  vbSpeed: { value: number };
  vbGlow: { value: number };
  vbBrightness: { value: number };
  vbTightness: { value: number };
  vbReach: { value: number };
  vbTrail: { value: number };
  vbSmoke: { value: number };
  vbChroma: { value: number };
  vbPulse: { value: number };
  opacity: { value: number };
  // baked into shader
  armCount: number;
}

function buildMaterial(
  armCount: number,
  initialColors: {
    colorBeam: [number, number, number];
    colorTip: [number, number, number];
    colorCore: [number, number, number];
  },
): {
  material: MeshBasicNodeMaterial;
  uniforms: VortexBeamUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uColorBeam = uniform(new THREE.Vector3(...initialColors.colorBeam));
  const uColorTip = uniform(new THREE.Vector3(...initialColors.colorTip));
  const uColorCore = uniform(new THREE.Vector3(...initialColors.colorCore));

  const uVbSpeed = uniform(0.6);
  const uVbGlow = uniform(0.012);
  const uVbBrightness = uniform(4.0);
  const uVbTightness = uniform(1.4);
  const uVbReach = uniform(0.9);
  const uVbTrail = uniform(0.55);
  const uVbSmoke = uniform(0.4);
  const uVbChroma = uniform(0.01);
  const uVbPulse = uniform(0.25);
  const uOpacity = uniform(1.0);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // hash11: float → float
  const hash11 = Fn(([x]: [any]) =>
    fract(sin(float(x).mul(127.1)).mul(43758.5453)),
  );

  /**
   * angleDiff — signed angular distance in [-π, π].
   * Returns how far `a` is from `b` going the short way round.
   */
  const angleDiff = Fn(([a, b]: [any, any]) => {
    const TWO_PI = float(6.283185307);
    const d = mod(float(a).sub(float(b)).add(float(Math.PI)), TWO_PI).sub(
      float(Math.PI),
    );
    return d;
  });

  /**
   * spiralAngleAtRadius — given a logarithmic spiral r = e^(k*θ),
   * returns the canonical θ for radius r.
   *   θ = ln(r) / k      (principal value, positive r)
   *
   * The arm index shifts θ by 2π/armCount so arms are evenly spaced.
   */
  const spiralAngleAtRadius = Fn(([r, k, armIdx]: [any, any, any]) => {
    const TWO_PI = float(6.283185307);
    const theta = log(max(r, float(0.001))).div(k);
    const offset = float(armIdx).mul(TWO_PI).div(float(armCount));
    return theta.add(offset);
  });

  /**
   * beamContrib — contribution of arm `armIdx` to the current pixel.
   *
   * Approach:
   *   1. Convert pixel UV to polar (r, θ_pixel).
   *   2. Compute the spiral angle θ_spiral(r) for this arm.
   *   3. The angular residual Δθ = θ_pixel − (θ_spiral + sweep) tells how far
   *      the pixel is "ahead of" or "behind" the leading edge of the arm.
   *   4. A narrow window around Δθ = 0 is the bright leading edge.
   *      The trailing window [−trailArc, 0] is the fading wake.
   *   5. Distance from the arm's centreline uses |Δθ| × r as an arc-length
   *      approximation, which maps cleanly onto the glow width.
   */
  const beamContrib = Fn(
    ([
      uv,
      armIdx,
      t,
      colorBeam,
      colorTip,
      colorCore,
      glow,
      brightness,
      tightness,
      reach,
      trail,
      smoke,
      chroma,
      pulse,
    ]: [
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
    ]) => {
      const TWO_PI = float(6.283185307);

      const r = length(uv);
      // Mask out beyond reach and a tiny dead zone at center
      const inBounds = smoothstep(float(0.02), float(0.06), r).mul(
        smoothstep(float(reach), float(reach).mul(0.85), r),
      );

      // Pixel angle in [0, 2π)
      const thetaPixel = mod(atan(uv.y, uv.x).add(TWO_PI), TWO_PI);

      // Sweep angle: time drives rotation
      const sweep = t.mul(TWO_PI);

      // Spiral angle at this radius for this arm
      const thetaSpiral = mod(
        spiralAngleAtRadius(r, tightness, armIdx)
          .add(sweep)
          .add(TWO_PI.mul(10.0)),
        TWO_PI,
      );

      // Angular residual: how far ahead/behind the leading edge we are
      const delta = angleDiff(thetaPixel, thetaSpiral);

      // ── Leading edge: narrow bright slice just ahead of the edge ──────────
      const leadWidth = float(0.04).mul(float(1.0).add(float(trail).mul(0.8)));
      const leadMask = smoothstep(leadWidth, float(0.0), abs(delta));

      // ── Trailing wake: fades from edge back by trailArc ───────────────────
      // trailArc spans [−π*trail, 0]
      const trailArc = TWO_PI.mul(float(trail));
      // delta is negative in the wake (we're behind the leading edge)
      const inWake = smoothstep(float(0.0), float(-0.05), delta) // just past leading edge
        .mul(smoothstep(trailArc.negate(), trailArc.negate().mul(0.9), delta)); // and within trail arc
      const wakeAge = clamp(
        delta.negate().div(trailArc),
        float(0.0),
        float(1.0),
      );
      const wakeFade = pow(float(1.0).sub(wakeAge), float(2.0));

      // ── Arc-length distance from spiral centreline ─────────────────────────
      // |Δθ| * r ≈ arc length to closest point on the spiral curve
      const arcDist = abs(delta).mul(max(r, float(0.03)));

      // Chromatic aberration: separate R and B channels radially
      const arcDistR = abs(delta.add(float(chroma))).mul(max(r, float(0.03)));
      const arcDistB = abs(delta.sub(float(chroma))).mul(max(r, float(0.03)));

      // Beam falloff: tight Gaussian along arc distance
      const beamFallG = exp(arcDist.div(float(glow)).mul(float(-3.5)));
      const beamFallR = exp(arcDistR.div(float(glow)).mul(float(-3.5)));
      const beamFallB = exp(arcDistB.div(float(glow)).mul(float(-3.5)));

      // Smoke scatter: wide halo using arc distance
      const smokeFall = exp(arcDist.div(float(glow).mul(10.0)).mul(float(-1.0)))
        .mul(float(smoke))
        .mul(0.3);

      // Pulse: brightness beats over time (per-arm offset for variety)
      const pulseSeed = hash11(float(armIdx).mul(4.3));
      const pulseMod = float(1.0).add(
        sin(t.mul(TWO_PI).mul(float(0.8).add(pulseSeed.mul(0.6))))
          .mul(float(pulse))
          .mul(0.5),
      );

      // ── Color: core hot → beam color → tip color along radius ─────────────
      const radialT = clamp(r.div(float(reach)), float(0.0), float(1.0));
      const coreBlend = smoothstep(float(0.15), float(0.0), r);
      const beamColor = mix(vec3(colorBeam), vec3(colorTip), radialT);
      const finalColor = mix(beamColor, vec3(colorCore), coreBlend);

      // Wake contribution: same color but faded
      const wakeContrib = beamFallG
        .mul(inWake)
        .mul(wakeFade)
        .add(smokeFall.mul(inWake).mul(wakeFade));

      // Leading edge contribution (RGB channels split for chroma)
      const leadContribR = beamFallR.mul(leadMask);
      const leadContribG = beamFallG.mul(leadMask);
      const leadContribB = beamFallB.mul(leadMask);

      // Combine: chroma on lead edge, plain on wake
      const totalG = leadContribG.add(wakeContrib);
      const totalR = leadContribR.add(wakeContrib);
      const totalB = leadContribB.add(wakeContrib);

      const brightness_f = float(brightness).mul(pulseMod).mul(inBounds);

      const rgb = vec3(
        finalColor.x.mul(totalR),
        finalColor.y.mul(totalG),
        finalColor.z.mul(totalB),
      ).mul(brightness_f);

      return rgb;
    },
  );

  // ─── Center core glow ────────────────────────────────────────────────────

  const coreGlow = Fn(
    ([uv, colorCore, brightness, glow, smoke]: [any, any, any, any, any]) => {
      const r = length(uv);
      const tight = exp(r.div(float(glow).mul(3.0)).mul(float(-4.0)))
        .mul(float(brightness))
        .mul(1.5);
      const wide = exp(r.div(float(glow).mul(25.0)).mul(float(-1.5)))
        .mul(float(brightness))
        .mul(float(smoke))
        .mul(0.4);
      return vec3(colorCore).mul(tight.add(wide));
    },
  );

  // ─── Main shader ─────────────────────────────────────────────────────────

  const vortexBeamShader = Fn(() => {
    const t = time.mul(uVbSpeed);
    const uv = screenAspectUV().toVar();

    const accum = vec3(0.0).toVar();

    for (let i = 0; i < armCount; i++) {
      const contrib = beamContrib(
        uv,
        float(i),
        t,
        uColorBeam,
        uColorTip,
        uColorCore,
        uVbGlow,
        uVbBrightness,
        uVbTightness,
        uVbReach,
        uVbTrail,
        uVbSmoke,
        uVbChroma,
        uVbPulse,
      );
      accum.addAssign(contrib);
    }

    // Add central core glow
    accum.addAssign(coreGlow(uv, uColorCore, uVbBrightness, uVbGlow, uVbSmoke));

    // Reinhard tonemap
    const tonemapped = accum.div(accum.add(float(1.0)));

    // Saturation boost
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.4));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = vortexBeamShader();

  return {
    material,
    uniforms: {
      colorBeam: uColorBeam,
      colorTip: uColorTip,
      colorCore: uColorCore,
      vbSpeed: uVbSpeed,
      vbGlow: uVbGlow,
      vbBrightness: uVbBrightness,
      vbTightness: uVbTightness,
      vbReach: uVbReach,
      vbTrail: uVbTrail,
      vbSmoke: uVbSmoke,
      vbChroma: uVbChroma,
      vbPulse: uVbPulse,
      opacity: uOpacity,
      armCount,
    },
  };
}

/**
 * VortexBeam
 *
 * Logarithmic spiral laser arms sweep from the center outward.
 * Each arm leaves a fading smoke trail — the angular wake is brighter
 * near the leading edge and fades proportionally to trailLength.
 * A hot-core glow and chromatic aberration on the leading edge add
 * laser-rig authenticity.
 */
export function VortexBeam({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const { viewport } = useThree();

  const vbSpeed = params?.vbSpeed ?? 0.6;
  const vbGlow = params?.vbGlow ?? 0.012;
  const vbBrightness = params?.vbBrightness ?? 4.0;
  const vbTightness = params?.vbTightness ?? 1.4;
  const vbReach = params?.vbReach ?? 0.9;
  const vbTrail = params?.vbTrail ?? 0.55;
  const vbSmoke = params?.vbSmoke ?? 0.4;
  const vbChroma = params?.vbChroma ?? 0.01;
  const vbPulse = params?.vbPulse ?? 0.25;
  const armCount = Math.round(params?.vbArms ?? 2);

  const colorBeam: [number, number, number] = [
    (params?.colorPrimaryR ?? 0) / 255,
    (params?.colorPrimaryG ?? 255) / 255,
    (params?.colorPrimaryB ?? 180) / 255,
  ];
  const colorTip: [number, number, number] = [
    (params?.colorSecondaryR ?? 120) / 255,
    (params?.colorSecondaryG ?? 0) / 255,
    (params?.colorSecondaryB ?? 255) / 255,
  ];
  const colorCore: [number, number, number] = [
    (params?.colorBgR ?? 255) / 255,
    (params?.colorBgG ?? 60) / 255,
    (params?.colorBgB ?? 0) / 255,
  ];

  const { material, uniforms } = useMemo(
    () => buildMaterial(armCount, { colorBeam, colorTip, colorCore }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [armCount],
  );

  useEffect(() => {
    uniforms.vbSpeed.value = vbSpeed;
  }, [vbSpeed, uniforms]);
  useEffect(() => {
    uniforms.vbGlow.value = vbGlow;
  }, [vbGlow, uniforms]);
  useEffect(() => {
    uniforms.vbBrightness.value = vbBrightness;
  }, [vbBrightness, uniforms]);
  useEffect(() => {
    uniforms.vbTightness.value = vbTightness;
  }, [vbTightness, uniforms]);
  useEffect(() => {
    uniforms.vbReach.value = vbReach;
  }, [vbReach, uniforms]);
  useEffect(() => {
    uniforms.vbTrail.value = vbTrail;
  }, [vbTrail, uniforms]);
  useEffect(() => {
    uniforms.vbSmoke.value = vbSmoke;
  }, [vbSmoke, uniforms]);
  useEffect(() => {
    uniforms.vbChroma.value = vbChroma;
  }, [vbChroma, uniforms]);
  useEffect(() => {
    uniforms.vbPulse.value = vbPulse;
  }, [vbPulse, uniforms]);
  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => {
      uniforms.opacity.value = v;
    });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify([colorBeam, colorTip, colorCore]);
  useEffect(() => {
    uniforms.colorBeam.value.set(colorBeam[0], colorBeam[1], colorBeam[2]);
    uniforms.colorTip.value.set(colorTip[0], colorTip[1], colorTip[2]);
    uniforms.colorCore.value.set(colorCore[0], colorCore[1], colorCore[2]);
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default VortexBeam;
