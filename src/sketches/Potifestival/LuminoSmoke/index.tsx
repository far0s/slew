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
  mix,
  time,
  uniform,
  fract,
  dot,
  pow,
  max,
  floor,
} from "three/tsl";

import type { SketchProps } from "@/sketches/types";
import { descriptor } from "./descriptor";

export { descriptor };
import { screenAspectUV } from "@/lib/tsl/utils";

const MAX_LIGHTS = 6;

const DEFAULT_COLORS: [number, number, number][] = [
  [0, 120, 255],
  [255, 0, 180],
  [0, 255, 160],
  [255, 180, 0],
  [180, 0, 255],
  [0, 220, 220],
];

interface LuminoSmokeUniforms {
  colors: { value: THREE.Vector3 }[];
  smokeDensity: { value: number };
  haloRadius: { value: number };
  lightIntensity: { value: number };
  lsSpeed: { value: number };
  scatterFalloff: { value: number };
  smokeTurbulence: { value: number };
  chromaticSpread: { value: number };
  opacity: { value: number };
  // baked — requires shader rebuild
  lightCount: number;
}

function buildMaterial(
  lightCount: number,
  initialColors: [number, number, number][],
): {
  material: MeshBasicNodeMaterial;
  uniforms: LuminoSmokeUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Create MAX_LIGHTS uniforms so color changes never require a rebuild
  const uColors = Array.from({ length: MAX_LIGHTS }, (_, i) =>
    uniform(new THREE.Vector3(...(initialColors[i] ?? DEFAULT_COLORS[i] ?? [1, 1, 1]))),
  );

  const uSmokeDensity = uniform(0.55);
  const uHaloRadius = uniform(0.45);
  const uLightIntensity = uniform(3.5);
  const uLsSpeed = uniform(0.35);
  const uScatterFalloff = uniform(1.8);
  const uSmokeTurbulence = uniform(0.3);
  const uChromaticSpread = uniform(0.03);
  const uOpacity = uniform(1.0);

  // ─── Utility helpers ────────────────────────────────────────────────────────

  const hash21 = Fn(([p]: [any]) => {
    const pv = vec2(p);
    const q = fract(pv.mul(vec2(127.1, 311.7)));
    const r = q.add(q.yx);
    return fract(sin(dot(r, vec2(127.1, 311.7))).mul(43758.5453));
  });

  const hash22 = Fn(([p]: [any]) => {
    const n = sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453);
    return fract(
      vec2(
        sin(n.mul(12.9898)).mul(43758.5453),
        sin(n.mul(78.233)).mul(43758.5453),
      ),
    );
  });

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

  const fbm = Fn(([p]: [any]) => {
    const result = float(0.0).toVar();
    const amplitude = float(0.5).toVar();
    const freq = float(1.0).toVar();
    const pp = vec2(p).toVar();

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

  const lightPos = Fn(([idx, t]: [any, any]) => {
    const seed = hash22(vec2(idx.mul(3.7), idx.mul(7.3)));

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

  const lightContrib = Fn(
    ([
      p,
      lightIdx,
      t,
      color,
      smokeDensity,
      haloRadius,
      lightIntensity,
      scatterFalloff,
      smokeTurbulence,
    ]: [any, any, any, any, any, any, any, any, any]) => {
      const lpos = lightPos(lightIdx, t);

      const turbOffset = vec2(
        fbm(p.add(vec2(t.mul(0.12), lightIdx.mul(0.37)))).sub(0.5),
        fbm(p.add(vec2(lightIdx.mul(0.53), t.mul(0.09)))).sub(0.5),
      )
        .mul(smokeTurbulence)
        .mul(0.18);

      const dp = p.sub(lpos).sub(turbOffset);
      const dist = length(dp);

      const beerLambert = exp(
        float(dist).mul(float(smokeDensity)).mul(float(-3.5)),
      );
      const haloFalloff = pow(
        max(float(1.0).sub(float(dist).div(float(haloRadius))), float(0.0)),
        float(scatterFalloff),
      );
      const scatter = beerLambert
        .mul(haloFalloff)
        .mul(lightIntensity);

      const coreGlow = float(0.012)
        .div(max(dist.mul(dist), float(0.0001)))
        .mul(lightIntensity)
        .mul(0.15);

      const total = scatter.add(coreGlow);

      return vec3(color).mul(total);
    },
  );

  const luminoSmokeShader = Fn(() => {
    const t = time.mul(uLsSpeed);
    const uv = screenAspectUV().toVar();

    const accum = vec3(0.0).toVar();

    for (let i = 0; i < lightCount; i++) {
      const idx = float(i);
      const c = lightContrib(
        uv,
        idx,
        t,
        uColors[i],
        uSmokeDensity,
        uHaloRadius,
        uLightIntensity,
        uScatterFalloff,
        uSmokeTurbulence,
      );
      accum.addAssign(c);
    }

    const uvDist = length(uv);
    const caAmount = uvDist.mul(uChromaticSpread).mul(3.0);
    const hdr = vec3(
      accum.x.mul(float(1.0).add(caAmount)),
      accum.y,
      accum.z.mul(float(1.0).sub(caAmount.mul(0.5))),
    );

    const tonemapped = hdr.div(hdr.add(float(1.0)));
    const luma = dot(tonemapped, vec3(0.299, 0.587, 0.114));
    const vivid = mix(vec3(luma), tonemapped, float(1.35));
    const clamped = clamp(vivid, vec3(0.0), vec3(1.0));

    return vec4(clamped, uOpacity);
  });

  material.colorNode = luminoSmokeShader();

  return {
    material,
    uniforms: {
      colors: uColors,
      smokeDensity: uSmokeDensity,
      haloRadius: uHaloRadius,
      lightIntensity: uLightIntensity,
      lsSpeed: uLsSpeed,
      scatterFalloff: uScatterFalloff,
      smokeTurbulence: uSmokeTurbulence,
      chromaticSpread: uChromaticSpread,
      opacity: uOpacity,
      lightCount,
    },
  };
}

export function LuminoSmoke({
  opacity,
  params,
  setOpacityOverride,
}: SketchProps) {
  const { viewport } = useThree();

  const smokeDensity = params?.smokeDensity ?? 0.55;
  const haloRadius = params?.haloRadius ?? 0.45;
  const lightIntensity = params?.lightIntensity ?? 3.5;
  const lsSpeed = params?.lsSpeed ?? 0.35;
  const lightCount = Math.round(params?.lsCount ?? 4);
  const scatterFalloff = params?.scatterFalloff ?? 1.8;
  const smokeTurbulence = params?.smokeTurbulence ?? 0.3;
  const chromaticSpread = params?.chromaticSpread ?? 0.03;

  const perItemColors: [number, number, number][] = Array.from({ length: MAX_LIGHTS }, (_, i) => {
    const n = i + 1;
    const def = DEFAULT_COLORS[i];
    return [
      (params?.[`colorItem${n}R`] ?? def[0]) / 255,
      (params?.[`colorItem${n}G`] ?? def[1]) / 255,
      (params?.[`colorItem${n}B`] ?? def[2]) / 255,
    ];
  });

  const { material, uniforms } = useMemo(
    () => buildMaterial(lightCount, perItemColors),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightCount],
  );

  useEffect(() => { uniforms.smokeDensity.value = smokeDensity; }, [smokeDensity, uniforms]);
  useEffect(() => { uniforms.haloRadius.value = haloRadius; }, [haloRadius, uniforms]);
  useEffect(() => { uniforms.lightIntensity.value = lightIntensity; }, [lightIntensity, uniforms]);
  useEffect(() => { uniforms.lsSpeed.value = lsSpeed; }, [lsSpeed, uniforms]);
  useEffect(() => { uniforms.scatterFalloff.value = scatterFalloff; }, [scatterFalloff, uniforms]);
  useEffect(() => { uniforms.smokeTurbulence.value = smokeTurbulence; }, [smokeTurbulence, uniforms]);
  useEffect(() => { uniforms.chromaticSpread.value = chromaticSpread; }, [chromaticSpread, uniforms]);
  useEffect(() => { uniforms.opacity.value = opacity; }, [opacity, uniforms]);

  useEffect(() => {
    setOpacityOverride?.((v) => { uniforms.opacity.value = v; });
  }, [setOpacityOverride, uniforms]);

  const colorsKey = JSON.stringify(perItemColors);
  useEffect(() => {
    for (let i = 0; i < MAX_LIGHTS; i++) {
      uniforms.colors[i].value.set(perItemColors[i][0], perItemColors[i][1], perItemColors[i][2]);
    }
  }, [colorsKey, uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default LuminoSmoke;
