import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "motion/react";
import { type SceneId } from "./scenes/sceneTypes";
import type { SceneProps } from "./scenes/sceneComponents";
import {
  type BackendParameter,
  useControlsParameters,
} from "./controls/controlsParameters";
import { SceneControlStrip } from "./components/controls/SceneControlStrip";
import { SceneAControls } from "./components/controls/SceneAControls";
import { SceneBControls } from "./components/controls/SceneBControls";
import { SceneCControls } from "./components/controls/SceneCControls";
import { RendererPreview } from "./components/controls/RendererPreview";

import {
  DebugPanel,
  type LogEntry,
  type DebugMetricsData,
} from "./components/debug";
import styles from "./App.module.css";

/** Maximum number of log entries to keep in memory */
const MAX_LOG_ENTRIES = 100;

function App() {
  const {
    crossfade,
    // Scene A
    sceneABrightness,
    rotationSpeed,
    sceneAWobble,
    sceneATint,
    sceneATintLfoDepth,
    // Scene B
    sceneBBrightness,
    sceneBRotationSpeed,
    sceneBTint,
    sceneBScale,
    // Scene C
    sceneCBrightness,
    sceneCPulseSpeed,
    sceneCRotationSpeed,
    sceneCTint,

    backendParameters,
    isLoadingParams,
    paramError,

    setCrossfade,
    // Scene A setters
    setSceneABrightness,
    setRotationSpeed,
    setSceneAWobble,
    setSceneATint,
    setSceneATintLfoDepth,
    // Scene B setters
    setSceneBBrightness,
    setSceneBRotationSpeed,
    setSceneBTint,
    setSceneBScale,
    // Scene C setters
    setSceneCBrightness,
    setSceneCPulseSpeed,
    setSceneCRotationSpeed,
    setSceneCTint,

    setBackendParameters,
    setIsLoadingParams,
    setParamError,
    DEFAULTS,
    applyBackendParamsToSliders,
  } = useControlsParameters();

  const [activeSceneId, setActiveSceneId] = useState<SceneId>("sceneA");
  const [nextSceneId, setNextSceneId] = useState<SceneId>("sceneB");

  // Debug logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdCounter = useRef(0);

  // Debug metrics state
  const [metrics, setMetrics] = useState<DebugMetricsData>(() => ({
    totalParameterUpdates: 0,
    parameterUpdateCounts: {},
    lastEventTime: null,
    sessionStartTime: Date.now(),
    crossfadeTransitions: 0,
  }));

  // Track previous crossfade value to detect transitions
  const prevCrossfadeRef = useRef<number | null>(null);

  const addLogEntry = useCallback((param: BackendParameter) => {
    const entry: LogEntry = {
      id: `log-${logIdCounter.current++}`,
      timestamp: Date.now(),
      parameterId: param.id,
      value: param.value,
      target: param.target,
      transitionSpeed: param.transition_speed,
      curve: param.curve,
    };

    setLogs((prev) => {
      const next = [entry, ...prev];
      if (next.length > MAX_LOG_ENTRIES) {
        return next.slice(0, MAX_LOG_ENTRIES);
      }
      return next;
    });
  }, []);

  const updateMetrics = useCallback((param: BackendParameter) => {
    setMetrics((prev) => {
      const newCounts = { ...prev.parameterUpdateCounts };
      newCounts[param.id] = (newCounts[param.id] ?? 0) + 1;

      let crossfadeTransitions = prev.crossfadeTransitions;
      if (param.id === "crossfade") {
        const prevCrossfade = prevCrossfadeRef.current;
        if (prevCrossfade !== null) {
          const wasAtEndpoint = prevCrossfade <= 0.01 || prevCrossfade >= 0.99;
          const isMovingToEndpoint = param.target === 0 || param.target === 1;
          if (
            wasAtEndpoint &&
            isMovingToEndpoint &&
            param.target !== prevCrossfade
          ) {
            crossfadeTransitions++;
          }
        }
        prevCrossfadeRef.current = param.value;
      }

      return {
        ...prev,
        totalParameterUpdates: prev.totalParameterUpdates + 1,
        parameterUpdateCounts: newCounts,
        lastEventTime: Date.now(),
        crossfadeTransitions,
      };
    });
  }, []);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const handleResetMetrics = useCallback(() => {
    setMetrics({
      totalParameterUpdates: 0,
      parameterUpdateCounts: {},
      lastEventTime: null,
      sessionStartTime: Date.now(),
      crossfadeTransitions: 0,
    });
    prevCrossfadeRef.current = null;
  }, []);

  async function handleCrossfadeChange(next: number) {
    setCrossfade(next);
    try {
      await invoke("set_parameter", {
        id: "crossfade",
        value: next,
        app: undefined,
      });
      await invoke("forward_controls_event", {
        event: "crossfade",
        payload: JSON.stringify({ value: next }),
      });
    } catch (error) {
      console.error("[Controls] Failed to update crossfade", error);
    }
  }

  async function refreshBackendParameters() {
    setIsLoadingParams(true);
    setParamError(null);
    try {
      const response = (await invoke("get_parameters")) as BackendParameter[];
      setBackendParameters(response);
      applyBackendParamsToSliders(response);
    } catch (error) {
      setParamError("Failed to load parameters from backend");
      console.error("[Controls] get_parameters failed", error);
    } finally {
      setIsLoadingParams(false);
    }
  }

  async function handleClearParameters() {
    setParamError(null);
    try {
      await invoke("clear_parameters");
      setBackendParameters([]);

      // Reset all sliders to defaults
      setCrossfade(DEFAULTS.crossfade);
      // Scene A
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
      setSceneATint(DEFAULTS.sceneATint);
      setSceneATintLfoDepth(DEFAULTS.sceneATintLfoDepth);
      // Scene B
      setSceneBBrightness(DEFAULTS.sceneBBrightness);
      setSceneBRotationSpeed(DEFAULTS.sceneBRotationSpeed);
      setSceneBTint(DEFAULTS.sceneBTint);
      setSceneBScale(DEFAULTS.sceneBScale);
      // Scene C
      setSceneCBrightness(DEFAULTS.sceneCBrightness);
      setSceneCPulseSpeed(DEFAULTS.sceneCPulseSpeed);
      setSceneCRotationSpeed(DEFAULTS.sceneCRotationSpeed);
      setSceneCTint(DEFAULTS.sceneCTint);
    } catch (error) {
      setParamError("Failed to clear parameters in backend");
      console.error("[Controls] clear_parameters failed", error);
    }
  }

  async function handleResetDefaults() {
    setParamError(null);

    const defaults: Array<{ id: string; value: number }> = [
      // Crossfade
      { id: "crossfade", value: DEFAULTS.crossfade },
      // Scene A
      { id: "scene_a_brightness", value: DEFAULTS.sceneABrightness },
      { id: "rotationSpeed", value: DEFAULTS.rotationSpeed },
      { id: "scene_a_wobble", value: DEFAULTS.sceneAWobble },
      { id: "scene_a_tint", value: DEFAULTS.sceneATint },
      { id: "scene_a_tint_lfo_depth", value: DEFAULTS.sceneATintLfoDepth },
      // Scene B
      { id: "scene_b_brightness", value: DEFAULTS.sceneBBrightness },
      { id: "scene_b_rotation_speed", value: DEFAULTS.sceneBRotationSpeed },
      { id: "scene_b_tint", value: DEFAULTS.sceneBTint },
      { id: "scene_b_scale", value: DEFAULTS.sceneBScale },
      // Scene C
      { id: "scene_c_brightness", value: DEFAULTS.sceneCBrightness },
      { id: "scene_c_pulse_speed", value: DEFAULTS.sceneCPulseSpeed },
      { id: "scene_c_rotation_speed", value: DEFAULTS.sceneCRotationSpeed },
      { id: "scene_c_tint", value: DEFAULTS.sceneCTint },
    ];

    try {
      await Promise.all(
        defaults.map(({ id, value }) =>
          invoke("set_parameter", { id, value, app: undefined }),
        ),
      );

      // Update local state
      setCrossfade(DEFAULTS.crossfade);
      // Scene A
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
      setSceneATint(DEFAULTS.sceneATint);
      setSceneATintLfoDepth(DEFAULTS.sceneATintLfoDepth);
      // Scene B
      setSceneBBrightness(DEFAULTS.sceneBBrightness);
      setSceneBRotationSpeed(DEFAULTS.sceneBRotationSpeed);
      setSceneBTint(DEFAULTS.sceneBTint);
      setSceneBScale(DEFAULTS.sceneBScale);
      // Scene C
      setSceneCBrightness(DEFAULTS.sceneCBrightness);
      setSceneCPulseSpeed(DEFAULTS.sceneCPulseSpeed);
      setSceneCRotationSpeed(DEFAULTS.sceneCRotationSpeed);
      setSceneCTint(DEFAULTS.sceneCTint);
    } catch (error) {
      setParamError("Failed to reset parameters to defaults");
      console.error("[Controls] reset defaults failed", error);
    }
  }

  useEffect(() => {
    void refreshBackendParameters();

    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            const updated = event.payload;

            applyBackendParamsToSliders([updated]);

            const current = backendParameters ?? [];
            const index = current.findIndex(
              (p: BackendParameter) => p.id === updated.id,
            );
            if (index === -1) {
              setBackendParameters([...current, updated]);
            } else {
              const next = current.slice();
              next[index] = updated;
              setBackendParameters(next);
            }

            addLogEntry(updated);
            updateMetrics(updated);
          },
        );
      } catch (error) {
        console.error("[Controls] subscribe parameter_changed failed", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Render the appropriate scene controls based on scene ID
   */
  function renderSceneControls(sceneId: SceneId) {
    switch (sceneId) {
      case "sceneA":
        return (
          <SceneAControls
            sceneABrightness={sceneABrightness}
            rotationSpeed={rotationSpeed}
            sceneAWobble={sceneAWobble}
            sceneATint={sceneATint}
            sceneATintLfoDepth={sceneATintLfoDepth}
            setSceneABrightness={setSceneABrightness}
            setRotationSpeed={setRotationSpeed}
            setSceneAWobble={setSceneAWobble}
            setSceneATint={setSceneATint}
            setSceneATintLfoDepth={setSceneATintLfoDepth}
          />
        );
      case "sceneB":
        return (
          <SceneBControls
            sceneBBrightness={sceneBBrightness}
            sceneBRotationSpeed={sceneBRotationSpeed}
            sceneBTint={sceneBTint}
            sceneBScale={sceneBScale}
            setSceneBBrightness={setSceneBBrightness}
            setSceneBRotationSpeed={setSceneBRotationSpeed}
            setSceneBTint={setSceneBTint}
            setSceneBScale={setSceneBScale}
          />
        );
      case "sceneC":
        return (
          <SceneCControls
            sceneCBrightness={sceneCBrightness}
            sceneCPulseSpeed={sceneCPulseSpeed}
            sceneCRotationSpeed={sceneCRotationSpeed}
            sceneCTint={sceneCTint}
            setSceneCBrightness={setSceneCBrightness}
            setSceneCPulseSpeed={setSceneCPulseSpeed}
            setSceneCRotationSpeed={setSceneCRotationSpeed}
            setSceneCTint={setSceneCTint}
          />
        );
      default:
        return null;
    }
  }

  /**
   * Get a human-readable label for a scene ID
   */
  function getSceneLabel(sceneId: SceneId): string {
    switch (sceneId) {
      case "sceneA":
        return "Scene A";
      case "sceneB":
        return "Scene B";
      case "sceneC":
        return "Scene C";
      default:
        return sceneId;
    }
  }

  /**
   * Get the params object for a given scene ID (for preview rendering)
   */
  function getSceneParams(sceneId: SceneId): SceneProps["params"] {
    switch (sceneId) {
      case "sceneA":
        return {
          rotationSpeed,
          sceneABrightness,
          sceneAWobble,
          sceneATint,
        };
      case "sceneB":
        return {
          sceneBBrightness,
          sceneBRotationSpeed,
          sceneBTint,
          sceneBScale,
        };
      case "sceneC":
        return {
          sceneCBrightness,
          sceneCPulseSpeed,
          sceneCRotationSpeed,
          sceneCTint,
        };
      default:
        return {};
    }
  }

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Scene control strip: top row, columns 1–4 */}
        <div className={styles.sceneControlStrip}>
          <SceneControlStrip
            activeSceneId={activeSceneId}
            nextSceneId={nextSceneId}
            setActiveSceneId={setActiveSceneId}
            setNextSceneId={setNextSceneId}
            crossfade={crossfade}
            onCrossfadeChange={handleCrossfadeChange}
            activeSceneParams={getSceneParams(activeSceneId)}
            nextSceneParams={getSceneParams(nextSceneId)}
          />
        </div>

        {/* Active scene column: columns 1–2, row 2 */}
        <div className={`${styles.sceneColumn} ${styles.activeSceneColumn}`}>
          <AnimatePresence mode="wait">
            <motion.section
              key={activeSceneId}
              aria-label={`${getSceneLabel(activeSceneId)} controls`}
              className={styles.panel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <h2 className={styles.panelTitle}>
                {getSceneLabel(activeSceneId)}
                <span className={styles.sceneRole}> (Active)</span>
              </h2>
              <p className={styles.caption}>
                Controls for the currently active scene.
              </p>
              {renderSceneControls(activeSceneId)}
            </motion.section>
          </AnimatePresence>
        </div>

        {/* Next scene column: columns 3–4, row 2 */}
        <div className={`${styles.sceneColumn} ${styles.nextSceneColumn}`}>
          <AnimatePresence mode="wait">
            <motion.section
              key={nextSceneId}
              aria-label={`${getSceneLabel(nextSceneId)} controls`}
              className={styles.panel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <h2 className={styles.panelTitle}>
                {getSceneLabel(nextSceneId)}
                <span className={styles.sceneRole}> (Next)</span>
              </h2>
              <p className={styles.caption}>
                Controls for the next scene in the crossfade.
              </p>
              {renderSceneControls(nextSceneId)}
            </motion.section>
          </AnimatePresence>
        </div>

        {/* Preview + Debug column: column 5, spans both rows */}
        <aside className={styles.debugColumn} aria-label="Preview and debug">
          <RendererPreview
            activeSceneId={activeSceneId}
            nextSceneId={nextSceneId}
            crossfade={crossfade}
            activeSceneParams={getSceneParams(activeSceneId)}
            nextSceneParams={getSceneParams(nextSceneId)}
            sceneATintLfoDepth={sceneATintLfoDepth}
          />
          <DebugPanel
            backendParameters={backendParameters}
            isLoadingParams={isLoadingParams}
            paramError={paramError}
            onRefresh={() => void refreshBackendParameters()}
            onResetDefaults={() => void handleResetDefaults()}
            onClearParameters={() => void handleClearParameters()}
            logs={logs}
            onClearLogs={handleClearLogs}
            metrics={metrics}
            onResetMetrics={handleResetMetrics}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
