import { Suspense, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import type { SketchId, SketchProps } from "../../sketches";
import { SKETCH_COMPONENT_REGISTRY } from "../../sketches";
import styles from "./RendererPreview.module.css";

export interface RendererPreviewProps {
  /** The currently active sketch ID */
  activeSceneId: SketchId;
  /** The next sketch ID for crossfading */
  nextSceneId: SketchId;
  /** Crossfade value (0 = fully active, 1 = fully next) */
  crossfade: number;
  /** Sketch-specific parameters for the active sketch */
  activeSceneParams?: SketchProps["params"];
  /** Sketch-specific parameters for the next sketch */
  nextSceneParams?: SketchProps["params"];
  /** Tint LFO depth for modulation (applies to sketches with tintLfoDepth param) */
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

interface SketchWeights {
  activeWeight: number;
  nextWeight: number;
}

function mapCrossfadeToSketchWeights(crossfadeRaw: number): SketchWeights {
  const crossfade = Math.max(0, Math.min(1, crossfadeRaw));
  return {
    activeWeight: 1 - crossfade,
    nextWeight: crossfade,
  };
}

interface RendererPreviewContentProps {
  activeSketchId: SketchId;
  nextSketchId: SketchId;
  crossfade: number;
  activeSketchParams?: SketchProps["params"];
  nextSketchParams?: SketchProps["params"];
  tintLfoDepth: number;
}

/**
 * Inner content component that renders inside the Canvas.
 * Handles sketch blending and tint modulation.
 */
function RendererPreviewContent({
  activeSketchId,
  nextSketchId,
  crossfade,
  activeSketchParams,
  nextSketchParams,
  tintLfoDepth,
}: RendererPreviewContentProps) {
  const sketchWeights = mapCrossfadeToSketchWeights(crossfade);

  // Track tint LFO phase for tint modulation
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  // Apply tint modulation for sketches that have tintLfoDepth
  const getModulatedParams = (
    sketchId: SketchId,
    params?: SketchProps["params"],
  ): SketchProps["params"] => {
    // Only apply tint modulation to blueCube (which has the tint LFO feature)
    if (sketchId !== "blueCube" || !params) return params;

    // Use the generic 'tint' property name
    const tintBase = params.tint ?? 0.5;
    const tintModulated = Math.max(
      0,
      Math.min(1, tintBase + Math.sin(tintLfoPhase) * tintLfoDepth),
    );

    return {
      ...params,
      tint: tintModulated,
    };
  };

  const ActiveSketchComponent = SKETCH_COMPONENT_REGISTRY[activeSketchId];
  const NextSketchComponent = SKETCH_COMPONENT_REGISTRY[nextSketchId];

  const modulatedActiveParams = getModulatedParams(
    activeSketchId,
    activeSketchParams,
  );
  const modulatedNextParams = getModulatedParams(
    nextSketchId,
    nextSketchParams,
  );

  return (
    <>
      <TintLfoDriver
        tintLfoDepth={tintLfoDepth}
        setTintLfoPhase={setTintLfoPhase}
      />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {/* Render active sketch with crossfade weight */}
      {ActiveSketchComponent && sketchWeights.activeWeight > 0.001 && (
        <ActiveSketchComponent
          opacity={sketchWeights.activeWeight}
          params={modulatedActiveParams}
        />
      )}

      {/* Render next sketch with crossfade weight */}
      {NextSketchComponent && sketchWeights.nextWeight > 0.001 && (
        <NextSketchComponent
          opacity={sketchWeights.nextWeight}
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
 * Shows both Active and Next sketches blended according to the crossfade value.
 *
 * This is used in the Controls window to give the operator an accurate
 * representation of what's being displayed in the Renderer window.
 *
 * Features:
 * - Accurate crossfade blending matching the main renderer
 * - Tint LFO modulation support for BlueCube sketch
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
            activeSketchId={activeSceneId}
            nextSketchId={nextSceneId}
            crossfade={crossfade}
            activeSketchParams={activeSceneParams}
            nextSketchParams={nextSceneParams}
            tintLfoDepth={sceneATintLfoDepth}
          />
        </Canvas>
      </Suspense>
      <div className={styles.label}>Live Preview</div>
    </div>
  );
}

export default RendererPreview;
