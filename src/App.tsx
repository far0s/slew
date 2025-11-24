import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * sebcat-vj — Control UI (Window B)
 *
 * This is a minimal placeholder for the future VJ control surface.
 * It:
 * - Exposes a couple of sliders (Crossfade + Scene A Brightness) to prove out the controls window
 * - Is keyboard-accessible and screen-reader-friendly
 * - Forwards the values to the backend via `forward_controls_event`
 * - Will later expand into scene selection, parameter panels, MIDI/OSC/audio config, etc.
 */

type BackendParameter = {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
};

function App() {
  const [crossfade, setCrossfade] = useState(0.5);
  const [sceneABrightness, setSceneABrightness] = useState(1);
  const [rotationSpeed, setRotationSpeed] = useState(0.6);
  const [sceneAWobble, setSceneAWobble] = useState(0);
  const [backendParameters, setBackendParameters] = useState<
    BackendParameter[] | null
  >(null);
  const [isLoadingParams, setIsLoadingParams] = useState(false);
  const [paramError, setParamError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const DEFAULTS = {
    crossfade: 0.5,
    sceneABrightness: 1,
    rotationSpeed: 0.6,
    sceneAWobble: 0,
  } as const;
  const [isResettingDefaults, setIsResettingDefaults] = useState(false);

  /**
   * Apply backend parameters to local slider state.
   * This keeps the live controls in sync with the canonical backend
   * values when the app first mounts or when we refresh.
   */
  function applyBackendParamsToSliders(params: BackendParameter[]) {
    for (const param of params) {
      if (param.id === "crossfade") {
        const clamped = Math.max(0, Math.min(1, param.value));
        setCrossfade(clamped);
      } else if (param.id === "scene_a_brightness") {
        const clamped = Math.max(0, Math.min(2, param.value));
        setSceneABrightness(clamped);
      } else if (param.id === "rotationSpeed") {
        const clamped = Math.max(0, Math.min(5, param.value));
        setRotationSpeed(clamped);
      } else if (param.id === "scene_a_wobble") {
        const clamped = Math.max(0, Math.min(1, param.value));
        setSceneAWobble(clamped);
      }
    }
  }

  async function handleCrossfadeChange(next: number) {
    setCrossfade(next);

    // 1) Update backend Parameter Server
    // NOTE: `value` is treated as the new target; backend will smooth
    // the runtime value towards this target over time.
    try {
      await invoke("set_parameter", {
        id: "crossfade",
        value: next,
        app: undefined,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to set crossfade parameter", error);
    }

    // 2) Forward event to renderer window for live updates.
    // This event communicates the new requested target; the renderer
    // should prefer listening to backend-smoothed values when available.
    try {
      await invoke("forward_controls_event", {
        event: "crossfade",
        payload: JSON.stringify({ value: next }),
      });
    } catch (error) {
      // In a real UI we might surface this in a toast/log panel.
      // For now we just log to the console.
      // eslint-disable-next-line no-console
      console.error("Failed to forward crossfade event", error);
    }
  }

  async function handleSceneABrightnessChange(next: number) {
    setSceneABrightness(next);

    // 1) Update backend Parameter Server
    // NOTE: `value` is treated as the new target; backend will smooth
    // the runtime value towards this target over time.
    try {
      await invoke("set_parameter", {
        id: "scene_a_brightness",
        value: next,
        app: undefined,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to set Scene A brightness parameter", error);
    }

    // 2) Forward event to renderer window for live updates.
    // This event communicates the new requested target; the renderer
    // should prefer listening to backend-smoothed values when available.
    try {
      await invoke("forward_controls_event", {
        event: "scene_a_brightness",
        payload: JSON.stringify({ value: next }),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to forward Scene A brightness event", error);
    }
  }

  async function refreshBackendParameters() {
    setIsLoadingParams(true);
    setParamError(null);

    try {
      const response = (await invoke("get_parameters")) as BackendParameter[];
      setBackendParameters(response);
      // Keep sliders in sync with backend state on refresh.
      applyBackendParamsToSliders(response);
    } catch (error) {
      setParamError("Failed to load parameters from backend");
      // eslint-disable-next-line no-console
      console.error("Failed to get_parameters", error);
    } finally {
      setIsLoadingParams(false);
    }
  }

  async function handleClearParameters() {
    setIsClearing(true);
    setParamError(null);

    try {
      await invoke("clear_parameters");
      setBackendParameters([]);
      // Also reset local slider state to known client-side defaults.
      setCrossfade(DEFAULTS.crossfade);
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
    } catch (error) {
      setParamError("Failed to clear parameters in backend");
      // eslint-disable-next-line no-console
      console.error("Failed to clear_parameters", error);
    } finally {
      setIsClearing(false);
    }
  }

  async function handleResetDefaults() {
    setIsResettingDefaults(true);
    setParamError(null);

    const defaults: Array<{ id: string; value: number }> = [
      { id: "crossfade", value: DEFAULTS.crossfade },
      { id: "scene_a_brightness", value: DEFAULTS.sceneABrightness },
      { id: "rotationSpeed", value: DEFAULTS.rotationSpeed },
      { id: "scene_a_wobble", value: DEFAULTS.sceneAWobble },
    ];

    try {
      // Push defaults to backend Parameter Server
      await Promise.all(
        defaults.map(({ id, value }) =>
          invoke("set_parameter", { id, value, app: undefined }),
        ),
      );

      // Update local sliders to match defaults
      setCrossfade(DEFAULTS.crossfade);
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
    } catch (error) {
      setParamError("Failed to reset parameters to defaults");
      // eslint-disable-next-line no-console
      console.error("Failed to reset defaults", error);
    } finally {
      setIsResettingDefaults(false);
    }
  }

  useEffect(() => {
    // Initial load of backend parameters on mount.
    void refreshBackendParameters();

    // Subscribe to live parameter change events from the backend so that
    // the inspector stays up-to-date without manual refresh.
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            const updated = event.payload;

            // Keep local sliders synced with backend parameter changes.
            applyBackendParamsToSliders([updated]);

            setBackendParameters((current) => {
              if (!current || current.length === 0) {
                return [updated];
              }

              const existingIndex = current.findIndex(
                (p) => p.id === updated.id,
              );
              if (existingIndex === -1) {
                return [...current, updated];
              }

              const next = current.slice();
              next[existingIndex] = updated;
              return next;
            });
          },
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to subscribe to parameter_changed events", error);
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#05060a",
        color: "#f5f5f5",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      <header
        style={{
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.1rem",
              letterSpacing: 0.02,
              margin: 0,
            }}
          >
            sebcat-vj — Controls
          </h1>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.8rem",
              opacity: 0.75,
            }}
          >
            Placeholder control UI. This window will drive parameters for the
            renderer window.
          </p>
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            opacity: 0.75,
            textAlign: "right",
          }}
        >
          <div>Phase 1 — Foundations</div>
          <div>Basic messaging &amp; layout</div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          padding: "1.5rem",
          gap: "1.5rem",
        }}
      >
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
              In the prototype, these values will be pushed to the renderer via
              the backend event bus.
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
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                htmlFor="crossfade"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                <span>Crossfade</span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.8rem",
                    opacity: 0.8,
                  }}
                >
                  {(crossfade * 100).toFixed(0)}%
                </span>
              </label>

              <input
                id="crossfade"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={crossfade}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  // Keep the UI responsive by updating local state immediately,
                  // then asynchronously forwarding the change to the backend.
                  void handleCrossfadeChange(next);
                }}
                style={{
                  width: "100%",
                  accentColor: "#f97316",
                  cursor: "pointer",
                }}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={crossfade}
                aria-label="Scene crossfade between A and B"
              />

              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  opacity: 0.8,
                  lineHeight: 1.5,
                }}
              >
                This will eventually control the blend between Scene&nbsp;A and
                Scene&nbsp;B in the renderer window. It’s a simple placeholder
                to validate messaging and parameter wiring.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginTop: "1.1rem",
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
                      console.error(
                        "Failed to set rotationSpeed parameter",
                        error,
                      );
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
                  accentColor: "#ec4899",
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
                Adds a subtle wobble to Scene&nbsp;A, driven as a backend
                parameter and smoothed by the same transition engine.
              </p>
            </div>
          </div>
        </section>

        <aside
          aria-label="Backend parameter inspector"
          style={{
            flex: "0 1 360px",
            borderRadius: "0.75rem",
            border: "1px dashed rgba(255,255,255,0.18)",
            background:
              "linear-gradient(135deg, rgba(16,24,40,0.9), rgba(5,6,10,0.95))",
            padding: "1.1rem 1.25rem 1.3rem",
            fontSize: "0.8rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "0.9rem",
              textTransform: "uppercase",
              letterSpacing: 0.06,
              opacity: 0.85,
            }}
          >
            Backend parameters
          </h2>

          <p
            style={{
              margin: "0.3rem 0 0.4rem",
              opacity: 0.85,
              lineHeight: 1.4,
            }}
          >
            Live view of the backend Parameter Server. Values shown here are the
            backend&apos;s canonical state, not the renderer&apos;s local copy.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginTop: "0.1rem",
            }}
          >
            <button
              type="button"
              onClick={() => {
                void refreshBackendParameters();
              }}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.78rem",
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.6)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              {isLoadingParams ? "Refreshing…" : "Refresh"}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleResetDefaults();
              }}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.78rem",
                borderRadius: "999px",
                border: "1px solid rgba(96,165,250,0.7)",
                background: "transparent",
                color: "#bfdbfe",
                cursor: "pointer",
              }}
            >
              {isResettingDefaults ? "Resetting…" : "Reset to defaults"}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleClearParameters();
              }}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.78rem",
                borderRadius: "999px",
                border: "1px solid rgba(248,113,113,0.7)",
                background: "transparent",
                color: "#fecaca",
                cursor: "pointer",
              }}
            >
              {isClearing ? "Clearing…" : "Clear"}
            </button>
          </div>

          {paramError ? (
            <p
              style={{
                marginTop: "0.45rem",
                color: "#fca5a5",
                fontSize: "0.78rem",
              }}
            >
              {paramError}
            </p>
          ) : null}

          <div
            style={{
              marginTop: "0.45rem",
              maxHeight: 220,
              overflowY: "auto",
              paddingRight: "0.25rem",
            }}
          >
            {backendParameters === null && !isLoadingParams ? (
              <p
                style={{
                  opacity: 0.8,
                  fontSize: "0.78rem",
                }}
              >
                No parameters loaded yet.
              </p>
            ) : backendParameters && backendParameters.length === 0 ? (
              <p
                style={{
                  opacity: 0.8,
                  fontSize: "0.78rem",
                }}
              >
                Parameter store is currently empty.
              </p>
            ) : (
              <>
                <h3
                  style={{
                    padding: "0.25rem 0",
                    margin: 0,
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.08,
                    opacity: 0.8,
                  }}
                >
                  Scene A
                </h3>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    fontFamily:
                      "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  {(backendParameters ?? [])
                    .filter((param) =>
                      [
                        "crossfade",
                        "scene_a_brightness",
                        "scene_a_wobble",
                      ].includes(param.id),
                    )
                    .sort((a, b) => {
                      const order = [
                        "crossfade",
                        "scene_a_brightness",
                        "scene_a_wobble",
                      ];
                      return order.indexOf(a.id) - order.indexOf(b.id);
                    })
                    .map((param) => (
                      <li
                        key={param.id}
                        style={{
                          padding: "0.3rem 0",
                          borderBottom: "1px solid rgba(148,163,184,0.18)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.08rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 500,
                          }}
                        >
                          {param.id}
                        </span>
                        <span
                          style={{
                            fontSize: "0.78rem",
                            opacity: 0.85,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          value: {param.value.toFixed(3)} — target:{" "}
                          {param.target.toFixed(3)}
                        </span>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            opacity: 0.75,
                          }}
                        >
                          speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                          {param.curve}
                        </span>
                      </li>
                    ))}
                </ul>

                <h3
                  style={{
                    padding: "0.35rem 0 0.1rem",
                    margin: "0.4rem 0 0",
                    fontSize: "0.8rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.08,
                    opacity: 0.8,
                  }}
                >
                  Global / Other
                </h3>
                <ul
                  style={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    fontFamily:
                      "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  {(backendParameters ?? [])
                    .filter(
                      (param) =>
                        ![
                          "crossfade",
                          "scene_a_brightness",
                          "scene_a_wobble",
                        ].includes(param.id),
                    )
                    .map((param) => (
                      <li
                        key={param.id}
                        style={{
                          padding: "0.3rem 0",
                          borderBottom: "1px solid rgba(148,163,184,0.18)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.08rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.8rem",
                            fontWeight: 500,
                          }}
                        >
                          {param.id}
                        </span>
                        <span
                          style={{
                            fontSize: "0.78rem",
                            opacity: 0.85,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          value: {param.value.toFixed(3)} — target:{" "}
                          {param.target.toFixed(3)}
                        </span>
                        <span
                          style={{
                            fontSize: "0.74rem",
                            opacity: 0.75,
                          }}
                        >
                          speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                          {param.curve}
                        </span>
                      </li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
