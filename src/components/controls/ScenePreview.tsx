import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import type { SceneId } from "../../scenes/sceneTypes";
import { SCENE_COMPONENT_REGISTRY } from "../../scenes/sceneComponents";
import type { SceneProps } from "../../scenes/sceneComponents";
import styles from "./ScenePreview.module.css";

export interface ScenePreviewProps {
  /** Which scene to preview */
  sceneId: SceneId;
  /** Scene-specific parameters to pass to the scene component */
  params?: SceneProps["params"];
}

/**
 * ScenePreview
 *
 * A small embedded 3D preview of a single scene.
 * Used in the Controls window to show real-time previews of the
 * Active and Next scenes as parameters are adjusted.
 *
 * Features:
 * - Fixed 16:9 aspect ratio
 * - Always renders the scene at full opacity
 * - Responds to parameter changes in real-time
 * - Lightweight camera and lighting setup
 */
export function ScenePreview({ sceneId, params }: ScenePreviewProps) {
  const SceneComponent = SCENE_COMPONENT_REGISTRY[sceneId];

  if (!SceneComponent) {
    return (
      <div className={styles.container}>
        <div className={styles.fallback}>Unknown scene: {sceneId}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
        <Canvas
          className={styles.canvas}
          camera={{ position: [0, 0, 4], fov: 50 }}
          // Reduce pixel ratio for better performance on previews
          dpr={[1, 1.5]}
          // Disable automatic frame loop updates when not visible
          frameloop="always"
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "low-power",
          }}
        >
          <color attach="background" args={["#020617"]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[4, 6, 3]} intensity={1.1} />
          <directionalLight position={[-4, -4, -2]} intensity={0.4} />

          {/* Always render the scene at full opacity */}
          <SceneComponent opacity={1} params={params} />
        </Canvas>
      </Suspense>
    </div>
  );
}

export default ScenePreview;
