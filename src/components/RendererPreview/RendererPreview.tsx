/**
 * RendererPreview
 *
 * A preview component that mirrors the actual Renderer output.
 * Shows all slots with alpha > 0, blended according to crossfade and alpha values.
 *
 * This is used in the Controls window to give the operator an accurate
 * representation of what's being displayed in the Renderer window.
 *
 * Features:
 * - Multi-slot rendering with individual alpha values
 * - Accurate crossfade blending matching the main renderer
 * - Tint LFO modulation support
 * - Fixed 16:9 aspect ratio
 * - Optimized for performance with reduced DPR
 */

import { Suspense, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import type { SketchId, SketchProps } from "../../sketches";
import { SKETCH_COMPONENT_REGISTRY, getSketchDescriptor } from "../../sketches";
import { makeSlotParameterId } from "../../scenes/sceneTypes";
import styles from "./RendererPreview.module.css";

// =============================================================================
// Types
// =============================================================================

/** Information about a slot to render */
export interface SlotInfo {
  index: number;
  sketchId: SketchId;
}

export interface RendererPreviewProps {
  /** All slots that could potentially be rendered */
  allSlots: SlotInfo[];
  /** The currently active slot index */
  activeSlotIndex: number;
  /** The crossfade target slot index (null if not crossfading) */
  crossfadeTargetIndex: number | null;
  /** Function to get interpolated parameter value */
  getParam: (parameterId: string) => number;
  /** Show performance stats (toggled with "D" key) */
  showStats?: boolean;
}

// =============================================================================
// Parameter Mapping
// =============================================================================

/** Maps parameter template IDs to sketch props keys */
const TEMPLATE_ID_TO_PROPS_KEY: Record<string, string> = {
  alpha: "alpha",
  brightness: "brightness",
  rotation_speed: "rotationSpeed",
  tint: "tint",
  wobble: "wobble",
  tint_lfo_depth: "tintLfoDepth",
  scale: "scale",
  pulse_speed: "pulseSpeed",
  hue_shift: "hueShift",
  glow_intensity: "glowIntensity",
  noise_scale: "noiseScale",
  noise_speed: "noiseSpeed",
  color_mix: "colorMix",
};

// =============================================================================
// Tint LFO Driver
// =============================================================================

interface TintLfoDriverProps {
  depth: number;
  setPhase: (phase: number) => void;
}

/**
 * Drives the tint LFO phase inside the r3f Canvas.
 * Uses elapsed time to compute phase (matching main renderer behavior).
 */
function TintLfoDriver({ depth, setPhase }: TintLfoDriverProps) {
  useFrame(({ clock }) => {
    if (depth <= 0) return;
    const elapsed = clock.getElapsedTime();
    const frequencyHz = 0.1;
    setPhase(2 * Math.PI * frequencyHz * elapsed);
  });
  return null;
}

// =============================================================================
// Slot Parameters Builder
// =============================================================================

/**
 * Build sketch props for a slot from the parameter store.
 * Matches the logic in RendererRoot.
 */
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

// =============================================================================
// Opacity Calculation
// =============================================================================

/**
 * Calculate the final opacity for a slot based on its alpha and crossfade state.
 * Matches the logic in RendererRoot.
 */
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

  // If this slot is involved in crossfade, apply crossfade weight
  if (isActive && crossfadeTargetIndex !== null) {
    // Active slot fades out
    return clampedAlpha * (1 - clampedCrossfade);
  }

  if (isTarget) {
    // Target slot fades in
    return clampedAlpha * clampedCrossfade;
  }

  // Other slots just use their alpha
  return clampedAlpha;
}

// =============================================================================
// Renderer Content
// =============================================================================

interface RendererPreviewContentProps {
  allSlots: SlotInfo[];
  activeSlotIndex: number;
  crossfadeTargetIndex: number | null;
  getParam: (parameterId: string) => number;
}

/**
 * Inner content component that renders inside the Canvas.
 * Handles multi-slot rendering with alpha-based blending.
 */
function RendererPreviewContent({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  getParam,
}: RendererPreviewContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const crossfade = getParam("crossfade");

  // Calculate max tint LFO depth across all visible slots for the driver
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

  // Render all slots with alpha > 0, in index order (lower index = behind)
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
    .sort((a, b) => a.index - b.index); // Ensure index order for z-layering

  return (
    <>
      <TintLfoDriver depth={maxTintLfoDepth} setPhase={setTintLfoPhase} />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {/* Render all visible slots in index order */}
      {slotsToRender.map((slot) => {
        const SketchComponent = SKETCH_COMPONENT_REGISTRY[slot.sketchId];
        if (!SketchComponent) return null;

        // Get the slot's alpha (master opacity) parameter
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

        return (
          <SketchComponent
            key={`slot-${slot.index}`}
            opacity={opacity}
            params={sketchParams}
          />
        );
      })}
    </>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * RendererPreview
 *
 * A preview component that mirrors the actual Renderer output.
 * Shows all slots with alpha > 0, blended according to crossfade and alpha values.
 */
export function RendererPreview({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  getParam,
  showStats = false,
}: RendererPreviewProps) {
  return (
    <div className={styles.container}>
      <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
        <Canvas
          className={styles.canvas}
          camera={{ position: [0, 0, 4], fov: 50 }}
          // Match main renderer camera but with reduced DPR for performance
          dpr={[1, 1.5]}
          frameloop="always"
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: "low-power",
          }}
        >
          {showStats && (
            <Perf
              position="top-left"
              minimal={true}
              showGraph={false}
              colorBlind={false}
            />
          )}
          <RendererPreviewContent
            allSlots={allSlots}
            activeSlotIndex={activeSlotIndex}
            crossfadeTargetIndex={crossfadeTargetIndex}
            getParam={getParam}
          />
        </Canvas>
      </Suspense>
      <div className={styles.label}>Live Preview</div>
    </div>
  );
}

export default RendererPreview;
