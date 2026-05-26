// Slot System Types
//
// This file provides slot-related types and utilities for managing visual slots.
// It imports sketch definitions from /src/sketches and provides parameter utilities.
//
// Key concepts:
// - Slots are numbered containers (0-7) that hold a visual and its parameters
// - Sketches are the visual programs that can be loaded into slots
// - Parameter templates define the shape (label, min, max, etc.)
// - Slot parameter IDs are generated as `slot_{slotIndex}_{templateId}`

// Re-export sketch types and utilities
export type {
  SketchId,
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
} from "@/sketches";

export {
  SKETCH_REGISTRY,
  ALL_SKETCH_IDS,
  getSketchDescriptor,
  getSketchParameterTemplateIds,
  getSketchParameterTemplate,
} from "@/sketches";

import {
  type SketchId,
  type ParameterTemplate,
  type ParameterTemplateId,
  type SliderColor,
  SKETCH_REGISTRY,
  getSketchDescriptor,
  getSketchParameterTemplate,
  getSketchParameterTemplateIds,
} from "@/sketches";

// ============================================================================
// Slot-Level Parameter Templates
// ============================================================================

// Alpha (master opacity) parameter template for slots.
// This is a slot-level parameter independent of the loaded sketch.
// It controls the overall opacity of the slot's output, multiplied with crossfade.
export const SLOT_ALPHA_TEMPLATE: ParameterTemplate = {
  templateId: "alpha",
  label: "Alpha",
  group: "transition",
  orderHint: 0,
  min: 0,
  max: 1,
  step: 0.01,
  defaultValue: 1,
  color: "rose",
  description: "Master opacity for this slot (independent of crossfade)",
};

// All slot-level parameter templates (parameters that exist on every slot).
export const SLOT_PARAMETER_TEMPLATES: ParameterTemplate[] = [
  SLOT_ALPHA_TEMPLATE,
];

// ============================================================================
// Global Parameter Types
// ============================================================================

export type GlobalParameterId = "crossfade";

// A slot-scoped parameter ID in the format `slot_{index}_{templateId}`.
export type SlotParameterId = `slot_${number}_${ParameterTemplateId}`;

// Union of all valid parameter IDs (global + slot-scoped).
export type ParameterId = GlobalParameterId | SlotParameterId | string;

// ============================================================================
// Slot Parameter ID Utilities
// ============================================================================

export function makeSlotParameterId(
  slotIndex: number,
  templateId: ParameterTemplateId,
): SlotParameterId {
  return `slot_${slotIndex}_${templateId}` as SlotParameterId;
}

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

export function isSlotParameterId(id: string): id is SlotParameterId {
  return /^slot_\d+_.+$/.test(id);
}

export function isGlobalParameterId(id: string): id is GlobalParameterId {
  return id === "crossfade";
}

// ============================================================================
// Parameter Template Utilities
// ============================================================================

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

export function getParameterTemplate(
  sketchId: SketchId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  return getSketchParameterTemplate(sketchId, templateId);
}

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

export function buildSlotDefaultParameters(
  slotIndex: number,
  sketchId: SketchId,
): Map<SlotParameterId, number> {
  const map = new Map<SlotParameterId, number>();

  // Add slot-level parameters (alpha, etc.)
  for (const param of SLOT_PARAMETER_TEMPLATES) {
    const id = makeSlotParameterId(slotIndex, param.templateId);
    map.set(id, param.defaultValue);
  }

  // Add sketch-specific parameters
  const sketch = getSketchDescriptor(sketchId);
  if (sketch) {
    for (const param of sketch.parameters) {
      if (param.inputType === "color") {
        // Expand to 3 numeric sub-params
        const baseId = makeSlotParameterId(slotIndex, param.templateId);
        const [dr, dg, db] = param.defaultColorValue ?? [0, 0, 0];
        map.set(`${baseId}_r` as SlotParameterId, dr);
        map.set(`${baseId}_g` as SlotParameterId, dg);
        map.set(`${baseId}_b` as SlotParameterId, db);
      } else {
        const id = makeSlotParameterId(slotIndex, param.templateId);
        map.set(id, param.defaultValue);
      }
    }
  }

  return map;
}

export function buildAllSlotsDefaultParameters(
  slots: Array<{ index: number; sketchId: SketchId }>,
): Map<ParameterId, number> {
  const map = new Map<ParameterId, number>();

  // Add global crossfade parameter
  map.set("crossfade", 0);

  // Add slot parameters
  for (const slot of slots) {
    const slotDefaults = buildSlotDefaultParameters(slot.index, slot.sketchId);
    for (const [id, value] of slotDefaults) {
      map.set(id, value);
    }
  }

  return map;
}

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

export function getSlotParameterIds(
  slotIndex: number,
  sketchId: SketchId,
): SlotParameterId[] {
  const ids: SlotParameterId[] = [];

  // Add slot-level parameters
  for (const param of SLOT_PARAMETER_TEMPLATES) {
    ids.push(makeSlotParameterId(slotIndex, param.templateId));
  }

  // Add sketch-specific parameters
  const templateIds = getSketchParameterTemplateIds(sketchId);
  for (const templateId of templateIds) {
    const template = getSketchParameterTemplate(sketchId, templateId);
    if (template?.inputType === "color") {
      const baseId = makeSlotParameterId(slotIndex, templateId);
      ids.push(`${baseId}_r` as SlotParameterId);
      ids.push(`${baseId}_g` as SlotParameterId);
      ids.push(`${baseId}_b` as SlotParameterId);
    } else {
      ids.push(makeSlotParameterId(slotIndex, templateId));
    }
  }

  return ids;
}

export function getAllSlotParameterIds(
  slots: Array<{ index: number; sketchId: SketchId }>,
): ParameterId[] {
  const ids: ParameterId[] = [];

  // Add global crossfade parameter
  ids.push("crossfade");

  // Add all slot parameters
  for (const slot of slots) {
    const slotIds = getSlotParameterIds(slot.index, slot.sketchId);
    ids.push(...slotIds);
  }

  return ids;
}

export function getAllParameterIds(): ParameterId[] {
  const ids: ParameterId[] = [];

  // Add global crossfade parameter
  ids.push("crossfade");

  // Generate parameters for all possible slots (0-7) and all sketch types
  const maxSlots = 8;
  for (let slotIndex = 0; slotIndex < maxSlots; slotIndex++) {
    for (const sketch of SKETCH_REGISTRY) {
      for (const template of sketch.parameters) {
        const paramId = makeSlotParameterId(slotIndex, template.templateId);
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

export interface SlotParameterDescriptor {
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
  inputType?: "slider" | "select" | "color" | "integer";
  colorChannel?: "r" | "g" | "b"; // set only on color sub-param descriptors
  colorGroup?: string;             // templateId of the parent color param (e.g. "color_primary")
}

export function buildSlotParameterDescriptors(
  slotIndex: number,
  sketchId: SketchId,
): SlotParameterDescriptor[] {
  const descriptors: SlotParameterDescriptor[] = [];

  // Add slot-level parameters (alpha, etc.)
  for (const template of SLOT_PARAMETER_TEMPLATES) {
    descriptors.push({
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
    });
  }

  // Add sketch-specific parameters
  const sketch = getSketchDescriptor(sketchId);
  if (sketch) {
    for (const template of sketch.parameters) {
      if (template.inputType === "color") {
        const baseId = makeSlotParameterId(slotIndex, template.templateId);
        const [dr, dg, db] = template.defaultColorValue ?? [0, 0, 0];
        const channels: Array<["r" | "g" | "b", number]> = [["r", dr], ["g", dg], ["b", db]];
        for (const [ch, defaultVal] of channels) {
          descriptors.push({
            id: `${baseId}_${ch}` as ParameterId,
            label: `${template.label} (${ch.toUpperCase()})`,
            group: template.group,
            orderHint: template.orderHint,
            min: 0,
            max: 255,
            step: 1,
            defaultValue: defaultVal,
            description: template.description,
            inputType: "color",
            colorChannel: ch,
            colorGroup: template.templateId,
          });
        }
      } else {
        descriptors.push({
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
        });
      }
    }
  }

  return descriptors;
}

export function getParameterDefault(
  parameterId: ParameterId,
  sketchIdForSlot?: SketchId,
): number | undefined {
  if (parameterId === "crossfade") {
    return 0;
  }

  const parsed = parseSlotParameterId(parameterId);
  if (parsed && sketchIdForSlot) {
    const template = getParameterTemplate(sketchIdForSlot, parsed.templateId);
    return template?.defaultValue;
  }

  return undefined;
}

export function getParameterDescriptor(
  parameterId: ParameterId,
  sketchIdForSlot?: SketchId,
): SlotParameterDescriptor | undefined {
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
    // Check slot-level parameters first (alpha, etc.)
    const slotTemplate = SLOT_PARAMETER_TEMPLATES.find(
      (p) => p.templateId === parsed.templateId,
    );
    if (slotTemplate) {
      return {
        id: parameterId,
        label: `Slot ${parsed.slotIndex + 1}: ${slotTemplate.label}`,
        group: slotTemplate.group,
        orderHint: slotTemplate.orderHint,
        min: slotTemplate.min,
        max: slotTemplate.max,
        step: slotTemplate.step,
        defaultValue: slotTemplate.defaultValue,
        color: slotTemplate.color,
        description: slotTemplate.description,
      };
    }

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

export function getParameterDropdownLabel(
  parameterId: ParameterId,
  sketchIdForSlot?: SketchId,
): string {
  if (parameterId === "crossfade") {
    return "Crossfade";
  }

  const parsed = parseSlotParameterId(parameterId);
  if (parsed) {
    const slotNum = parsed.slotIndex + 1;

    // Check slot-level parameters first (alpha, etc.)
    const slotTemplate = SLOT_PARAMETER_TEMPLATES.find(
      (p) => p.templateId === parsed.templateId,
    );
    if (slotTemplate) {
      return `${slotNum} - ${slotTemplate.label}`;
    }

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

    return `${slotNum} - ${parsed.templateId}`;
  }

  return parameterId;
}
