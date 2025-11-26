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
 * Available slider color themes for parameter UI.
 */
export type SliderColor =
  | "emerald"
  | "indigo"
  | "cyan"
  | "amber"
  | "rose"
  | "violet"
  | "lime"
  | "orange"
  | "sky"
  | "fuchsia";

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
 * Array of all available scene IDs for iteration.
 */
export const ALL_SCENE_IDS: SceneId[] = ["sceneA", "sceneB", "sceneC"];

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
 * - Auto-generating control sliders
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
   */
  label: string;

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
   * Minimum value for UI sliders. Defaults to 0.
   */
  min: number;

  /**
   * Maximum value for UI sliders. Defaults to 1.
   */
  max: number;

  /**
   * Step size for slider increments. Defaults to 0.01.
   */
  step: number;

  /**
   * Default value for the parameter.
   */
  defaultValue: number;

  /**
   * Optional color theme for the slider UI.
   */
  color?: SliderColor;

  /**
   * Optional description/tooltip for the parameter.
   */
  description?: string;
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
   * Short label for compact UI (e.g., column headers).
   */
  shortLabel: string;

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
    shortLabel: "Scene A",
    description:
      "Primary demo scene with a blue cube driven by crossfade, brightness, wobble, tint, and rotationSpeed.",
    parameters: [
      {
        id: "scene_a_brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "emerald",
        description: "Adjusts the brightness of Scene A in the renderer.",
      },
      {
        id: "rotationSpeed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.6,
        color: "indigo",
        description: "Controls the cube rotation speed in the renderer.",
      },
      {
        id: "scene_a_wobble",
        label: "Wobble",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0,
        color: "emerald",
        description:
          "Controls how much Scene A's cube wobbles in X/Y over time.",
      },
      {
        id: "scene_a_tint_lfo_depth",
        label: "Tint LFO Depth",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.2,
        color: "emerald",
        description:
          "Controls how strongly an LFO modulates Scene A's tint around the base value.",
      },
      {
        id: "scene_a_tint",
        label: "Tint",
        group: "scene",
        orderHint: 50,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0,
        color: "cyan",
        description:
          "Blends Scene A between its base blue and a more cyan tint.",
      },
    ],
  },
  {
    id: "sceneB",
    label: "Scene B — Orange Cube",
    shortLabel: "Scene B",
    description:
      "Secondary demo scene with an orange cube. Supports brightness, rotation, tint (red-yellow shift), and scale.",
    parameters: [
      {
        id: "scene_b_brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "amber",
        description: "Adjusts the brightness of Scene B in the renderer.",
      },
      {
        id: "scene_b_rotation_speed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.4,
        color: "orange",
        description: "Controls the cube rotation speed for Scene B.",
      },
      {
        id: "scene_b_tint",
        label: "Tint",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.5,
        color: "amber",
        description: "Shifts Scene B's color between red and yellow.",
      },
      {
        id: "scene_b_scale",
        label: "Scale",
        group: "scene",
        orderHint: 40,
        min: 0.5,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "orange",
        description: "Adjusts the size of Scene B's cube.",
      },
    ],
  },
  {
    id: "sceneC",
    label: "Scene C — Green Pulsing Cube",
    shortLabel: "Scene C",
    description:
      "Tertiary demo scene with a green pulsing cube. Supports brightness, pulse speed, rotation, and tint (cyan-lime shift).",
    parameters: [
      {
        id: "scene_c_brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "lime",
        description: "Adjusts the brightness of Scene C in the renderer.",
      },
      {
        id: "scene_c_pulse_speed",
        label: "Pulse Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 1.5,
        color: "lime",
        description: "Controls how fast Scene C's cube pulses.",
      },
      {
        id: "scene_c_rotation_speed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.4,
        color: "emerald",
        description: "Controls the cube rotation speed for Scene C.",
      },
      {
        id: "scene_c_tint",
        label: "Tint",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.5,
        color: "lime",
        description: "Shifts Scene C's color between cyan and lime.",
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

/**
 * Get the default value for a parameter from the scene registry.
 * Searches all scenes and returns the first match, or undefined.
 */
export function getParameterDefault(
  parameterId: ParameterId,
): number | undefined {
  for (const scene of SCENE_REGISTRY) {
    const param = scene.parameters.find((p) => p.id === parameterId);
    if (param) {
      return param.defaultValue;
    }
  }
  return undefined;
}

/**
 * Get the parameter descriptor from any scene that contains it.
 */
export function getParameterDescriptor(
  parameterId: ParameterId,
): SceneParameterDescriptor | undefined {
  for (const scene of SCENE_REGISTRY) {
    const param = scene.parameters.find((p) => p.id === parameterId);
    if (param) {
      return param;
    }
  }
  return undefined;
}

/**
 * Collect all unique parameter IDs from all scenes.
 */
export function getAllParameterIds(): ParameterId[] {
  const ids = new Set<ParameterId>();
  for (const scene of SCENE_REGISTRY) {
    for (const param of scene.parameters) {
      ids.add(param.id);
    }
  }
  return Array.from(ids);
}

/**
 * Build a map of parameter ID → default value from the registry.
 */
export function buildDefaultParameterMap(): Map<ParameterId, number> {
  const map = new Map<ParameterId, number>();
  for (const scene of SCENE_REGISTRY) {
    for (const param of scene.parameters) {
      if (!map.has(param.id)) {
        map.set(param.id, param.defaultValue);
      }
    }
  }
  // Add crossfade as a global parameter
  map.set("crossfade", 0);
  return map;
}
