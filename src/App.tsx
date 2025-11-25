import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type SceneId } from "./scenes/sceneTypes";
import {
  type BackendParameter,
  useControlsParameters,
} from "./controls/controlsParameters";
import { SceneControlStrip } from "./components/controls/SceneControlStrip";
import { SceneAControls } from "./components/controls/SceneAControls";
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
    sceneABrightness,
    rotationSpeed,
    sceneAWobble,
    sceneATint,
    sceneATintLfoDepth,
    backendParameters,
    isLoadingParams,
    paramError,
    setCrossfade,
    setSceneABrightness,
    setRotationSpeed,
    setSceneAWobble,
    setSceneATint,
    setSceneATintLfoDepth,
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
      setCrossfade(DEFAULTS.crossfade);
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
      setSceneATint(DEFAULTS.sceneATint);
      setSceneATintLfoDepth(DEFAULTS.sceneATintLfoDepth);
    } catch (error) {
      setParamError("Failed to clear parameters in backend");
      console.error("[Controls] clear_parameters failed", error);
    }
  }

  async function handleResetDefaults() {
    setParamError(null);

    const defaults: Array<{ id: string; value: number }> = [
      { id: "crossfade", value: DEFAULTS.crossfade },
      { id: "scene_a_brightness", value: DEFAULTS.sceneABrightness },
      { id: "rotationSpeed", value: DEFAULTS.rotationSpeed },
      { id: "scene_a_wobble", value: DEFAULTS.sceneAWobble },
      { id: "scene_a_tint", value: DEFAULTS.sceneATint },
      { id: "scene_a_tint_lfo_depth", value: DEFAULTS.sceneATintLfoDepth },
    ];

    try {
      await Promise.all(
        defaults.map(({ id, value }) =>
          invoke("set_parameter", { id, value, app: undefined }),
        ),
      );

      setCrossfade(DEFAULTS.crossfade);
      setSceneABrightness(DEFAULTS.sceneABrightness);
      setRotationSpeed(DEFAULTS.rotationSpeed);
      setSceneAWobble(DEFAULTS.sceneAWobble);
      setSceneATint(DEFAULTS.sceneATint);
      setSceneATintLfoDepth(DEFAULTS.sceneATintLfoDepth);
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

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Scene control strip: top row, columns 1–4 */}
        <div className={styles.sceneControlStrip}>
          <div className={styles.panel}>
            <SceneControlStrip
              activeSceneId={activeSceneId}
              nextSceneId={nextSceneId}
              setActiveSceneId={setActiveSceneId}
              setNextSceneId={setNextSceneId}
              crossfade={crossfade}
              onCrossfadeChange={handleCrossfadeChange}
            />
          </div>
        </div>

        {/* Scene A column: columns 1–2, row 2 */}
        <div className={`${styles.sceneColumn} ${styles.sceneAColumn}`}>
          <section aria-label="Scene A controls" className={styles.panel}>
            <h2 className={styles.panelTitle}>Scene A</h2>
            <p className={styles.caption}>
              Per-scene parameters for Scene&nbsp;A beneath the scene control
              strip.
            </p>
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
          </section>
        </div>

        {/* Scene B column: columns 3–4, row 2 (placeholder) */}
        <div className={`${styles.sceneColumn} ${styles.sceneBColumn}`}>
          <section
            aria-label="Scene B controls placeholder"
            className={styles.panel}
          >
            <h2 className={styles.panelTitle}>Scene B</h2>
            <p className={styles.caption}>
              Placeholder for Scene&nbsp;B-specific controls beneath the scene
              control strip.
            </p>
          </section>
        </div>

        {/* Preview + Debug column: column 5, spans both rows */}
        <aside className={styles.previewColumn} aria-label="Preview and debug">
          <div className={styles.previewBlock}>
            <span>Renderer preview placeholder</span>
          </div>

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
