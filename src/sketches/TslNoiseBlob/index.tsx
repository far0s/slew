import { useRef, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../types";

/**
 * TslNoiseBlob Sketch Descriptor
 *
 * Defines all metadata and parameters for this procedural noise blob sketch.
 * Features animated sphere with noise displacement and gradient colors.
 */
export const descriptor: SketchDescriptor = {
  id: "tslNoiseBlob",
  label: "TSL Noise Blob",
  shortLabel: "Blob",
  description:
    "Animated sphere with procedural noise displacement and color gradients.",
  parameters: [
    {
      templateId: "noise_scale",
      label: "Noise Scale",
      group: "sketch",
      orderHint: 10,
      min: 0.1,
      max: 5,
      step: 0.1,
      defaultValue: 1.5,
      color: "cyan",
      description: "Scale/frequency of the noise pattern.",
    },
    {
      templateId: "noise_speed",
      label: "Noise Speed",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 0.5,
      color: "lime",
      description: "Animation speed of the noise displacement.",
    },
    {
      templateId: "color_mix",
      label: "Color Mix",
      group: "sketch",
      orderHint: 30,
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      color: "rose",
      description:
        "Blend between warm (orange/pink) and cool (cyan/purple) palette.",
    },
  ],
};

/**
 * Simple 3D noise function (simplex-like approximation)
 * Used for vertex displacement in the shader material
 */
function createNoiseMaterial(
  noiseScale: number,
  noiseSpeed: number,
  colorMix: number,
  time: number,
  opacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: time },
      uNoiseScale: { value: noiseScale },
      uNoiseSpeed: { value: noiseSpeed },
      uColorMix: { value: colorMix },
      uOpacity: { value: opacity },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uNoiseScale;
      uniform float uNoiseSpeed;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vDisplacement;

      // Simple 3D noise functions
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod289(i);
        vec4 p = permute(permute(permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;

        // Calculate noise displacement
        float animatedTime = uTime * uNoiseSpeed;
        vec3 noisePos = position * uNoiseScale + vec3(animatedTime);

        // Layer multiple octaves of noise
        float noise = snoise(noisePos) * 0.5;
        noise += snoise(noisePos * 2.0) * 0.25;
        noise += snoise(noisePos * 4.0) * 0.125;

        vDisplacement = noise;

        // Displace vertex along normal
        vec3 displaced = position + normal * noise * 0.3;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uColorMix;
      uniform float uOpacity;
      uniform float uTime;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying float vDisplacement;

      void main() {
        // Warm palette: orange to pink
        vec3 warmColor1 = vec3(1.0, 0.4, 0.1);  // Orange
        vec3 warmColor2 = vec3(1.0, 0.2, 0.6);  // Pink

        // Cool palette: cyan to purple
        vec3 coolColor1 = vec3(0.1, 0.8, 0.9);  // Cyan
        vec3 coolColor2 = vec3(0.6, 0.2, 1.0);  // Purple

        // Use normal direction and displacement for color variation
        float normalFactor = dot(vNormal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
        float dispFactor = vDisplacement * 0.5 + 0.5;

        // Blend within each palette based on surface features
        vec3 warmBlend = mix(warmColor1, warmColor2, normalFactor + dispFactor * 0.3);
        vec3 coolBlend = mix(coolColor1, coolColor2, normalFactor + dispFactor * 0.3);

        // Final color based on colorMix parameter
        vec3 finalColor = mix(warmBlend, coolBlend, uColorMix);

        // Add some rim lighting effect
        vec3 viewDir = normalize(cameraPosition - vPosition);
        float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
        rim = pow(rim, 3.0) * 0.5;

        finalColor += rim * mix(warmColor2, coolColor2, uColorMix);

        // Add subtle brightness variation based on displacement
        finalColor *= 0.8 + dispFactor * 0.4;

        gl_FragColor = vec4(finalColor, uOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

/**
 * TslNoiseBlob
 *
 * An animated sphere with procedural noise displacement and gradient colors.
 *
 * Parameters:
 * - opacity: 0..1, used for crossfade
 * - params.noiseScale: 0.1..5, scale/frequency of the noise pattern
 * - params.noiseSpeed: 0..3, animation speed of the noise
 * - params.colorMix: 0..1, blend between warm and cool color palettes
 */
export function TslNoiseBlob({ opacity, params }: SketchProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const timeRef = useRef(0);

  // Derive per-sketch values from the optional params bag, with sensible defaults
  const noiseScale = params?.noiseScale ?? 1.5;
  const noiseSpeed = params?.noiseSpeed ?? 0.5;
  const colorMix = params?.colorMix ?? 0.5;

  // Create initial material
  const material = useMemo(() => {
    return createNoiseMaterial(noiseScale, noiseSpeed, colorMix, 0, opacity);
  }, []);

  // Animation loop - update uniforms
  useFrame((_, delta) => {
    // Clamp delta to avoid huge jumps on tab switch
    const clampedDelta = Math.min(delta, 1 / 30);
    timeRef.current += clampedDelta;

    // Update material uniforms
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = timeRef.current;
      materialRef.current.uniforms.uNoiseScale.value = noiseScale;
      materialRef.current.uniforms.uNoiseSpeed.value = noiseSpeed;
      materialRef.current.uniforms.uColorMix.value = colorMix;
      materialRef.current.uniforms.uOpacity.value = opacity;
    }

    // Gentle rotation of the whole mesh
    if (meshRef.current) {
      meshRef.current.rotation.y += clampedDelta * 0.2;
      meshRef.current.rotation.x = Math.sin(timeRef.current * 0.3) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1, 64]} />
      <primitive object={material} ref={materialRef} attach="material" />
    </mesh>
  );
}

export default TslNoiseBlob;
