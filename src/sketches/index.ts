/**
 * Sketch Registry - Central hub for all sketch metadata and components
 *
 * This module exports:
 * - SKETCH_GROUPS: Grouped sketches for UI display
 * - SKETCH_REGISTRY: Flat list of all sketch descriptors
 * - SKETCH_COMPONENT_REGISTRY: Lazy-loaded sketch components (default)
 * - SKETCH_COMPONENT_REGISTRY_SYNC: Eager-loaded components (for special cases)
 * - Utility functions for looking up sketches and parameters
 *
 * Lazy loading reduces initial bundle size by deferring sketch code until needed.
 */

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
import { advancedExamplesGroup } from "./AdvancedExamples";
import { auraGroup } from "./Aura/presets";
import { luminoSmokeGroup } from "./LuminoSmoke/group";
import { prismLinesGroup } from "./PrismLines/group";
import { starTrailsGroup } from "./StarTrails/group";
import { vortexBeamGroup } from "./VortexBeam/group";
import { TEMPLATE_ID_TO_PROPS_KEY } from "./parameterMappings";
import {
  LAZY_SKETCH_REGISTRY,
  getLazySketchComponent,
  SketchLoader,
  SketchLoadingFallback,
  type LazySketchComponent,
} from "./LazySketchRegistry";

// =============================================================================
// Groups and Registry
// =============================================================================

/**
 * Grouped registry for UI (sorted by orderHint)
 */
export const SKETCH_GROUPS: SketchGroup[] = [
  examplesGroup,
  advancedExamplesGroup,
  auraGroup,
  luminoSmokeGroup,
  prismLinesGroup,
  starTrailsGroup,
  vortexBeamGroup,
].sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0));

/**
 * Flat registry of all sketch descriptors (metadata only, no components)
 */
export const SKETCH_REGISTRY: SketchDescriptor[] = SKETCH_GROUPS.flatMap(
  (group) => group.sketches,
);

/**
 * Union type of all valid sketch IDs
 */
export type SketchId = (typeof SKETCH_REGISTRY)[number]["id"];

/**
 * Array of all valid sketch IDs
 */
export const ALL_SKETCH_IDS: SketchId[] = SKETCH_REGISTRY.map((s) => s.id);

// =============================================================================
// Component Registries
// =============================================================================

/**
 * Lazy-loaded sketch component registry (default).
 *
 * Components are loaded on-demand when first accessed via React.lazy().
 * Use with <Suspense> boundary or the <SketchLoader> wrapper component.
 *
 * This is the recommended registry for production use as it reduces
 * initial bundle size.
 */
export const SKETCH_COMPONENT_REGISTRY: Record<SketchId, LazySketchComponent> =
  LAZY_SKETCH_REGISTRY as Record<SketchId, LazySketchComponent>;

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Get a sketch descriptor by ID
 */
export function getSketchDescriptor(
  id: SketchId,
): SketchDescriptor | undefined {
  return SKETCH_REGISTRY.find((s) => s.id === id);
}

/**
 * Get a lazy-loaded sketch component by ID.
 *
 * Returns a React.lazy() wrapped component that loads on first render.
 * Use with <Suspense> to handle the loading state.
 */
export function getSketchComponent(
  id: SketchId,
): LazySketchComponent | undefined {
  return getLazySketchComponent(id);
}

/**
 * Get all parameter template IDs for a sketch
 */
export function getSketchParameterTemplateIds(
  sketchId: SketchId,
): ParameterTemplateId[] {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return [];
  return descriptor.parameters.map((p) => p.templateId);
}

/**
 * Get a specific parameter template from a sketch
 */
export function getSketchParameterTemplate(
  sketchId: SketchId,
  templateId: ParameterTemplateId,
): ParameterTemplate | undefined {
  const descriptor = getSketchDescriptor(sketchId);
  if (!descriptor) return undefined;
  return descriptor.parameters.find((p) => p.templateId === templateId);
}

// =============================================================================
// Re-exports
// =============================================================================

// Types
export type {
  SketchDescriptor,
  SketchProps,
  SketchComponent,
  ParameterTemplate,
  ParameterTemplateId,
  SliderColor,
  SketchGroup,
  LazySketchComponent,
};

// Utilities
export { TEMPLATE_ID_TO_PROPS_KEY };
export { SketchLoader, SketchLoadingFallback };
