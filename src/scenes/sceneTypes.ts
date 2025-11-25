/* Scene System scaffolding — initial design only.
 *
 * This file defines minimal types and a registry for scenes and their
 * parameters. The goal is to:
 *
 * - Keep runtime behavior unchanged for now: the renderer still
 *   hardcodes which scenes to render and which parameters to read.
 * - Provide a declarative description of scenes + parameters that the
 *   Control UI and future Scene Manager can use to:
 *     - Group parameters by scene.
 *     - Drive scene selection UI.
 *     - Eventually switch scenes without deep coupling to layout code.
 *
 * This is intentionally conservative and can evolve as more scenes and
 * modulation features are added.
 */

/**
 * Identifier for a scene.
 *
 * For now we only have:
 * - "sceneA" → Blue cube with wobble/tint
 * - "sceneB" → Orange cube
 * - "sceneC" → Green pulsing cube
 *
 * This is a string union rather than an enum so that:
 * - It is easy to extend in code generators / config-driven flows.
 * - It stays ergonomic in JSON if we ever serialize scene state.
 */
export type SceneId = "sceneA" | "sceneB" | "sceneC";

/**
 * Identifier for a parameter as used across the app.
 *
 * NOTE:
 * - This must stay aligned with backend parameter IDs and existing
 *   client usage:
 *     "crossfade"
 *     "scene_a_brightness"
 *     "scene_a_wobble"
 *     "scene_a_tint"
 *     "scene_a_tint_lfo_depth"
 *     "rotationSpeed"
 *     "scene_b_brightness"
 *     "scene_b_rotation_speed"
 *     "scene_b_tint"
 *     "scene_b_scale"
 *     "scene_c_brightness"
 *     "scene_c_pulse_speed"
 *     "scene_c_rotation_speed"
 *     "scene_c_tint"
 *
 * - Do NOT arbitrarily rename or remove IDs here; they are part of
 *   the shared contract with the Rust Parameter Server and the
 *   renderer/controls windows.
 */
export type ParameterId =
  // Global / transition
  | "crossfade"
  // Scene A
  | "scene_a_brightness"
  | "scene_a_wobble"
  | "scene_a_tint"
  | "scene_a_tint_lfo_depth"
  | "rotationSpeed"
  // Scene B
  | "scene_b_brightness"
  | "scene_b_rotation_speed"
  | "scene_b_tint"
  | "scene_b_scale"
  // Scene C
  | "scene_c_brightness"
  | "scene_c_pulse_speed"
  | "scene_c_rotation_speed"
  | "scene_c_tint";

/**
 * Lightweight description of a parameter from the Scene System's
 * perspective.
 *
 * This is *not* the same as the backend `Parameter` model; it is
 * purely metadata for:
 * - UI grouping
 * - Labelling
 * - Default ranges
 *
 * The canonical runtime value/target/speed/curve still live in the
 * backend Parameter Server.
 */
export interface SceneParameterDescriptor {
  /**
   * Exact backend parameter ID.
   */
  id: ParameterId;

  /**
   * Human-readable label used in scene-aware UIs.
   * Optional: existing UIs may still hardcode labels for now.
   */
  label?: string;

  /**
   * Optional group hint for UI.
   *
   * Examples:
   * - "scene"       → scene-local parameter (e.g., wobble, tint)
   * - "transition"  → crossfades / scene switching
   * - "global"      → reused across multiple scenes
   */
  group?: "scene" | "transition" | "global";

  /**
   * Optional ordering hint within a scene's parameter panel.
   * Lower numbers should appear first.
   */
  orderHint?: number;

  /**
   * Optional UI range hints. These DO NOT clamp backend values; they
   * simply guide sliders/inputs in the Control UI.
   */
  min?: number;
  max?: number;

  /**
   * Optional default value, purely descriptive.
   * The real runtime default is still owned by the backend + control UI
   * reset logic.
   */
  defaultValue?: number;
}

/**
 * Descriptor for a single visual scene.
 *
 * For now we only use this for documentation and potential future
 * UI grouping. The renderer still mounts scenes directly.
 */
export interface SceneDescriptor {
  /**
   * Stable ID for the scene.
   */
  id: SceneId;

  /**
   * Label for UI (scene picker, inspector headings, etc.).
   */
  label: string;

  /**
   * Short description for docs / tooltips.
   */
  description?: string;

  /**
   * Parameters this scene cares about.
   *
   * The same `ParameterId` may appear in multiple scenes (e.g.,
   * `crossfade` as a global transition parameter).
   */
  parameters: SceneParameterDescriptor[];
}

/**
 * Initial scene registry.
 *
 * This is a static array for now. In the future we may:
 * - Load additional scene descriptors dynamically.
 * - Allow plugins or user projects to register scenes at runtime.
 */
export const SCENE_REGISTRY: SceneDescriptor[] = [
  {
    id: "sceneA",
    label: "Scene A — Blue Cube",
    description:
      "Primary demo scene with a blue cube driven by crossfade, brightness, wobble, tint, and rotationSpeed.",
    parameters: [
      {
        id: "crossfade",
        label: "Crossfade",
        group: "transition",
        orderHint: 10,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      },
      {
        id: "scene_a_brightness",
        label: "Scene A Brightness",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 2,
        defaultValue: 1,
      },
      {
        id: "scene_a_wobble",
        label: "Scene A Wobble",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 1,
        defaultValue: 0,
      },
      {
        id: "scene_a_tint",
        label: "Scene A Tint",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        defaultValue: 0,
      },
      {
        id: "scene_a_tint_lfo_depth",
        label: "Scene A Tint LFO Depth",
        group: "scene",
        orderHint: 45,
        min: 0,
        max: 1,
        defaultValue: 0.2,
      },
      {
        id: "rotationSpeed",
        label: "Rotation Speed",
        group: "global",
        orderHint: 50,
        min: 0,
        max: 5,
        defaultValue: 0.6,
      },
    ],
  },
  {
    id: "sceneB",
    label: "Scene B — Orange Cube",
    description:
      "Secondary demo scene with an orange cube. Supports brightness, rotation, tint (red-yellow shift), and scale.",
    parameters: [
      {
        id: "crossfade",
        label: "Crossfade",
        group: "transition",
        orderHint: 10,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      },
      {
        id: "scene_b_brightness",
        label: "Scene B Brightness",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 2,
        defaultValue: 1,
      },
      {
        id: "scene_b_rotation_speed",
        label: "Scene B Rotation Speed",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 5,
        defaultValue: 0.4,
      },
      {
        id: "scene_b_tint",
        label: "Scene B Tint",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      },
      {
        id: "scene_b_scale",
        label: "Scene B Scale",
        group: "scene",
        orderHint: 50,
        min: 0.5,
        max: 2,
        defaultValue: 1,
      },
    ],
  },
  {
    id: "sceneC",
    label: "Scene C — Green Pulsing Cube",
    description:
      "Tertiary demo scene with a green pulsing cube. Supports brightness, pulse speed, rotation, and tint (cyan-lime shift).",
    parameters: [
      {
        id: "crossfade",
        label: "Crossfade",
        group: "transition",
        orderHint: 10,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      },
      {
        id: "scene_c_brightness",
        label: "Scene C Brightness",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 2,
        defaultValue: 1,
      },
      {
        id: "scene_c_pulse_speed",
        label: "Scene C Pulse Speed",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 5,
        defaultValue: 1.5,
      },
      {
        id: "scene_c_rotation_speed",
        label: "Scene C Rotation Speed",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 5,
        defaultValue: 0.4,
      },
      {
        id: "scene_c_tint",
        label: "Scene C Tint",
        group: "scene",
        orderHint: 50,
        min: 0,
        max: 1,
        defaultValue: 0.5,
      },
    ],
  },
];

/**
 * Helper to look up a scene descriptor by ID.
 *
 * This is deliberately simple; a future Scene Manager might expose a
 * richer API, but this is enough for:
 * - Controls UI to discover which parameters belong to which scene.
 * - Documentation/inspector tooling.
 */
export function getSceneDescriptor(id: SceneId): SceneDescriptor | undefined {
  return SCENE_REGISTRY.find((scene) => scene.id === id);
}

/**
 * Helper to find all scenes that reference a given parameter ID.
 *
 * This is useful for:
 * - Understanding where a given backend parameter is used.
 * - Driving UI that wants to show "this parameter is used in scenes: …".
 */
export function getScenesUsingParameter(
  parameterId: ParameterId,
): SceneDescriptor[] {
  return SCENE_REGISTRY.filter((scene) =>
    scene.parameters.some((param) => param.id === parameterId),
  );
}
