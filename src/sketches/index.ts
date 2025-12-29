/**
 * Sketch Registry
 *
 * Central registry that aggregates all sketches from their individual modules.
 * This file serves as the single source of truth for available sketches.
 *
 * To add a new sketch:
 * 1. Create a folder under /src/sketches/{SketchName}/
 * 2. Add index.tsx with descriptor and component exports
 * 3. Import and register it in this file
 */

import type {
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
} from "./types";

// Import all sketch modules
import { BlueCube, descriptor as blueCubeDescriptor } from "./BlueCube";
import { OrangeCube, descriptor as orangeCubeDescriptor } from "./OrangeCube";
import { GreenPulse, descriptor as greenPulseDescriptor } from "./GreenPulse";
import { TslText3D, descriptor as tslText3DDescriptor } from "./TslText3D";
import {
  TslNoiseBlob,
  descriptor as tslNoiseBlobDescriptor,
} from "./TslNoiseBlob";

/**
 * Array of all sketch descriptors.
 * Order here determines order in UI pickers.
 */
export const SKETCH_REGISTRY: SketchDescriptor[] = [
  blueCubeDescriptor,
  orangeCubeDescriptor,
  greenPulseDescriptor,
  tslText3DDescriptor,
  tslNoiseBlobDescriptor,
];

/**
 * Union type of all available sketch IDs.
 * Derived from the registry for type safety.
 */
export type SketchId = (typeof SKETCH_REGISTRY)[number]["id"];

/**
 * Array of all available sketch IDs for iteration.
 */
export const ALL_SKETCH_IDS: SketchId[] = SKETCH_REGISTRY.map((s) => s.id);

/**
 * Registry mapping SketchId → React component.
 * Used by the renderer to look up components for a given sketch ID.
 */
export const SKETCH_COMPONENT_REGISTRY: Record<SketchId, SketchComponent> = {
  blueCube: BlueCube,
  orangeCube: OrangeCube,
  greenPulse: GreenPulse,
  tslText3D: TslText3D,
  tslNoiseBlob: TslNoiseBlob,
};

/**
 * Helper to look up a sketch descriptor by ID.
 */
export function getSketchDescriptor(
  id: SketchId,
): SketchDescriptor | undefined {
  return SKETCH_REGISTRY.find((s) => s.id === id);
}

/**
 * Helper to get a sketch component by ID.
 */
export function getSketchComponent(id: SketchId): SketchComponent | undefined {
  return SKETCH_COMPONENT_REGISTRY[id];
}

/**
 * Get parameter template IDs for a given sketch.
 */
export function getSketchParameterTemplateIds(
  sketchId: SketchId,
): ParameterTemplateId[] {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return [];
  return descriptor.parameters.map((p) => p.templateId);
}

/**
 * Get a specific parameter template from a sketch.
 */
export function getSketchParameterTemplate(
  sketchId: SketchId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return undefined;
  return descriptor.parameters.find((p) => p.templateId === templateId);
}

// Re-export types for convenience
export type {
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
};

// Re-export individual sketch components for direct imports
export { BlueCube } from "./BlueCube";
export { OrangeCube } from "./OrangeCube";
export { GreenPulse } from "./GreenPulse";
export { TslText3D } from "./TslText3D";
export { TslNoiseBlob } from "./TslNoiseBlob";
