import type {
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
  SketchGroup,
} from "./types";

import { examplesGroup } from "./Examples";
import { auraGroup } from "./Aura/presets";

import { BlueCube } from "./Examples/BlueCube";
import { OrangeCube } from "./Examples/OrangeCube";
import { GreenPulse } from "./Examples/GreenPulse";
import { TslText3D } from "./Examples/TslText3D";
import { TslNoiseBlob } from "./Examples/TslNoiseBlob";
import { Aura } from "./Aura";

// Grouped registry for UI (sorted by orderHint)
export const SKETCH_GROUPS: SketchGroup[] = [examplesGroup, auraGroup].sort(
  (a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0),
);

// Flat registry for backward compatibility
export const SKETCH_REGISTRY: SketchDescriptor[] = SKETCH_GROUPS.flatMap(
  (group) => group.sketches,
);

export type SketchId = (typeof SKETCH_REGISTRY)[number]["id"];

export const ALL_SKETCH_IDS: SketchId[] = SKETCH_REGISTRY.map((s) => s.id);

export const SKETCH_COMPONENT_REGISTRY: Record<SketchId, SketchComponent> = {
  blueCube: BlueCube,
  orangeCube: OrangeCube,
  greenPulse: GreenPulse,
  tslText3D: TslText3D,
  tslNoiseBlob: TslNoiseBlob,
  // Aura presets (all use same component)
  auraOg: Aura,
  auraRoseGold: Aura,
  auraDeepBlue: Aura,
  auraSolarPlume: Aura,
  auraGhostLike: Aura,
  auraForestClearing: Aura,
  auraDefaultIntense: Aura,
  auraBlushNebula: Aura,
};

export function getSketchDescriptor(
  id: SketchId,
): SketchDescriptor | undefined {
  return SKETCH_REGISTRY.find((s) => s.id === id);
}

export function getSketchComponent(id: SketchId): SketchComponent | undefined {
  return SKETCH_COMPONENT_REGISTRY[id];
}

export function getSketchParameterTemplateIds(
  sketchId: SketchId,
): ParameterTemplateId[] {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return [];
  return descriptor.parameters.map((p) => p.templateId);
}

export function getSketchParameterTemplate(
  sketchId: SketchId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return undefined;
  return descriptor.parameters.find((p) => p.templateId === templateId);
}

export type {
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
  SketchGroup,
};

export { BlueCube } from "./Examples/BlueCube";
export { OrangeCube } from "./Examples/OrangeCube";
export { GreenPulse } from "./Examples/GreenPulse";
export { TslText3D } from "./Examples/TslText3D";
export { TslNoiseBlob } from "./Examples/TslNoiseBlob";
export { Aura } from "./Aura";
