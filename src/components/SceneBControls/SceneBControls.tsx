import { invoke } from "@tauri-apps/api/core";
import { ParameterSlider } from "../ParameterSlider";
import styles from "./SceneBControls.module.css";

export interface SceneBControlsProps {
  sceneBBrightness: number;
  sceneBRotationSpeed: number;
  sceneBTint: number;
  sceneBScale: number;

  setSceneBBrightness: (value: number) => void;
  setSceneBRotationSpeed: (value: number) => void;
  setSceneBTint: (value: number) => void;
  setSceneBScale: (value: number) => void;
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
 * SceneBControls
 *
 * Per-scene control block for Scene B with sliders for:
 * - Brightness
 * - Rotation speed
 * - Tint
 * - Scale
 */
export function SceneBControls({
  sceneBBrightness,
  sceneBRotationSpeed,
  sceneBTint,
  sceneBScale,
  setSceneBBrightness,
  setSceneBRotationSpeed,
  setSceneBTint,
  setSceneBScale,
}: SceneBControlsProps) {
  const handleBrightnessChange = (value: number) => {
    setSceneBBrightness(value);
    void (async () => {
      try {
        await setParameter("scene_b_brightness", value);
        await forwardControlsEvent("scene_b_brightness", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_b_brightness parameter",
          error,
        );
      }
    })();
  };

  const handleRotationSpeedChange = (value: number) => {
    setSceneBRotationSpeed(value);
    void (async () => {
      try {
        await setParameter("scene_b_rotation_speed", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_b_rotation_speed parameter",
          error,
        );
      }
    })();
  };

  const handleTintChange = (value: number) => {
    setSceneBTint(value);
    void (async () => {
      try {
        await setParameter("scene_b_tint", value);
      } catch (error) {
        console.error("[Controls] Failed to set scene_b_tint parameter", error);
      }
    })();
  };

  const handleScaleChange = (value: number) => {
    setSceneBScale(value);
    void (async () => {
      try {
        await setParameter("scene_b_scale", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_b_scale parameter",
          error,
        );
      }
    })();
  };

  return (
    <section aria-label="Scene B controls" className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Scene B controls</h2>
        <p className={styles.description}>
          Parameters that affect Scene&nbsp;B&apos;s appearance and motion.
        </p>
      </header>

      <div className={styles.content}>
        <ParameterSlider
          id="scene-b-brightness"
          label="Scene B Brightness"
          value={sceneBBrightness}
          min={0}
          max={2}
          step={0.01}
          color="amber"
          description="Adjusts the brightness of Scene B in the renderer."
          onChange={handleBrightnessChange}
          midiParameterId="scene_b_brightness"
        />

        <ParameterSlider
          id="scene-b-rotation-speed"
          label="Rotation Speed"
          value={sceneBRotationSpeed}
          min={0}
          max={5}
          step={0.05}
          color="amber"
          showSpacing
          description="Controls the cube rotation speed in Scene B."
          onChange={handleRotationSpeedChange}
          midiParameterId="scene_b_rotation_speed"
        />

        <ParameterSlider
          id="scene-b-tint"
          label="Scene B Tint"
          value={sceneBTint}
          min={0}
          max={1}
          step={0.01}
          color="amber"
          showSpacing
          description="Shifts Scene B's orange color towards red (0) or yellow (1)."
          onChange={handleTintChange}
          midiParameterId="scene_b_tint"
        />

        <ParameterSlider
          id="scene-b-scale"
          label="Scene B Scale"
          value={sceneBScale}
          min={0.5}
          max={2}
          step={0.01}
          color="amber"
          showSpacing
          description="Adjusts the size of Scene B's cube."
          onChange={handleScaleChange}
          midiParameterId="scene_b_scale"
        />
      </div>
    </section>
  );
}

export default SceneBControls;
