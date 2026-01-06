import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSlots } from "./slots/useSlots";
import {
  useParameterStore,
  buildSlotSceneParams,
  buildSlotSceneParamsInterpolated,
  type BackendParameter,
  type SlotConfig,
} from "./controls/useParameterStore";
import type { SketchId, SketchProps } from "./sketches";
import { getSketchDescriptor } from "./sketches";
import { makeSlotParameterId } from "./slots/slotTypes";
import { SlotsArea, RendererPreview, DebugPanel } from "./components";
import { useMacropad, DEFAULT_SENSITIVITY } from "./inputs/hid";
import { useAudioMappings } from "./inputs/audio";
import { useLfos, useModulationTargets } from "./inputs/modulation";
import {
  useMidiMappings,
  useMidiDevices,
  useMidiPickupStates,
} from "./inputs/midi";
import { useWindowManager } from "./hooks";
import styles from "./App.module.css";

function App() {
  // Slot state
  const slotState = useSlots({
    minSlots: 1,
    maxSlots: 8,
    initialSketches: ["blueCube"],
  });

  // Parameter store (replaces individual useState calls)
  const paramStore = useParameterStore();

  // Color palette store - stores colors per slot
  const [slotColors, setSlotColors] = useState<
    Map<
      number,
      {
        startColor?: [number, number, number];
        midColor?: [number, number, number];
        endColor?: [number, number, number];
        background?: [number, number, number, number];
      }
    >
  >(new Map());

  const [isInitialized, setIsInitialized] = useState(false);
  const hasHydratedRef = useRef(false);

  // Ref to access current paramStore in event callbacks
  const paramStoreRef = useRef(paramStore);
  useEffect(() => {
    paramStoreRef.current = paramStore;
  }, [paramStore]);

  // Audio mappings for parameter indicators
  const { mappings: audioMappings } = useAudioMappings();

  // MIDI mappings and device state (to disable direct input for MIDI-controlled parameters)
  const { mappings: midiMappings } = useMidiMappings();
  const { devices: midiDevices } = useMidiDevices();
  const { pickupStates: midiPickupStates } = useMidiPickupStates();

  // Check if any MIDI device is connected (for disabling direct input on mapped controls)
  const isMidiDeviceConnected = midiDevices.some((d) => d.is_connected);

  // Modulation state for parameter indicators
  const { lfos } = useLfos();
  const { targets: modulationTargets } = useModulationTargets();

  // Macropad selected slot (distinct from crossfade target)
  const [macropadSelectedIndex, setMacropadSelectedIndex] = useState<
    number | null
  >(null);

  // Window manager for heartbeat and recovery
  useWindowManager({
    windowLabel: "controls",
    enableHeartbeat: true,
    enableStatusPolling: false,
  });

  // Handle crossfade to a slot
  const handleCrossfade = useCallback(
    async (targetSlotIndex: number) => {
      if (targetSlotIndex === slotState.activeIndex) return;
      if (slotState.isCrossfading) return;

      // Start crossfade in slot state
      slotState.startCrossfade(targetSlotIndex);

      try {
        // CRITICAL: Set slot pairing BEFORE changing crossfade value
        // This ensures the Renderer knows which slots to show before the fade starts
        const targetSketchId = slotState.getSketchId(targetSlotIndex);
        const activeSketchId = slotState.getSketchId(slotState.activeIndex);
        if (targetSketchId && activeSketchId) {
          await invoke("set_slot_pairing", {
            activeSlotIndex: slotState.activeIndex,
            activeSceneId: activeSketchId,
            nextSlotIndex: targetSlotIndex,
            nextSceneId: targetSketchId,
          });
        }

        // Ensure target slot alpha is 1 so it fades in fully
        const targetAlphaId = makeSlotParameterId(targetSlotIndex, "alpha");
        await invoke("set_parameter", {
          id: targetAlphaId,
          value: 1,
          app: undefined,
        });
        paramStore.set(targetAlphaId, 1);

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
        slotState.cancelCrossfade();
      }
    },
    [slotState, paramStore],
  );

  // Track which sketchId each slot had to detect changes
  const prevSlotSketchIds = useRef<Map<number, string | null>>(new Map());

  // Initialize/reset colors when slots or their sketches change
  useEffect(() => {
    // Capture current sketch IDs for comparison BEFORE updating state
    const changes: Array<{
      slotIndex: number;
      sketchId: string;
      colorPalette: {
        startColor: [number, number, number];
        midColor: [number, number, number];
        endColor: [number, number, number];
        background: [number, number, number, number];
      };
    }> = [];
    const clears: number[] = [];

    slotState.slots.forEach((slot) => {
      const prevSketchId = prevSlotSketchIds.current.get(slot.index);
      const currentSketchId = slot.sketchId;

      // Reset colors if sketch changed (including from null to a sketch, or sketch to different sketch)
      if (currentSketchId && currentSketchId !== prevSketchId) {
        const descriptor = getSketchDescriptor(currentSketchId);
        if (descriptor?.colorPalette) {
          changes.push({
            slotIndex: slot.index,
            sketchId: currentSketchId,
            colorPalette: descriptor.colorPalette,
          });
        }
      } else if (!currentSketchId && prevSketchId) {
        // Clear colors when slot is cleared
        clears.push(slot.index);
      }
    });

    // Only update state if there are actual changes
    if (changes.length > 0 || clears.length > 0) {
      setSlotColors((prev) => {
        const next = new Map(prev);
        for (const change of changes) {
          next.set(change.slotIndex, {
            startColor: change.colorPalette.startColor,
            midColor: change.colorPalette.midColor,
            endColor: change.colorPalette.endColor,
            background: change.colorPalette.background,
          });
        }
        for (const slotIndex of clears) {
          next.delete(slotIndex);
        }
        return next;
      });
    }

    // Update tracking ref AFTER determining changes (outside of setState)
    slotState.slots.forEach((slot) => {
      prevSlotSketchIds.current.set(slot.index, slot.sketchId);
    });
  }, [slotState.slots]);

  // Listen for color changes from controls
  useEffect(() => {
    const handleColorChange = (event: Event) => {
      const customEvent = event as CustomEvent<{
        slotIndex: number;
        colorType: "startColor" | "midColor" | "endColor" | "background";
        color: [number, number, number] | [number, number, number, number];
      }>;

      const { slotIndex, colorType, color } = customEvent.detail;

      setSlotColors((prev) => {
        const next = new Map(prev);
        const current = next.get(slotIndex) || {};
        next.set(slotIndex, {
          ...current,
          [colorType]: color,
        });
        return next;
      });

      // Forward to renderer window
      invoke("forward_controls_event", {
        event: "sketch-color-changed",
        payload: JSON.stringify({
          slotIndex,
          colorType,
          color,
        }),
      }).catch((err) => {
        console.error("[Controls] Failed to forward color change:", err);
      });
    };

    window.addEventListener("sketch-color-changed", handleColorChange);
    return () => {
      window.removeEventListener("sketch-color-changed", handleColorChange);
    };
  }, []);

  // Get colors for a slot
  const getSlotColors = useCallback(
    (slotIndex: number): SketchProps["colors"] | undefined => {
      return slotColors.get(slotIndex);
    },
    [slotColors],
  );

  // Retrieve all parameters for the target scene (macropad-selected or active)
  // Sorted by orderHint for encoder mapping
  const getTargetSceneParameters = useCallback(() => {
    // Use macropad selection if available, otherwise use active slot
    const targetIndex = macropadSelectedIndex ?? slotState.activeIndex;
    const sketchId = slotState.getSketchId(targetIndex);
    if (!sketchId) return [];
    const descriptor = getSketchDescriptor(sketchId);
    if (!descriptor) return [];
    // Sort by orderHint (ascending) and include slot index for parameter ID generation
    return [...descriptor.parameters]
      .sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0))
      .map((template) => ({
        ...template,
        slotIndex: targetIndex,
        parameterId: makeSlotParameterId(targetIndex, template.templateId),
      }));
  }, [macropadSelectedIndex, slotState]);

  // Handle macropad slot selection
  const handleMacropadSlotSelect = useCallback(
    (slotIndex: number) => {
      // Only select if the slot exists
      if (slotIndex < slotState.slots.length) {
        setMacropadSelectedIndex(slotIndex);
      }
    },
    [slotState.slots.length],
  );

  // Handle macropad crossfade trigger
  const handleMacropadCrossfade = useCallback(() => {
    if (macropadSelectedIndex === null) return;
    if (macropadSelectedIndex === slotState.activeIndex) return;
    if (slotState.isCrossfading) return;

    // Trigger crossfade to the selected slot
    void handleCrossfade(macropadSelectedIndex);

    // Clear selection after triggering
    setMacropadSelectedIndex(null);
  }, [
    macropadSelectedIndex,
    slotState.activeIndex,
    slotState.isCrossfading,
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
      maxSlots: slotState.slots.length,
    },
  );

  // Handle slot sketch change
  async function handleSlotSketchChange(slotIndex: number, sketchId: SketchId) {
    // Update slot state
    const initParams = slotState.setSlotSketch(slotIndex, sketchId);
    if (!initParams) return;

    // Clear local parameters first, then reinitialize with new defaults
    paramStore.removeSlotParameters(slotIndex);
    paramStore.initializeSlotWithValues(slotIndex, initParams.parameters);

    // Reset parameters in backend (clears all slot params and reinitializes from sketch defaults)
    try {
      await invoke("reset_slot_parameters", {
        slotIndex,
        sketchId,
      });
    } catch (error) {
      console.error("[Controls] Failed to reset slot parameters", error);
    }

    // Update backend slot pairing if this affects the active/target pair
    try {
      const activeSketchId = slotState.isActiveSlot(slotIndex)
        ? sketchId
        : slotState.getSketchId(slotState.activeIndex);

      const targetSketchId = slotState.isCrossfadeTarget(slotIndex)
        ? sketchId
        : slotState.crossfadeTargetIndex !== null
          ? slotState.getSketchId(slotState.crossfadeTargetIndex)
          : null;

      if (activeSketchId) {
        await invoke("set_slot_pairing", {
          activeSlotIndex: slotState.activeIndex,
          activeSceneId: activeSketchId,
          nextSlotIndex:
            slotState.crossfadeTargetIndex ?? slotState.activeIndex,
          nextSceneId: targetSketchId ?? activeSketchId,
        });
      }
    } catch (error) {
      console.error("[Controls] Failed to update slot pairing", error);
    }
  }

  // Handle setting a sketch in a specific slot
  async function handleSetSketch(slotIndex: number, sketchId: SketchId) {
    const initParams = slotState.setSketch(slotIndex, sketchId);
    if (!initParams) return;

    const { parameters } = initParams;

    // Override alpha to 0 for newly filled slots (start hidden)
    const alphaParamId = makeSlotParameterId(slotIndex, "alpha");
    parameters.set(alphaParamId, 0);

    // Clear any stale parameters first, then initialize with new defaults
    paramStore.removeSlotParameters(slotIndex);
    paramStore.initializeSlotWithValues(slotIndex, parameters);

    // Reset parameters in backend (clears all slot params and reinitializes from sketch defaults)
    try {
      await invoke("reset_slot_parameters", {
        slotIndex,
        sketchId,
      });
      // Set alpha to 0 in backend (override the default of 1)
      await invoke("set_parameter", {
        id: alphaParamId,
        value: 0,
        app: undefined,
      });
    } catch (error) {
      console.error("[Controls] Failed to reset slot parameters", error);
    }
  }

  // Handle copying parameters from one slot to another
  async function handleCopyToSlot(
    sourceSlotIndex: number,
    targetSlotIndex: number,
  ) {
    const initParams = slotState.copyToSlot(
      sourceSlotIndex,
      targetSlotIndex,
      (id) => paramStore.get(id),
    );
    if (!initParams) return;

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

  // Handle clearing a slot (remove sketch, keep slot)
  function handleClearSlot(slotIndex: number) {
    slotState.clearSlot(slotIndex);
    // Note: We don't remove parameters from the backend (per user requirement)
    // but we do remove them from the local store for cleanliness
    paramStore.removeSlotParameters(slotIndex);
  }

  // Refresh backend parameters - wrapped in useCallback with proper dependencies
  const refreshBackendParameters = useCallback(async () => {
    paramStore.setIsLoading(true);
    paramStore.setError(null);
    try {
      // Get all backend parameters
      const response = (await invoke("get_parameters")) as BackendParameter[];

      // Build slot config from current slots (only filled slots)
      const slotConfig: SlotConfig[] = slotState.slots
        .filter((slot) => slot.sketchId !== null)
        .map((slot) => ({
          index: slot.index,
          sketchId: slot.sketchId as SketchId,
        }));

      // Update parameter store's slot configuration
      paramStore.setCurrentSlots(slotConfig);

      // Apply parameters to store
      paramStore.setBackendSnapshot(response);
      paramStore.applyBackendParams(response);

      // Initialize any missing slot parameters (only for filled slots)
      for (const slot of slotState.slots) {
        if (slot.sketchId !== null) {
          paramStore.initializeSlot(slot.index, slot.sketchId);
        }
      }
    } catch (error) {
      paramStore.setError("Failed to load parameters from backend");
      console.error("[Controls] get_parameters failed", error);
    } finally {
      paramStore.setIsLoading(false);
      setIsInitialized(true);
    }
  }, [slotState.slots, paramStore]);

  // Handle crossfade completion when value reaches endpoint
  useEffect(() => {
    const crossfade = paramStore.get("crossfade");

    if (slotState.crossfadeTargetIndex !== null) {
      slotState.setCrossfadeValue(crossfade);

      // Complete crossfade when we reach the target
      if (crossfade >= 0.99) {
        // Capture slot info BEFORE completing
        const oldActiveSlotIndex = slotState.activeIndex;
        const newActiveSlotIndex = slotState.crossfadeTargetIndex;
        const newActiveSketchId = slotState.getSketchId(newActiveSlotIndex);

        // Complete the crossfade in local state
        slotState.completeCrossfade();

        // Update Renderer and reset crossfade
        void (async () => {
          try {
            // CRITICAL: Tell Renderer the new active slot BEFORE resetting crossfade
            if (newActiveSketchId) {
              await invoke("set_slot_pairing", {
                activeSlotIndex: newActiveSlotIndex,
                activeSceneId: newActiveSketchId,
                nextSlotIndex: newActiveSlotIndex,
                nextSceneId: newActiveSketchId,
              });
            }

            // Set old active slot alpha to 0 (it faded out)
            const oldAlphaId = makeSlotParameterId(oldActiveSlotIndex, "alpha");
            await invoke("set_parameter", {
              id: oldAlphaId,
              value: 0,
              app: undefined,
            });
            paramStore.set(oldAlphaId, 0);

            // Ensure new active slot alpha is 1 (it faded in)
            const newAlphaId = makeSlotParameterId(newActiveSlotIndex, "alpha");
            await invoke("set_parameter", {
              id: newAlphaId,
              value: 1,
              app: undefined,
            });
            paramStore.set(newAlphaId, 1);

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
  }, [
    paramStore.get("crossfade"),
    slotState.crossfadeTargetIndex,
    slotState.activeIndex,
    paramStore,
  ]);

  // Sync initial slot pairing to Renderer on startup
  // Wait for hydration to complete before syncing
  useEffect(() => {
    if (!isInitialized) return;
    if (!slotState.isHydrated) return; // Don't sync until hydrated from backend

    const activeSketchId = slotState.getSketchId(slotState.activeIndex);
    if (activeSketchId) {
      void invoke("set_slot_pairing", {
        activeSlotIndex: slotState.activeIndex,
        activeSceneId: activeSketchId,
        nextSlotIndex: slotState.activeIndex,
        nextSceneId: activeSketchId,
      }).catch((error) => {
        console.error("[Controls] Failed to sync initial slot pairing", error);
      });
    }
  }, [isInitialized, slotState.isHydrated]);

  // Sync all slots to Renderer for multi-layer alpha rendering
  // Wait for both initialization AND hydration to complete before syncing
  useEffect(() => {
    if (!isInitialized) return;
    if (!slotState.isHydrated) return; // Don't sync until hydrated from backend

    // Only send slots that have a sketch loaded (non-null sketchId)
    const slots = slotState.slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({
        index: slot.index,
        sketch_id: slot.sketchId as SketchId,
      }));

    void invoke("set_all_slots", {
      slots,
      activeSlotIndex: slotState.activeIndex,
      crossfadeTargetIndex: slotState.crossfadeTargetIndex,
    }).catch((error) => {
      console.error("[Controls] Failed to sync all slots to renderer", error);
    });
  }, [
    isInitialized,
    slotState.isHydrated,
    slotState.slots,
    slotState.activeIndex,
    slotState.crossfadeTargetIndex,
  ]);

  // Initial parameter load (run once after slot hydration)
  useEffect(() => {
    if (!slotState.isHydrated) return;
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;
    void refreshBackendParameters();
  }, [slotState.isHydrated, refreshBackendParameters]);

  // Subscribe to parameter changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            const updated = event.payload;
            const store = paramStoreRef.current;

            store.setInterpolated(updated.id, updated.value);

            if (updated.id === "crossfade") {
              store.set("crossfade", updated.value);
            } else {
              store.setFromBackend(updated.id, updated.target);
            }

            const current = store.backendSnapshot ?? [];
            const index = current.findIndex((p) => p.id === updated.id);
            if (index === -1) {
              store.setBackendSnapshot([...current, updated]);
            } else {
              const next = current.slice();
              next[index] = updated;
              store.setBackendSnapshot(next);
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
  }, []);

  // Update slot configuration when slots change
  useEffect(() => {
    const slotConfig: SlotConfig[] = slotState.slots
      .filter((slot) => slot.sketchId !== null)
      .map((slot) => ({
        index: slot.index,
        sketchId: slot.sketchId as SketchId,
      }));
    paramStore.setCurrentSlots(slotConfig);
  }, [slotState.slots, paramStore.setCurrentSlots]);

  // Get scene params for a slot (target values for sliders)
  // paramStore functions are now stable (use refs internally)
  const getSlotSketchParams = useCallback(
    (slotIndex: number, sketchId: SketchId) =>
      buildSlotSceneParams(slotIndex, sketchId, paramStore),
    [paramStore],
  );

  // Get sketch params with interpolated values (for smooth preview rendering)
  const getSlotSketchParamsInterpolated = useCallback(
    (slotIndex: number, sketchId: SketchId) =>
      buildSlotSceneParamsInterpolated(slotIndex, sketchId, paramStore),
    [paramStore],
  );

  // Get/set parameter value wrappers
  // paramStore.get and paramStore.set are now stable functions
  const getValue = useCallback(
    (id: string) => paramStore.get(id),
    [paramStore.get],
  );

  const setValue = useCallback(
    (id: string, value: number) => {
      paramStore.set(id, value);
    },
    [paramStore.set],
  );

  // Get active slot info for preview
  const activeSlotIndex = slotState.activeIndex;

  return (
    <div className={styles.root}>
      <main className={styles.main}>
        {/* Scenes Area (4/5 width) */}
        <div className={styles.scenesArea}>
          <SlotsArea
            slots={slotState.slots}
            activeIndex={slotState.activeIndex}
            crossfadeTargetIndex={slotState.crossfadeTargetIndex}
            crossfadeValue={slotState.crossfadeValue}
            isCrossfading={slotState.isCrossfading}
            macropadSelectedIndex={macropadSelectedIndex}
            getValue={getValue}
            setValue={setValue}
            getSlotSketchParams={getSlotSketchParams}
            getSlotSketchParamsInterpolated={getSlotSketchParamsInterpolated}
            getSlotColors={getSlotColors}
            audioMappings={audioMappings}
            modulationTargets={modulationTargets}
            lfos={lfos}
            midiMappings={isMidiDeviceConnected ? midiMappings : undefined}
            midiPickupStates={
              isMidiDeviceConnected ? midiPickupStates : undefined
            }
            onSlotSketchChange={handleSlotSketchChange}
            onCrossfade={handleCrossfade}
            onClearSlot={handleClearSlot}
            onSetSketch={handleSetSketch}
            onCopyToSlot={handleCopyToSlot}
          />
        </div>

        {/* Sidebar (1/5 width) */}
        <aside className={styles.sidebar} aria-label="Preview and debug">
          <RendererPreview
            allSlots={slotState.slots
              .filter((slot) => slot.sketchId !== null)
              .map((slot) => ({
                index: slot.index,
                sketchId: slot.sketchId as SketchId,
              }))}
            activeSlotIndex={activeSlotIndex}
            crossfadeTargetIndex={slotState.crossfadeTargetIndex}
            getParam={(id) => paramStore.getInterpolated(id)}
            getSlotColors={getSlotColors}
          />
          <DebugPanel
            macropadSelectedIndex={macropadSelectedIndex}
            slots={slotState.slots}
            getValue={getValue}
            setValue={setValue}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
