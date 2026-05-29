import { useEffect, useCallback, Suspense, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Cross2Icon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import type { SketchId, SketchProps } from "@/sketches";
import {
  SKETCH_COMPONENT_REGISTRY,
  SketchLoadingFallback,
  getSketchDescriptor,
} from "@/sketches";
import { SlotParameterControls } from "@/components/slots/SlotParameterControls";
import { StreamedPreview } from "@/components/preview/StreamedPreview";
import { WebGPUCanvas } from "@/renderer/WebGPUCanvas";
import type { AudioMapping } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import styles from "./SlotEditorOverlay.module.css";

export interface SlotEditorOverlayProps {
  slotIndex: number;
  sketchId: SketchId;
  rendererAspectRatio?: number;
  getSlotSketchParamsInterpolated?: (
    slotIndex: number,
    sketchId: SketchId,
  ) => SketchProps["params"];
  colors?: SketchProps["colors"];
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  midiMappings?: MidiMapping[];
  midiPickupStates?: Map<string, MidiPickupState>;
  highlightedParamIds?: Set<string>;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (
    parameterId: string,
    paramMin: number,
    paramMax: number,
  ) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
  onClose: () => void;
}

export function SlotEditorOverlay({
  slotIndex,
  sketchId,
  rendererAspectRatio = 16 / 9,
  getSlotSketchParamsInterpolated,
  colors,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  midiPickupStates,
  highlightedParamIds,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
  onClose,
}: SlotEditorOverlayProps) {
  const descriptor = getSketchDescriptor(sketchId);
  const displayNumber = slotIndex + 1;
  const label = descriptor?.label ?? sketchId;

  // Escape key closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const SketchComponent = SKETCH_COMPONENT_REGISTRY[sketchId];
  const params = getSlotSketchParamsInterpolated?.(slotIndex, sketchId);

  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={handleBackdropClick}
    >
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {/* Header */}
        <div className={styles.header}>
          <span className={styles.slotBadge}>{displayNumber}</span>
          <span className={styles.title}>{label}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close slot editor"
          >
            <Cross2Icon />
          </button>
        </div>

        {/* Body: preview left, params sidebar right */}
        <div className={styles.body}>
          <div className={styles.previewArea}>
            {SketchComponent ? (
              <div className={styles.previewCanvas}>
                <div
                  className={styles.previewCanvasInner}
                  style={
                    {
                      "--overlay-aspect-ratio": rendererAspectRatio,
                    } as React.CSSProperties
                  }
                >
                  <OverlayPreview
                    slotIndex={slotIndex}
                    SketchComponent={SketchComponent}
                    params={params}
                    colors={colors}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.previewFallback}>
                Unknown sketch: {sketchId}
              </div>
            )}
          </div>

          <div className={styles.sidebar} data-nodrag>
            <SlotParameterControls
              slotIndex={slotIndex}
              sketchId={sketchId}
              getValue={getValue}
              setValue={setValue}
              audioMappings={audioMappings}
              modulationTargets={modulationTargets}
              lfos={lfos}
              midiMappings={midiMappings}
              midiPickupStates={midiPickupStates}
              highlightedParamIds={highlightedParamIds}
              onQuickBeat={onQuickBeat}
              onQuickLfo={onQuickLfo}
              onUnlinkBeat={onUnlinkBeat}
              onUnlinkLfo={onUnlinkLfo}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// OverlayPreview — mirrors SlotPreview logic: stream if available, local fallback
// ---------------------------------------------------------------------------

interface OverlayPreviewProps {
  slotIndex: number;
  SketchComponent: React.ComponentType<SketchProps>;
  params?: SketchProps["params"];
  colors?: SketchProps["colors"];
}

function OverlayPreview({
  slotIndex,
  SketchComponent,
  params,
  colors,
}: OverlayPreviewProps) {
  const [streamingEnabled, setStreamingEnabled] = useState(false);
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);

  const source = useMemo(() => `slot-${slotIndex}` as const, [slotIndex]);

  // Check backend config to see if streaming is enabled
  useEffect(() => {
    let mounted = true;
    const checkConfig = async () => {
      try {
        const config = await invoke<{
          enabled: boolean;
          stream_slots: boolean;
        }>("get_frame_distribution_config");
        if (mounted) setStreamingEnabled(config.enabled && config.stream_slots);
      } catch {
        // streaming remains disabled
      }
    };
    checkConfig();
    const interval = setInterval(checkConfig, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleFirstFrame = useCallback(() => setHasReceivedFrame(true), []);
  const useStreamedPreview = streamingEnabled && hasReceivedFrame;

  return (
    <WebGPUCanvas
      camera={{ position: [0, 0, 4], fov: 50 }}
      frameloop="always"
      dpr={1}
      fallback={<div className={styles.previewFallback}>Initializing…</div>}
    >
      {streamingEnabled && (
        <StreamedPreview source={source} onFirstFrame={handleFirstFrame} />
      )}
      {!useStreamedPreview && (
        <>
          <color attach="background" args={["#020617"]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[4, 6, 3]} intensity={1.1} />
          <directionalLight position={[-4, -4, -2]} intensity={0.4} />
          <Suspense fallback={<SketchLoadingFallback />}>
            <SketchComponent opacity={1} params={params} colors={colors} />
          </Suspense>
        </>
      )}
    </WebGPUCanvas>
  );
}
