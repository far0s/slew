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
  max,
  abs,
  dot,
  pow,
  smoothstep,
  oneMinus,
  mix,
  sqrt,
  sign,
  If,
  int,
  Fn,
  time,
} from "three/tsl";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { rgbShift } from "three/examples/jsm/tsl/display/RGBShiftNode.js";
import { gaussianBlur } from "three/examples/jsm/tsl/display/GaussianBlurNode.js";
import { afterImage } from "three/examples/jsm/tsl/display/AfterImageNode.js";
import type { EffectInstance } from "./effectTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

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

const waveDistortionFn = Fn(([_uv, options]: [AnyNode, AnyNode]) => {
  const {
    frequency = float(10.0),
    amplitude = float(0.1),
    angle = float(0),
    timeOffset = float(0),
  } = options ?? {};
  const uvVar = _uv.toVar();
  const direction = vec2(cos(angle), sin(angle)).toVar();
  const wavePhase = dot(uvVar, direction).mul(frequency).add(timeOffset);
  const perpendicular = vec2(direction.y.negate(), direction.x).toVar();
  const displacement = perpendicular.mul(sin(wavePhase).mul(amplitude));
  return uvVar.add(displacement);
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
// Effect application
// ============================================================================

function applyEffect(
  effectId: string,
  params: Record<string, number>,
  inputNode: AnyNode,
): AnyNode {
  switch (effectId) {
    case "grain": {
      return film(inputNode, float(params.intensity ?? 0.4));
    }
    case "bloom": {
      const bloomNode = bloom(inputNode, params.strength ?? 1.0, params.radius ?? 0.4, params.threshold ?? 0.85);
      return inputNode.add(bloomNode);
    }
    case "rgb_shift": {
      return rgbShift(inputNode, params.amount ?? 0.005, params.angle ?? 0);
    }
    case "chromatic_ab": {
      // ChromaticAberrationNode has rendering issues; rgbShift achieves same visual
      return rgbShift(inputNode, params.strength ?? 0.005, 0);
    }
    case "blur": {
      return gaussianBlur(inputNode, null, params.sigma ?? 2);
    }
    case "afterimage": {
      return afterImage(inputNode, float(params.damp ?? 0.96));
    }

    case "vignette": {
      const _uv = uv().toVar();
      const centeredUV = _uv.sub(0.5).toVar();
      // sdSphere(uv, 0) = length(uv) — no radius offset needed for vignette
      const dist = length(centeredUV).toVar();
      const vignette = smoothstep(float(params.smoothing ?? 0.25), float(1), dist).oneMinus();
      const vignetteMask = pow(vignette, float(params.exponent ?? 5)).toVar();
      return inputNode.sample(_uv).mul(vignetteMask);
    }

    case "crt": {
      const _uv = uv().toVar();
      const lf = float(params.lineFrequency ?? 200);
      const li = float(params.lineIntensity ?? 0.3);
      const curv = float(params.curvature ?? 0.1);
      const sharpness = float(params.scanlineSharpness ?? 0.5);
      const centered = _uv.sub(0.5).toVar();
      const distortion = centered.mul(curv.mul(centered.dot(centered))).toVar();
      const distortedUV = _uv.add(distortion).toVar();
      const scanline = sin(distortedUV.y.mul(lf).mul(3.14159)).toVar();
      const pattern = pow(scanline.mul(0.5).add(0.5), sharpness).toVar();
      const effect = mix(float(1.0).sub(li), float(1.0), pattern).toVar();
      return inputNode.sample(_uv).mul(effect);
    }

    case "dither": {
      const _uv = uv().toVar();
      const pixSize = float(params.pixelSize ?? 2);
      const colorThreshold = float(params.colorThreshold ?? 4);
      const bias = float(params.bias ?? 0.25);
      const scaledResolution = screenSize.div(pixSize);
      const sourceColor = inputNode.sample(_uv).rgb.toVar();
      const x = int(_uv.x.mul(scaledResolution.x)).mod(8);
      const y = int(_uv.y.mul(scaledResolution.y)).mod(8);
      const threshold = getBayerValue8x8(x, y).sub(bias).toVar();
      sourceColor.addAssign(threshold);
      const colorNum = colorThreshold;
      sourceColor.r.assign(floor(sourceColor.r.mul(colorNum.sub(1.0)).add(0.5)).div(colorNum.sub(1.0)));
      sourceColor.g.assign(floor(sourceColor.g.mul(colorNum.sub(1.0)).add(0.5)).div(colorNum.sub(1.0)));
      sourceColor.b.assign(floor(sourceColor.b.mul(colorNum.sub(1.0)).add(0.5)).div(colorNum.sub(1.0)));
      return vec4(sourceColor, inputNode.sample(_uv).a);
    }

    case "halftone": {
      const _uv = uv().toVar();
      const freq = float(params.frequency ?? 100);
      const ang = float(params.angle ?? 0.5);
      const sm = float(params.smoothness ?? 0.1);
      const aspect = screenSize.x.div(screenSize.y).toVar();
      const aspectUV = vec2(_uv.x.mul(aspect), _uv.y).toVar();
      const c = cos(ang).toVar();
      const s = sin(ang).toVar();
      const rotatedUV = vec2(
        dot(aspectUV, vec2(c, s.negate())),
        dot(aspectUV, vec2(s, c)),
      ).toVar();
      const gridUV = fract(rotatedUV.mul(freq)).sub(0.5).toVar();
      const originalColor = inputNode.sample(_uv);
      const brightness = dot(originalColor.rgb, vec3(0.299, 0.587, 0.114)).toVar();
      const dotSize = brightness.mul(0.7).add(0.15).toVar();
      const dist = length(gridUV).toVar();
      const d = smoothstep(dotSize.add(sm), dotSize.sub(sm), dist).toVar();
      return vec4(vec3(d).mul(originalColor.rgb), originalColor.a);
    }

    case "led": {
      const _uv = uv().toVar();
      const scalar = float(params.scalar ?? 100);
      const zoom = float(params.zoom ?? 2);
      const exponent = float(params.exponent ?? 1.2);
      const edge = float(params.edge ?? 0.1);
      const gridUV = fract(_uv.mul(scalar)).sub(0.5).toVar();
      const pattern = length(gridUV.mul(zoom)).oneMinus().toVar();
      pattern.assign(smoothstep(edge, float(1), pattern));
      pattern.assign(pow(pattern, exponent));
      return inputNode.sample(_uv).mul(pattern);
    }

    case "pixellation": {
      const _uv = uv().toVar();
      const size = float(params.size ?? 20);
      const aspect = screenSize.x.div(screenSize.y).toVar();
      const aspectUV = vec2(_uv.x.mul(aspect), _uv.y).toVar();
      const pixelSize = size.div(1000.0);
      const pixelatedUV = floor(aspectUV.div(pixelSize)).mul(pixelSize).toVar();
      const samplingUV = vec2(pixelatedUV.x.div(aspect), pixelatedUV.y).toVar();
      return inputNode.sample(samplingUV);
    }

    case "bulge": {
      const _uv = uv().toVar();
      const center = vec2(0.5);
      const distortedUV = bulgeDistortionFn(_uv, {
        strength: float(params.strength ?? 0.5),
        radius: float(params.radius ?? 0.5),
        power: float(params.power ?? 1.0),
        center,
      });
      return inputNode.sample(distortedUV);
    }

    case "swirl": {
      const _uv = uv().toVar();
      const center = vec2(0.5);
      const distortedUV = swirlDistortionFn(_uv, {
        strength: float(params.strength ?? 1.0),
        radius: float(params.radius ?? 0.5),
        center,
      });
      return inputNode.sample(distortedUV);
    }

    case "wave": {
      const _uv = uv().toVar();
      const t = time;
      const distortedUV = waveDistortionFn(_uv, {
        frequency: float(params.frequency ?? 10),
        amplitude: float(params.amplitude ?? 0.03),
        angle: float(params.angle ?? 0),
        timeOffset: t,
      });
      return inputNode.sample(distortedUV);
    }

    default:
      return inputNode;
  }
}

// Silence unused import warnings for helpers that may not all be called yet
void vec3; void vec4; void sqrt; void sign; void min; void max; void abs; void normalize; void mix;

/**
 * Build a RenderPipeline with scene pass + effect chain for on-screen display.
 */
export function buildSceneEffectPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  effects: EffectInstance[],
): RenderPipeline {
  const scenePass = pass(scene, camera);
  let outputNode: AnyNode = scenePass.getTextureNode("output");

  for (const effect of effects) {
    if (!effect.enabled) continue;
    outputNode = applyEffect(effect.effectId, effect.params, outputNode);
  }

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = outputNode;
  return pipeline;
}

/**
 * Build a RenderPipeline that reads from an already-rendered texture + applies effects.
 * Used by VideoOutputCapture to apply effects to the capture RT.
 */
export function buildTextureEffectPipeline(
  renderer: WebGPURenderer,
  sourceTexture: Texture,
  effects: EffectInstance[],
): RenderPipeline {
  let outputNode: AnyNode = textureNode(sourceTexture);

  for (const effect of effects) {
    if (!effect.enabled) continue;
    outputNode = applyEffect(effect.effectId, effect.params, outputNode);
  }

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = outputNode;
  return pipeline;
}
