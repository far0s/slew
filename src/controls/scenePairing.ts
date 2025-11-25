import { invoke } from "@tauri-apps/api/core";
import { SCENE_REGISTRY, type SceneId } from "../scenes/sceneTypes";

export interface ScenePairingState {
  activeSceneId: SceneId;
  nextSceneId: SceneId;
}

export type SetSceneId = (id: SceneId) => void;

interface ScenePairingUpdateContext {
  currentActive: SceneId;
  currentNext: SceneId;
  setActiveSceneId: SetSceneId;
  setNextSceneId: SetSceneId;
}

/**
 * Pick a fallback scene that is different from the one provided.
 * Falls back to the first registry entry or "sceneA"/"sceneB" if needed.
 */
function getFallbackSceneId(exclude: SceneId): SceneId {
  const fallbackFromRegistry = SCENE_REGISTRY.find(
    (scene) => scene.id !== exclude,
  )?.id as SceneId | undefined;

  if (fallbackFromRegistry) return fallbackFromRegistry;

  // Hard fallback if registry is somehow empty or only contains one scene
  if (exclude !== "sceneA") return "sceneA";
  return "sceneB";
}

/**
 * Update scene pairing in the backend and keep local state consistent.
 *
 * This helper:
 * - Prevents Active/Next from being the same scene by choosing a fallback.
 * - Calls the Rust `set_scene_pairing` command with camelCase parameters.
 */
export async function setScenePairingOnBackend(
  ctx: ScenePairingUpdateContext,
): Promise<void> {
  let { currentActive, currentNext } = ctx;

  // Ensure active and next are not identical; if they are, pick a fallback.
  if (currentActive === currentNext) {
    const fallback = getFallbackSceneId(currentActive);
    // Heuristic: if the user is changing active, keep next as fallback, and
    // if they're changing next, keep active as fallback. The caller is
    // expected to pass the updated side as either currentActive or currentNext.
    if (currentActive !== ctx.currentActive) {
      // Active was unchanged, next was changed to match active
      currentNext = fallback;
      ctx.setNextSceneId(fallback);
    } else {
      // Active was changed to match next
      currentActive = fallback;
      ctx.setActiveSceneId(fallback);
    }
  } else {
    ctx.setActiveSceneId(currentActive);
    ctx.setNextSceneId(currentNext);
  }

  try {
    await invoke("set_scene_pairing", {
      activeSceneId: currentActive,
      nextSceneId: currentNext,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Controls] set_scene_pairing failed", error);
  }
}

/**
 * Simple in-memory pairing defaults used by the Controls UI.
 *
 * This is intentionally decoupled from the renderer's defaults so each
 * window can evolve independently but still start from a sensible pair.
 */
export const DEFAULT_SCENE_PAIRING: ScenePairingState = {
  activeSceneId: "sceneA",
  nextSceneId: "sceneB",
};
