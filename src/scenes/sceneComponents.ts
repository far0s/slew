import type { ComponentType } from "react";
import type { SceneId } from "./sceneTypes";
import { SceneA } from "./components/SceneA";
import { SceneB } from "./components/SceneB";
import { SceneC } from "./components/SceneC";

/**
 * Shared props passed from the renderer into all scene components.
 *
 * - `opacity` is required and is the primary crossfade control.
 * - `params` is an optional bag of additional per-scene parameters.
 *   Scenes are free to ignore params they don't care about.
 *
 * This keeps the renderer ↔ scene contract narrow and forward-compatible:
 * new parameters can be added to `params` without breaking existing scenes.
 *
 * With multi-instance support, parameters are now generic (e.g., `brightness`)
 * rather than scene-prefixed (e.g., `sceneABrightness`). Each slot gets its
 * own independent parameters.
 */
export interface SceneProps {
  /**
   * Crossfade weight for this scene.
   *
   * - 0 → fully invisible
   * - 1 → fully visible
   *
   * The renderer is responsible for mapping the global `crossfade`
   * parameter into per-scene `opacity` values.
   */
  opacity: number;

  /**
   * Optional bag of additional parameters.
   *
   * These are generic parameter names that apply to all scenes.
   * Each scene uses whichever parameters are relevant to it.
   */
  params?: Partial<{
    // Common parameters (used by multiple scenes)
    brightness: number;
    rotationSpeed: number;
    tint: number;

    // Scene A specific
    wobble: number;
    tintLfoDepth: number;

    // Scene B specific
    scale: number;

    // Scene C specific
    pulseSpeed: number;
  }>;
}

/**
 * All scene components must accept `SceneProps`. This allows the
 * renderer to treat them uniformly, while individual scenes can
 * opt into whichever params are relevant.
 */
export type SceneComponent = ComponentType<SceneProps>;

/**
 * Registry mapping SceneId → React component.
 *
 * This file defines the mapping used by the renderer (and any future
 * Scene Manager) to look up a concrete React component for a given
 * SceneId.
 */
export const SCENE_COMPONENT_REGISTRY: Partial<
  Record<SceneId, SceneComponent>
> = {
  sceneA: SceneA,
  sceneB: SceneB,
  sceneC: SceneC,
};
