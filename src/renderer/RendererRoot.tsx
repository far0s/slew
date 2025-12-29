import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Canvas, useFrame } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import { VideoOutputCapture } from "./VideoOutputCapture";
import {
  SKETCH_COMPONENT_REGISTRY,
  type SketchProps,
  type SketchId,
} from "../sketches";
import type { ParameterTemplateId } from "../scenes/sceneTypes";
import { getSketchDescriptor, makeSlotParameterId } from "../scenes/sceneTypes";
import { useStatsToggle } from "../hooks";
import styles from "./RendererRoot.module.css";

// Heartbeat interval for health monitoring
const HEARTBEAT_INTERVAL_MS = 5000;

// =============================================================================
// Types
// =============================================================================

/**
 * Backend parameter shape from the Rust Parameter Server.
 */
interface BackendParameter {
  id: string;
  value: number;
  target: number;
  transition_speed: number;
  curve: "linear" | "ease" | "exp";
}

/**
 * Slot pairing event payload from backend (legacy, still used for crossfade).
 */
interface SlotPairingPayload {
  active_slot_index: number;
  active_scene_id: SketchId;
  next_slot_index: number;
  next_scene_id: SketchId;
}

/**
 * All slots changed event payload for multi-layer rendering.
 */
interface AllSlotsPayload {
  slots: Array<{ index: number; sketch_id: SketchId }>;
  active_slot_index: number;
  crossfade_target_index: number | null;
}

/**
 * Backend slot state returned from get_slot_state command.
 */
interface BackendSlotState {
  slots: Array<{ index: number; sketch_id: string }>;
  active_slot_index: number;
  crossfade_target_index: number | null;
}

/**
 * Slot configuration for rendering.
 */
interface SlotInfo {
  index: number;
  sketchId: SketchId;
}

// =============================================================================
// Template ID to Props Key Mapping
// =============================================================================

/**
 * Maps template IDs (snake_case) to SceneProps param keys (camelCase).
 */
const TEMPLATE_ID_TO_PROPS_KEY: Record<ParameterTemplateId, string> = {
  // Slot-level parameters
  alpha: "alpha", // Note: alpha is handled separately, not passed to sketch
  audio_reactivity: "audioReactivity", // Note: audio_reactivity is slot-level, not passed to sketch
  // Common parameters
  brightness: "brightness",
  rotation_speed: "rotationSpeed",
  tint: "tint",
  wobble: "wobble",
  tint_lfo_depth: "tintLfoDepth",
  scale: "scale",
  pulse_speed: "pulseSpeed",
  // TslText3D specific
  hue_shift: "hueShift",
  glow_intensity: "glowIntensity",
  // TslNoiseBlob specific
  noise_scale: "noiseScale",
  noise_speed: "noiseSpeed",
  color_mix: "colorMix",
};

// =============================================================================
// Helper Components
// =============================================================================

interface TintLfoDriverProps {
  depth: number;
  setPhase: (phase: number) => void;
}

/**
 * Drives the tint LFO phase inside the r3f Canvas.
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
// Dynamic Scene Params Builder
// =============================================================================

/**
 * Build SceneProps params for a slot from the parameter store.
 * Uses slot-prefixed parameter IDs (e.g., slot_0_brightness).
 */
function buildSlotParams(
  slotIndex: number,
  sketchId: SketchId,
  paramStore: Map<string, number>,
  tintLfoPhase: number,
): SketchProps["params"] {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return {};

  const params: Record<string, number> = {};

  // Build params from scene descriptor using slot-prefixed IDs
  for (const template of descriptor.parameters) {
    const paramId = makeSlotParameterId(slotIndex, template.templateId);
    const propsKey = TEMPLATE_ID_TO_PROPS_KEY[template.templateId];

    if (propsKey) {
      const value = paramStore.get(paramId);
      params[propsKey] = value !== undefined ? value : template.defaultValue;
    }
  }

  // Apply tint LFO modulation for scenes that support it
  if (params.tintLfoDepth !== undefined && params.tint !== undefined) {
    const tintBase = params.tint;
    const tintDepth = params.tintLfoDepth;
    params.tint = Math.max(
      0,
      Math.min(1, tintBase + Math.sin(tintLfoPhase) * tintDepth),
    );
  }

  return params as SketchProps["params"];
}

// =============================================================================
// Opacity Calculation
// =============================================================================

/**
 * Calculate the final opacity for a slot in multi-layer mode.
 *
 * For slots involved in a crossfade transition, the opacity is:
 *   crossfadeWeight * alpha
 *
 * For other slots, the opacity is simply their alpha value.
 *
 * @param slotIndex - The slot being rendered
 * @param activeSlotIndex - The currently active (output) slot
 * @param crossfadeTargetIndex - The slot we're crossfading to (or null)
 * @param crossfade - Current crossfade value (0 = fully active, 1 = fully target)
 * @param alpha - The slot's master opacity (0-1)
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

  // If this slot is both active and target (same slot), just use alpha
  if (isActive && isTarget) {
    return clampedAlpha;
  }

  // If this is the active slot and we're crossfading, fade out
  if (isActive && crossfadeTargetIndex !== null && clampedCrossfade > 0.001) {
    return (1 - clampedCrossfade) * clampedAlpha;
  }

  // If this is the target slot, fade in
  if (isTarget && clampedCrossfade > 0.001) {
    return clampedCrossfade * clampedAlpha;
  }

  // For all other slots (not in crossfade), just use their alpha directly
  // This enables multi-layer rendering where any slot with alpha > 0 is visible
  return clampedAlpha;
}

// =============================================================================
// Canvas Content
// =============================================================================

interface RendererContentProps {
  allSlots: SlotInfo[];
  activeSlotIndex: number;
  crossfadeTargetIndex: number | null;
  paramStore: Map<string, number>;
}

function RendererContent({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  paramStore,
}: RendererContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const crossfade = paramStore.get("crossfade") ?? 0;

  // Calculate max tint LFO depth across all visible slots for the driver
  let maxTintLfoDepth = 0;
  for (const slot of allSlots) {
    const alphaParamId = makeSlotParameterId(slot.index, "alpha");
    const alpha = paramStore.get(alphaParamId) ?? 1;
    if (alpha > 0.001) {
      const tintLfoDepthParamId = makeSlotParameterId(
        slot.index,
        "tint_lfo_depth",
      );
      const tintLfoDepth = paramStore.get(tintLfoDepthParamId) ?? 0;
      maxTintLfoDepth = Math.max(maxTintLfoDepth, tintLfoDepth);
    }
  }

  // Render all slots with alpha > 0, in index order (lower index = behind)
  const slotsToRender = allSlots
    .filter((slot) => {
      const alphaParamId = makeSlotParameterId(slot.index, "alpha");
      const alpha = paramStore.get(alphaParamId) ?? 1;
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
        const alpha = paramStore.get(alphaParamId) ?? 1;

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
          paramStore,
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
 * RendererRoot - Main renderer window component with multi-layer alpha support.
 *
 * Architecture:
 * 1. Stores ALL parameters in a generic Map (including slot-prefixed IDs)
 * 2. Listens to `all_slots_changed` for the complete list of slots
 * 3. Listens to `slot_pairing_changed` for active/crossfade target info
 * 4. Listens to `parameter_changed` for ANY parameter update
 * 5. Renders ALL slots with alpha > 0 (multi-layer rendering)
 * 6. Uses crossfade only for smooth transitions between active and target
 *
 * Key features:
 * - Parameters use slot-prefixed IDs (e.g., `slot_0_brightness`)
 * - Each slot has an independent alpha for visibility control
 * - Slots render in index order (0 = back, higher = front)
 * - Crossfade smoothly transitions between active and target slots
 */
export function RendererRoot() {
  // All slots state for multi-layer rendering
  const [allSlots, setAllSlots] = useState<SlotInfo[]>([
    { index: 0, sketchId: "blueCube" },
  ]);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [crossfadeTargetIndex, setCrossfadeTargetIndex] = useState<
    number | null
  >(null);

  // Generic parameter store - stores ANY parameter by its backend ID
  const [paramStore, setParamStore] = useState<Map<string, number>>(
    () => new Map([["crossfade", 0]]),
  );

  // Stats toggle (press "D" to show/hide performance stats)
  const { showStats } = useStatsToggle();

  // Heartbeat for window health monitoring
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Send initial heartbeat
    invoke("window_heartbeat", { label: "renderer" }).catch((e) =>
      console.warn("[Renderer] Initial heartbeat failed:", e),
    );

    // Set up interval
    heartbeatRef.current = setInterval(() => {
      invoke("window_heartbeat", { label: "renderer" }).catch((e) =>
        console.warn("[Renderer] Heartbeat failed:", e),
      );
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, []);

  const updateParam = useCallback((id: string, value: number) => {
    setParamStore((prev) => {
      const current = prev.get(id);
      if (current !== undefined && Math.abs(current - value) < 0.0001) {
        return prev;
      }
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  const handleParameterChanged = useCallback(
    (param: BackendParameter) => {
      updateParam(param.id, param.value);
    },
    [updateParam],
  );

  // Handle all slots changed event (new multi-layer format)
  const handleAllSlotsChanged = useCallback((payload: AllSlotsPayload) => {
    console.log(
      "[Renderer] All slots changed:",
      payload.slots.length,
      "slots, active:",
      payload.active_slot_index,
      "target:",
      payload.crossfade_target_index,
    );

    setAllSlots(
      payload.slots.map((s) => ({
        index: s.index,
        sketchId: s.sketch_id,
      })),
    );
    setActiveSlotIndex(payload.active_slot_index);
    setCrossfadeTargetIndex(payload.crossfade_target_index);
  }, []);

  // Handle slot pairing change (legacy format, still used for crossfade)
  const handleSlotPairingChanged = useCallback(
    (payload: SlotPairingPayload) => {
      console.log(
        "[Renderer] Slot pairing: slot",
        payload.active_slot_index,
        "(" + payload.active_scene_id + ") ->",
        "slot",
        payload.next_slot_index,
        "(" + payload.next_scene_id + ")",
      );

      setActiveSlotIndex(payload.active_slot_index);

      // Set crossfade target if different from active
      if (payload.next_slot_index !== payload.active_slot_index) {
        setCrossfadeTargetIndex(payload.next_slot_index);
      } else {
        setCrossfadeTargetIndex(null);
      }

      // Update slot info if we don't have it yet
      setAllSlots((prev) => {
        const hasActive = prev.some(
          (s) => s.index === payload.active_slot_index,
        );
        const hasNext = prev.some((s) => s.index === payload.next_slot_index);

        if (hasActive && hasNext) return prev;

        const updated = [...prev];
        if (!hasActive) {
          updated.push({
            index: payload.active_slot_index,
            sketchId: payload.active_scene_id,
          });
        }
        if (!hasNext && payload.next_slot_index !== payload.active_slot_index) {
          updated.push({
            index: payload.next_slot_index,
            sketchId: payload.next_scene_id,
          });
        }
        return updated.sort((a, b) => a.index - b.index);
      });
    },
    [],
  );

  // Legacy handler for scene_pairing_changed (backwards compatibility)
  const handleLegacyScenePairingChanged = useCallback(
    (payload: { active_scene_id: SketchId; next_scene_id: SketchId }) => {
      console.log(
        "[Renderer] Legacy scene pairing:",
        payload.active_scene_id,
        "->",
        payload.next_scene_id,
      );
      // Map legacy scene IDs to slot 0 for backwards compatibility
      setAllSlots([{ index: 0, sketchId: payload.active_scene_id }]);
      setActiveSlotIndex(0);
      setCrossfadeTargetIndex(null);
    },
    [],
  );

  // Hydrate from backend on startup (both slots and parameters)
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        // Hydrate slot state first
        const slotState = await invoke<BackendSlotState>("get_slot_state");

        if (!mounted) return;

        if (slotState.slots && slotState.slots.length > 0) {
          setAllSlots(
            slotState.slots.map((s) => ({
              index: s.index,
              sketchId: s.sketch_id as SketchId,
            })),
          );
          setActiveSlotIndex(slotState.active_slot_index);
          setCrossfadeTargetIndex(slotState.crossfade_target_index);

          console.log(
            "[Renderer] Hydrated",
            slotState.slots.length,
            "slots from backend, active:",
            slotState.active_slot_index,
          );
        }

        // Then hydrate parameters
        const backendParams = (await invoke(
          "get_parameters",
        )) as BackendParameter[];

        if (!mounted) return;

        for (const param of backendParams) {
          handleParameterChanged(param);
        }

        console.log(
          "[Renderer] Hydrated",
          backendParams.length,
          "parameters from backend",
        );
      } catch (error) {
        console.error("[Renderer] Failed to hydrate from backend:", error);
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [handleParameterChanged]);

  // Listen for all slots changed (new multi-layer format)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<AllSlotsPayload>(
          "all_slots_changed",
          (event) => {
            if (event.payload) {
              handleAllSlotsChanged(event.payload);
            }
          },
        );
        console.log("[Renderer] Subscribed to all_slots_changed events");
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to all_slots_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleAllSlotsChanged]);

  // Listen for slot pairing changes (still used for crossfade)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<SlotPairingPayload>(
          "slot_pairing_changed",
          (event) => {
            if (event.payload) {
              handleSlotPairingChanged(event.payload);
            }
          },
        );
        console.log("[Renderer] Subscribed to slot_pairing_changed events");
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to slot_pairing_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleSlotPairingChanged]);

  // Listen for legacy scene pairing changes (backwards compatibility)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<{
          active_scene_id: SketchId;
          next_scene_id: SketchId;
        }>("scene_pairing_changed", (event) => {
          if (event.payload) {
            handleLegacyScenePairingChanged(event.payload);
          }
        });
        console.log(
          "[Renderer] Subscribed to scene_pairing_changed events (legacy)",
        );
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to scene_pairing_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleLegacyScenePairingChanged]);

  // Listen for parameter changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function subscribe() {
      try {
        unlisten = await listen<BackendParameter>(
          "parameter_changed",
          (event) => {
            if (event.payload) {
              handleParameterChanged(event.payload);
            }
          },
        );
        console.log("[Renderer] Subscribed to parameter_changed events");
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to parameter_changed:",
          error,
        );
      }
    }

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleParameterChanged]);

  return (
    <div className={styles.root}>
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }} frameloop="always">
        {showStats && (
          <Perf
            position="top-left"
            minimal={false}
            showGraph={true}
            colorBlind={false}
          />
        )}
        {/* Video output capture - sends frames to Syphon/Spout/NDI when active */}
        <VideoOutputCapture />
        <RendererContent
          allSlots={allSlots}
          activeSlotIndex={activeSlotIndex}
          crossfadeTargetIndex={crossfadeTargetIndex}
          paramStore={paramStore}
        />
      </Canvas>
    </div>
  );
}

export default RendererRoot;
