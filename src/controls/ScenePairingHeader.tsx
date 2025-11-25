import { type SceneId, SCENE_REGISTRY } from "../scenes/sceneTypes";
import type { SetSceneId } from "./scenePairing";
import { setScenePairingOnBackend } from "./scenePairing";

export interface ScenePairingHeaderProps {
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  setActiveSceneId: SetSceneId;
  setNextSceneId: SetSceneId;
}

/**
 * Compact header section that:
 * - Shows the list of available scenes with labels.
 * - Exposes Active / Next pairing controls wired to the backend helper.
 *
 * This is extracted from `App` to keep the main controls window slimmer.
 */
export function ScenePairingHeader({
  activeSceneId,
  nextSceneId,
  setActiveSceneId,
  setNextSceneId,
}: ScenePairingHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "0.35rem",
        fontSize: "0.75rem",
        opacity: 0.8,
        textAlign: "right",
      }}
    >
      <div>
        <div>Phase 1 — Foundations</div>
        <div>Basic messaging & layout</div>
      </div>

      <div
        aria-label="Available scenes"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.3rem",
          maxWidth: "20rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              opacity: 0.8,
            }}
          >
            Scenes:
          </span>
          <span
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.25rem",
            }}
          >
            {SCENE_REGISTRY.map((scene, index) => (
              <span
                key={scene.id}
                style={{
                  padding: "0.08rem 0.35rem",
                  borderRadius: "999px",
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.8)",
                  fontSize: "0.72rem",
                  whiteSpace: "nowrap",
                }}
              >
                {index + 1}. {scene.label}
              </span>
            ))}
          </span>
        </div>

        <div
          aria-label="Scene crossfade pairing"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              opacity: 0.8,
            }}
          >
            Active →
          </span>
          <select
            value={activeSceneId}
            onChange={(event) => {
              const nextId = event.currentTarget.value as SceneId;
              void setScenePairingOnBackend({
                currentActive: nextId,
                currentNext: nextSceneId,
                setActiveSceneId,
                setNextSceneId,
              });
            }}
            style={{
              fontSize: "0.72rem",
              padding: "0.1rem 0.4rem",
              borderRadius: "999px",
              border: "1px solid rgba(148,163,184,0.6)",
              background: "rgba(15,23,42,0.9)",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            {SCENE_REGISTRY.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.label}
              </option>
            ))}
          </select>
          <span
            style={{
              opacity: 0.8,
            }}
          >
            Next →
          </span>
          <select
            value={nextSceneId}
            onChange={(event) => {
              const nextId = event.currentTarget.value as SceneId;
              void setScenePairingOnBackend({
                currentActive: activeSceneId,
                currentNext: nextId,
                setActiveSceneId,
                setNextSceneId,
              });
            }}
            style={{
              fontSize: "0.72rem",
              padding: "0.1rem 0.4rem",
              borderRadius: "999px",
              border: "1px solid rgba(148,163,184,0.6)",
              background: "rgba(15,23,42,0.9)",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            {SCENE_REGISTRY.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

export default ScenePairingHeader;
