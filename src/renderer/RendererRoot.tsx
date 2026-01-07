import { useEffect, useState, useCallback, useRef } from "react";
import * as THREE from "three";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useFrame, useThree } from "@react-three/fiber";
import { WebGPUCanvas } from "./WebGPUCanvas";
import { VideoOutputCapture } from "./VideoOutputCapture";
import { SlotPreviewCapture } from "./SlotPreviewCapture";
import {
  SKETCH_COMPONENT_REGISTRY,
  type SketchProps,
  type SketchId,
  getSketchDescriptor,
} from "../sketches";
import type { ParameterTemplateId } from "../slots/slotTypes";
import { makeSlotParameterId } from "../slots/slotTypes";
import { useRendererSettings } from "../hooks";
import type { RendererInfo, RendererStats } from "../hooks";
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
  // Plasma specific
  plasma_speed: "plasmaSpeed",
  plasma_scale: "plasmaScale",
  plasma_complexity: "plasmaComplexity",
  plasma_color_cycle: "plasmaColorCycle",
  // Kaleidoscope specific
  kaleid_segments: "kaleidSegments",
  kaleid_zoom: "kaleidZoom",
  kaleid_rotation: "kaleidRotation",
  kaleid_pattern_speed: "kaleidPatternSpeed",
  // FeedbackTunnel specific
  tunnel_speed: "tunnelSpeed",
  tunnel_twist: "tunnelTwist",
  tunnel_layers: "tunnelLayers",
  tunnel_color_speed: "tunnelColorSpeed",
  // Waveform specific
  wave_speed: "waveSpeed",
  wave_amplitude: "waveAmplitude",
  wave_frequency: "waveFrequency",
  wave_glow: "waveGlow",
  // Aura specific
  bloom: "bloom",
  complexity: "complexity",
  sample_offset: "sampleOffset",
  speed: "speed",
  scale_base: "scaleBase",
  distance: "distance",
  attenuation: "attenuation",
  ray_steps: "raySteps",
  seed: "seed",
  color_interp: "colorInterp",
  grain_intensity: "grainIntensity",
  tonemap_mode: "tonemapMode",
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
// Renderer Info Reporter
// =============================================================================

interface RendererInfoReporterProps {
  appliedDpr: number;
  backend: "webgpu" | "webgl2" | "unknown";
  reportInfo: (info: RendererInfo) => void;
}

// Number of frame time samples to average for smooth FPS display
const FPS_SAMPLE_COUNT = 60;

/**
 * Component that reports renderer info (dimensions, DPR, backend, stats) to Controls window.
 * Must be inside a Canvas to access useThree.
 * Tracks FPS and other stats every frame and reports them periodically.
 */
function RendererInfoReporter({
  appliedDpr,
  backend,
  reportInfo,
}: RendererInfoReporterProps) {
  const { size, gl } = useThree();

  // FPS tracking
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef<number>(performance.now());

  // Track frame times and report stats
  useFrame(() => {
    const now = performance.now();
    const deltaMs = now - lastTimeRef.current;
    lastTimeRef.current = now;

    // Add frame time to ring buffer
    const frameTimes = frameTimesRef.current;
    frameTimes.push(deltaMs);
    if (frameTimes.length > FPS_SAMPLE_COUNT) {
      frameTimes.shift();
    }

    // Calculate average frame time and FPS
    const avgFrameTime =
      frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const fps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;

    // Get renderer stats (works for both WebGL and WebGPU)
    const glInfo = gl.info;
    const stats: RendererStats = {
      fps: Math.round(fps),
      frameTimeMs: Math.round(avgFrameTime * 100) / 100,
      drawCalls: glInfo?.render?.calls ?? 0,
      triangles: glInfo?.render?.triangles ?? 0,
      textures: glInfo?.memory?.textures ?? 0,
      geometries: glInfo?.memory?.geometries ?? 0,
    };

    // Get actual render dimensions from the renderer
    const renderWidth = gl.domElement.width;
    const renderHeight = gl.domElement.height;

    const info: RendererInfo = {
      windowWidth: size.width,
      windowHeight: size.height,
      renderWidth,
      renderHeight,
      nativePixelRatio: window.devicePixelRatio,
      appliedDpr,
      backend,
      stats,
    };

    reportInfo(info);
  });

  return null;
}

// =============================================================================
// Canvas Content
// =============================================================================

interface RendererContentProps {
  allSlots: SlotInfo[];
  activeSlotIndex: number;
  crossfadeTargetIndex: number | null;
  paramStore: Map<string, number>;
  slotColors: Map<
    number,
    {
      startColor?: [number, number, number];
      midColor?: [number, number, number];
      endColor?: [number, number, number];
      background?: [number, number, number, number];
    }
  >;
}

function RendererContent({
  allSlots,
  activeSlotIndex,
  crossfadeTargetIndex,
  paramStore,
  slotColors,
}: RendererContentProps) {
  const [tintLfoPhase, setTintLfoPhase] = useState(0);
  const slotGroupsRef = useRef<Map<number, THREE.Group>>(new Map());

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

      {/* Per-slot preview capture for streaming to Controls window */}
      <SlotPreviewCapture
        slotGroups={slotGroupsRef}
        visibleSlotIndices={slotsToRender.map((s) => s.index)}
      />

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

        const colors = slotColors.get(slot.index);

        return (
          <group
            key={`slot-${slot.index}`}
            ref={(group) => {
              if (group) {
                slotGroupsRef.current.set(slot.index, group);
              } else {
                slotGroupsRef.current.delete(slot.index);
              }
            }}
          >
            <SketchComponent
              opacity={opacity}
              params={sketchParams}
              colors={colors}
            />
          </group>
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
  >(() => new Map());

  // Track which sketchId each slot had to detect changes
  const prevSlotSketchIds = useRef<Map<number, string | null>>(new Map());

  // Renderer settings (DPR, etc.) from Controls window
  const { settings, reportInfo } = useRendererSettings();

  // Track the renderer backend
  const [rendererBackend, setRendererBackend] = useState<
    "webgpu" | "webgl2" | "unknown"
  >("unknown");

  const handleRendererReady = useCallback((backend: "webgpu" | "webgl2") => {
    setRendererBackend(backend);
  }, []);

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

    // Initialize/reset colors for slots from their descriptors
    // Capture changes BEFORE updating state to avoid race condition with ref updates
    const colorChanges: Array<{
      slotIndex: number;
      colorPalette: {
        startColor: [number, number, number];
        midColor: [number, number, number];
        endColor: [number, number, number];
        background: [number, number, number, number];
      };
    }> = [];
    const colorClears: number[] = [];

    payload.slots.forEach((s) => {
      const prevSketchId = prevSlotSketchIds.current.get(s.index);
      const currentSketchId = s.sketch_id;

      if (currentSketchId && currentSketchId !== prevSketchId) {
        const descriptor = getSketchDescriptor(currentSketchId);
        if (descriptor?.colorPalette) {
          colorChanges.push({
            slotIndex: s.index,
            colorPalette: descriptor.colorPalette,
          });
        }
      } else if (!currentSketchId && prevSketchId) {
        colorClears.push(s.index);
      }
    });

    // Only update state if there are actual changes
    if (colorChanges.length > 0 || colorClears.length > 0) {
      setSlotColors((prev) => {
        const next = new Map(prev);
        for (const change of colorChanges) {
          next.set(change.slotIndex, {
            startColor: change.colorPalette.startColor,
            midColor: change.colorPalette.midColor,
            endColor: change.colorPalette.endColor,
            background: change.colorPalette.background,
          });
        }
        for (const slotIndex of colorClears) {
          next.delete(slotIndex);
        }
        return next;
      });
    }

    // Update tracking ref AFTER determining changes (outside of setState)
    payload.slots.forEach((s) => {
      prevSlotSketchIds.current.set(s.index, s.sketch_id);
    });
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

  // Listen for color changes from controls window (both direct and via backend)
  useEffect(() => {
    let unlisten: (() => void) | undefined;

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
    };

    // Listen for local color changes
    window.addEventListener("sketch-color-changed", handleColorChange);

    // Listen for color changes forwarded from controls window via backend
    async function subscribeToBackendEvents() {
      try {
        unlisten = await listen<string>(
          "renderer:sketch-color-changed",
          (event) => {
            try {
              const payload = JSON.parse(event.payload);
              const { slotIndex, colorType, color } = payload;

              setSlotColors((prev) => {
                const next = new Map(prev);
                const current = next.get(slotIndex) || {};
                next.set(slotIndex, {
                  ...current,
                  [colorType]: color,
                });
                return next;
              });
            } catch (error) {
              console.error(
                "[Renderer] Failed to parse color change event:",
                error,
              );
            }
          },
        );
        console.log(
          "[Renderer] Subscribed to renderer:sketch-color-changed events",
        );
      } catch (error) {
        console.error(
          "[Renderer] Failed to subscribe to renderer:sketch-color-changed:",
          error,
        );
      }
    }

    void subscribeToBackendEvents();

    return () => {
      window.removeEventListener("sketch-color-changed", handleColorChange);
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className={styles.root}>
      <WebGPUCanvas
        camera={{ position: [0, 0, 4], fov: 50 }}
        frameloop="always"
        dpr={settings.dpr}
        onRendererReady={handleRendererReady}
      >
        {/* Report renderer info and stats to Controls window */}
        <RendererInfoReporter
          appliedDpr={settings.dpr}
          backend={rendererBackend}
          reportInfo={reportInfo}
        />
        {/* Video output capture - sends frames to Syphon/Spout/NDI when active */}
        <VideoOutputCapture />
        <RendererContent
          allSlots={allSlots}
          activeSlotIndex={activeSlotIndex}
          crossfadeTargetIndex={crossfadeTargetIndex}
          paramStore={paramStore}
          slotColors={slotColors}
        />
      </WebGPUCanvas>
    </div>
  );
}

export default RendererRoot;
