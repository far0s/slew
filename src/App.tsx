import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { type SceneId } from "./scenes/sceneTypes";
import {
  type BackendParameter,
  useControlsParameters,
} from "./controls/controlsParameters.ts";
import ScenePairingHeader from "./controls/ScenePairingHeader";
import PrimaryControlsPanel from "./controls/PrimaryControlsPanel";
import BackendInspector from "./controls/BackendInspector";

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

  async function handleSceneABrightnessChange(next: number) {
    setSceneABrightness(next);
    try {
      await invoke("set_parameter", {
        id: "scene_a_brightness",
        value: next,
        app: undefined,
      });
      await invoke("forward_controls_event", {
        event: "scene_a_brightness",
        payload: JSON.stringify({ value: next }),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[Controls] Failed to update scene_a_brightness", error);
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

        <ScenePairingHeader
          activeSceneId={activeSceneId}
          nextSceneId={nextSceneId}
          setActiveSceneId={setActiveSceneId}
          setNextSceneId={setNextSceneId}
        />
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
        <PrimaryControlsPanel
          activeSceneId={activeSceneId}
          nextSceneId={nextSceneId}
          setScenePairingOnBackend={({ currentActive, currentNext }) => {
            void import("./controls/scenePairing").then(
              ({ setScenePairingOnBackend }) => {
                void setScenePairingOnBackend({
                  currentActive,
                  currentNext,
                  setActiveSceneId,
                  setNextSceneId,
                });
              },
            );
          }}
          crossfade={crossfade}
          sceneABrightness={sceneABrightness}
          rotationSpeed={rotationSpeed}
          sceneAWobble={sceneAWobble}
          sceneATint={sceneATint}
          sceneATintLfoDepth={sceneATintLfoDepth}
          setCrossfade={setCrossfade}
          setSceneABrightness={setSceneABrightness}
          setRotationSpeed={setRotationSpeed}
          setSceneAWobble={setSceneAWobble}
          setSceneATint={setSceneATint}
          setSceneATintLfoDepth={setSceneATintLfoDepth}
          handleCrossfadeChange={handleCrossfadeChange}
          handleSceneABrightnessChange={handleSceneABrightnessChange}
        />

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
      </main>
    </div>
  );
}

export default App;
