import { useMemo } from "react";
import type { SceneId } from "./sceneTypes";

/**
 * Configuration passed from the renderer into the Scene Manager.
 *
 * This allows the renderer (or a higher-level store) to decide which
 * scenes are considered "active" vs "next", rather than hardcoding
 * those choices inside this hook.
 */
export interface SceneSelection {
  /**
   * Scene visible at crossfade === 0.
   */
  activeSceneId: SceneId;

  /**
   * Scene visible at crossfade === 1.
   */
  nextSceneId: SceneId;
}

/**
 * Core shape of the Scene Manager state.
 *
 * This is intentionally minimal:
 * - It models which scenes are considered the current pair.
 * - It exposes how crossfade should be interpreted between them.
 * - It does NOT own the crossfade value itself; that remains a backend
 *   parameter (`crossfade`) managed by the Parameter Server.
 */
export interface SceneManagerState {
  /**
   * Scene that is considered currently "active" at crossfade === 0.
   *
   * In the current prototype:
   * - `activeSceneId` = "sceneA"
   * - At crossfade === 0, only Scene A is visible.
   */
  activeSceneId: SceneId;

  /**
   * Scene that is considered "next" at crossfade === 1.
   *
   * In the current prototype:
   * - `nextSceneId` = "sceneB"
   * - At crossfade === 1, only Scene B is visible.
   */
  nextSceneId: SceneId;

  /**
   * Name of the backend parameter that drives crossfade between scenes.
   *
   * This is currently a fixed string ("crossfade") and is used as a
   * convenience for wiring UI/renderer logic together with this hook.
   */
  crossfadeParameterId: "crossfade";

  /**
   * Helper for the renderer: given a numeric crossfade value from the
   * backend Parameter Server, return which scene(s) should be considered
   * visible and with what weights.
   *
   * This does NOT perform any rendering; it is purely a semantic mapping.
   */
  mapCrossfadeToSceneWeights(crossfade: number): SceneWeights;
}

/**
 * Simple structure describing how visible each scene is, given a
 * particular crossfade value.
 *
 * For now we only care about a linear A/B blend, but this type can be
 * extended later (e.g., multiple layers, additive blends, etc.).
 */
export interface SceneWeights {
  activeSceneId: SceneId;
  nextSceneId: SceneId;

  /**
   * Weight for the active scene (typically 1 - crossfade).
   */
  activeWeight: number;

  /**
   * Weight for the next scene (typically crossfade).
   */
  nextWeight: number;
}

/**
 * Initial configuration for the prototype:
 *
 * - activeSceneId: "sceneA"
 * - nextSceneId: "sceneB"
 *
 * Future versions may:
 * - Allow these to be configured from the Control UI.
 * - Persist them as part of a "show" or "project" configuration.
 */
const DEFAULT_ACTIVE_SCENE_ID: SceneId = "sceneA";
const DEFAULT_NEXT_SCENE_ID: SceneId = "sceneB";

/**
 * Hook providing a minimal Scene Manager abstraction.
 *
 * Responsibilities:
 * - Define which scenes are considered "active" vs "next".
 * - Define how the global `crossfade` parameter should be interpreted
 *   between those scenes.
 *
 * Non-responsibilities (by design):
 * - Reading or writing the `crossfade` parameter itself.
 * - Mounting/unmounting React components (the renderer still does this).
 * - Owning any global state; this hook is currently a pure view over
 *   either static configuration or a simple selection passed in from
 *   the renderer.
 *
 * As the app evolves, this hook can:
 * - Start reading scene configuration from a dedicated store.
 * - Gain setters like `setActiveScene` / `setNextScene`.
 * - Integrate with a future SceneComponentRegistry to inform the renderer
 *   which components to mount.
 */
export function useSceneManager(selection?: SceneSelection): SceneManagerState {
  // Determine the active and next scene IDs from the provided selection,
  // falling back to sensible defaults so the renderer continues to work
  // even if no explicit selection is passed.
  const activeSceneId: SceneId =
    selection?.activeSceneId ?? DEFAULT_ACTIVE_SCENE_ID;
  const nextSceneId: SceneId = selection?.nextSceneId ?? DEFAULT_NEXT_SCENE_ID;

  // We memoize the mapping function so that the reference is stable
  // across renders, which avoids unnecessary downstream effect churn.
  const mapCrossfadeToSceneWeights = useMemo(() => {
    return (crossfadeRaw: number): SceneWeights => {
      // Clamp to [0, 1] defensively; callers may pass slightly
      // out-of-range values (e.g., due to easing overshoot).
      const crossfade = Math.max(0, Math.min(1, crossfadeRaw));

      const nextWeight = crossfade;
      const activeWeight = 1 - crossfade;

      return {
        activeSceneId,
        nextSceneId,
        activeWeight,
        nextWeight,
      };
    };
  }, [activeSceneId, nextSceneId]);

  return {
    activeSceneId,
    nextSceneId,
    crossfadeParameterId: "crossfade",
    mapCrossfadeToSceneWeights,
  };
}
