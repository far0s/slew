/**
 * Scene Components (Backwards Compatibility)
 *
 * This file re-exports the sketch system types and components
 * with backwards-compatible aliases for existing code.
 *
 * @deprecated Import directly from '../sketches' for new code.
 */

import type { SketchId, SketchProps, SketchComponent } from "../sketches";
import {
  SKETCH_COMPONENT_REGISTRY,
  BlueCube,
  OrangeCube,
  GreenPulse,
} from "../sketches";

// Re-export SketchProps as SceneProps for backwards compatibility
export type SceneProps = SketchProps;

// Re-export SketchComponent as SceneComponent for backwards compatibility
export type SceneComponent = SketchComponent;

/**
 * Registry mapping SceneId → React component.
 *
 * @deprecated Use SKETCH_COMPONENT_REGISTRY from '../sketches' instead.
 */
export const SCENE_COMPONENT_REGISTRY: Record<SketchId, SketchComponent> =
  SKETCH_COMPONENT_REGISTRY;

// Legacy component aliases
/**
 * @deprecated Use BlueCube from '../sketches' instead.
 */
export const SceneA = BlueCube;

/**
 * @deprecated Use OrangeCube from '../sketches' instead.
 */
export const SceneB = OrangeCube;

/**
 * @deprecated Use GreenPulse from '../sketches' instead.
 */
export const SceneC = GreenPulse;

// Re-export sketch types for convenience
export type { SketchId, SketchProps, SketchComponent };

// Re-export the new registry
export { SKETCH_COMPONENT_REGISTRY };

// Re-export individual components with new names
export { BlueCube, OrangeCube, GreenPulse };
