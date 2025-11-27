import { useEffect, useState, useCallback } from "react";
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
 * Slot pairing event payload from backend.
 * Uses slot indices instead of scene IDs for multi-instance support.
 */
interface SlotPairingPayload {
  active_slot_index: number;
  active_scene_id: SketchId;
  next_slot_index: number;
  next_scene_id: SketchId;
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
 * Calculate the opacity for a slot based on crossfade state.
 *
 * @param slotIndex - The slot being rendered
 * @param activeSlotIndex - The currently active (output) slot
 * @param nextSlotIndex - The slot we're crossfading to
 * @param crossfade - Current crossfade value (0 = fully active, 1 = fully next)
 */
function calculateSlotOpacity(
  slotIndex: number,
  activeSlotIndex: number,
  nextSlotIndex: number,
  crossfade: number,
): number {
  const clampedCrossfade = Math.max(0, Math.min(1, crossfade));

  const isActive = slotIndex === activeSlotIndex;
  const isNext = slotIndex === nextSlotIndex;

  // If this slot is both active and next (same slot), show at full opacity
  if (isActive && isNext) {
    return 1;
  }

  // If this is the active slot, fade out as crossfade increases
  if (isActive) {
    return 1 - clampedCrossfade;
  }

  // If this is the next slot, fade in as crossfade increases
  if (isNext) {
    return clampedCrossfade;
  }

  // Slot is neither active nor next - hide it
  return 0;
}

// =============================================================================
// Canvas Content
// =============================================================================

interface RendererContentProps {
  activeSlot: SlotInfo;
  nextSlot: SlotInfo;
  paramStore: Map<string, number>;
}

function RendererContent({
  activeSlot,
  nextSlot,
  paramStore,
}: RendererContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);

  const crossfade = paramStore.get("crossfade") ?? 0;

  // Calculate max tint LFO depth across active slots for the driver
  const activeTintLfoDepthParamId = makeSlotParameterId(
    activeSlot.index,
    "tint_lfo_depth",
  );
  const activeTintLfoDepth = paramStore.get(activeTintLfoDepthParamId) ?? 0;
  const nextTintLfoDepthParamId = makeSlotParameterId(
    nextSlot.index,
    "tint_lfo_depth",
  );
  const nextTintLfoDepth = paramStore.get(nextTintLfoDepthParamId) ?? 0;
  const maxTintLfoDepth = Math.max(activeTintLfoDepth, nextTintLfoDepth);

  // Determine which slots to render (active and/or next)
  const slotsToRender: SlotInfo[] = [];

  // Always include active slot
  slotsToRender.push(activeSlot);

  // Include next slot if different from active and crossfading
  if (
    nextSlot.index !== activeSlot.index &&
    crossfade > 0.001 &&
    crossfade < 0.999
  ) {
    slotsToRender.push(nextSlot);
  }

  return (
    <>
      <TintLfoDriver depth={maxTintLfoDepth} setPhase={setTintLfoPhase} />
      <color attach="background" args={["#020617"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, -4, -2]} intensity={0.4} />

      {/* Render slots based on active/next pairing */}
      {slotsToRender.map((slot) => {
        const SketchComponent = SKETCH_COMPONENT_REGISTRY[slot.sketchId];
        if (!SketchComponent) return null;

        const opacity = calculateSlotOpacity(
          slot.index,
          activeSlot.index,
          nextSlot.index,
          crossfade,
        );

        // Skip rendering slots with zero opacity for performance
        if (opacity < 0.001) return null;

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
 * RendererRoot - Main renderer window component with multi-instance support.
 *
 * Architecture:
 * 1. Stores ALL parameters in a generic Map (including slot-prefixed IDs)
 * 2. Listens to `slot_pairing_changed` for active/next slot indices and scene IDs
 * 3. Listens to `parameter_changed` for ANY parameter update
 * 4. Renders slots based on the active/next pairing
 * 5. Dynamically builds scene params based on slot index and scene descriptors
 *
 * Key changes for multi-instance:
 * - Parameters use slot-prefixed IDs (e.g., `slot_0_brightness`)
 * - Scene pairing uses slot indices instead of just scene IDs
 * - Each slot renders its own instance of the scene component
 */
export function RendererRoot() {
  // Slot pairing state
  const [activeSlot, setActiveSlot] = useState<SlotInfo>({
    index: 0,
    sketchId: "blueCube",
  });
  const [nextSlot, setNextSlot] = useState<SlotInfo>({
    index: 0,
    sketchId: "blueCube",
  });

  // Generic parameter store - stores ANY parameter by its backend ID
  const [paramStore, setParamStore] = useState<Map<string, number>>(
    () => new Map([["crossfade", 0]]),
  );

  // Stats toggle (press "D" to show/hide performance stats)
  const { showStats } = useStatsToggle();

  // Update a parameter and trigger re-render
  const updateParam = useCallback((id: string, value: number) => {
    setParamStore((prev) => {
      // Only update if value actually changed to avoid unnecessary re-renders
      if (prev.get(id) === value) return prev;
      const next = new Map(prev);
      next.set(id, value);
      return next;
    });
  }, []);

  // Handle incoming parameter from backend
  const handleParameterChanged = useCallback(
    (param: BackendParameter) => {
      updateParam(param.id, param.value);
    },
    [updateParam],
  );

  // Handle slot pairing change (new multi-instance format)
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

      setActiveSlot({
        index: payload.active_slot_index,
        sketchId: payload.active_scene_id,
      });
      setNextSlot({
        index: payload.next_slot_index,
        sketchId: payload.next_scene_id,
      });
    },
    [],
  );

  // Legacy handler for scene_pairing_changed (backwards compatibility during migration)
  const handleLegacyScenePairingChanged = useCallback(
    (payload: { active_scene_id: SketchId; next_scene_id: SketchId }) => {
      console.log(
        "[Renderer] Legacy scene pairing:",
        payload.active_scene_id,
        "->",
        payload.next_scene_id,
      );
      // Map legacy scene IDs to slot 0 for backwards compatibility
      setActiveSlot({ index: 0, sketchId: payload.active_scene_id });
      setNextSlot({ index: 0, sketchId: payload.next_scene_id });
    },
    [],
  );

  // Hydrate from backend on startup
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
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
        console.error("[Renderer] Failed to hydrate parameters:", error);
      }
    }

    void hydrate();

    return () => {
      mounted = false;
    };
  }, [handleParameterChanged]);

  // Listen for slot pairing changes (new format)
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
          activeSlot={activeSlot}
          nextSlot={nextSlot}
          paramStore={paramStore}
        />
      </Canvas>
    </div>
  );
}

export default RendererRoot;
