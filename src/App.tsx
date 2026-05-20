import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logger } from "./lib/logger";
import { LayoutGroup, motion } from "motion/react";
import { useSlots } from "./slots/useSlots";
import {
  useParameterStore,
  buildSlotSceneParams,
  buildSlotSceneParamsInterpolated,
  type BackendParameter,
  type SlotConfig,
} from "./hooks/useParameterStore";
import type { SketchId, SketchProps } from "./sketches";
import { getSketchDescriptor } from "./sketches";
import { makeSlotParameterId, buildSlotDefaultParameters, getParameterDropdownLabel, type ParameterId } from "./slots/slotTypes";
import { SlotsArea, RendererPreview, Sidebar, UpdateBanner } from "./components";
import { ToolbarUndoRedo, ToolbarTapBpm, PerformanceChip, ToolbarShortcutsButton } from "./components/Toolbar";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";

import { AudioIndicator } from "./components/AudioIndicator";
import { useUndoHistory, applyUndo, applyRedo } from "./hooks/useUndoHistory";
import { useMacropad, DEFAULT_SENSITIVITY } from "./inputs/hid";
import { useAudioMappings, generateMappingId, type AudioMapping } from "./inputs/audio";
import { useLfos, useModulationTargets, createLfo, createTarget } from "./inputs/modulation";
import {
  globalTapTempo,
  matchesTapShortcut,
} from "./inputs/tapTempo";
import {
  useMidiMappings,
  useMidiDevices,
  useMidiPickupStates,
  useMidiLearn,
  cancelMidiLearn,
} from "./inputs/midi";
import {
  useWindowManager,
  useLayoutPreferences,
  useRendererSettings,
  usePerformanceMonitor,
} from "./hooks";
import { useUpdater } from "./hooks/useUpdater";
import { useEventListener } from "./inputs/shared";
import type { BpmSourceChangedEvent } from "./inputs/bpmSource";
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
  const { mappings: audioMappings, add: addAudioMapping, remove: removeAudioMapping } = useAudioMappings();

  // MIDI mappings and device state (to disable direct input for MIDI-controlled parameters)
  const { mappings: midiMappings } = useMidiMappings();
  const { devices: midiDevices } = useMidiDevices();
  const { pickupStates: midiPickupStates } = useMidiPickupStates();
  const { isLearning: isMidiLearning, learningParameterId: midiLearningParameterId, cancelLearn: cancelMidiLearnLocal } = useMidiLearn();

  // Check if any MIDI device is connected (for disabling direct input on mapped controls)
  const isMidiDeviceConnected = midiDevices.some((d) => d.is_connected);

  // Modulation state for parameter indicators
  const { lfos, add: addLfo } = useLfos();
  const { targets: modulationTargets, add: addModulationTarget, remove: removeModulationTarget } = useModulationTargets();

  // Renderer settings (for aspect ratio sync)
  const { info: rendererInfo } = useRendererSettings();
  const performanceStats = usePerformanceMonitor();

  // Calculate aspect ratio from renderer window dimensions
  const rendererAspectRatio =
    rendererInfo &&
    rendererInfo.windowWidth > 0 &&
    rendererInfo.windowHeight > 0
      ? rendererInfo.windowWidth / rendererInfo.windowHeight
      : 16 / 9; // Default to 16:9

  // Macropad selected slot (distinct from crossfade target)
  const [macropadSelectedIndex, setMacropadSelectedIndex] = useState<
    number | null
  >(null);

  const undoHistory = useUndoHistory();

  // Window manager for heartbeat and recovery
  const { toggleFullscreenControls } = useWindowManager({
    windowLabel: "controls",
    enableHeartbeat: true,
    enableStatusPolling: false,
  });

  const handleUndo = useCallback(() => {
    const entry = applyUndo();
    if (entry) {
      paramStore.set(entry.id, entry.value);
      void invoke("set_parameter", { id: entry.id, value: entry.value, app: undefined });
    }
  }, [paramStore]);

  const handleRedo = useCallback(() => {
    const entry = applyRedo();
    if (entry) {
      paramStore.set(entry.id, entry.value);
      void invoke("set_parameter", { id: entry.id, value: entry.value, app: undefined });
    }
  }, [paramStore]);

  // Cancel MIDI learn when the controls window is closed/reloaded
  useEffect(() => {
    const handleBeforeUnload = () => {
      void cancelMidiLearn();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape — cancel MIDI learn if active
      if (e.key === "Escape" && isMidiLearning) {
        e.preventDefault();
        void cancelMidiLearnLocal();
      }
      // Tap Tempo — configurable shortcut (default: Space)
      if (
        matchesTapShortcut(e) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        globalTapTempo();
      }
      // Cmd+Shift+F (macOS) or Ctrl+Shift+F (Windows/Linux) - Toggle fullscreen
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        toggleFullscreenControls();
      }
      // Cmd+Z / Ctrl+Z — undo
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      }
      // Cmd+Shift+Z / Ctrl+Shift+Z — redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFullscreenControls, handleUndo, handleRedo, isMidiLearning, cancelMidiLearnLocal]);

  // Quick-wire handlers for Beat and LFO buttons on parameter sliders
  const handleQuickBeat = useCallback(
    async (parameterId: string, paramMax: number) => {
      const mapping: AudioMapping = {
        id: generateMappingId(),
        source: "beat",
        parameter_id: parameterId,
        min_input: 0,
        max_input: 1,
        min_output: 0,
        max_output: paramMax,
        mode: "trigger",
        smoothing: 0,
        enabled: true,
      };
      await addAudioMapping(mapping);
    },
    [addAudioMapping],
  );

  const handleQuickLfo = useCallback(
    async (parameterId: string, paramMin: number, paramMax: number) => {
      const lfoName = getParameterDropdownLabel(parameterId as ParameterId);
      const lfo = createLfo({ name: lfoName });
      const savedLfo = await addLfo(lfo);
      // Depth = 25% of the parameter's native range so the oscillation stays
      // within a comfortable swing without clipping.
      const depth = 0.25 * (paramMax - paramMin);
      const target = createTarget(savedLfo.id, parameterId, {
        depth,
        bipolar: true,
      });
      await addModulationTarget(target);
    },
    [addLfo, addModulationTarget],
  );

  const handleUnlinkBeat = useCallback(
    async (parameterId: string) => {
      const mapping = audioMappings.find((m) => m.parameter_id === parameterId);
      if (mapping) await removeAudioMapping(mapping.id);
    },
    [audioMappings, removeAudioMapping],
  );

  const handleUnlinkLfo = useCallback(
    async (parameterId: string) => {
      const targets = modulationTargets.filter(
        (t) => t.parameter_id === parameterId,
      );
      await Promise.all(targets.map((t) => removeModulationTarget(t.id)));
    },
    [modulationTargets, removeModulationTarget],
  );

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
        logger.error("Controls", "Failed to start crossfade", error);
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
        logger.error("Controls", "Failed to forward color change:", err);
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
        logger.error("Macropad", `Failed to set ${param.parameterId}:`, error);
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
      // Push color sub-params (backend doesn't know about these)
      for (const [id, value] of initParams.parameters) {
        if (/color_[a-z_]+_[rgb]$/.test(String(id))) {
          await invoke("set_parameter", { id, value, app: undefined });
        }
      }
    } catch (error) {
      logger.error("Controls", "Failed to reset slot parameters", error);
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
      logger.error("Controls", "Failed to update slot pairing", error);
    }
  }

  // Handle setting a sketch in a specific slot
  async function handleSetSketch(slotIndex: number, sketchId: SketchId) {
    const alphaParamId = makeSlotParameterId(slotIndex, "alpha");

    // Reset backend parameters FIRST (with alpha=0), before updating React slot state.
    // This ensures that by the time the slots useEffect fires set_all_slots and the
    // renderer learns about the new slot, alpha=0 is already in the backend param store.
    // Without this ordering, there's a flash frame where the sketch renders at alpha=1.
    try {
      await invoke("reset_slot_parameters", {
        slotIndex,
        sketchId,
        initialAlpha: 0,
      });
    } catch (error) {
      logger.error("Controls", "Failed to reset slot parameters", error);
      return;
    }

    const initParams = slotState.setSketch(slotIndex, sketchId);
    if (!initParams) return;

    const { parameters } = initParams;

    // Override alpha to 0 for newly filled slots (start hidden)
    parameters.set(alphaParamId, 0);

    // Clear any stale parameters first, then initialize with new defaults
    paramStore.removeSlotParameters(slotIndex);
    paramStore.initializeSlotWithValues(slotIndex, parameters);

    // Push color sub-params (backend doesn't know about these)
    try {
      for (const [id, value] of parameters) {
        if (/color_[a-z_]+_[rgb]$/.test(String(id))) {
          await invoke("set_parameter", { id, value, app: undefined });
        }
      }
    } catch (error) {
      logger.error("Controls", "Failed to push color sub-params", error);
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
      logger.error(
        "Controls",
        "Failed to copy slot parameters to backend",
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
    // If MIDI learn is active for a parameter in this slot, cancel it
    if (isMidiLearning && midiLearningParameterId?.startsWith(`slot${slotIndex}_`)) {
      void cancelMidiLearnLocal();
    }
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
      // Also push color sub-params to backend so the renderer window gets them
      // (backend doesn't auto-create color sub-params since they're new)
      const backendParamIds = new Set(response.map((p) => p.id));
      for (const slot of slotState.slots) {
        if (slot.sketchId !== null) {
          paramStore.initializeSlot(slot.index, slot.sketchId);
          // Push any color sub-params that aren't in the backend yet
          const defaults = buildSlotDefaultParameters(slot.index, slot.sketchId);
          for (const [id, value] of defaults) {
            if (/color_[a-z_]+_[rgb]$/.test(String(id)) && !backendParamIds.has(String(id))) {
              await invoke("set_parameter", { id, value, app: undefined });
            }
          }
        }
      }
    } catch (error) {
      paramStore.setError("Failed to load parameters from backend");
      logger.error("Controls", "get_parameters failed", error);
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

        // Update Renderer and reset crossfade.
        // IMPORTANT: completeCrossfade() is called INSIDE the async block, after alpha=0
        // is confirmed in the backend. Calling it earlier would update slotState, triggering
        // the set_all_slots useEffect which sends crossfade_target_index=null to the renderer
        // before alpha=0 has landed — causing the old slot to flash at full alpha.
        void (async () => {
          try {
            // Set old active slot alpha to 0 FIRST, before set_slot_pairing.
            // The renderer clears crossfadeTargetIndex when it receives slot_pairing_changed,
            // after which the old slot renders at plain alpha. By sending alpha=0 first,
            // the parameter_changed event arrives in the renderer before slot_pairing_changed,
            // so the old slot is already invisible when crossfadeTargetIndex clears.
            const oldAlphaId = makeSlotParameterId(oldActiveSlotIndex, "alpha");
            await invoke("set_parameter", {
              id: oldAlphaId,
              value: 0,
              app: undefined,
            });
            paramStore.set(oldAlphaId, 0);

            // Reset crossfade to 0 locally NOW so the renderer never sees the
            // combination of (target=null, crossfade≈1) which causes both slots
            // to render at plain alpha simultaneously.
            paramStore.set("crossfade", 0);
            await invoke("set_parameter", {
              id: "crossfade",
              value: 0,
              app: undefined,
            });

            // NOW complete the crossfade in local state.
            // This triggers the set_all_slots useEffect, but by this point alpha=0
            // is already in the backend, so the renderer will see it correctly.
            slotState.completeCrossfade();

            // NOW tell the renderer the new active slot (clears crossfadeTargetIndex)
            if (newActiveSketchId) {
              await invoke("set_slot_pairing", {
                activeSlotIndex: newActiveSlotIndex,
                activeSceneId: newActiveSketchId,
                nextSlotIndex: newActiveSlotIndex,
                nextSceneId: newActiveSketchId,
              });
            }

            // Ensure new active slot alpha is 1 (it faded in)
            const newAlphaId = makeSlotParameterId(newActiveSlotIndex, "alpha");
            await invoke("set_parameter", {
              id: newAlphaId,
              value: 1,
              app: undefined,
            });
            paramStore.set(newAlphaId, 1);
          } catch (error) {
            logger.error("Controls", "Failed to complete crossfade", error);
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
        logger.error("Controls", "Failed to sync initial slot pairing", error);
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
      logger.error("Controls", "Failed to sync all slots to renderer", error);
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
        logger.error("Controls", "subscribe parameter_changed failed", error);
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

  // Highlighted parameter IDs for modulation editing
  const [highlightedParamIds, setHighlightedParamIds] = useState<Set<string>>(new Set());

  // Get active slot info for preview
  const activeSlotIndex = slotState.activeIndex;

  // Layout preferences for sidebar position
  const { sidebarPosition } = useLayoutPreferences();
  const { state: updateState, installUpdate, dismiss: dismissUpdate } = useUpdater();

  // Show a one-time toast when OSC takes over as the BPM source for the first time
  const oscToastShownRef = useRef(false);
  const [showOscBeatToast, setShowOscBeatToast] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  useEventListener<BpmSourceChangedEvent>("bpm_source_changed", (event) => {
    if (event.source === "osc" && !oscToastShownRef.current) {
      oscToastShownRef.current = true;
      setShowOscBeatToast(true);
    }
  });

  // Show a one-time toast when OSC takes over as the BPM source for the first time
  return (
    <div className={styles.root}>
      <UpdateBanner state={updateState} onInstall={installUpdate} onClose={dismissUpdate} />
      <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      {showOscBeatToast && (
        <div className={styles.oscBeatToast} role="status">
          <span className={styles.oscBeatToastBadge}>OSC</span>
          <span className={styles.oscBeatToastMessage}>Beat clock connected — BPM now driven by OSC</span>
          <button
            className={styles.oscBeatToastDismiss}
            onClick={() => setShowOscBeatToast(false)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className={styles.toolbar}>
        <ToolbarUndoRedo
          canUndo={undoHistory.canUndo}
          canRedo={undoHistory.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          isMidiLearning={isMidiLearning}
          onCancelMidiLearn={() => void cancelMidiLearnLocal()}
        />

        <div className={styles.toolbarSpacer} />

        {/* Performance chip — Controls rAF FPS, JS heap, Renderer FPS */}
        <PerformanceChip
          controls={performanceStats}
          rendererFps={rendererInfo?.stats?.fps ?? null}
          rendererFrameTimeMs={rendererInfo?.stats?.frameTimeMs ?? null}
        />

        {/* Tap BPM */}
        <AudioIndicator />
        <ToolbarTapBpm />
        <ToolbarShortcutsButton onOpen={() => setShowShortcuts(true)} />
      </div>
      <LayoutGroup>
        <main className={styles.main}>
          {/* Scenes Area (4/5 width) */}
          <motion.div
            className={styles.scenesArea}
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={{ order: sidebarPosition === "left" ? 2 : 1 }}
          >
            <SlotsArea
              slots={slotState.slots}
              activeIndex={slotState.activeIndex}
              crossfadeTargetIndex={slotState.crossfadeTargetIndex}
              crossfadeValue={slotState.crossfadeValue}
              isCrossfading={slotState.isCrossfading}
              macropadSelectedIndex={macropadSelectedIndex}
              rendererAspectRatio={rendererAspectRatio}
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
              onQuickBeat={handleQuickBeat}
              onQuickLfo={handleQuickLfo}
              onUnlinkBeat={handleUnlinkBeat}
              onUnlinkLfo={handleUnlinkLfo}
              highlightedParamIds={highlightedParamIds}
              onHighlightParams={setHighlightedParamIds}
            />
          </motion.div>

          {/* Sidebar (1/5 width) */}
          <motion.aside
            className={styles.sidebar}
            aria-label="Preview and debug"
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={{ order: sidebarPosition === "left" ? 1 : 2 }}
          >
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
              aspectRatio={rendererAspectRatio}
            />
            <Sidebar
              macropadSelectedIndex={macropadSelectedIndex}
              slots={slotState.slots}
              getValue={getValue}
              setValue={setValue}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onHighlightParams={setHighlightedParamIds}
            />
          </motion.aside>
        </main>
      </LayoutGroup>
    </div>
  );
}

export default App;
