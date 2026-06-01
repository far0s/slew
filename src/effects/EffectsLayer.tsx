import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import type { RenderPipeline } from "three/webgpu";
import type { WebGPURenderer } from "three/webgpu";
import { useEffects } from "./EffectsContext";
import { buildSceneEffectPipeline } from "./buildEffectChain";

/**
 * Renders the scene through the post-processing effect chain to screen.
 * Must be placed inside a <Canvas> component.
 *
 * IMPORTANT: useFrame with priority=1 suppresses r3f's default render entirely.
 * We must always render — either via the effects pipeline or directly.
 */
export function EffectsLayer() {
  const { gl, scene, camera } = useThree();
  const { effects } = useEffects();
  const pipelineRef = useRef<RenderPipeline | null>(null);

  const effectsKey = JSON.stringify(effects);
  const enabledEffects = effects.filter((e) => e.enabled);
  const hasEffects = enabledEffects.length > 0;

  useEffect(() => {
    pipelineRef.current?.dispose();
    pipelineRef.current = null;

    if (!hasEffects) return;

    pipelineRef.current = buildSceneEffectPipeline(
      gl as unknown as WebGPURenderer,
      scene,
      camera,
      effects,
    );

    return () => {
      pipelineRef.current?.dispose();
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectsKey]);

  // priority=1 suppresses r3f's default render — must always render here.
  useFrame(() => {
    if (pipelineRef.current) {
      pipelineRef.current.render();
    } else {
      // No effects: render scene directly (fallback for suppressed r3f render)
      gl.render(scene, camera);
    }
  }, 1);

  return null;
}
