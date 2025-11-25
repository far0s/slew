import { invoke } from "@tauri-apps/api/core";
import * as Slider from "@radix-ui/react-slider";
import appShellStyles from "../AppShell.module.css";

export interface SceneAControlsProps {
  // Parameter values
  sceneABrightness: number;
  rotationSpeed: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;

  // Parameter setters (local UI state)
  setSceneABrightness: (value: number) => void;
  setRotationSpeed: (value: number) => void;
  setSceneAWobble: (value: number) => void;
  setSceneATint: (value: number) => void;
  setSceneATintLfoDepth: (value: number) => void;
}

/**
 * SceneAControls
 *
 * Per-scene control block for Scene A, intended to live inside the Scene A
 * column panel beneath the global Scene control strip.
 *
 * This component focuses purely on Scene A-related parameters and delegates
 * all shared scene switching / crossfade UI to the Scene control strip.
 *
 * Backend wiring:
 * - Uses the same Parameter Server commands as the original controls:
 *   - scene_a_brightness
 *   - rotationSpeed
 *   - scene_a_wobble
 *   - scene_a_tint_lfo_depth
 *   - scene_a_tint
 */
export function SceneAControls(props: SceneAControlsProps) {
  const {
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
  } = props;

  return (
    <section
      aria-label="Scene A controls"
      className={appShellStyles.panel}
      style={{
        flex: "0 1 auto",
      }}
    >
      <header className={appShellStyles.stack}>
        <h2 className={appShellStyles.panelTitle}>Scene A controls</h2>
        <p className={appShellStyles.caption}>
          Parameters that affect Scene&nbsp;A&apos;s appearance and motion.
        </p>
      </header>

      <div
        className={appShellStyles.stack}
        style={{
          marginTop: "0.5rem",
        }}
      >
        {/* Scene A Brightness */}
        <div className={appShellStyles.stack}>
          <label
            htmlFor="scene-a-brightness"
            className={appShellStyles.row}
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className={appShellStyles.label}>Scene A Brightness</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {sceneABrightness.toFixed(2)}
            </span>
          </label>

          <Slider.Root
            id="scene-a-brightness"
            min={0}
            max={2}
            step={0.01}
            value={[sceneABrightness]}
            onValueChange={([next]: number[]) => {
              const value = Number.isFinite(next) ? next : sceneABrightness;
              setSceneABrightness(value);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_brightness",
                    value,
                    app: undefined,
                  });
                  await invoke("forward_controls_event", {
                    event: "scene_a_brightness",
                    payload: JSON.stringify({ value }),
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "[Controls] Failed to set scene_a_brightness parameter",
                    error,
                  );
                }
              })();
            }}
            className="relative flex h-5 w-full touch-action-none select-none items-center"
            aria-label="Scene A brightness"
          >
            <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
              <Slider.Range className="absolute h-full bg-emerald-400" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-slate-100 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </Slider.Root>

          <p className={appShellStyles.caption}>
            Adjusts the brightness of Scene&nbsp;A in the renderer.
          </p>
        </div>

        {/* Rotation Speed */}
        <div
          className={appShellStyles.stack}
          style={{
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-rotation-speed"
            className={appShellStyles.row}
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className={appShellStyles.label}>Rotation speed</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {rotationSpeed.toFixed(2)}
            </span>
          </label>

          <Slider.Root
            id="scene-a-rotation-speed"
            min={0}
            max={5}
            step={0.05}
            value={[rotationSpeed]}
            onValueChange={([next]: number[]) => {
              const value = Number.isFinite(next) ? next : rotationSpeed;
              setRotationSpeed(value);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "rotationSpeed",
                    value,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "[Controls] Failed to set rotationSpeed parameter",
                    error,
                  );
                }
              })();
            }}
            className="relative flex h-5 w-full touch-action-none select-none items-center"
            aria-label="Scene A rotation speed"
          >
            <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
              <Slider.Range className="absolute h-full bg-indigo-400" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-slate-100 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </Slider.Root>

          <p className={appShellStyles.caption}>
            Controls the cube rotation speed in the renderer.
          </p>
        </div>

        {/* Scene A Wobble */}
        <div
          className={appShellStyles.stack}
          style={{
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-wobble"
            className={appShellStyles.row}
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className={appShellStyles.label}>Scene A Wobble</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {sceneAWobble.toFixed(2)}
            </span>
          </label>

          <Slider.Root
            id="scene-a-wobble"
            min={0}
            max={1}
            step={0.01}
            value={[sceneAWobble]}
            onValueChange={([next]: number[]) => {
              const value = Number.isFinite(next) ? next : sceneAWobble;
              setSceneAWobble(value);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_wobble",
                    value,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "[Controls] Failed to set scene_a_wobble parameter",
                    error,
                  );
                }
              })();
            }}
            className="relative flex h-5 w-full touch-action-none select-none items-center"
            aria-label="Scene A wobble"
          >
            <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
              <Slider.Range className="absolute h-full bg-emerald-400" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-slate-100 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </Slider.Root>

          <p className={appShellStyles.caption}>
            Controls how much Scene&nbsp;A&apos;s cube wobbles in X/Y over time.
          </p>
        </div>

        {/* Scene A Tint LFO Depth */}
        <div
          className={appShellStyles.stack}
          style={{
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-tint-lfo-depth"
            className={appShellStyles.row}
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className={appShellStyles.label}>Scene A Tint LFO Depth</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {sceneATintLfoDepth.toFixed(2)}
            </span>
          </label>

          <Slider.Root
            id="scene-a-tint-lfo-depth"
            min={0}
            max={1}
            step={0.01}
            value={[sceneATintLfoDepth]}
            onValueChange={([next]: number[]) => {
              const value = Number.isFinite(next) ? next : sceneATintLfoDepth;
              setSceneATintLfoDepth(value);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_tint_lfo_depth",
                    value,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "[Controls] Failed to set scene_a_tint_lfo_depth parameter",
                    error,
                  );
                }
              })();
            }}
            className="relative flex h-5 w-full touch-action-none select-none items-center"
            aria-label="Scene A tint LFO depth"
          >
            <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
              <Slider.Range className="absolute h-full bg-emerald-400" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-slate-100 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </Slider.Root>

          <p className={appShellStyles.caption}>
            Controls how strongly an LFO modulates Scene&nbsp;A&apos;s tint
            around the base value.
          </p>
        </div>

        {/* Scene A Tint */}
        <div
          className={appShellStyles.stack}
          style={{
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-tint"
            className={appShellStyles.row}
            style={{
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <span className={appShellStyles.label}>Scene A Tint</span>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {sceneATint.toFixed(2)}
            </span>
          </label>

          <Slider.Root
            id="scene-a-tint"
            min={0}
            max={1}
            step={0.01}
            value={[sceneATint]}
            onValueChange={([next]: number[]) => {
              const value = Number.isFinite(next) ? next : sceneATint;
              setSceneATint(value);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_tint",
                    value,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "[Controls] Failed to set scene_a_tint parameter",
                    error,
                  );
                }
              })();
            }}
            className="relative flex h-5 w-full touch-action-none select-none items-center"
            aria-label="Scene A tint"
          >
            <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-slate-800">
              <Slider.Range className="absolute h-full bg-cyan-400" />
            </Slider.Track>
            <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-slate-100 shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950" />
          </Slider.Root>

          <p className={appShellStyles.caption}>
            Blends Scene&nbsp;A between its base blue and a more cyan tint.
          </p>
        </div>
      </div>
    </section>
  );
}

export default SceneAControls;
