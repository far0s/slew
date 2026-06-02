import type { Scene, Camera, Texture } from "three";
import type { WebGPURenderer } from "three/webgpu";
import { RenderPipeline } from "three/webgpu";
import {
  float,
  vec2,
  vec3,
  vec4,
  pass,
  texture as textureNode,
  uv,
  screenSize,
  sin,
  cos,
  atan,
  fract,
  floor,
  length,
  normalize,
  min,
  abs,
  dot,
  pow,
  smoothstep,
  oneMinus,
  mix,
  If,
  int,
  Fn,
  time,
  mod,
  mx_fractal_noise_vec2,
} from "three/tsl";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { rgbShift } from "three/examples/jsm/tsl/display/RGBShiftNode.js";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import AfterImageNode, { afterImage } from "three/examples/jsm/tsl/display/AfterImageNode.js";
import { nodeObject, convertToTexture } from "three/tsl";
import type { EffectInstance } from "./effectTypes";

// Cache keyed by effect instanceId — persists AfterImageNode's internal ping-pong
// RTs across pipeline rebuilds so accumulated trail history survives param changes.
export type AfterImageCache = Map<string, AfterImageNode>;

// Afterimage "damp" is stored as 0–100% in the UI; convert to the raw 0.8–0.99 range.
function dampFromPercent(pct: number): number {
  return 0.8 + (pct / 100) * (0.99 - 0.8);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

// ============================================================================
// Effect categories
//
// UV effects: transform UV coordinates — always processed first, composed in
// stack order, then the original texture is sampled once with the final UV.
//
// Color effects: transform the sampled color — always processed second, in
// stack order, on the vec4/texture result of the UV phase.
//
// This two-phase approach avoids calling .sample() on non-TextureNodes (which
// happens when a UV effect comes after a color effect and causes black screens).
// ============================================================================

const UV_EFFECT_IDS = new Set([
  "mirror",
  "kaleidoscope",
  "tile",
  "domain_warp",
  "bulge",
  "swirl",
  "pixellation",
]);

// ============================================================================
// Inlined distortion helpers (from phobon/fragments-boilerplate)
// ============================================================================

const bulgeDistortionFn = Fn(([_uv, options]: [AnyNode, AnyNode]) => {
  const {
    strength = float(0.5),
    radius = float(0.5),
    power = float(1.0),
    center = vec2(0),
  } = options ?? {};
  const uvVar = _uv.toVar();
  const offset = uvVar.sub(center).toVar();
  const dist = length(offset).toVar();
  const normalizedDist = smoothstep(float(0), float(1), min(dist.div(radius), float(1))).toVar();
  const falloff = pow(oneMinus(normalizedDist), power).mul(strength);
  const direction = normalize(offset);
  return center.add(direction.mul(dist.mul(falloff.add(float(1.0)))));
});

const swirlDistortionFn = Fn(([_uv, options]: [AnyNode, AnyNode]) => {
  const {
    strength = float(1),
    radius = float(0.5),
    center = vec2(0),
  } = options ?? {};
  const uvVar = _uv.toVar();
  const offset = uvVar.sub(center).toVar();
  const dist = length(offset).toVar();
  const angle = atan(offset.y, offset.x).toVar();
  const rotation = angle.add(strength.mul(oneMinus(dist.div(radius)))).toVar();
  const rotatedOffset = vec2(dist.mul(cos(rotation)), dist.mul(sin(rotation))).toVar();
  return center.add(rotatedOffset);
});

// Bayer 8x8 dither matrix lookup (64 If branches — compiled once, cached by TSL)
const bayerMatrix8x8Values = [
  0.0 / 64.0, 48.0 / 64.0, 12.0 / 64.0, 60.0 / 64.0, 3.0 / 64.0, 51.0 / 64.0, 15.0 / 64.0, 63.0 / 64.0,
  32.0 / 64.0, 16.0 / 64.0, 44.0 / 64.0, 28.0 / 64.0, 35.0 / 64.0, 19.0 / 64.0, 47.0 / 64.0, 31.0 / 64.0,
  8.0 / 64.0, 56.0 / 64.0, 4.0 / 64.0, 52.0 / 64.0, 11.0 / 64.0, 59.0 / 64.0, 7.0 / 64.0, 55.0 / 64.0,
  40.0 / 64.0, 24.0 / 64.0, 36.0 / 64.0, 20.0 / 64.0, 43.0 / 64.0, 27.0 / 64.0, 39.0 / 64.0, 23.0 / 64.0,
  2.0 / 64.0, 50.0 / 64.0, 14.0 / 64.0, 62.0 / 64.0, 1.0 / 64.0, 49.0 / 64.0, 13.0 / 64.0, 61.0 / 64.0,
  34.0 / 64.0, 18.0 / 64.0, 46.0 / 64.0, 30.0 / 64.0, 33.0 / 64.0, 17.0 / 64.0, 45.0 / 64.0, 29.0 / 64.0,
  10.0 / 64.0, 58.0 / 64.0, 6.0 / 64.0, 54.0 / 64.0, 9.0 / 64.0, 57.0 / 64.0, 5.0 / 64.0, 53.0 / 64.0,
  42.0 / 64.0, 26.0 / 64.0, 38.0 / 64.0, 22.0 / 64.0, 41.0 / 64.0, 25.0 / 64.0, 37.0 / 64.0, 21.0 / 64.0,
];

const getBayerValue8x8 = Fn(([x, y]: [AnyNode, AnyNode]) => {
  const index = y.mul(8).add(x).toVar();
  const value = float(0.0).toVar();
  for (let i = 0; i < 64; i++) {
    If(index.equal(i), () => { value.assign(bayerMatrix8x8Values[i]); });
  }
  return value;
});

// ============================================================================
// Phase 1: UV transforms
// Each function receives the current (possibly already transformed) UV node and
// returns a new UV node. The original texture is sampled once after all UV
// transforms have been composed.
// ============================================================================

function applyUVTransform(
  effectId: string,
  params: Record<string, number>,
  currentUV: AnyNode,
): AnyNode {
  switch (effectId) {
    case "mirror": {
      const doH = (params.horizontal ?? 1) >= 0.5;
      const doV = (params.vertical ?? 0) >= 0.5;
      const x = doH ? abs(currentUV.x.mul(2).sub(1)) : currentUV.x;
      const y = doV ? abs(currentUV.y.mul(2).sub(1)) : currentUV.y;
      return vec2(x, y);
    }

    case "kaleidoscope": {
      const segments = float(Math.max(2, Math.round(params.segments ?? 6)));
      const zoom = float(params.zoom ?? 1.0);
      const centered = currentUV.sub(0.5).mul(zoom);
      const r = length(centered);
      const theta = atan(centered.y, centered.x);
      const TAU = float(Math.PI * 2);
      const segAngle = TAU.div(segments);
      const t2raw = mod(theta.add(TAU.mul(10)), segAngle);
      const halfSeg = segAngle.div(2);
      const t2 = t2raw.greaterThan(halfSeg).select(segAngle.sub(t2raw), t2raw);
      return vec2(r.mul(cos(t2)).add(0.5), r.mul(sin(t2)).add(0.5));
    }

    case "tile": {
      const scale = float(params.scale ?? 3);
      const doMirror = (params.mirror ?? 1) >= 0.5;
      const tileUV = currentUV.sub(0.5).mul(scale).add(0.5);
      const cell = floor(tileUV) as AnyNode;
      const localUV = fract(tileUV) as AnyNode;
      if (doMirror) {
        const flipX = mod(cell.x, float(2)).greaterThanEqual(float(1));
        const flipY = mod(cell.y, float(2)).greaterThanEqual(float(1));
        return vec2(
          flipX.select(float(1).sub(localUV.x), localUV.x),
          flipY.select(float(1).sub(localUV.y), localUV.y),
        );
      }
      return localUV;
    }

    case "domain_warp": {
      const scale = float(params.scale ?? 3);
      const strength = float(((params.strength ?? 30) / 100) * 0.5);
      const octaves = Math.max(1, Math.round(params.octaves ?? 3));
      const speed = float(params.speed ?? 0.3);
      const angleRad = ((params.angle ?? 90) - 90) * Math.PI / 180;
      const noiseUV = vec2(
        currentUV.x.mul(scale).add(time.mul(speed).mul(Math.cos(angleRad))),
        currentUV.y.mul(scale).add(time.mul(speed).mul(Math.sin(angleRad))),
      );
      const displacement = mx_fractal_noise_vec2(noiseUV, octaves, 2, 0.5, 1);
      return currentUV.add(displacement.mul(strength));
    }

    case "bulge": {
      return bulgeDistortionFn(currentUV, {
        strength: float((params.strength ?? 50) / 100),
        radius: float((params.radius ?? 50) / 100),
        power: float(params.power ?? 1.0),
        center: vec2(0.5),
      });
    }

    case "swirl": {
      return swirlDistortionFn(currentUV, {
        strength: float(((params.strength ?? 20) / 100) * 5),
        radius: float((params.radius ?? 50) / 100),
        center: vec2(0.5),
      });
    }

    case "pixellation": {
      const size = float(params.size ?? 20);
      const aspect = screenSize.x.div(screenSize.y);
      const aspectUV = vec2(currentUV.x.mul(aspect), currentUV.y);
      const pixelSize = size.div(1000.0);
      const pixelatedUV = floor(aspectUV.div(pixelSize)).mul(pixelSize);
      return vec2(pixelatedUV.x.div(aspect), pixelatedUV.y);
    }

    default:
      return currentUV;
  }
}

// ============================================================================
// Phase 2: color effects
// inputNode is either the original TextureNode (if no UV transforms ran) or a
// sampled vec4. Neither case requires .sample() — effects just transform the
// color value using uv() for position-based calculations (pattern generation).
// ============================================================================

function applyColorEffect(
  effectId: string,
  params: Record<string, number>,
  inputNode: AnyNode,
): AnyNode {
  switch (effectId) {
    case "grain": {
      return film(inputNode, float((params.intensity ?? 40) / 100));
    }

    case "bloom": {
      const bloomNode = bloom(
        inputNode,
        (params.strength ?? 100) / 100,
        (params.radius ?? 40) / 100,
        (params.threshold ?? 85) / 100,
      );
      return inputNode.add(bloomNode);
    }

    case "rgb_shift": {
      return rgbShift(
        inputNode,
        ((params.amount ?? 25) / 100) * 0.02,
        ((params.angle ?? 0) * Math.PI) / 180,
      );
    }

    case "chromatic_ab": {
      return rgbShift(
        inputNode,
        ((params.strength ?? 25) / 100) * 0.02,
        ((params.angle ?? 0) * Math.PI) / 180,
      );
    }

    case "blur": {
      return gaussianBlur(inputNode, null, params.sigma ?? 2);
    }

    case "afterimage": {
      return afterImage(inputNode, float(dampFromPercent(params.damp ?? 84)));
    }

    case "vignette": {
      const _uv = uv();
      const centeredUV = _uv.sub(0.5);
      const dist = length(centeredUV);
      const vignette = smoothstep(float((params.smoothing ?? 25) / 100), float(1), dist).oneMinus();
      const vignetteMask = pow(vignette, float(params.exponent ?? 5));
      return inputNode.mul(vignetteMask);
    }

    case "crt": {
      const _uv = uv();
      const lf = float(params.lineFrequency ?? 200);
      const li = float((params.lineIntensity ?? 30) / 100);
      const curv = float(((params.curvature ?? 20) / 100) * 0.5);
      const sharpness = float((params.scanlineSharpness ?? 50) / 100);
      const centered = _uv.sub(0.5);
      const distortion = centered.mul(curv.mul(centered.dot(centered)));
      const distortedUV = _uv.add(distortion);
      const scanline = sin(distortedUV.y.mul(lf).mul(3.14159));
      const pattern = pow(scanline.mul(0.5).add(0.5), sharpness);
      const effect = mix(float(1.0).sub(li), float(1.0), pattern);
      return inputNode.mul(effect);
    }

    case "dither": {
      const _uv = uv();
      const pixSize = float(params.pixelSize ?? 2);
      const colorThreshold = float(params.colorThreshold ?? 4);
      const bias = float((params.bias ?? 50) / 100);
      const scaledResolution = screenSize.div(pixSize);
      const x = int(_uv.x.mul(scaledResolution.x)).mod(8);
      const y = int(_uv.y.mul(scaledResolution.y)).mod(8);
      const threshold = getBayerValue8x8(x, y).sub(bias);
      // Add threshold then quantize — pure expressions, no VarNode mutation
      const shifted = inputNode.rgb.add(threshold);
      const colorNum = colorThreshold;
      const quantize = (ch: AnyNode) =>
        floor(ch.mul(colorNum.sub(1.0)).add(0.5)).div(colorNum.sub(1.0));
      return vec4(vec3(quantize(shifted.r), quantize(shifted.g), quantize(shifted.b)), inputNode.a);
    }

    case "halftone": {
      const _uv = uv();
      const freq = float(params.frequency ?? 100);
      const ang = float(((params.angle ?? 29) * Math.PI) / 180);
      const sm = float(((params.smoothness ?? 33) / 100) * 0.3);
      const aspect = screenSize.x.div(screenSize.y).toVar();
      const aspectUV = vec2(_uv.x.mul(aspect), _uv.y).toVar();
      const c = cos(ang).toVar();
      const s = sin(ang).toVar();
      const rotatedUV = vec2(
        dot(aspectUV, vec2(c, s.negate())),
        dot(aspectUV, vec2(s, c)),
      ).toVar();
      const gridUV = fract(rotatedUV.mul(freq)).sub(0.5).toVar();
      const brightness = dot(inputNode.rgb, vec3(0.299, 0.587, 0.114)).toVar();
      const dotSize = brightness.mul(0.7).add(0.15).toVar();
      const dist = length(gridUV).toVar();
      const d = smoothstep(dotSize.add(sm), dotSize.sub(sm), dist).toVar();
      return vec4(vec3(d).mul(inputNode.rgb), inputNode.a);
    }

    case "led": {
      const _uv = uv();
      const scalar = float(params.scalar ?? 100);
      const zoom = float(params.zoom ?? 2);
      const exponent = float(params.exponent ?? 1.2);
      const edge = float(((params.edge ?? 20) / 100) * 0.5);
      const gridUV = fract(_uv.mul(scalar)).sub(0.5).toVar();
      const patt = length(gridUV.mul(zoom)).oneMinus().toVar();
      patt.assign(smoothstep(edge, float(1), patt));
      patt.assign(pow(patt, exponent));
      return inputNode.mul(patt);
    }

    default:
      return inputNode;
  }
}

// ============================================================================
// Chain builder
// ============================================================================

function buildEffectChain(
  originalTexture: AnyNode,
  effects: EffectInstance[],
  afterImageCache: AfterImageCache,
): AnyNode {
  const enabled = effects.filter((e) => e.enabled);

  // Phase 1: compose UV transforms (stack order for UV effects)
  let currentUV: AnyNode = uv();
  let hasUVTransforms = false;
  for (const effect of enabled) {
    if (UV_EFFECT_IDS.has(effect.effectId)) {
      currentUV = applyUVTransform(effect.effectId, effect.params, currentUV);
      hasUVTransforms = true;
    }
  }

  // AfterImageNode requires a real TextureNode (it accesses .value and .sample()).
  // Bake the composed UV into originalTexture so AfterImage samples at the warped UV.
  // Safe to mutate because the pipeline is always rebuilt from scratch on any change.
  if (hasUVTransforms) {
    (originalTexture as AnyNode).uvNode = currentUV;
  }

  // Phase 2: AfterImage — reuse the cached node so its internal _compRT/_oldRT render
  // targets (which hold the accumulated trail history) survive pipeline rebuilds.
  // A rebuild fires on every param change, so without caching, history is lost instantly.
  const afterImageEffect = enabled.find((e) => e.effectId === "afterimage");

  let outputNode: AnyNode;
  if (afterImageEffect) {
    const damp = float(dampFromPercent(afterImageEffect.params.damp ?? 84));
    const convertedTexture = convertToTexture(originalTexture);

    let afNode = afterImageCache.get(afterImageEffect.instanceId);
    if (afNode) {
      // Reuse existing node — history preserved. Update texture + damp for this build.
      afNode.textureNode = convertedTexture;
      afNode.damp = damp;
    } else {
      afNode = new AfterImageNode(convertedTexture, damp);
      afterImageCache.set(afterImageEffect.instanceId, afNode);
    }
    outputNode = nodeObject(afNode);
  } else if (hasUVTransforms) {
    outputNode = originalTexture.sample(currentUV);
  } else {
    outputNode = originalTexture;
  }

  // Phase 3: color effects (stack order, skipping UV and afterimage)
  for (const effect of enabled) {
    if (!UV_EFFECT_IDS.has(effect.effectId) && effect.effectId !== "afterimage") {
      outputNode = applyColorEffect(effect.effectId, effect.params, outputNode);
    }
  }

  return outputNode;
}

// ============================================================================
// Public pipeline builders
// ============================================================================

export function buildSceneEffectPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  effects: EffectInstance[],
  afterImageCache: AfterImageCache,
): RenderPipeline {
  const scenePass = pass(scene, camera);
  const originalTexture = scenePass.getTextureNode("output");
  const outputNode = buildEffectChain(originalTexture, effects, afterImageCache);
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = outputNode;
  return pipeline;
}

export function buildTextureEffectPipeline(
  renderer: WebGPURenderer,
  sourceTexture: Texture,
  effects: EffectInstance[],
): RenderPipeline {
  // Video capture pipeline — AfterImage in video output gets a fresh node each build
  // (video capture is a snapshot render, not a continuous accumulation loop).
  const emptyCache: AfterImageCache = new Map();
  const originalTexture = textureNode(sourceTexture);
  const outputNode = buildEffectChain(originalTexture, effects, emptyCache);
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = outputNode;
  return pipeline;
}
