import { invoke } from "@tauri-apps/api/core";
import type {
  SceneId,
  SceneParameterDescriptor,
} from "../../scenes/sceneTypes";
import { getSceneDescriptor } from "../../scenes/sceneTypes";
import {
  ParameterSlider,
  type AudioMappingIndicator,
  type ModulationIndicator,
} from "../ParameterSlider";
import {
  type AudioMapping,
  AUDIO_SOURCE_SHORT_LABELS,
  AUDIO_SOURCE_COLORS,
} from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import styles from "./SceneParameterControls.module.css";

/**
 * Props for the SceneParameterControls component.
 *
 * @property sceneId - Scene ID to render controls for
 * @property getValue - Get current value for a parameter
 * @property setValue - Set value for a parameter
 * @property audioMappings - Optional list of audio mappings to show indicators
 * @property modulationTargets - Optional list of modulation targets to show indicators
 * @property lfos - Optional list of LFO sources (for indicator labels)
 */
export interface SceneParameterControlsProps {
  sceneId: SceneId;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
}

/**
 * Send parameter update to backend.
 */
async function setParameter(id: string, value: number): Promise<void> {
  await invoke("set_parameter", { id, value, app: undefined });
}

/**
 * Forward event to renderer for low-latency updates.
 */
async function forwardControlsEvent(
  event: string,
  value: number,
): Promise<void> {
  await invoke("forward_controls_event", {
    event,
    payload: JSON.stringify({ value }),
  });
}

/**
 * Handle parameter change: update local state + backend + forward to renderer.
 */
function createChangeHandler(
  descriptor: SceneParameterDescriptor,
  setValue: (id: string, value: number) => void,
) {
  return (value: number) => {
    setValue(descriptor.id, value);
    void (async () => {
      try {
        await setParameter(descriptor.id, value);
        // Forward brightness events for low-latency rendering
        if (descriptor.id.includes("brightness")) {
          await forwardControlsEvent(descriptor.id, value);
        }
      } catch (error) {
        console.error(
          `[Controls] Failed to set ${descriptor.id} parameter`,
          error,
        );
      }
    })();
  };
}

/**
 * Get audio mapping indicator for a parameter if one exists.
 */
function getAudioMappingIndicator(
  parameterId: string,
  audioMappings?: AudioMapping[],
): AudioMappingIndicator | null {
  if (!audioMappings) return null;

  // Find enabled mapping for this parameter
  const mapping = audioMappings.find(
    (m) => m.parameter_id === parameterId && m.enabled,
  );

  if (!mapping) return null;

  return {
    sourceLabel: AUDIO_SOURCE_SHORT_LABELS[mapping.source],
    color: AUDIO_SOURCE_COLORS[mapping.source],
  };
}

/**
 * Get modulation indicator for a parameter if one exists.
 */
function getModulationIndicator(
  parameterId: string,
  modulationTargets?: ModulationTarget[],
  lfos?: LfoSource[],
): ModulationIndicator | null {
  if (!modulationTargets || !lfos) return null;

  // Find all enabled targets for this parameter
  const activeTargets = modulationTargets.filter(
    (t) => t.parameter_id === parameterId && t.enabled,
  );

  if (activeTargets.length === 0) return null;

  // Get the first LFO name for display
  const firstTarget = activeTargets[0];
  const lfo = lfos.find((l) => l.id === firstTarget.source_id && l.enabled);

  if (!lfo) return null;

  return {
    lfoName: lfo.name,
    count: activeTargets.length,
  };
}

/**
 * SceneParameterControls
 *
 * Auto-generates parameter sliders from a scene's descriptor.
 * This replaces the manually-coded SceneAControls, SceneBControls, etc.
 *
 * Features:
 * - Reads parameter metadata from SCENE_REGISTRY
 * - Renders ParameterSlider for each parameter
 * - Handles all backend communication
 * - Supports MIDI learn via midiParameterId
 * - Shows audio mapping indicators when a parameter is audio-mapped
 */
export function SceneParameterControls({
  sceneId,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
}: SceneParameterControlsProps) {
  const descriptor = getSceneDescriptor(sceneId);

  if (!descriptor) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMessage}>Unknown scene: {sceneId}</p>
      </div>
    );
  }

  // Sort parameters by orderHint
  const sortedParameters = [...descriptor.parameters].sort(
    (a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0),
  );

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        {sortedParameters.map((param, index) => (
          <ParameterSlider
            key={param.id}
            id={`${sceneId}-${param.id}`}
            label={param.label}
            value={getValue(param.id)}
            min={param.min}
            max={param.max}
            step={param.step}
            color={param.color ?? "emerald"}
            showSpacing={index > 0}
            description={param.description}
            onChange={createChangeHandler(param, setValue)}
            midiParameterId={param.id}
            audioMapping={getAudioMappingIndicator(param.id, audioMappings)}
            modulationIndicator={getModulationIndicator(
              param.id,
              modulationTargets,
              lfos,
            )}
          />
        ))}
      </div>
    </div>
  );
}

export default SceneParameterControls;
