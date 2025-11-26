import { invoke } from "@tauri-apps/api/core";
import { ParameterSlider } from "../ParameterSlider";
import styles from "./SceneAControls.module.css";

export interface SceneAControlsProps {
  sceneABrightness: number;
  rotationSpeed: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;

  setSceneABrightness: (value: number) => void;
  setRotationSpeed: (value: number) => void;
  setSceneAWobble: (value: number) => void;
  setSceneATint: (value: number) => void;
  setSceneATintLfoDepth: (value: number) => void;
}

async function setParameter(id: string, value: number): Promise<void> {
  await invoke("set_parameter", { id, value, app: undefined });
}

async function forwardControlsEvent(
  event: string,
  value: number,
): Promise<void> {
  await invoke("forward_controls_event", {
    event,
    payload: JSON.stringify({ value }),
  });
}

/**
 * SceneAControls
 *
 * Per-scene control block for Scene A with sliders for:
 * - Brightness
 * - Rotation speed
 * - Wobble
 * - Tint LFO depth
 * - Tint
 */
export function SceneAControls({
  sceneABrightness,
  rotationSpeed,
  sceneAWobble,
  sceneATint,
  sceneATintLfoDepth,
  setSceneABrightness,
  setRotationSpeed,
  setSceneAWobble,
  setSceneATint,
  setSceneATintLfoDepth,
}: SceneAControlsProps) {
  const handleBrightnessChange = (value: number) => {
    setSceneABrightness(value);
    void (async () => {
      try {
        await setParameter("scene_a_brightness", value);
        await forwardControlsEvent("scene_a_brightness", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_a_brightness parameter",
          error,
        );
      }
    })();
  };

  const handleRotationSpeedChange = (value: number) => {
    setRotationSpeed(value);
    void (async () => {
      try {
        await setParameter("rotationSpeed", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set rotationSpeed parameter",
          error,
        );
      }
    })();
  };

  const handleWobbleChange = (value: number) => {
    setSceneAWobble(value);
    void (async () => {
      try {
        await setParameter("scene_a_wobble", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_a_wobble parameter",
          error,
        );
      }
    })();
  };

  const handleTintLfoDepthChange = (value: number) => {
    setSceneATintLfoDepth(value);
    void (async () => {
      try {
        await setParameter("scene_a_tint_lfo_depth", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_a_tint_lfo_depth parameter",
          error,
        );
      }
    })();
  };

  const handleTintChange = (value: number) => {
    setSceneATint(value);
    void (async () => {
      try {
        await setParameter("scene_a_tint", value);
      } catch (error) {
        console.error("[Controls] Failed to set scene_a_tint parameter", error);
      }
    })();
  };

  return (
    <section aria-label="Scene A controls" className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Scene A controls</h2>
        <p className={styles.description}>
          Parameters that affect Scene&nbsp;A&apos;s appearance and motion.
        </p>
      </header>

      <div className={styles.content}>
        <ParameterSlider
          id="scene-a-brightness"
          label="Scene A Brightness"
          value={sceneABrightness}
          min={0}
          max={2}
          step={0.01}
          color="emerald"
          description="Adjusts the brightness of Scene A in the renderer."
          onChange={handleBrightnessChange}
          midiParameterId="scene_a_brightness"
        />

        <ParameterSlider
          id="scene-a-rotation-speed"
          label="Rotation speed"
          value={rotationSpeed}
          min={0}
          max={5}
          step={0.05}
          color="indigo"
          showSpacing
          description="Controls the cube rotation speed in the renderer."
          onChange={handleRotationSpeedChange}
          midiParameterId="rotationSpeed"
        />

        <ParameterSlider
          id="scene-a-wobble"
          label="Scene A Wobble"
          value={sceneAWobble}
          min={0}
          max={1}
          step={0.01}
          color="emerald"
          showSpacing
          description="Controls how much Scene A's cube wobbles in X/Y over time."
          onChange={handleWobbleChange}
          midiParameterId="scene_a_wobble"
        />

        <ParameterSlider
          id="scene-a-tint-lfo-depth"
          label="Scene A Tint LFO Depth"
          value={sceneATintLfoDepth}
          min={0}
          max={1}
          step={0.01}
          color="emerald"
          showSpacing
          description="Controls how strongly an LFO modulates Scene A's tint around the base value."
          onChange={handleTintLfoDepthChange}
          midiParameterId="scene_a_tint_lfo_depth"
        />

        <ParameterSlider
          id="scene-a-tint"
          label="Scene A Tint"
          value={sceneATint}
          min={0}
          max={1}
          step={0.01}
          color="cyan"
          showSpacing
          description="Blends Scene A between its base blue and a more cyan tint."
          onChange={handleTintChange}
          midiParameterId="scene_a_tint"
        />
      </div>
    </section>
  );
}

export default SceneAControls;
