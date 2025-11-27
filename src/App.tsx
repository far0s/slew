import { useEffect, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSceneSlots } from "./scenes/useSceneSlots";
import {
  useParameterStore,
  buildSlotSceneParams,
  buildSlotSceneParamsInterpolated,
  type BackendParameter,
  type SlotConfig,
} from "./controls/useParameterStore";
import type { SceneId } from "./scenes/sceneTypes";
import { getSceneDescriptor, makeSlotParameterId } from "./scenes/sceneTypes";
import { ScenesArea, RendererPreview, DebugPanel } from "./components";
import { useMacropad, DEFAULT_SENSITIVITY } from "./inputs/hid";
import { useAudioMappings } from "./inputs/audio";
import { useLfos, useModulationTargets } from "./inputs/modulation";
import { useStatsToggle } from "./hooks";
import styles from "./App.module.css";

function App() {
  // Scene slots state
  const sceneSlots = useSceneSlots({
    minSlots: 1,
    maxSlots: 6,
    initialScenes: ["sceneA"],
  });

  // Parameter store (replaces individual useState calls)
  const paramStore = useParameterStore();

  // Track whether initial migration/hydration has happened
  const [isInitialized, setIsInitialized] = useState(false);

  // Audio mappings for parameter indicators
  const { mappings: audioMappings } = useAudioMappings();

  // Modulation state for parameter indicators
  const { lfos } = useLfos();
  const { targets: modulationTargets } = useModulationTargets();

  // Macropad selected slot (distinct from crossfade target)
  const [macropadSelectedIndex, setMacropadSelectedIndex] = useState<
    number | null
  >(null);

  // Stats toggle (press "D" to show/hide performance stats)
  const { showStats } = useStatsToggle();

  // Handle crossfade to a slot
  const handleCrossfade = useCallback(
    async (targetSlotIndex: number) => {
      if (targetSlotIndex === sceneSlots.activeIndex) return;
      if (sceneSlots.isCrossfading) return;

      // Start crossfade in slot state
      sceneSlots.startCrossfade(targetSlotIndex);

      try {
        // CRITICAL: Set slot pairing BEFORE changing crossfade value
        // This ensures the Renderer knows which slots to show before the fade starts
        const targetSceneId = sceneSlots.getSceneId(targetSlotIndex);
        const activeSceneId = sceneSlots.getSceneId(sceneSlots.activeIndex);
        if (targetSceneId && activeSceneId) {
          await invoke("set_slot_pairing", {
            activeSlotIndex: sceneSlots.activeIndex,
            activeSceneId,
            nextSlotIndex: targetSlotIndex,
            nextSceneId: targetSceneId,
          });
        }

        // Now set crossfade target to 1 (will transition from active to target)
        await invoke("set_parameter", {
          id: "crossfade",
          value: 1,
          app: undefined,
        });
        await invoke("forward_controls_event", {
          event: "crossfade",
          payload: JSON.stringify({ value: 1 }),
        });
      } catch (error) {
        console.error("[Controls] Failed to start crossfade", error);
        sceneSlots.cancelCrossfade();
      }
    },
    [sceneSlots],
  );

  // Get parameters for the target scene (macropad-selected or active slot)
  // Sorted by orderHint for encoder mapping
  const getTargetSceneParameters = useCallback(() => {
    // Use macropad selection if available, otherwise use active slot
    const targetIndex = macropadSelectedIndex ?? sceneSlots.activeIndex;
    const sceneId = sceneSlots.getSceneId(targetIndex);
    if (!sceneId) return [];
    const descriptor = getSceneDescriptor(sceneId);
    if (!descriptor) return [];
    // Sort by orderHint (ascending) and include slot index for parameter ID generation
    return [...descriptor.parameters]
      .sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0))
      .map((template) => ({
        ...template,
        slotIndex: targetIndex,
        parameterId: makeSlotParameterId(targetIndex, template.templateId),
      }));
  }, [macropadSelectedIndex, sceneSlots]);

  // Handle macropad slot selection
  const handleMacropadSlotSelect = useCallback(
    (slotIndex: number) => {
      // Only select if the slot exists
      if (slotIndex < sceneSlots.slots.length) {
        setMacropadSelectedIndex(slotIndex);
      }
    },
    [sceneSlots.slots.length],
  );

  // Handle macropad crossfade trigger
  const handleMacropadCrossfade = useCallback(() => {
    if (macropadSelectedIndex === null) return;
    if (macropadSelectedIndex === sceneSlots.activeIndex) return;
    if (sceneSlots.isCrossfading) return;

    // Trigger crossfade to the selected slot
    void handleCrossfade(macropadSelectedIndex);

    // Clear selection after triggering
    setMacropadSelectedIndex(null);
  }, [
    macropadSelectedIndex,
    sceneSlots.activeIndex,
    sceneSlots.isCrossfading,
    handleCrossfade,
  ]);

  // Handle macropad encoder change
  // Routes to macropad-selected scene, or active scene if none selected
  const handleMacropadEncoder = useCallback(
    (encoderIndex: number, delta: number) => {
      const params = getTargetSceneParameters();
      if (encoderIndex >= params.length) return;

      const param = params[encoderIndex];
      const currentValue = paramStore.get(param.parameterId);

      // Use the larger of: sensitivity-based change OR one step
      // This ensures parameters with large step sizes (like rotationSpeed: 0.05)
      // still respond to encoder input (sensitivity: 0.02)
      const sensitivityChange = Math.abs(delta) * DEFAULT_SENSITIVITY;
      const stepChange = param.step;
      const actualChange =
        Math.max(sensitivityChange, stepChange) * Math.sign(delta);

      const newValue = Math.max(
        param.min,
        Math.min(param.max, currentValue + actualChange),
      );

      // Round to step
      const stepped = Math.round(newValue / param.step) * param.step;

      // Skip if value hasn't actually changed (can happen at min/max bounds)
      if (stepped === currentValue) return;

      // Update local state immediately for responsive UI
      paramStore.set(param.parameterId, stepped);

      // Send to backend so Renderer receives the update via parameter_changed event
      void invoke("set_parameter", {
        id: param.parameterId,
        value: stepped,
        app: undefined,
      }).catch((error) => {
        console.error(`[Macropad] Failed to set ${param.parameterId}:`, error);
      });
    },
    [getTargetSceneParameters, paramStore],
  );

  // Use macropad hook for HID integration
  // Note: We don't use the returned state directly, but the hook sets up
  // event listeners that call our callbacks
  useMacropad(
    {
      onSlotSelect: handleMacropadSlotSelect,
      onCrossfade: handleMacropadCrossfade,
      onEncoderChange: handleMacropadEncoder,
    },
    {
      maxSlots: sceneSlots.slots.length,
    },
  );

  // Handle slot scene change
  async function handleSlotSceneChange(slotIndex: number, sceneId: SceneId) {
    // This will return parameters to initialize
    const initParams = sceneSlots.setSlotScene(slotIndex, sceneId);

    if (initParams) {
      // Initialize the new parameters in the store
      paramStore.initializeSlotWithValues(slotIndex, initParams.parameters);

      // Also initialize in the backend
      try {
        await invoke("initialize_slot_parameters", {
          slotIndex,
          sceneId,
        });
      } catch (error) {
        console.error("[Controls] Failed to initialize slot parameters", error);
      }
    }

    // Update backend slot pairing if this affects the active/target pair
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
        await invoke("set_slot_pairing", {
          activeSlotIndex: sceneSlots.activeIndex,
          activeSceneId,
          nextSlotIndex:
            sceneSlots.crossfadeTargetIndex ?? sceneSlots.activeIndex,
          nextSceneId: targetSceneId ?? activeSceneId,
        });
      }
    } catch (error) {
      console.error("[Controls] Failed to update slot pairing", error);
    }
  }

  // Handle add slot with defaults
  async function handleAddSlot(sceneId?: SceneId) {
    const initParams = sceneSlots.addSlot(sceneId);
    if (!initParams) return;

    // Use the returned slotIndex (state hasn't updated yet)
    const { slotIndex, sceneId: newSceneId, parameters } = initParams;

    // Initialize parameters in the store
    paramStore.initializeSlotWithValues(slotIndex, parameters);

    // Initialize in the backend
    try {
      await invoke("initialize_slot_parameters", {
        slotIndex,
        sceneId: newSceneId,
      });
    } catch (error) {
      console.error("[Controls] Failed to initialize slot parameters", error);
    }
  }

  // Handle copy slot (add new slot with copied parameters)
  async function handleCopySlot(sourceSlotIndex: number) {
    const initParams = sceneSlots.addSlotWithCopy(sourceSlotIndex, (id) =>
      paramStore.get(id),
    );
    if (!initParams) return;

    // Use the returned slotIndex (state hasn't updated yet)
    const { slotIndex, parameters } = initParams;

    // Initialize parameters in the store with copied values
    paramStore.initializeSlotWithValues(slotIndex, parameters);

    // Send copied values to backend
    try {
      for (const [paramId, value] of parameters) {
        await invoke("set_parameter", {
          id: paramId,
          value,
          app: undefined,
        });
      }
    } catch (error) {
      console.error(
        "[Controls] Failed to copy slot parameters to backend",
        error,
      );
    }
  }

  // Handle remove slot
  function handleRemoveSlot(slotIndex: number) {
    sceneSlots.removeSlot(slotIndex);
    // Note: We don't remove parameters from the backend (per user requirement)
    // but we do remove them from the local store for cleanliness
    paramStore.removeSlotParameters(slotIndex);
  }

  // Refresh backend parameters and migrate legacy IDs
  async function refreshBackendParameters() {
    paramStore.setIsLoading(true);
    paramStore.setError(null);
    try {
      // Get all backend parameters
      const response = (await invoke("get_parameters")) as BackendParameter[];

      // Build slot config for migration
      const slotConfig: SlotConfig[] = sceneSlots.slots.map((slot) => ({
        index: slot.index,
        sceneId: slot.sceneId,
      }));

      // Update parameter store's slot configuration
      paramStore.setCurrentSlots(slotConfig);

      // Migrate legacy parameters if needed
      const migratedParams = paramStore.migrateBackendParams(
        response,
        slotConfig,
      );

      // Also trigger backend migration
      await invoke("migrate_parameters", {
        slots: slotConfig.map((s) => ({ index: s.index, sceneId: s.sceneId })),
      });

      // Apply migrated parameters to store
      paramStore.setBackendSnapshot(migratedParams);
      paramStore.applyBackendParams(migratedParams);

      // Initialize any missing slot parameters
      for (const slot of sceneSlots.slots) {
        paramStore.initializeSlot(slot.index, slot.sceneId);
      }
    } catch (error) {
      paramStore.setError("Failed to load parameters from backend");
      console.error("[Controls] get_parameters failed", error);
    } finally {
      paramStore.setIsLoading(false);
      setIsInitialized(true);
    }
  }

  // Handle crossfade completion when value reaches endpoint
  useEffect(() => {
    const crossfade = paramStore.get("crossfade");

    if (sceneSlots.crossfadeTargetIndex !== null) {
      sceneSlots.setCrossfadeValue(crossfade);

      // Complete crossfade when we reach the target
      if (crossfade >= 0.99) {
        // Capture the new active slot info BEFORE completing (target becomes active)
        const newActiveSlotIndex = sceneSlots.crossfadeTargetIndex;
        const newActiveSceneId = sceneSlots.getSceneId(newActiveSlotIndex);

        // Complete the crossfade in local state
        sceneSlots.completeCrossfade();

        // Update Renderer and reset crossfade
        void (async () => {
          try {
            // CRITICAL: Tell Renderer the new active slot BEFORE resetting crossfade
            if (newActiveSceneId) {
              await invoke("set_slot_pairing", {
                activeSlotIndex: newActiveSlotIndex,
                activeSceneId: newActiveSceneId,
                nextSlotIndex: newActiveSlotIndex,
                nextSceneId: newActiveSceneId,
              });
            }

            // Now reset crossfade to 0 for next transition
            await invoke("set_parameter", {
              id: "crossfade",
              value: 0,
              app: undefined,
            });
          } catch (error) {
            console.error("[Controls] Failed to complete crossfade", error);
          }
        })();
      }
    }
  }, [paramStore.get("crossfade"), sceneSlots.crossfadeTargetIndex]);

  // Sync initial slot pairing to Renderer on startup
  useEffect(() => {
    if (!isInitialized) return;

    const activeSceneId = sceneSlots.getSceneId(sceneSlots.activeIndex);
    if (activeSceneId) {
      void invoke("set_slot_pairing", {
        activeSlotIndex: sceneSlots.activeIndex,
        activeSceneId,
        nextSlotIndex: sceneSlots.activeIndex,
        nextSceneId: activeSceneId,
      }).catch((error) => {
        console.error("[Controls] Failed to sync initial slot pairing", error);
      });
    }
  }, [isInitialized]);

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

            // Always update interpolated values with the smooth backend value
            // This is what the Renderer uses, so previews will match
            paramStore.setInterpolated(updated.id, updated.value);

            // For crossfade, use interpolated value (smooth animation)
            // For other parameters, use target (immediate response to user input)
            if (updated.id === "crossfade") {
              // Use value for smooth crossfade animation in UI
              paramStore.set("crossfade", updated.value);
            } else {
              // Use target for immediate response to user input (for sliders)
              paramStore.applyBackendParams([updated]);
            }

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

  // Update slot configuration when slots change
  useEffect(() => {
    const slotConfig: SlotConfig[] = sceneSlots.slots.map((slot) => ({
      index: slot.index,
      sceneId: slot.sceneId,
    }));
    paramStore.setCurrentSlots(slotConfig);
  }, [sceneSlots.slots, paramStore.setCurrentSlots]);

  // Get scene params for a slot (target values for sliders)
  const getSlotSceneParams = useCallback(
    (slotIndex: number, sceneId: SceneId) =>
      buildSlotSceneParams(slotIndex, sceneId, paramStore),
    [paramStore],
  );

  // Get scene params with interpolated values (for smooth preview rendering)
  const getSlotSceneParamsInterpolated = useCallback(
    (slotIndex: number, sceneId: SceneId) =>
      buildSlotSceneParamsInterpolated(slotIndex, sceneId, paramStore),
    [paramStore],
  );

  // Get/set parameter value wrappers
  const getValue = useCallback(
    (id: string) => paramStore.get(id),
    [paramStore],
  );

  const setValue = useCallback(
    (id: string, value: number) => {
      paramStore.set(id, value);
    },
    [paramStore],
  );

  // Get active and target slot info for preview
  const activeSlotIndex = sceneSlots.activeIndex;
  const activeSceneId = sceneSlots.getSceneId(activeSlotIndex) ?? "sceneA";
  const targetSlotIndex = sceneSlots.crossfadeTargetIndex ?? activeSlotIndex;
  const targetSceneId = sceneSlots.getSceneId(targetSlotIndex) ?? activeSceneId;

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
            macropadSelectedIndex={macropadSelectedIndex}
            canAddSlot={sceneSlots.canAddSlot}
            canRemoveSlot={sceneSlots.canRemoveSlot}
            getValue={getValue}
            setValue={setValue}
            getSlotSceneParams={getSlotSceneParams}
            getSlotSceneParamsInterpolated={getSlotSceneParamsInterpolated}
            audioMappings={audioMappings}
            modulationTargets={modulationTargets}
            lfos={lfos}
            onSlotSceneChange={handleSlotSceneChange}
            onCrossfade={handleCrossfade}
            onRemoveSlot={handleRemoveSlot}
            onAddSlot={handleAddSlot}
            onCopySlot={handleCopySlot}
          />
        </div>

        {/* Sidebar (1/5 width) */}
        <aside className={styles.sidebar} aria-label="Preview and debug">
          <RendererPreview
            activeSceneId={activeSceneId}
            nextSceneId={targetSceneId}
            crossfade={paramStore.getInterpolated("crossfade")}
            activeSceneParams={getSlotSceneParamsInterpolated(
              activeSlotIndex,
              activeSceneId,
            )}
            nextSceneParams={getSlotSceneParamsInterpolated(
              targetSlotIndex,
              targetSceneId,
            )}
            sceneATintLfoDepth={paramStore.getInterpolated(
              makeSlotParameterId(activeSlotIndex, "tint_lfo_depth"),
            )}
            showStats={showStats}
          />
          <DebugPanel macropadSelectedIndex={macropadSelectedIndex} />
        </aside>
      </main>
    </div>
  );
}

export default App;
