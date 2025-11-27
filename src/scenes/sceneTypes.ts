/* Scene System with Multi-Instance Support
 *
 * This file defines types and a registry for scenes and their parameters.
 * Parameters are now template-based, meaning each slot gets its own
 * independent set of parameters prefixed with `slot_{index}_`.
 *
 * Key concepts:
 * - Parameter templates define the shape (label, min, max, etc.)
 * - Slot parameter IDs are generated as `slot_{slotIndex}_{templateId}`
 * - Scenes can be instantiated multiple times in different slots
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
 * Identifier for a scene type.
 *
 * - "sceneA" → Blue cube with wobble/tint
 * - "sceneB" → Orange cube
 * - "sceneC" → Green pulsing cube
 */
export type SceneId = "sceneA" | "sceneB" | "sceneC";

/**
 * Array of all available scene IDs for iteration.
 */
export const ALL_SCENE_IDS: SceneId[] = ["sceneA", "sceneB", "sceneC"];

/**
 * Template ID for a parameter (without slot prefix).
 * These are the base names used in parameter templates.
 */
export type ParameterTemplateId =
  // Common parameters (used across scenes)
  | "brightness"
  | "rotation_speed"
  | "tint"
  // Scene A specific
  | "wobble"
  | "tint_lfo_depth"
  // Scene B specific
  | "scale"
  // Scene C specific
  | "pulse_speed";

/**
 * Global parameter IDs (not slot-scoped).
 */
export type GlobalParameterId = "crossfade";

/**
 * A slot-scoped parameter ID in the format `slot_{index}_{templateId}`.
 * This is a branded string type for type safety.
 */
export type SlotParameterId = `slot_${number}_${ParameterTemplateId}`;

/**
 * Union of all valid parameter IDs (global + slot-scoped).
 */
export type ParameterId = GlobalParameterId | SlotParameterId | string;

/**
 * Legacy parameter IDs for migration support.
 * Maps old scene-prefixed IDs to new template IDs.
 */
export const LEGACY_PARAMETER_MAPPING: Record<
  string,
  { sceneId: SceneId; templateId: ParameterTemplateId }
> = {
  // Scene A
  scene_a_brightness: { sceneId: "sceneA", templateId: "brightness" },
  scene_a_wobble: { sceneId: "sceneA", templateId: "wobble" },
  scene_a_tint: { sceneId: "sceneA", templateId: "tint" },
  scene_a_tint_lfo_depth: { sceneId: "sceneA", templateId: "tint_lfo_depth" },
  rotationSpeed: { sceneId: "sceneA", templateId: "rotation_speed" },
  // Scene B
  scene_b_brightness: { sceneId: "sceneB", templateId: "brightness" },
  scene_b_rotation_speed: { sceneId: "sceneB", templateId: "rotation_speed" },
  scene_b_tint: { sceneId: "sceneB", templateId: "tint" },
  scene_b_scale: { sceneId: "sceneB", templateId: "scale" },
  // Scene C
  scene_c_brightness: { sceneId: "sceneC", templateId: "brightness" },
  scene_c_pulse_speed: { sceneId: "sceneC", templateId: "pulse_speed" },
  scene_c_rotation_speed: { sceneId: "sceneC", templateId: "rotation_speed" },
  scene_c_tint: { sceneId: "sceneC", templateId: "tint" },
};

/**
 * Generate a slot-scoped parameter ID from slot index and template ID.
 */
export function makeSlotParameterId(
  slotIndex: number,
  templateId: ParameterTemplateId,
): SlotParameterId {
  return `slot_${slotIndex}_${templateId}` as SlotParameterId;
}

/**
 * Parse a slot parameter ID into its components.
 * Returns null if the ID is not a valid slot parameter ID.
 */
export function parseSlotParameterId(
  id: string,
): { slotIndex: number; templateId: ParameterTemplateId } | null {
  const match = id.match(/^slot_(\d+)_(.+)$/);
  if (!match) return null;
  return {
    slotIndex: parseInt(match[1], 10),
    templateId: match[2] as ParameterTemplateId,
  };
}

/**
 * Check if a parameter ID is a slot-scoped parameter.
 */
export function isSlotParameterId(id: string): id is SlotParameterId {
  return /^slot_\d+_.+$/.test(id);
}

/**
 * Check if a parameter ID is a global parameter.
 */
export function isGlobalParameterId(id: string): id is GlobalParameterId {
  return id === "crossfade";
}

/**
 * Lightweight description of a parameter template.
 * This defines the parameter's metadata without the slot prefix.
 */
export interface ParameterTemplate {
  /**
   * Template ID (e.g., "brightness", "tint", "wobble").
   */
  templateId: ParameterTemplateId;

  /**
   * Human-readable label used in UI.
   */
  label: string;

  /**
   * Optional group hint for UI.
   */
  group?: "scene" | "transition" | "global";

  /**
   * Optional ordering hint within a scene's parameter panel.
   * Lower numbers appear first.
   */
  orderHint?: number;

  /**
   * Minimum value for UI sliders.
   */
  min: number;

  /**
   * Maximum value for UI sliders.
   */
  max: number;

  /**
   * Step size for slider increments.
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
 */
export interface SceneDescriptor {
  /**
   * Stable ID for the scene type.
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
   * Parameter templates for this scene.
   * These get instantiated per-slot with slot-prefixed IDs.
   */
  parameters: ParameterTemplate[];
}

/**
 * Scene registry with template-based parameters.
 */
export const SCENE_REGISTRY: SceneDescriptor[] = [
  {
    id: "sceneA",
    label: "Scene A — Blue Cube",
    shortLabel: "Scene A",
    description:
      "Primary demo scene with a blue cube driven by brightness, rotation, wobble, and tint.",
    parameters: [
      {
        templateId: "brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "emerald",
        description: "Adjusts the brightness of the scene.",
      },
      {
        templateId: "rotation_speed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.6,
        color: "indigo",
        description: "Controls the cube rotation speed.",
      },
      {
        templateId: "wobble",
        label: "Wobble",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0,
        color: "emerald",
        description: "Controls how much the cube wobbles in X/Y over time.",
      },
      {
        templateId: "tint_lfo_depth",
        label: "Tint LFO Depth",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.2,
        color: "emerald",
        description: "Controls how strongly an LFO modulates the tint.",
      },
      {
        templateId: "tint",
        label: "Tint",
        group: "scene",
        orderHint: 50,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0,
        color: "cyan",
        description: "Blends between base blue and cyan tint.",
      },
    ],
  },
  {
    id: "sceneB",
    label: "Scene B — Orange Cube",
    shortLabel: "Scene B",
    description:
      "Secondary demo scene with an orange cube. Supports brightness, rotation, tint, and scale.",
    parameters: [
      {
        templateId: "brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "amber",
        description: "Adjusts the brightness of the scene.",
      },
      {
        templateId: "rotation_speed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.4,
        color: "orange",
        description: "Controls the cube rotation speed.",
      },
      {
        templateId: "tint",
        label: "Tint",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.5,
        color: "amber",
        description: "Shifts color between red and yellow.",
      },
      {
        templateId: "scale",
        label: "Scale",
        group: "scene",
        orderHint: 40,
        min: 0.5,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "orange",
        description: "Adjusts the size of the cube.",
      },
    ],
  },
  {
    id: "sceneC",
    label: "Scene C — Green Pulsing Cube",
    shortLabel: "Scene C",
    description:
      "Tertiary demo scene with a green pulsing cube. Supports brightness, pulse speed, rotation, and tint.",
    parameters: [
      {
        templateId: "brightness",
        label: "Brightness",
        group: "scene",
        orderHint: 10,
        min: 0,
        max: 2,
        step: 0.01,
        defaultValue: 1,
        color: "lime",
        description: "Adjusts the brightness of the scene.",
      },
      {
        templateId: "pulse_speed",
        label: "Pulse Speed",
        group: "scene",
        orderHint: 20,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 1.5,
        color: "lime",
        description: "Controls how fast the cube pulses.",
      },
      {
        templateId: "rotation_speed",
        label: "Rotation Speed",
        group: "scene",
        orderHint: 30,
        min: 0,
        max: 5,
        step: 0.05,
        defaultValue: 0.4,
        color: "emerald",
        description: "Controls the cube rotation speed.",
      },
      {
        templateId: "tint",
        label: "Tint",
        group: "scene",
        orderHint: 40,
        min: 0,
        max: 1,
        step: 0.01,
        defaultValue: 0.5,
        color: "lime",
        description: "Shifts color between cyan and lime.",
      },
    ],
  },
];

/**
 * Helper to look up a scene descriptor by ID.
 */
export function getSceneDescriptor(id: SceneId): SceneDescriptor | undefined {
  return SCENE_REGISTRY.find((scene) => scene.id === id);
}

/**
 * Get the default value for a parameter template from any scene.
 */
export function getParameterTemplateDefault(
  templateId: ParameterTemplateId,
): number | undefined {
  for (const scene of SCENE_REGISTRY) {
    const param = scene.parameters.find((p) => p.templateId === templateId);
    if (param) {
      return param.defaultValue;
    }
  }
  return undefined;
}

/**
 * Get the parameter template from a scene descriptor.
 */
export function getParameterTemplate(
  sceneId: SceneId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return undefined;
  return scene.parameters.find((p) => p.templateId === templateId);
}

/**
 * Get min/max range for a slot parameter.
 */
export function getSlotParameterRange(
  _slotIndex: number,
  templateId: ParameterTemplateId,
  sceneId: SceneId,
): { min: number; max: number } | undefined {
  const template = getParameterTemplate(sceneId, templateId);
  if (!template) return undefined;
  return { min: template.min, max: template.max };
}

/**
 * Build a map of slot parameter IDs → default values for a slot.
 */
export function buildSlotDefaultParameters(
  slotIndex: number,
  sceneId: SceneId,
): Map<SlotParameterId, number> {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return new Map();

  const map = new Map<SlotParameterId, number>();
  for (const param of scene.parameters) {
    const id = makeSlotParameterId(slotIndex, param.templateId);
    map.set(id, param.defaultValue);
  }
  return map;
}

/**
 * Build default parameters for all slots.
 */
export function buildAllSlotsDefaultParameters(
  slots: Array<{ index: number; sceneId: SceneId }>,
): Map<ParameterId, number> {
  const map = new Map<ParameterId, number>();

  // Add global crossfade parameter
  map.set("crossfade", 0);

  // Add slot parameters
  for (const slot of slots) {
    const slotDefaults = buildSlotDefaultParameters(slot.index, slot.sceneId);
    for (const [id, value] of slotDefaults) {
      map.set(id, value);
    }
  }

  return map;
}

/**
 * Copy parameters from one slot to another.
 * Returns a map of new parameter IDs → values.
 */
export function copySlotParameters(
  sourceSlotIndex: number,
  targetSlotIndex: number,
  sceneId: SceneId,
  getParameterValue: (id: ParameterId) => number | undefined,
): Map<SlotParameterId, number> {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return new Map();

  const map = new Map<SlotParameterId, number>();
  for (const param of scene.parameters) {
    const sourceId = makeSlotParameterId(sourceSlotIndex, param.templateId);
    const targetId = makeSlotParameterId(targetSlotIndex, param.templateId);
    const value = getParameterValue(sourceId) ?? param.defaultValue;
    map.set(targetId, value);
  }
  return map;
}

/**
 * Get all parameter template IDs used by a scene.
 */
export function getSceneParameterTemplateIds(
  sceneId: SceneId,
): ParameterTemplateId[] {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return [];
  return scene.parameters.map((p) => p.templateId);
}

/**
 * Get all slot parameter IDs for a slot.
 */
export function getSlotParameterIds(
  slotIndex: number,
  sceneId: SceneId,
): SlotParameterId[] {
  const templateIds = getSceneParameterTemplateIds(sceneId);
  return templateIds.map((templateId) =>
    makeSlotParameterId(slotIndex, templateId),
  );
}

/**
 * Get all parameter IDs across all slots.
 * Used by AudioPanel and ModulationPanel for parameter selection dropdowns.
 */
export function getAllSlotParameterIds(
  slots: Array<{ index: number; sceneId: SceneId }>,
): ParameterId[] {
  const ids: ParameterId[] = [];

  // Add global crossfade parameter
  ids.push("crossfade");

  // Add all slot parameters
  for (const slot of slots) {
    const slotIds = getSlotParameterIds(slot.index, slot.sceneId);
    ids.push(...slotIds);
  }

  return ids;
}

/**
 * Legacy compatibility: Get all parameter IDs for all possible slots.
 * This generates parameter IDs for slots 0-5 (max 6 slots) for all scene types.
 * Used by AudioPanel and ModulationPanel for parameter selection dropdowns.
 *
 * @deprecated Use getAllSlotParameterIds(slots) for accurate slot-based parameters
 */
export function getAllParameterIds(): ParameterId[] {
  const ids: ParameterId[] = [];

  // Add global crossfade parameter
  ids.push("crossfade");

  // Generate parameters for all possible slots (0-5) and all scene types
  // This ensures the dropdowns always show available parameters
  const maxSlots = 6;
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    for (const scene of SCENE_REGISTRY) {
      for (const template of scene.parameters) {
        const paramId = makeSlotParameterId(slotIndex, template.templateId);
        // Avoid duplicates (same template across different scenes)
        if (!ids.includes(paramId)) {
          ids.push(paramId);
        }
      }
    }
  }

  return ids;
}

/**
 * Legacy compatibility: Build a map from old parameter IDs to new slot parameter IDs.
 * This is used for migrating saved parameters.
 *
 * @param slots - Current slot configuration to determine which slot index to use for each scene
 * @returns Map of old parameter ID → new slot parameter ID
 */
export function buildLegacyMigrationMap(
  slots: Array<{ index: number; sceneId: SceneId }>,
): Map<string, SlotParameterId> {
  const map = new Map<string, SlotParameterId>();

  // For each legacy parameter, find the first slot with that scene type
  for (const [legacyId, { sceneId, templateId }] of Object.entries(
    LEGACY_PARAMETER_MAPPING,
  )) {
    const slot = slots.find((s) => s.sceneId === sceneId);
    if (slot) {
      const newId = makeSlotParameterId(slot.index, templateId);
      map.set(legacyId, newId);
    }
  }

  return map;
}

/**
 * SceneParameterDescriptor - for backwards compatibility with existing code.
 * This is a "realized" parameter descriptor with a full parameter ID.
 *
 * @deprecated Use ParameterTemplate and slot-based functions instead.
 */
export interface SceneParameterDescriptor {
  id: ParameterId;
  label: string;
  group?: "scene" | "transition" | "global";
  orderHint?: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  color?: SliderColor;
  description?: string;
}

/**
 * Build realized parameter descriptors for a slot.
 * This bridges the gap between templates and the existing UI code.
 */
export function buildSlotParameterDescriptors(
  slotIndex: number,
  sceneId: SceneId,
): SceneParameterDescriptor[] {
  const scene = getSceneDescriptor(sceneId);
  if (!scene) return [];

  return scene.parameters.map((template) => ({
    id: makeSlotParameterId(slotIndex, template.templateId),
    label: template.label,
    group: template.group,
    orderHint: template.orderHint,
    min: template.min,
    max: template.max,
    step: template.step,
    defaultValue: template.defaultValue,
    color: template.color,
    description: template.description,
  }));
}

/**
 * Get the default value for any parameter (global or slot-scoped).
 */
export function getParameterDefault(
  parameterId: ParameterId,
  sceneIdForSlot?: SceneId,
): number | undefined {
  // Handle global parameters
  if (parameterId === "crossfade") {
    return 0;
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(parameterId);
  if (parsed && sceneIdForSlot) {
    const template = getParameterTemplate(sceneIdForSlot, parsed.templateId);
    return template?.defaultValue;
  }

  return undefined;
}

/**
 * Get the parameter descriptor for any parameter.
 * For slot parameters, can optionally provide sceneIdForSlot for accuracy.
 * If not provided, will search all scenes for the template.
 */
export function getParameterDescriptor(
  parameterId: ParameterId,
  sceneIdForSlot?: SceneId,
): SceneParameterDescriptor | undefined {
  // Handle global parameters
  if (parameterId === "crossfade") {
    return {
      id: "crossfade",
      label: "Crossfade",
      group: "transition",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
    };
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(parameterId);
  if (parsed) {
    // If scene ID provided, use it directly
    if (sceneIdForSlot) {
      const template = getParameterTemplate(sceneIdForSlot, parsed.templateId);
      if (template) {
        return {
          id: parameterId,
          label: `Slot ${parsed.slotIndex + 1}: ${template.label}`,
          group: template.group,
          orderHint: template.orderHint,
          min: template.min,
          max: template.max,
          step: template.step,
          defaultValue: template.defaultValue,
          color: template.color,
          description: template.description,
        };
      }
    }

    // Otherwise, search all scenes for the template
    for (const scene of SCENE_REGISTRY) {
      const template = scene.parameters.find(
        (p) => p.templateId === parsed.templateId,
      );
      if (template) {
        return {
          id: parameterId,
          label: `Slot ${parsed.slotIndex + 1}: ${template.label}`,
          group: template.group,
          orderHint: template.orderHint,
          min: template.min,
          max: template.max,
          step: template.step,
          defaultValue: template.defaultValue,
          color: template.color,
          description: template.description,
        };
      }
    }
  }

  return undefined;
}
