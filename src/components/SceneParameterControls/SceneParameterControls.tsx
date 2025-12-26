import { invoke } from "@tauri-apps/api/core";
import type { SketchId, ParameterTemplate } from "../../sketches";
import { getSketchDescriptor } from "../../sketches";
import {
  makeSlotParameterId,
  SLOT_PARAMETER_TEMPLATES,
} from "../../scenes/sceneTypes";
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
 * @property slotIndex - Slot index for this sketch instance
 * @property sketchId - Sketch type to render controls for
 * @property getValue - Get current value for a parameter
 * @property setValue - Set value for a parameter
 * @property audioMappings - Optional list of audio mappings to show indicators
 * @property modulationTargets - Optional list of modulation targets to show indicators
 * @property lfos - Optional list of LFO sources (for indicator labels)
 */
export interface SceneParameterControlsProps {
  slotIndex: number;
  sketchId: SketchId;
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
  slotIndex: number,
  template: ParameterTemplate,
  setValue: (id: string, value: number) => void,
) {
  const paramId = makeSlotParameterId(slotIndex, template.templateId);

  return (value: number) => {
    setValue(paramId, value);
    void (async () => {
      try {
        await setParameter(paramId, value);
        // Forward brightness events for low-latency rendering
        if (template.templateId === "brightness") {
          await forwardControlsEvent(paramId, value);
        }
      } catch (error) {
        console.error(`[Controls] Failed to set ${paramId} parameter`, error);
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
 * Auto-generates parameter sliders for a slot's sketch.
 * Uses slot-prefixed parameter IDs for multi-instance support.
 *
 * Features:
 * - Reads parameter templates from SKETCH_REGISTRY
 * - Generates slot-prefixed parameter IDs (e.g., slot_0_brightness)
 * - Renders ParameterSlider for each parameter
 * - Handles all backend communication
 * - Supports MIDI learn via midiParameterId
 * - Shows audio mapping indicators when a parameter is audio-mapped
 */
export function SceneParameterControls({
  slotIndex,
  sketchId,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
}: SceneParameterControlsProps) {
  const descriptor = getSketchDescriptor(sketchId);

  if (!descriptor) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMessage}>Unknown sketch: {sketchId}</p>
      </div>
    );
  }

  // Combine slot-level parameters (alpha, etc.) with sketch-specific parameters
  // and sort by orderHint
  const allParameters = [...SLOT_PARAMETER_TEMPLATES, ...descriptor.parameters];
  const sortedParameters = allParameters.sort(
    (a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0),
  );

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        {sortedParameters.map((template, index) => {
          const paramId = makeSlotParameterId(slotIndex, template.templateId);

          return (
            <ParameterSlider
              key={paramId}
              id={`slot-${slotIndex}-${template.templateId}`}
              label={template.label}
              value={getValue(paramId)}
              min={template.min}
              max={template.max}
              step={template.step}
              color={template.color ?? "emerald"}
              showSpacing={index > 0}
              description={template.description}
              onChange={createChangeHandler(slotIndex, template, setValue)}
              midiParameterId={paramId}
              audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
              modulationIndicator={getModulationIndicator(
                paramId,
                modulationTargets,
                lfos,
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

export default SceneParameterControls;
