/**
 * RendererPreview - Mirrors the Renderer output in the Controls window.
 * Uses streaming mode by default, with local rendering as fallback.
 */

import { Suspense, useState, useCallback, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import type { SketchId, SketchProps } from "../../sketches";
import { STREAMING_FALLBACK_TIMEOUT_MS } from "../../config";
import {
  SKETCH_COMPONENT_REGISTRY,
  getSketchDescriptor,
  TEMPLATE_ID_TO_PROPS_KEY,
} from "../../sketches";
import { makeSlotParameterId } from "../../slots/slotTypes";
import { WebGPUCanvas } from "../../renderer/WebGPUCanvas";
import { StreamedPreview } from "../StreamedPreview";
import styles from "./RendererPreview.module.css";

const USE_STREAMING_BY_DEFAULT = true;

export interface SlotInfo {
  index: number;
  sketchId: SketchId;
}

export interface RendererPreviewProps {
  allSlots: SlotInfo[];
  activeSlotIndex: number;
  crossfadeTargetIndex: number | null;
  getParam: (parameterId: string) => number;
  getSlotColors?: (slotIndex: number) => SketchProps["colors"];
  useStreaming?: boolean;
  aspectRatio?: number;
}

interface TintLfoDriverProps {
  depth: number;
  setPhase: (phase: number) => void;
}

function TintLfoDriver({ depth, setPhase }: TintLfoDriverProps) {
  useFrame(({ clock }) => {
    if (depth <= 0) return;
    const elapsed = clock.getElapsedTime();
    const frequencyHz = 0.1;
    setPhase(2 * Math.PI * frequencyHz * elapsed);
  });
  return null;
}

function buildSlotParams(
  slotIndex: number,
  sketchId: SketchId,
  getParam: (id: string) => number,
  tintLfoPhase: number,
): SketchProps["params"] {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return undefined;

  const params: Record<string, number> = {};

  for (const template of descriptor.parameters) {
    const paramId = makeSlotParameterId(slotIndex, template.templateId);
    const propsKey = TEMPLATE_ID_TO_PROPS_KEY[template.templateId];
    if (propsKey) {
      const value = getParam(paramId);
      params[propsKey] = value;
    }
  }

  // Apply tint LFO modulation
  const tintBase = params.tint ?? 0.5;
  const tintDepth = params.tintLfoDepth ?? 0;
  if (tintDepth > 0) {
    params.tint = Math.max(
      0,
      Math.min(1, tintBase + Math.sin(tintLfoPhase) * tintDepth),
    );
  }

  return params;
}

function calculateSlotOpacity(
  slotIndex: number,
  activeSlotIndex: number,
  crossfadeTargetIndex: number | null,
  crossfade: number,
  alpha: number,
): number {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  const clampedCrossfade = Math.max(0, Math.min(1, crossfade));

  const isActive = slotIndex === activeSlotIndex;
  const isTarget =
    crossfadeTargetIndex !== null && slotIndex === crossfadeTargetIndex;

  if (isActive && crossfadeTargetIndex !== null) {
    return clampedAlpha * (1 - clampedCrossfade);
  }
  if (isTarget) {
    return clampedAlpha * clampedCrossfade;
  }
  return clampedAlpha;
}

interface RendererPreviewContentProps {
  allSlots: SlotInfo[];
  activeSlotIndex: number;
  crossfadeTargetIndex: number | null;
  getParam: (parameterId: string) => number;
  getSlotColors?: (slotIndex: number) => SketchProps["colors"];
}

function RendererPreviewContent({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  getParam,
  getSlotColors,
}: RendererPreviewContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const crossfade = getParam("crossfade");

  let maxTintLfoDepth = 0;
  for (const slot of allSlots) {
    const alphaParamId = makeSlotParameterId(slot.index, "alpha");
    const alpha = getParam(alphaParamId);
    if (alpha > 0.001) {
      const tintLfoDepthParamId = makeSlotParameterId(
        slot.index,
        "tint_lfo_depth",
      );
      const tintLfoDepth = getParam(tintLfoDepthParamId);
      maxTintLfoDepth = Math.max(maxTintLfoDepth, tintLfoDepth);
    }
  }

  const slotsToRender = allSlots
    .filter((slot) => {
      const alphaParamId = makeSlotParameterId(slot.index, "alpha");
      const alpha = getParam(alphaParamId);
      const opacity = calculateSlotOpacity(
        slot.index,
        activeSlotIndex,
        crossfadeTargetIndex,
        crossfade,
        alpha,
      );
      return opacity > 0.001;
    })
    .sort((a, b) => a.index - b.index);

  return (
    <>
      <TintLfoDriver depth={maxTintLfoDepth} setPhase={setTintLfoPhase} />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {slotsToRender.map((slot) => {
        const SketchComponent = SKETCH_COMPONENT_REGISTRY[slot.sketchId];
        if (!SketchComponent) return null;

        const alphaParamId = makeSlotParameterId(slot.index, "alpha");
        const alpha = getParam(alphaParamId);

        const opacity = calculateSlotOpacity(
          slot.index,
          activeSlotIndex,
          crossfadeTargetIndex,
          crossfade,
          alpha,
        );

        const sketchParams = buildSlotParams(
          slot.index,
          slot.sketchId,
          getParam,
          tintLfoPhase,
        );

        const colors = getSlotColors?.(slot.index);

        return (
          <SketchComponent
            key={`slot-${slot.index}`}
            opacity={opacity}
            params={sketchParams}
            colors={colors}
          />
        );
      })}
    </>
  );
}

/**
 * RendererPreview - Displays either streamed composited frames or local rendering.
 *
 * Simplified streaming logic:
 * - Check if streaming is enabled via prop
 * - Once first frame is received, commit to streaming mode permanently
 * - No timeout-based fallback after streaming starts - show last valid frame
 * - Only fall back to local rendering if no frames received within initial timeout
 */
export function RendererPreview({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  getParam,
  getSlotColors,
  useStreaming,
  aspectRatio = 16 / 9,
}: RendererPreviewProps) {
  const streamingEnabled = useStreaming ?? USE_STREAMING_BY_DEFAULT;
  // Whether we've received at least one frame (commit to streaming)
  const [hasReceivedFrame, setHasReceivedFrame] = useState(false);
  // Whether initial connection failed (fall back to local rendering)
  const [initialConnectionFailed, setInitialConnectionFailed] = useState(false);

  // Called when StreamedPreview receives its first frame
  const handleFirstFrame = useCallback(() => {
    setHasReceivedFrame(true);
    setInitialConnectionFailed(false);
  }, []);

  // Initial connection timeout - only applies before first frame received
  useEffect(() => {
    if (!streamingEnabled || hasReceivedFrame) {
      return;
    }

    const timeout = setTimeout(() => {
      if (!hasReceivedFrame) setInitialConnectionFailed(true);
    }, STREAMING_FALLBACK_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [streamingEnabled, hasReceivedFrame]);

  // Use streaming if enabled and either we've received frames OR we're still waiting
  const shouldStream = streamingEnabled && !initialConnectionFailed;
  // Visual indicator: streaming is active if we've received at least one frame
  const isStreaming = shouldStream && hasReceivedFrame;

  const containerStyle = {
    "--renderer-aspect-ratio": aspectRatio,
  } as React.CSSProperties;

  return (
    <div className={styles.container} style={containerStyle}>
      <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
        <WebGPUCanvas
          camera={{ position: [0, 0, 4], fov: 50 }}
          frameloop="always"
          dpr={1}
          fallback={<div className={styles.fallback}>Initializing…</div>}
        >
          {/* Always render StreamedPreview when should stream - it shows last valid frame */}
          {shouldStream ? (
            <StreamedPreview
              source="composited"
              onFirstFrame={handleFirstFrame}
            />
          ) : (
            <RendererPreviewContent
              allSlots={allSlots}
              activeSlotIndex={activeSlotIndex}
              crossfadeTargetIndex={crossfadeTargetIndex}
              getParam={getParam}
              getSlotColors={getSlotColors}
            />
          )}
        </WebGPUCanvas>
      </Suspense>
      <div className={styles.label}>
        <span
          className={
            isStreaming ? styles.streamDotActive : styles.streamDotInactive
          }
        />
        {isStreaming ? "Live Preview" : "Local Preview"}
      </div>
    </div>
  );
}

export default RendererPreview;
