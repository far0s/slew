/**
 * Slot System Types
 *
 * This file provides slot-related types and utilities for managing visual slots.
 * It imports sketch definitions from the new /src/sketches system and provides
 * backwards-compatible aliases for existing code.
 *
 * Key concepts:
 * - Slots are numbered containers (1-6) that hold a visual and its parameters
 * - Sketches are the visual programs that can be loaded into slots
 * - Parameter templates define the shape (label, min, max, etc.)
 * - Slot parameter IDs are generated as `slot_{slotIndex}_{templateId}`
 */

// Import types and registry from the new sketches system
import {
  type SketchId,
  type SketchDescriptor,
  type SketchProps,
  type SketchComponent,
  type ParameterTemplate,
  type ParameterTemplateId,
  type SliderColor,
  SKETCH_REGISTRY,
  ALL_SKETCH_IDS,
  getSketchDescriptor,
  getSketchParameterTemplateIds,
  getSketchParameterTemplate,
  LEGACY_SKETCH_ID_MAP,
  resolveSketchId,
} from "../sketches";

// ============================================================================
// Backwards Compatibility Aliases
// ============================================================================

/**
 * @deprecated Use SketchId from '../sketches' instead
 */
export type SceneId = SketchId;

/**
 * @deprecated Use SketchDescriptor from '../sketches' instead
 */
export type SceneDescriptor = SketchDescriptor;

/**
 * @deprecated Use ALL_SKETCH_IDS from '../sketches' instead
 */
export const ALL_SCENE_IDS: SceneId[] = ALL_SKETCH_IDS;

/**
 * @deprecated Use SKETCH_REGISTRY from '../sketches' instead
 */
export const SCENE_REGISTRY: SceneDescriptor[] = SKETCH_REGISTRY;

/**
 * @deprecated Use getSketchDescriptor from '../sketches' instead
 */
export function getSceneDescriptor(id: SceneId): SceneDescriptor | undefined {
  return getSketchDescriptor(id);
}

/**
 * @deprecated Use getSketchParameterTemplateIds from '../sketches' instead
 */
export function getSceneParameterTemplateIds(
  sceneId: SceneId,
): ParameterTemplateId[] {
  return getSketchParameterTemplateIds(sceneId);
}

// Re-export sketch types for convenience
export type {
  SketchId,
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
};

export {
  SKETCH_REGISTRY,
  ALL_SKETCH_IDS,
  getSketchDescriptor,
  getSketchParameterTemplateIds,
  getSketchParameterTemplate,
  LEGACY_SKETCH_ID_MAP,
  resolveSketchId,
};

// ============================================================================
// Global Parameter Types
// ============================================================================

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

// ============================================================================
// Slot Parameter ID Utilities
// ============================================================================

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

// ============================================================================
// Parameter Template Utilities
// ============================================================================

/**
 * Get the default value for a parameter template from any sketch.
 */
export function getParameterTemplateDefault(
  templateId: ParameterTemplateId,
): number | undefined {
  for (const sketch of SKETCH_REGISTRY) {
    const param = sketch.parameters.find((p) => p.templateId === templateId);
    if (param) {
      return param.defaultValue;
    }
  }
  return undefined;
}

/**
 * Get the parameter template from a sketch descriptor.
 */
export function getParameterTemplate(
  sketchId: SketchId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  return getSketchParameterTemplate(sketchId, templateId);
}

/**
 * Get min/max range for a slot parameter.
 */
export function getSlotParameterRange(
  _slotIndex: number,
  templateId: ParameterTemplateId,
  sketchId: SketchId,
): { min: number; max: number } | undefined {
  const template = getParameterTemplate(sketchId, templateId);
  if (!template) return undefined;
  return { min: template.min, max: template.max };
}

// ============================================================================
// Slot Default Parameter Builders
// ============================================================================

/**
 * Build a map of slot parameter IDs → default values for a slot.
 */
export function buildSlotDefaultParameters(
  slotIndex: number,
  sketchId: SketchId,
): Map<SlotParameterId, number> {
  const sketch = getSketchDescriptor(sketchId);
  if (!sketch) return new Map();

  const map = new Map<SlotParameterId, number>();
  for (const param of sketch.parameters) {
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
  sketchId: SketchId,
  getParameterValue: (id: ParameterId) => number | undefined,
): Map<SlotParameterId, number> {
  const sketch = getSketchDescriptor(sketchId);
  if (!sketch) return new Map();

  const map = new Map<SlotParameterId, number>();
  for (const param of sketch.parameters) {
    const sourceId = makeSlotParameterId(sourceSlotIndex, param.templateId);
    const targetId = makeSlotParameterId(targetSlotIndex, param.templateId);
    const value = getParameterValue(sourceId) ?? param.defaultValue;
    map.set(targetId, value);
  }
  return map;
}

// ============================================================================
// Slot Parameter ID Getters
// ============================================================================

/**
 * Get all slot parameter IDs for a slot.
 */
export function getSlotParameterIds(
  slotIndex: number,
  sketchId: SketchId,
): SlotParameterId[] {
  const templateIds = getSketchParameterTemplateIds(sketchId);
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
 * This generates parameter IDs for slots 0-5 (max 6 slots) for all sketch types.
 * Used by AudioPanel and ModulationPanel for parameter selection dropdowns.
 *
 * @deprecated Use getAllSlotParameterIds(slots) for accurate slot-based parameters
 */
export function getAllParameterIds(): ParameterId[] {
  const ids: ParameterId[] = [];

  // Add global crossfade parameter
  ids.push("crossfade");

  // Generate parameters for all possible slots (0-5) and all sketch types
  // This ensures the dropdowns always show available parameters
  const maxSlots = 6;
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    for (const sketch of SKETCH_REGISTRY) {
      for (const template of sketch.parameters) {
        const paramId = makeSlotParameterId(slotIndex, template.templateId);
        // Avoid duplicates (same template across different sketches)
        if (!ids.includes(paramId)) {
          ids.push(paramId);
        }
      }
    }
  }

  return ids;
}

// ============================================================================
// Parameter Descriptors (for UI)
// ============================================================================

/**
 * SceneParameterDescriptor - for backwards compatibility with existing code.
 * This is a "realized" parameter descriptor with a full parameter ID.
 *
 * @deprecated Use ParameterTemplate and slot-based functions instead.
 */
export interface SceneParameterDescriptor {
  id: ParameterId;
  label: string;
  group?: "sketch" | "scene" | "transition" | "global";
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
  sketchId: SketchId,
): SceneParameterDescriptor[] {
  const sketch = getSketchDescriptor(sketchId);
  if (!sketch) return [];

  return sketch.parameters.map((template) => ({
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
  sketchIdForSlot?: SketchId,
): number | undefined {
  // Handle global parameters
  if (parameterId === "crossfade") {
    return 0;
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(parameterId);
  if (parsed && sketchIdForSlot) {
    const template = getParameterTemplate(sketchIdForSlot, parsed.templateId);
    return template?.defaultValue;
  }

  return undefined;
}

/**
 * Get the parameter descriptor for any parameter.
 * For slot parameters, can optionally provide sketchIdForSlot for accuracy.
 * If not provided, will search all sketches for the template.
 */
export function getParameterDescriptor(
  parameterId: ParameterId,
  sketchIdForSlot?: SketchId,
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
    // If sketch ID provided, use it directly
    if (sketchIdForSlot) {
      const template = getParameterTemplate(sketchIdForSlot, parsed.templateId);
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

    // Otherwise, search all sketches for the template
    for (const sketch of SKETCH_REGISTRY) {
      const template = sketch.parameters.find(
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

/**
 * Get a simplified label for parameter dropdowns.
 * Returns format: "1 - Brightness" instead of "[Slot 1] Slot 1: Brightness"
 *
 * @param parameterId - The parameter ID
 * @param sketchIdForSlot - Optional sketch ID if known
 */
export function getParameterDropdownLabel(
  parameterId: ParameterId,
  sketchIdForSlot?: SketchId,
): string {
  // Handle global parameters
  if (parameterId === "crossfade") {
    return "Crossfade";
  }

  // Handle slot parameters
  const parsed = parseSlotParameterId(parameterId);
  if (parsed) {
    const slotNum = parsed.slotIndex + 1;

    // If sketch ID provided, use it directly
    if (sketchIdForSlot) {
      const template = getParameterTemplate(sketchIdForSlot, parsed.templateId);
      if (template) {
        return `${slotNum} - ${template.label}`;
      }
    }

    // Otherwise, search all sketches for the template
    for (const sketch of SKETCH_REGISTRY) {
      const template = sketch.parameters.find(
        (p) => p.templateId === parsed.templateId,
      );
      if (template) {
        return `${slotNum} - ${template.label}`;
      }
    }

    // Fallback to raw template ID
    return `${slotNum} - ${parsed.templateId}`;
  }

  // Fallback to the parameter ID itself
  return parameterId;
}
