import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type SceneId } from "./scenes/sceneTypes";
import {
  type BackendParameter,
  useControlsParameters,
} from "./controls/controlsParameters.ts";
import PrimaryControlsPanel from "./controls/PrimaryControlsPanel";
import BackendInspector from "./controls/BackendInspector";
import SceneAControls from "./controls/SceneAControls";
import styles from "./AppShell.module.css";

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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      {
        id: "scene_a_tint_lfo_depth",
        value: DEFAULTS.sceneATintLfoDepth,
      },
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
      // eslint-disable-next-line no-console
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
          },
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[Controls] subscribe parameter_changed failed", error);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Top-row scene control / switching strip spanning columns 1–4 */}
        <div className={styles.sceneControlStrip}>
          <PrimaryControlsPanel
            activeSceneId={activeSceneId}
            nextSceneId={nextSceneId}
            setActiveSceneId={setActiveSceneId}
            setNextSceneId={setNextSceneId}
            crossfade={crossfade}
            handleCrossfadeChange={handleCrossfadeChange}
          />
        </div>

        {/* Scene A column (columns 1–2, row 2) – placeholder for future Scene A-specific controls */}
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

        {/* Scene B column (columns 3–4, row 2) – placeholder for future Scene B-specific controls */}
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

        {/* Preview + Debug/Parameters column (column 5 spans both rows) */}
        <aside className={styles.previewColumn} aria-label="Preview and debug">
          <div className={styles.previewBlock}>
            <span>Renderer preview placeholder</span>
          </div>

          <div className={styles.debugPanel}>
            <div className={styles.debugTabs}>
              <div
                className={`${styles.debugTab} ${styles.debugTabActive}`}
                aria-selected="true"
              >
                Parameters
              </div>
              <div className={styles.debugTab}>Logs</div>
              <div className={styles.debugTab}>Metrics</div>
            </div>

            <div className={styles.debugBody}>
              <BackendInspector
                backendParameters={backendParameters}
                isLoadingParams={isLoadingParams}
                paramError={paramError}
                onRefresh={() => {
                  void refreshBackendParameters();
                }}
                onResetDefaults={() => {
                  void handleResetDefaults();
                }}
                onClearParameters={() => {
                  void handleClearParameters();
                }}
              />
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
