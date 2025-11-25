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
 */
export interface SceneProps {
  /**
   * Crossfade weight for this scene.
   *
   * - 0 → fully invisible
   * - 1 → fully visible
   *
   * The renderer is responsible for mapping the global `crossfade`
   * parameter into per-scene `opacity` values via `useSceneManager`.
   */
  opacity: number;

  /**
   * Optional bag of additional parameters.
   *
   * Keys here are intentionally aligned with the renderer's local
   * `RendererParameters` shape, not the backend IDs. The renderer
   * is responsible for mapping backend IDs → these props.
   */
  params?: Partial<{
    rotationSpeed: number;
    sceneABrightness: number;
    sceneAWobble: number;
    sceneATint: number;
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
 * SceneId. For now, all known scenes are registered here.
 */
export const SCENE_COMPONENT_REGISTRY: Partial<
  Record<SceneId, SceneComponent>
> = {
  sceneA: SceneA,
  sceneB: SceneB,
  sceneC: SceneC,
};
