import { invoke } from "@tauri-apps/api/core";
import type { SceneId } from "../scenes/sceneTypes";

export interface PrimaryControlsPanelProps {
  // Scene pairing state
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  setScenePairingOnBackend: (args: {
    currentActive: SceneId;
    currentNext: SceneId;
  }) => void;

  // Parameter values
  crossfade: number;
  sceneABrightness: number;
  rotationSpeed: number;
  sceneAWobble: number;
  sceneATint: number;
  sceneATintLfoDepth: number;

  // Parameter setters (local UI state)
  setCrossfade: (value: number) => void;
  setSceneABrightness: (value: number) => void;
  setRotationSpeed: (value: number) => void;
  setSceneAWobble: (value: number) => void;
  setSceneATint: (value: number) => void;
  setSceneATintLfoDepth: (value: number) => void;

  // Actions
  handleCrossfadeChange: (value: number) => Promise<void>;
  handleSceneABrightnessChange: (value: number) => Promise<void>;
}

/**
 * PrimaryControlsPanel
 *
 * Extracted from App.tsx: this component owns the main "live" controls:
 * - Crossfade + pairing context (but not scene selection dropdowns).
 * - Scene A brightness / wobble.
 * - Rotation speed.
 * - Scene A tint + tint LFO depth.
 *
 * It is intentionally "dumb" about backend wiring: all state and handlers
 * are passed in via props so App.tsx can continue to centralize business
 * logic and Parameter Server integration.
 */
export function PrimaryControlsPanel(props: PrimaryControlsPanelProps) {
  const {
    activeSceneId,
    nextSceneId,
    crossfade,
    sceneABrightness,
    rotationSpeed,
    sceneAWobble,
    sceneATint,
    sceneATintLfoDepth,
    setRotationSpeed,
    setSceneAWobble,
    setSceneATint,
    setSceneATintLfoDepth,
    handleCrossfadeChange,
    handleSceneABrightnessChange,
  } = props;

  return (
    <section
      aria-label="Primary controls"
      style={{
        flex: "0 1 520px",
        borderRadius: "0.75rem",
        border: "1px solid rgba(255,255,255,0.08)",
        background:
          "radial-gradient(circle at top left, #1b2735 0, #05060a 55%)",
        padding: "1.25rem 1.5rem 1.5rem",
        boxShadow:
          "0 18px 35px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.02)",
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
      }}
    >
      <header>
        <h2
          style={{
            fontSize: "0.95rem",
            margin: 0,
            letterSpacing: 0.03,
            textTransform: "uppercase",
            opacity: 0.9,
          }}
        >
          Live Controls (Placeholder)
        </h2>
        <p
          style={{
            margin: "0.35rem 0 0",
            fontSize: "0.8rem",
            opacity: 0.8,
          }}
        >
          In the prototype, these values will be pushed to the renderer via the
          backend event bus.
        </p>
      </header>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          marginTop: "0.25rem",
        }}
      >
        {/* Crossfade block */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.1rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                Crossfade
              </span>
              <span
                style={{
                  fontSize: "0.78rem",
                  opacity: 0.8,
                }}
              >
                Active → {activeSceneId.toUpperCase()} / Next →{" "}
                {nextSceneId.toUpperCase()}
              </span>
            </div>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              {(crossfade * 100).toFixed(0)}%
            </span>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginTop: "0.1rem",
            }}
          >
            <button
              type="button"
              onClick={() => {
                // Crossfade fully to the active scene (crossfade → 0).
                void handleCrossfadeChange(0);
              }}
              style={{
                flex: 1,
                padding: "0.4rem 0.6rem",
                fontSize: "0.8rem",
                borderRadius: "999px",
                border: "1px solid rgba(248,250,252,0.6)",
                background:
                  crossfade < 0.5
                    ? "rgba(15,23,42,0.95)"
                    : "rgba(15,23,42,0.7)",
                color: "#e5e7eb",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Crossfade to Active
            </button>
            <button
              type="button"
              onClick={() => {
                // Crossfade fully to the next scene (crossfade → 1).
                void handleCrossfadeChange(1);
              }}
              style={{
                flex: 1,
                padding: "0.4rem 0.6rem",
                fontSize: "0.8rem",
                borderRadius: "999px",
                border: "1px solid rgba(248,250,252,0.6)",
                background:
                  crossfade > 0.5
                    ? "rgba(15,23,42,0.95)"
                    : "rgba(15,23,42,0.7)",
                color: "#e5e7eb",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Crossfade to Next
            </button>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Uses the backend Parameter Server to smoothly transition the global{" "}
            <code>crossfade</code> parameter from 0 → 1 between the selected
            Active/Next scenes. Click a button to start the transition; the
            renderer follows the smoothed backend value.
          </p>
        </div>

        {/* Scene A Brightness */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            marginTop: "0.5rem",
          }}
        >
          <label
            htmlFor="scene-a-brightness"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <span>Scene A Brightness</span>
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

          <input
            id="scene-a-brightness"
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={sceneABrightness}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              void handleSceneABrightnessChange(next);
            }}
            style={{
              width: "100%",
              accentColor: "#22c55e",
              cursor: "pointer",
            }}
            aria-valuemin={0}
            aria-valuemax={2}
            aria-valuenow={sceneABrightness}
            aria-label="Scene A brightness"
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Adjusts the brightness of Scene&nbsp;A in the renderer. This
            parameter is forwarded independently from the crossfade value to
            validate multi-parameter control.
          </p>
        </div>

        {/* Rotation Speed */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="rotation-speed"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <span>Rotation speed</span>
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

          <input
            id="rotation-speed"
            type="range"
            min={0}
            max={5}
            step={0.05}
            value={rotationSpeed}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setRotationSpeed(next);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "rotationSpeed",
                    value: next,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error("Failed to set rotationSpeed parameter", error);
                }
              })();
            }}
            style={{
              width: "100%",
              accentColor: "#6366f1",
              cursor: "pointer",
            }}
            aria-valuemin={0}
            aria-valuemax={5}
            aria-valuenow={rotationSpeed}
            aria-label="Scene rotation speed"
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Controls the cube rotation speed in the renderer as a separate
            backend parameter, smoothed by the same transition engine.
          </p>
        </div>

        {/* Scene A Wobble */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-wobble"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <span>Scene A Wobble</span>
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

          <input
            id="scene-a-wobble"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sceneAWobble}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setSceneAWobble(next);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_wobble",
                    value: next,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "Failed to set scene_a_wobble parameter",
                    error,
                  );
                }
              })();
            }}
            style={{
              width: "100%",
              accentColor: "#22c55e",
              cursor: "pointer",
            }}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={sceneAWobble}
            aria-label="Scene A wobble"
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Controls how much Scene&nbsp;A&apos;s cube wobbles in X/Y over time.
          </p>
        </div>

        {/* Scene A Tint LFO Depth */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-tint-lfo-depth"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <span>Scene A Tint LFO Depth</span>
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

          <input
            id="scene-a-tint-lfo-depth"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sceneATintLfoDepth}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setSceneATintLfoDepth(next);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_tint_lfo_depth",
                    value: next,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error(
                    "Failed to set scene_a_tint_lfo_depth parameter",
                    error,
                  );
                }
              })();
            }}
            style={{
              width: "100%",
              accentColor: "#22c55e",
              cursor: "pointer",
            }}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={sceneATintLfoDepth}
            aria-label="Scene A tint LFO depth"
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Controls how strongly a slow LFO modulates Scene&nbsp;A&apos;s tint
            around the base value. 0 disables modulation; 1 uses full depth.
          </p>
        </div>

        {/* Scene A Tint */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            marginTop: "1.1rem",
          }}
        >
          <label
            htmlFor="scene-a-tint"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            <span>Scene A Tint</span>
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

          <input
            id="scene-a-tint"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sceneATint}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              setSceneATint(next);
              void (async () => {
                try {
                  await invoke("set_parameter", {
                    id: "scene_a_tint",
                    value: next,
                    app: undefined,
                  });
                } catch (error) {
                  // eslint-disable-next-line no-console
                  console.error("Failed to set scene_a_tint parameter", error);
                }
              })();
            }}
            style={{
              width: "100%",
              accentColor: "#22d3ee",
              cursor: "pointer",
            }}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={sceneATint}
            aria-label="Scene A tint"
          />

          <p
            style={{
              margin: 0,
              fontSize: "0.78rem",
              opacity: 0.8,
              lineHeight: 1.5,
            }}
          >
            Blends Scene&nbsp;A between its base blue and a more cyan tint. This
            is a numeric parameter (0–1) driven by the backend transition
            engine.
          </p>
        </div>
      </div>
    </section>
  );
}

export default PrimaryControlsPanel;
