import { useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSceneSlots } from "./scenes/useSceneSlots";
import {
  useParameterStore,
  buildSceneParams,
  type BackendParameter,
} from "./controls/useParameterStore";
import type { SceneId } from "./scenes/sceneTypes";
import {
  ScenesArea,
  RendererPreview,
  DebugPanel,
  type LogEntry,
  type DebugMetricsData,
} from "./components";
import styles from "./App.module.css";
import { useState } from "react";

/** Maximum number of log entries to keep in memory */
const MAX_LOG_ENTRIES = 100;

function App() {
  // Scene slots state
  const sceneSlots = useSceneSlots({
    minSlots: 1,
    maxSlots: 6,
    initialScenes: ["sceneA"],
  });

  // Parameter store (replaces individual useState calls)
  const paramStore = useParameterStore();

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

  // Handle crossfade to a slot
  async function handleCrossfade(targetSlotIndex: number) {
    if (targetSlotIndex === sceneSlots.activeIndex) return;
    if (sceneSlots.isCrossfading) return;

    // Start crossfade in slot state
    sceneSlots.startCrossfade(targetSlotIndex);

    // Set crossfade target to 1 (will transition from active to target)
    try {
      await invoke("set_parameter", {
        id: "crossfade",
        value: 1,
        app: undefined,
      });
      await invoke("forward_controls_event", {
        event: "crossfade",
        payload: JSON.stringify({ value: 1 }),
      });

      // Update scene pairing on backend
      const targetSceneId = sceneSlots.getSceneId(targetSlotIndex);
      const activeSceneId = sceneSlots.getSceneId(sceneSlots.activeIndex);
      if (targetSceneId && activeSceneId) {
        await invoke("set_scene_pairing", {
          activeSceneId,
          nextSceneId: targetSceneId,
        });
      }
    } catch (error) {
      console.error("[Controls] Failed to start crossfade", error);
      sceneSlots.cancelCrossfade();
    }
  }

  // Handle slot scene change
  async function handleSlotSceneChange(slotIndex: number, sceneId: SceneId) {
    sceneSlots.setSlotScene(slotIndex, sceneId);

    // Update backend if this affects the active/target pair
    try {
      const activeSceneId = sceneSlots.isActiveSlot(slotIndex)
        ? sceneId
        : sceneSlots.getSceneId(sceneSlots.activeIndex);

      const targetSceneId = sceneSlots.isCrossfadeTarget(slotIndex)
        ? sceneId
        : sceneSlots.crossfadeTargetIndex !== null
          ? sceneSlots.getSceneId(sceneSlots.crossfadeTargetIndex)
          : null;

      if (activeSceneId) {
        await invoke("set_scene_pairing", {
          activeSceneId,
          nextSceneId: targetSceneId ?? activeSceneId,
        });
      }
    } catch (error) {
      console.error("[Controls] Failed to update scene pairing", error);
    }
  }

  // Handle add slot
  function handleAddSlot() {
    sceneSlots.addSlot();
  }

  // Handle remove slot
  function handleRemoveSlot(slotIndex: number) {
    sceneSlots.removeSlot(slotIndex);
  }

  // Refresh backend parameters
  async function refreshBackendParameters() {
    paramStore.setIsLoading(true);
    paramStore.setError(null);
    try {
      const response = (await invoke("get_parameters")) as BackendParameter[];
      paramStore.setBackendSnapshot(response);
      paramStore.applyBackendParams(response);
    } catch (error) {
      paramStore.setError("Failed to load parameters from backend");
      console.error("[Controls] get_parameters failed", error);
    } finally {
      paramStore.setIsLoading(false);
    }
  }

  // Clear all parameters
  async function handleClearParameters() {
    paramStore.setError(null);
    try {
      await invoke("clear_parameters");
      paramStore.setBackendSnapshot([]);
      paramStore.resetAllToDefaults();
    } catch (error) {
      paramStore.setError("Failed to clear parameters in backend");
      console.error("[Controls] clear_parameters failed", error);
    }
  }

  // Reset parameters to defaults
  async function handleResetDefaults() {
    paramStore.setError(null);

    const defaults = paramStore.entries().map(([id, _]) => ({
      id,
      value: paramStore.getDefault(id),
    }));

    try {
      await Promise.all(
        defaults.map(({ id, value }) =>
          invoke("set_parameter", { id, value, app: undefined }),
        ),
      );
      paramStore.resetAllToDefaults();
    } catch (error) {
      paramStore.setError("Failed to reset parameters to defaults");
      console.error("[Controls] reset defaults failed", error);
    }
  }

  // Handle crossfade completion when value reaches endpoint
  useEffect(() => {
    const crossfade = paramStore.get("crossfade");

    if (sceneSlots.crossfadeTargetIndex !== null) {
      sceneSlots.setCrossfadeValue(crossfade);

      // Complete crossfade when we reach the target
      if (crossfade >= 0.99) {
        sceneSlots.completeCrossfade();
        // Reset crossfade to 0 for next transition
        void (async () => {
          try {
            await invoke("set_parameter", {
              id: "crossfade",
              value: 0,
              app: undefined,
            });
          } catch (error) {
            console.error("[Controls] Failed to reset crossfade", error);
          }
        })();
      }
    }
  }, [paramStore.get("crossfade"), sceneSlots.crossfadeTargetIndex]);

  // Initial load and event subscription
  useEffect(() => {
    void refreshBackendParameters();

    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            const updated = event.payload;
            paramStore.applyBackendParams([updated]);

            // Update backend snapshot
            const current = paramStore.backendSnapshot ?? [];
            const index = current.findIndex((p) => p.id === updated.id);
            if (index === -1) {
              paramStore.setBackendSnapshot([...current, updated]);
            } else {
              const next = current.slice();
              next[index] = updated;
              paramStore.setBackendSnapshot(next);
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

  // Get scene params for a scene ID
  const getSceneParams = useCallback(
    (sceneId: SceneId) => buildSceneParams(sceneId, paramStore),
    [paramStore],
  );

  // Get/set parameter value wrappers
  const getValue = useCallback(
    (id: string) =>
      paramStore.get(id as import("./scenes/sceneTypes").ParameterId),
    [paramStore],
  );

  const setValue = useCallback(
    (id: string, value: number) => {
      paramStore.set(id as import("./scenes/sceneTypes").ParameterId, value);
    },
    [paramStore],
  );

  // Get active and target scene IDs for preview
  const activeSceneId =
    sceneSlots.getSceneId(sceneSlots.activeIndex) ?? "sceneA";
  const targetSceneId =
    sceneSlots.crossfadeTargetIndex !== null
      ? (sceneSlots.getSceneId(sceneSlots.crossfadeTargetIndex) ??
        activeSceneId)
      : activeSceneId;

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Scenes Area (4/5 width) */}
        <div className={styles.scenesArea}>
          <ScenesArea
            slots={sceneSlots.slots}
            activeIndex={sceneSlots.activeIndex}
            crossfadeTargetIndex={sceneSlots.crossfadeTargetIndex}
            crossfadeValue={sceneSlots.crossfadeValue}
            isCrossfading={sceneSlots.isCrossfading}
            canAddSlot={sceneSlots.canAddSlot}
            canRemoveSlot={sceneSlots.canRemoveSlot}
            getValue={getValue}
            setValue={setValue}
            getSceneParams={getSceneParams}
            onSlotSceneChange={handleSlotSceneChange}
            onCrossfade={handleCrossfade}
            onRemoveSlot={handleRemoveSlot}
            onAddSlot={handleAddSlot}
          />
        </div>

        {/* Sidebar (1/5 width) */}
        <aside className={styles.sidebar} aria-label="Preview and debug">
          <RendererPreview
            activeSceneId={activeSceneId}
            nextSceneId={targetSceneId}
            crossfade={paramStore.get("crossfade")}
            activeSceneParams={getSceneParams(activeSceneId)}
            nextSceneParams={getSceneParams(targetSceneId)}
            sceneATintLfoDepth={paramStore.get("scene_a_tint_lfo_depth")}
          />
          <DebugPanel
            backendParameters={paramStore.backendSnapshot}
            isLoadingParams={paramStore.isLoading}
            paramError={paramStore.error}
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
