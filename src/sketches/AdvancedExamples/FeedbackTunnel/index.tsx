import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  sqrt,
  atan2,
  log2,
  mod,
  time,
  screenSize,
} from "three/tsl";
import { useFrame, useThree } from "@react-three/fiber";
import type { SketchDescriptor, SketchProps } from "../../types";

export const descriptor: SketchDescriptor = {
  id: "feedbackTunnel",
  label: "Feedback Tunnel",
  shortLabel: "Tunnel",
  description:
    "Infinite zoom tunnel effect with hypnotic color cycling and depth layers (WebGPU/TSL).",
  parameters: [
    {
      templateId: "tunnel_speed",
      label: "Speed",
      group: "sketch",
      orderHint: 10,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 1,
      color: "cyan",
      description: "Speed of the tunnel zoom.",
    },
    {
      templateId: "tunnel_twist",
      label: "Twist",
      group: "sketch",
      orderHint: 20,
      min: 0,
      max: 5,
      step: 0.1,
      defaultValue: 2,
      color: "violet",
      description: "Amount of spiral twist in the tunnel.",
    },
    {
      templateId: "tunnel_layers",
      label: "Layers",
      group: "sketch",
      orderHint: 30,
      min: 2,
      max: 12,
      step: 1,
      defaultValue: 6,
      color: "rose",
      description: "Number of visible tunnel layers/rings.",
    },
    {
      templateId: "tunnel_color_speed",
      label: "Color Speed",
      group: "sketch",
      orderHint: 40,
      min: 0,
      max: 3,
      step: 0.05,
      defaultValue: 0.5,
      color: "amber",
      description: "Speed of the color cycling effect.",
    },
  ],
};

interface TunnelUniforms {
  speed: { value: number };
  twist: { value: number };
  layers: { value: number };
  colorSpeed: { value: number };
  opacity: { value: number };
}

function createTunnelMaterial(): {
  material: MeshBasicNodeMaterial;
  uniforms: TunnelUniforms;
} {
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const uSpeed = uniform(1.0);
  const uTwist = uniform(2.0);
  const uLayers = uniform(6.0);
  const uColorSpeed = uniform(0.5);
  const uOpacity = uniform(1.0);

  material.colorNode = Fn(() => {
    const t = time;
    const PI = float(3.14159265359);

    // Aspect ratio correction
    const resolution = screenSize;
    const aspect = resolution.x.div(resolution.y);
    const baseUV = uv().sub(0.5).mul(2.0);
    const centeredUV = vec2(baseUV.x.mul(aspect), baseUV.y);

    // Convert to polar coordinates
    const radius = sqrt(
      centeredUV.x.mul(centeredUV.x).add(centeredUV.y.mul(centeredUV.y)),
    );
    const angle = atan2(centeredUV.y, centeredUV.x);

    // Create infinite zoom effect using log of radius
    // This maps the distance from center to a repeating pattern
    const logRadius = log2(radius.add(0.001)).mul(-1.0);

    // Add time-based zoom animation
    const zoomOffset = t.mul(uSpeed);
    const animatedDepth = logRadius.add(zoomOffset);

    // Create layer bands
    const layerPhase = mod(animatedDepth.mul(uLayers), float(1.0));

    // Add twist based on depth
    const twistedAngle = angle.add(animatedDepth.mul(uTwist));

    // Create pattern within each layer
    const pattern1 = sin(twistedAngle.mul(4.0)).mul(0.5).add(0.5);
    const pattern2 = sin(twistedAngle.mul(8.0).add(PI.mul(0.5)))
      .mul(0.3)
      .add(0.5);

    // Combine patterns with layer phase for depth variation
    const combined = pattern1
      .mul(layerPhase)
      .add(pattern2.mul(float(1.0).sub(layerPhase)));

    // Color cycling based on depth and time
    const colorTime = t.mul(uColorSpeed);
    const colorPhase = animatedDepth.mul(0.5).add(colorTime);

    // Create RGB with phase offsets for rainbow effect
    const r = sin(colorPhase.mul(PI)).mul(0.5).add(0.5);
    const g = sin(colorPhase.mul(PI).add(2.094)).mul(0.5).add(0.5);
    const b = sin(colorPhase.mul(PI).add(4.189)).mul(0.5).add(0.5);

    // Modulate brightness with pattern
    const brightness = combined.mul(0.6).add(0.4);
    const rFinal = r.mul(brightness);
    const gFinal = g.mul(brightness);
    const bFinal = b.mul(brightness);

    // Add center glow
    const centerGlow = float(1.0).sub(radius.mul(0.5)).max(0.0);
    const glowColor = vec3(
      rFinal.add(centerGlow.mul(0.3)),
      gFinal.add(centerGlow.mul(0.3)),
      bFinal.add(centerGlow.mul(0.3)),
    );

    // Fade out at edges
    const edgeFade = float(1.0).sub(radius.sub(0.8).mul(5.0).max(0.0)).max(0.0);

    return vec4(glowColor.mul(edgeFade), uOpacity);
  })();

  return {
    material,
    uniforms: {
      speed: uSpeed,
      twist: uTwist,
      layers: uLayers,
      colorSpeed: uColorSpeed,
      opacity: uOpacity,
    },
  };
}

export function FeedbackTunnel({ opacity, params }: SketchProps) {
  const speed = params?.tunnelSpeed ?? 1;
  const twist = params?.tunnelTwist ?? 2;
  const layers = params?.tunnelLayers ?? 6;
  const colorSpeed = params?.tunnelColorSpeed ?? 0.5;

  const { viewport } = useThree();

  const { material, uniforms } = useMemo(() => {
    return createTunnelMaterial();
  }, []);

  useEffect(() => {
    uniforms.speed.value = speed;
  }, [speed, uniforms]);

  useEffect(() => {
    uniforms.twist.value = twist;
  }, [twist, uniforms]);

  useEffect(() => {
    uniforms.layers.value = layers;
  }, [layers, uniforms]);

  useEffect(() => {
    uniforms.colorSpeed.value = colorSpeed;
  }, [colorSpeed, uniforms]);

  useEffect(() => {
    uniforms.opacity.value = opacity;
  }, [opacity, uniforms]);

  useFrame(() => {
    // Material handles animation via time uniform
  });

  return (
    <mesh>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default FeedbackTunnel;
