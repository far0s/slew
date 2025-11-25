import { invoke } from "@tauri-apps/api/core";
import { ParameterSlider } from "../ui/ParameterSlider";
import styles from "./SceneCControls.module.css";

export interface SceneCControlsProps {
  sceneCBrightness: number;
  sceneCPulseSpeed: number;
  sceneCRotationSpeed: number;
  sceneCTint: number;

  setSceneCBrightness: (value: number) => void;
  setSceneCPulseSpeed: (value: number) => void;
  setSceneCRotationSpeed: (value: number) => void;
  setSceneCTint: (value: number) => void;
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
 * SceneCControls
 *
 * Per-scene control block for Scene C with sliders for:
 * - Brightness
 * - Pulse speed
 * - Rotation speed
 * - Tint
 */
export function SceneCControls({
  sceneCBrightness,
  sceneCPulseSpeed,
  sceneCRotationSpeed,
  sceneCTint,
  setSceneCBrightness,
  setSceneCPulseSpeed,
  setSceneCRotationSpeed,
  setSceneCTint,
}: SceneCControlsProps) {
  const handleBrightnessChange = (value: number) => {
    setSceneCBrightness(value);
    void (async () => {
      try {
        await setParameter("scene_c_brightness", value);
        await forwardControlsEvent("scene_c_brightness", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_c_brightness parameter",
          error,
        );
      }
    })();
  };

  const handlePulseSpeedChange = (value: number) => {
    setSceneCPulseSpeed(value);
    void (async () => {
      try {
        await setParameter("scene_c_pulse_speed", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_c_pulse_speed parameter",
          error,
        );
      }
    })();
  };

  const handleRotationSpeedChange = (value: number) => {
    setSceneCRotationSpeed(value);
    void (async () => {
      try {
        await setParameter("scene_c_rotation_speed", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_c_rotation_speed parameter",
          error,
        );
      }
    })();
  };

  const handleTintChange = (value: number) => {
    setSceneCTint(value);
    void (async () => {
      try {
        await setParameter("scene_c_tint", value);
      } catch (error) {
        console.error(
          "[Controls] Failed to set scene_c_tint parameter",
          error,
        );
      }
    })();
  };

  return (
    <section aria-label="Scene C controls" className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>Scene C controls</h2>
        <p className={styles.description}>
          Parameters that affect Scene&nbsp;C&apos;s appearance and motion.
        </p>
      </header>

      <div className={styles.content}>
        <ParameterSlider
          id="scene-c-brightness"
          label="Scene C Brightness"
          value={sceneCBrightness}
          min={0}
          max={2}
          step={0.01}
          color="emerald"
          description="Adjusts the brightness of Scene C in the renderer."
          onChange={handleBrightnessChange}
        />

        <ParameterSlider
          id="scene-c-pulse-speed"
          label="Pulse Speed"
          value={sceneCPulseSpeed}
          min={0}
          max={5}
          step={0.05}
          color="emerald"
          showSpacing
          description="Controls how fast Scene C's cube pulses in size."
          onChange={handlePulseSpeedChange}
        />

        <ParameterSlider
          id="scene-c-rotation-speed"
          label="Rotation Speed"
          value={sceneCRotationSpeed}
          min={0}
          max={5}
          step={0.05}
          color="emerald"
          showSpacing
          description="Controls the cube rotation speed in Scene C."
          onChange={handleRotationSpeedChange}
        />

        <ParameterSlider
          id="scene-c-tint"
          label="Scene C Tint"
          value={sceneCTint}
          min={0}
          max={1}
          step={0.01}
          color="cyan"
          showSpacing
          description="Shifts Scene C's green color towards cyan (0) or lime (1)."
          onChange={handleTintChange}
        />
      </div>
    </section>
  );
}

export default SceneCControls;
