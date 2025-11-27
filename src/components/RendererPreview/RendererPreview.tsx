import { Suspense, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import type { SceneId } from "../../scenes/sceneTypes";
import { SCENE_COMPONENT_REGISTRY } from "../../scenes/sceneComponents";
import type { SceneProps } from "../../scenes/sceneComponents";
import styles from "./RendererPreview.module.css";

export interface RendererPreviewProps {
  /** The currently active scene ID */
  activeSceneId: SceneId;
  /** The next scene ID for crossfading */
  nextSceneId: SceneId;
  /** Crossfade value (0 = fully active, 1 = fully next) */
  crossfade: number;
  /** Scene-specific parameters for the active scene */
  activeSceneParams?: SceneProps["params"];
  /** Scene-specific parameters for the next scene */
  nextSceneParams?: SceneProps["params"];
  /** Tint LFO depth for modulation (applies to scenes with tintLfoDepth param) */
  sceneATintLfoDepth?: number;
  /** Show performance stats (toggled with "D" key) */
  showStats?: boolean;
}

interface TintLfoDriverProps {
  tintLfoDepth: number;
  setTintLfoPhase: (phase: number) => void;
}

/**
 * Drives the tint LFO phase inside the r3f Canvas.
 * Uses elapsed time to compute phase (matching main renderer behavior).
 */
function TintLfoDriver({ tintLfoDepth, setTintLfoPhase }: TintLfoDriverProps) {
  useFrame(({ clock }) => {
    if (tintLfoDepth <= 0) return;
    const elapsed = clock.getElapsedTime();
    const frequencyHz = 0.1;
    setTintLfoPhase(2 * Math.PI * frequencyHz * elapsed);
  });
  return null;
}

interface SceneWeights {
  activeWeight: number;
  nextWeight: number;
}

function mapCrossfadeToSceneWeights(crossfadeRaw: number): SceneWeights {
  const crossfade = Math.max(0, Math.min(1, crossfadeRaw));
  return {
    activeWeight: 1 - crossfade,
    nextWeight: crossfade,
  };
}

interface RendererPreviewContentProps {
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  crossfade: number;
  activeSceneParams?: SceneProps["params"];
  nextSceneParams?: SceneProps["params"];
  sceneATintLfoDepth: number;
}

/**
 * Inner content component that renders inside the Canvas.
 * Handles scene blending and tint modulation.
 */
function RendererPreviewContent({
  activeSceneId,
  nextSceneId,
  crossfade,
  activeSceneParams,
  nextSceneParams,
  sceneATintLfoDepth,
}: RendererPreviewContentProps) {
  const sceneWeights = mapCrossfadeToSceneWeights(crossfade);

  // Track tint LFO phase for tint modulation
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  // Apply tint modulation for scenes that have tintLfoDepth
  const getModulatedParams = (
    sceneId: SceneId,
    params?: SceneProps["params"],
  ): SceneProps["params"] => {
    // Only apply tint modulation to sceneA (which has the tint LFO feature)
    if (sceneId !== "sceneA" || !params) return params;

    // Use the generic 'tint' property name
    const tintBase = params.tint ?? 0.5;
    const tintModulated = Math.max(
      0,
      Math.min(1, tintBase + Math.sin(tintLfoPhase) * sceneATintLfoDepth),
    );

    return {
      ...params,
      tint: tintModulated,
    };
  };

  const ActiveSceneComponent = SCENE_COMPONENT_REGISTRY[activeSceneId];
  const NextSceneComponent = SCENE_COMPONENT_REGISTRY[nextSceneId];

  const modulatedActiveParams = getModulatedParams(
    activeSceneId,
    activeSceneParams,
  );
  const modulatedNextParams = getModulatedParams(nextSceneId, nextSceneParams);

  return (
    <>
      <TintLfoDriver
        tintLfoDepth={sceneATintLfoDepth}
        setTintLfoPhase={setTintLfoPhase}
      />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {/* Render active scene with crossfade weight */}
      {ActiveSceneComponent && sceneWeights.activeWeight > 0.001 && (
        <ActiveSceneComponent
          opacity={sceneWeights.activeWeight}
          params={modulatedActiveParams}
        />
      )}

      {/* Render next scene with crossfade weight */}
      {NextSceneComponent && sceneWeights.nextWeight > 0.001 && (
        <NextSceneComponent
          opacity={sceneWeights.nextWeight}
          params={modulatedNextParams}
        />
      )}
    </>
  );
}

/**
 * RendererPreview
 *
 * A preview component that mirrors the actual Renderer output.
 * Shows both Active and Next scenes blended according to the crossfade value.
 *
 * This is used in the Controls window to give the operator an accurate
 * representation of what's being displayed in the Renderer window.
 *
 * Features:
 * - Accurate crossfade blending matching the main renderer
 * - Tint LFO modulation support for Scene A
 * - Fixed 16:9 aspect ratio
 * - Optimized for performance with reduced DPR
 */
export function RendererPreview({
  activeSceneId,
  nextSceneId,
  crossfade,
  activeSceneParams,
  nextSceneParams,
  sceneATintLfoDepth = 0,
  showStats = false,
}: RendererPreviewProps) {
  return (
    <div className={styles.container}>
      <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
        <Canvas
          className={styles.canvas}
          camera={{ position: [0, 0, 4], fov: 50 }}
          // Match main renderer camera but with reduced DPR for performance
          dpr={[1, 1.5]}
          frameloop="always"
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "low-power",
          }}
        >
          {showStats && (
            <Perf
              position="top-left"
              minimal={true}
              showGraph={false}
              colorBlind={false}
            />
          )}
          <RendererPreviewContent
            activeSceneId={activeSceneId}
            nextSceneId={nextSceneId}
            crossfade={crossfade}
            activeSceneParams={activeSceneParams}
            nextSceneParams={nextSceneParams}
            sceneATintLfoDepth={sceneATintLfoDepth}
          />
        </Canvas>
      </Suspense>
      <div className={styles.label}>Live Preview</div>
    </div>
  );
}

export default RendererPreview;
