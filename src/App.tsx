import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { logger } from "@/lib/logger";
import { LayoutGroup, motion } from "motion/react";
import { useSlots } from "@/slots/useSlots";
import {
  useParameterStore,
  buildSlotSceneParams,
  buildSlotSceneParamsInterpolated,
} from "@/hooks/useParameterStore";
import type { SketchId } from "@/sketches";
import {
  makeSlotParameterId,
  getParameterDropdownLabel,
  type ParameterId,
} from "@/slots/slotTypes";
import {
  SlotsArea,
  RendererPreview,
  Sidebar,
  UpdateBanner,
} from "@/components";
import {
  ToolbarUndoRedo,
  ToolbarTapBpm,
  PerformanceChip,
  ToolbarShortcutsButton,
  ToolbarCaptureFrame,
} from "@/components/layout/Toolbar";
import { ShortcutsModal } from "@/components/layout/ShortcutsModal/ShortcutsModal";
import { AudioIndicator } from "@/components/panels/AudioIndicator";
import { useUndoHistory, applyUndo, applyRedo } from "@/hooks/useUndoHistory";
import {
  useAudioMappings,
  generateMappingId,
  type AudioMapping,
} from "@/inputs/audio";
import {
  useLfos,
  useModulationTargets,
  createLfo,
  createTarget,
} from "@/inputs/modulation";
import {
  useMidiMappings,
  useMidiDevices,
  useMidiPickupStates,
  useMidiLearn,
  cancelMidiLearn,
} from "@/inputs/midi";
import {
  useWindowManager,
  useLayoutPreferences,
  useRendererSettings,
  usePerformanceMonitor,
} from "@/hooks";
import { useUpdater } from "@/hooks/useUpdater";
import { useEventListener } from "@/inputs/shared";
import { useSlotColors } from "@/hooks/useSlotColors";
import { useCrossfade } from "@/hooks/useCrossfade";
import { useParameterBackendSync } from "@/hooks/useParameterBackendSync";
import { useGlobalKeyboard } from "@/hooks/useGlobalKeyboard";
import { useMacropadController } from "@/hooks/useMacropadController";
import type { BpmSourceChangedEvent } from "@/inputs/bpmSource";
import styles from "./App.module.css";

function App() {
  const slotState = useSlots({
    minSlots: 1,
    maxSlots: 8,
    initialSketches: ["blueCube"],
  });
  const paramStore = useParameterStore();

  // Audio / MIDI / Modulation inputs
  const {
    mappings: audioMappings,
    add: addAudioMapping,
    remove: removeAudioMapping,
  } = useAudioMappings();
  const { mappings: midiMappings } = useMidiMappings();
  const { devices: midiDevices } = useMidiDevices();
  const { pickupStates: midiPickupStates } = useMidiPickupStates();
  const {
    isLearning: isMidiLearning,
    learningParameterId: midiLearningParameterId,
    cancelLearn: cancelMidiLearnLocal,
  } = useMidiLearn();
  const isMidiDeviceConnected = midiDevices.some((d) => d.is_connected);
  const { lfos, add: addLfo } = useLfos();
  const {
    targets: modulationTargets,
    add: addModulationTarget,
    remove: removeModulationTarget,
  } = useModulationTargets();

  // Renderer / window
  const { info: rendererInfo } = useRendererSettings();
  const performanceStats = usePerformanceMonitor();
  const rendererAspectRatio =
    rendererInfo &&
    rendererInfo.windowWidth > 0 &&
    rendererInfo.windowHeight > 0
      ? rendererInfo.windowWidth / rendererInfo.windowHeight
      : 16 / 9;
  const { toggleFullscreenControls } = useWindowManager({
    windowLabel: "controls",
    enableHeartbeat: true,
    enableStatusPolling: false,
  });

  // Refs for stable callbacks — always reflect latest values without causing recreations
  const slotStateRef = useRef(slotState);
  slotStateRef.current = slotState;
  const isMidiLearningRef = useRef(isMidiLearning);
  isMidiLearningRef.current = isMidiLearning;
  const midiLearningParameterIdRef = useRef(midiLearningParameterId);
  midiLearningParameterIdRef.current = midiLearningParameterId;

  const undoHistory = useUndoHistory();
  const {
    state: updateState,
    installUpdate,
    dismiss: dismissUpdate,
  } = useUpdater();
  const { sidebarPosition } = useLayoutPreferences();

  // Undo / redo — paramStore.set is a stable callback (empty deps useCallback)
  const handleUndo = useCallback(() => {
    const entry = applyUndo();
    if (entry) {
      paramStore.set(entry.id, entry.value);
      void invoke("set_parameter", {
        id: entry.id,
        value: entry.value,
        app: undefined,
      });
    }
  }, [paramStore.set]);

  const handleRedo = useCallback(() => {
    const entry = applyRedo();
    if (entry) {
      paramStore.set(entry.id, entry.value);
      void invoke("set_parameter", {
        id: entry.id,
        value: entry.value,
        app: undefined,
      });
    }
  }, [paramStore.set]);

  // Domain hooks
  const { getSlotColors } = useSlotColors(slotState.slots);
  const { suspendedSlots, suspendSlot, resumeSlot } = slotState;
  const { handleCrossfade } = useCrossfade({ slotState, paramStore });
  useParameterBackendSync({
    paramStore,
    slots: slotState.slots,
    activeIndex: slotState.activeIndex,
    crossfadeTargetIndex: slotState.crossfadeTargetIndex,
    isHydrated: slotState.isHydrated,
    getSketchId: slotState.getSketchId,
  });
  const { macropadSelectedIndex } = useMacropadController({
    slotState,
    paramStore,
    handleCrossfade,
  });

  useGlobalKeyboard({
    isMidiLearning,
    onCancelMidiLearn: () => void cancelMidiLearnLocal(),
    onUndo: handleUndo,
    onRedo: handleRedo,
    onToggleFullscreen: toggleFullscreenControls,
  });

  // Cancel MIDI learn when the controls window closes
  useEffect(() => {
    const handler = () => void cancelMidiLearn();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Quick-wire: Beat button on a parameter slider
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

  // Quick-wire: LFO button on a parameter slider
  const handleQuickLfo = useCallback(
    async (parameterId: string, paramMin: number, paramMax: number) => {
      const lfoName = getParameterDropdownLabel(parameterId as ParameterId);
      const lfo = createLfo({ name: lfoName });
      const savedLfo = await addLfo(lfo);
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

  // Slot management — all stable (empty deps) via slotStateRef + stable paramStore callbacks
  const handleSlotSketchChange = useCallback(
    async (slotIndex: number, sketchId: SketchId) => {
      const ss = slotStateRef.current;
      const initParams = ss.setSlotSketch(slotIndex, sketchId);
      if (!initParams) return;

      paramStore.removeSlotParameters(slotIndex);
      paramStore.initializeSlotWithValues(slotIndex, initParams.parameters);

      try {
        await invoke("reset_slot_parameters", { slotIndex, sketchId });
        for (const [id, value] of initParams.parameters) {
          if (/color_[a-z_]+_[rgb]$/.test(String(id))) {
            await invoke("set_parameter", { id, value, app: undefined });
          }
        }
      } catch (error) {
        logger.error("Controls", "Failed to reset slot parameters", error);
      }

      try {
        const activeSketchId = ss.isActiveSlot(slotIndex)
          ? sketchId
          : ss.getSketchId(ss.activeIndex);
        const targetSketchId = ss.isCrossfadeTarget(slotIndex)
          ? sketchId
          : ss.crossfadeTargetIndex !== null
            ? ss.getSketchId(ss.crossfadeTargetIndex)
            : null;

        if (activeSketchId) {
          await invoke("set_slot_pairing", {
            activeSlotIndex: ss.activeIndex,
            activeSceneId: activeSketchId,
            nextSlotIndex: ss.crossfadeTargetIndex ?? ss.activeIndex,
            nextSceneId: targetSketchId ?? activeSketchId,
          });
        }
      } catch (error) {
        logger.error("Controls", "Failed to update slot pairing", error);
      }
    },
    [paramStore.removeSlotParameters, paramStore.initializeSlotWithValues],
  );

  const handleSetSketch = useCallback(
    async (slotIndex: number, sketchId: SketchId) => {
      const alphaParamId = makeSlotParameterId(slotIndex, "alpha");

      // Reset backend parameters FIRST (with alpha=0) so there's no flash frame
      // at alpha=1 when the renderer learns about the new slot.
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

      const initParams = slotStateRef.current.setSketch(slotIndex, sketchId);
      if (!initParams) return;

      const { parameters } = initParams;
      parameters.set(alphaParamId, 0);

      paramStore.removeSlotParameters(slotIndex);
      paramStore.initializeSlotWithValues(slotIndex, parameters);

      try {
        for (const [id, value] of parameters) {
          if (/color_[a-z_]+_[rgb]$/.test(String(id))) {
            await invoke("set_parameter", { id, value, app: undefined });
          }
        }
      } catch (error) {
        logger.error("Controls", "Failed to push color sub-params", error);
      }
    },
    [paramStore.removeSlotParameters, paramStore.initializeSlotWithValues],
  );

  const handleCopyToSlot = useCallback(
    async (sourceSlotIndex: number, targetSlotIndex: number) => {
      const initParams = slotStateRef.current.copyToSlot(
        sourceSlotIndex,
        targetSlotIndex,
        (id) => paramStore.get(id),
      );
      if (!initParams) return;

      const { slotIndex, parameters } = initParams;
      paramStore.initializeSlotWithValues(slotIndex, parameters);

      try {
        for (const [paramId, value] of parameters) {
          await invoke("set_parameter", { id: paramId, value, app: undefined });
        }
      } catch (error) {
        logger.error(
          "Controls",
          "Failed to copy slot parameters to backend",
          error,
        );
      }
    },
    [paramStore.get, paramStore.initializeSlotWithValues],
  );

  const handleClearSlot = useCallback(
    async (slotIndex: number) => {
      const ss = slotStateRef.current;
      const wasActive = ss.isActiveSlot(slotIndex);
      const nextFilled = wasActive
        ? ss.getFilledSlots().find((s) => s.index !== slotIndex)
        : null;

      ss.clearSlot(slotIndex);
      paramStore.removeSlotParameters(slotIndex);

      if (wasActive) {
        const oldAlphaId = makeSlotParameterId(slotIndex, "alpha");
        try {
          await invoke("set_parameter", {
            id: oldAlphaId,
            value: 0,
            app: undefined,
          });
          paramStore.set(oldAlphaId, 0);
        } catch (error) {
          logger.error("Controls", "Failed to clear active slot alpha", error);
        }

        if (nextFilled) {
          const newSketchId = nextFilled.sketchId;
          const newAlphaId = makeSlotParameterId(nextFilled.index, "alpha");
          try {
            await invoke("set_parameter", {
              id: newAlphaId,
              value: 1,
              app: undefined,
            });
            paramStore.set(newAlphaId, 1);
            await invoke("set_slot_pairing", {
              activeSlotIndex: nextFilled.index,
              activeSceneId: newSketchId,
              nextSlotIndex: nextFilled.index,
              nextSceneId: newSketchId,
            });
          } catch (error) {
            logger.error(
              "Controls",
              "Failed to activate next slot after active removal",
              error,
            );
          }
        }
      }

      if (
        isMidiLearningRef.current &&
        midiLearningParameterIdRef.current?.startsWith(`slot${slotIndex}_`)
      ) {
        void cancelMidiLearnLocal();
      }
    },
    [paramStore.removeSlotParameters, paramStore.set, cancelMidiLearnLocal],
  );

  // Param getters/setters for components
  const getValue = useCallback(
    (id: string) => paramStore.get(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramStore.get, paramStore.parameters],
  );
  const setValue = useCallback(
    (id: string, value: number) => {
      paramStore.set(id, value);
    },
    [paramStore.set],
  );

  // buildSlotSceneParams only calls store.get/getInterpolated — both stable callbacks
  const getSlotSketchParams = useCallback(
    (slotIndex: number, sketchId: SketchId) =>
      buildSlotSceneParams(slotIndex, sketchId, paramStore),
    [paramStore.get],
  );
  const getSlotSketchParamsInterpolated = useCallback(
    (slotIndex: number, sketchId: SketchId) =>
      buildSlotSceneParamsInterpolated(slotIndex, sketchId, paramStore),
    [paramStore.getInterpolated],
  );
  const getInterpolatedParam = useCallback(
    (id: string) => paramStore.getInterpolated(id),
    [paramStore.getInterpolated],
  );

  const handleCancelMidiLearn = useCallback(() => {
    void cancelMidiLearnLocal();
  }, [cancelMidiLearnLocal]);

  const [highlightedParamIds, setHighlightedParamIds] = useState<Set<string>>(
    new Set(),
  );

  // OSC BPM toast (shown once when OSC takes over as BPM source)
  const oscToastShownRef = useRef(false);
  const [showOscBeatToast, setShowOscBeatToast] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Stable derived props — prevent breaking memo on child components
  const rendererPreviewSlots = useMemo(
    () =>
      slotState.slots
        .filter(
          (slot) => slot.sketchId !== null && !suspendedSlots.has(slot.index),
        )
        .map((slot) => ({
          index: slot.index,
          sketchId: slot.sketchId as SketchId,
        })),
    [slotState.slots, suspendedSlots],
  );

  useEventListener<string | null>("project_restored", (frontendState) => {
    void slotState.hydrateFromBackend();
    if (frontendState) {
      try {
        const parsed = JSON.parse(frontendState) as {
          effects?: unknown;
          panelSlots?: unknown;
        };
        if (parsed.effects !== undefined) {
          localStorage.setItem("slew-effects", JSON.stringify(parsed.effects));
          void import("@tauri-apps/api/event").then(({ emit }) => {
            void emit("effects-changed", parsed.effects);
          });
        }
        if (parsed.panelSlots !== undefined) {
          localStorage.setItem("slew-panel-slots", JSON.stringify(parsed.panelSlots));
          void import("@tauri-apps/api/event").then(({ emit }) => {
            void emit("panel-slots-restore", parsed.panelSlots);
          });
        }
      } catch {
        // malformed frontend_state — ignore
      }
    }
    // Always stay on Projects tab after a load so user sees the result
    void import("@tauri-apps/api/event").then(({ emit }) => {
      void emit("sidebar-tab-restore", "projects");
    });
  });

  useEventListener<BpmSourceChangedEvent>("bpm_source_changed", (event) => {
    if (event.source === "osc" && !oscToastShownRef.current) {
      oscToastShownRef.current = true;
      setShowOscBeatToast(true);
    }
  });

  return (
    <div className={styles.root}>
      <UpdateBanner
        state={updateState}
        onInstall={installUpdate}
        onClose={dismissUpdate}
      />
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      {showOscBeatToast && (
        <div className={styles.oscBeatToast} role="status">
          <span className={styles.oscBeatToastBadge}>OSC</span>
          <span className={styles.oscBeatToastMessage}>
            Beat clock connected — BPM now driven by OSC
          </span>
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
          onCancelMidiLearn={handleCancelMidiLearn}
        />
        <ToolbarCaptureFrame />
        <div className={styles.toolbarSpacer} />
        <PerformanceChip
          controls={performanceStats}
          rendererFps={rendererInfo?.stats?.fps ?? null}
          rendererFrameTimeMs={rendererInfo?.stats?.frameTimeMs ?? null}
        />
        <AudioIndicator />
        <ToolbarTapBpm />
        <ToolbarShortcutsButton onOpen={() => setShowShortcuts(true)} />
      </div>
      <LayoutGroup>
        <main className={styles.main}>
          <motion.div
            className={styles.scenesArea}
            layout
            layoutDependency={sidebarPosition}
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
              suspendedSlots={suspendedSlots}
              onSuspendSlot={suspendSlot}
              onResumeSlot={resumeSlot}
              onQuickBeat={handleQuickBeat}
              onQuickLfo={handleQuickLfo}
              onUnlinkBeat={handleUnlinkBeat}
              onUnlinkLfo={handleUnlinkLfo}
              highlightedParamIds={highlightedParamIds}
              onHighlightParams={setHighlightedParamIds}
            />
          </motion.div>

          <motion.aside
            className={styles.sidebar}
            aria-label="Preview and debug"
            layout
            layoutDependency={sidebarPosition}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={{ order: sidebarPosition === "left" ? 1 : 2 }}
          >
            <RendererPreview
              allSlots={rendererPreviewSlots}
              activeSlotIndex={slotState.activeIndex}
              crossfadeTargetIndex={slotState.crossfadeTargetIndex}
              getParam={getInterpolatedParam}
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
