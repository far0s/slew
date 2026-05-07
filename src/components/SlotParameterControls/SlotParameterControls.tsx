import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { pushUndoEntry } from "../../controls/useUndoHistory";
import type { SketchId, ParameterTemplate } from "../../sketches";
import { getSketchDescriptor } from "../../sketches";
import {
  makeSlotParameterId,
  SLOT_PARAMETER_TEMPLATES,
} from "../../slots/slotTypes";
import {
  ParameterSlider,
  type AudioMappingIndicator,
  type ModulationIndicator,
} from "../ParameterSlider";
import { ParameterSelect } from "../ParameterSelect";
import {
  type AudioMapping,
  AUDIO_SOURCE_SHORT_LABELS,
  AUDIO_SOURCE_COLORS,
} from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping, MidiPickupState } from "../../inputs/midi";
import { ColorPalette } from "../ColorPalette";
import { ColorPicker } from "../ColorPicker";
import { sendColorOsc } from "../../inputs/osc";
import styles from "./SlotParameterControls.module.css";

export interface SlotParameterControlsProps {
  slotIndex: number;
  sketchId: SketchId;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  midiMappings?: MidiMapping[];
  midiPickupStates?: Map<string, MidiPickupState>;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (parameterId: string) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
}

// ---------------------------------------------------------------------------
// Color utilities (0-255 raw values, unlike ColorPalette which uses 0-1)
// ---------------------------------------------------------------------------

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function handleColorParamChange(
  slotIndex: number,
  templateId: string,
  hex: string,
  setValue: (id: string, value: number) => void,
): void {
  const [r, g, b] = hexToRgb(hex);
  const baseId = `slot_${slotIndex}_${templateId}`;

  setValue(`${baseId}_r`, r);
  setValue(`${baseId}_g`, g);
  setValue(`${baseId}_b`, b);

  void (async () => {
    try {
      await setParameter(`${baseId}_r`, r);
      await setParameter(`${baseId}_g`, g);
      await setParameter(`${baseId}_b`, b);

      // Forward color over OSC if enabled
      await sendColorOsc(slotIndex, templateId, r, g, b);
    } catch {
      // best-effort
    }
  })();

  // Dispatch legacy sketch-color-changed event for renderer compatibility
  const colorTypeMap: Record<string, "startColor" | "midColor" | "endColor"> = {
    color_primary: "startColor",
    color_secondary: "midColor",
    color_bg: "endColor",
  };
  const colorType = colorTypeMap[templateId];
  if (colorType) {
    window.dispatchEvent(
      new CustomEvent("sketch-color-changed", {
        detail: {
          slotIndex,
          colorType,
          color: [r, g, b] as [number, number, number],
        },
      }),
    );
  }
}

// ---------------------------------------------------------------------------

async function setParameter(id: string, value: number): Promise<void> {
  await invoke("set_parameter", { id, value, app: undefined });
}

async function forwardControlsEvent(
  event: string,
  value: number,
): Promise<void> {
  await invoke("forward_controls_event", {
    event,
    payload: JSON.stringify({ value }),
  });
}

function createChangeHandler(
  slotIndex: number,
  template: ParameterTemplate,
  setValue: (id: string, value: number) => void,
): { onChange: (value: number) => void; onCommit: (after: number, before: number) => void } {
  const paramId = makeSlotParameterId(slotIndex, template.templateId);

  const onChange = (value: number) => {
    setValue(paramId, value);
    void (async () => {
      try {
        await setParameter(paramId, value);
        if (template.templateId === "brightness") {
          await forwardControlsEvent(paramId, value);
        }
      } catch {
        // UI state already reflects failure
      }
    })();
  };

  const onCommit = (after: number, before: number) => {
    if (after !== before) {
      pushUndoEntry(paramId, before, after);
    }
  };

  return { onChange, onCommit };
}

function getAudioMappingIndicator(
  parameterId: string,
  audioMappings?: AudioMapping[],
): AudioMappingIndicator | null {
  if (!audioMappings) return null;

  const mapping = audioMappings.find(
    (m) => m.parameter_id === parameterId && m.enabled,
  );

  if (!mapping) return null;

  return {
    sourceLabel: AUDIO_SOURCE_SHORT_LABELS[mapping.source],
    color: AUDIO_SOURCE_COLORS[mapping.source],
  };
}

function getModulationIndicator(
  parameterId: string,
  modulationTargets?: ModulationTarget[],
  lfos?: LfoSource[],
): ModulationIndicator | null {
  if (!modulationTargets || !lfos) return null;

  const activeTargets = modulationTargets.filter(
    (t) => t.parameter_id === parameterId && t.enabled,
  );

  if (activeTargets.length === 0) return null;

  const firstTarget = activeTargets[0];
  const lfo = lfos.find((l) => l.id === firstTarget.source_id && l.enabled);

  if (!lfo) return null;

  return {
    lfoName: lfo.name,
    count: activeTargets.length,
  };
}

// Auto-generates parameter sliders for a slot's sketch.
// Uses slot-prefixed parameter IDs for multi-instance support.
export function SlotParameterControls({
  slotIndex,
  sketchId,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  midiPickupStates,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
}: SlotParameterControlsProps) {
  const descriptor = getSketchDescriptor(sketchId);

  if (!descriptor) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMessage}>Unknown sketch: {sketchId}</p>
      </div>
    );
  }

  // Combine slot-level parameters (alpha, etc.) with sketch-specific parameters
  const allParameters = [...SLOT_PARAMETER_TEMPLATES, ...descriptor.parameters];
  const sortedParameters = allParameters.sort(
    (a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0),
  );

  // Show the legacy ColorPalette section only for sketches that have colorPalette
  // but haven't yet migrated to the new color param system.
  const hasColorParams = descriptor.parameters.some(
    (p) => p.inputType === "color",
  );

  // State for color palette
  const [colors, setColors] = useState<{
    startColor: [number, number, number];
    midColor: [number, number, number];
    endColor: [number, number, number];
    background: [number, number, number, number];
  } | null>(null);

  // Initialize colors from descriptor
  useEffect(() => {
    if (descriptor.colorPalette) {
      setColors({
        startColor: descriptor.colorPalette.startColor,
        midColor: descriptor.colorPalette.midColor,
        endColor: descriptor.colorPalette.endColor,
        background: descriptor.colorPalette.background,
      });
    }
  }, [descriptor.colorPalette]);

  const handleColorChange = (
    colorType: "startColor" | "midColor" | "endColor" | "background",
    color: [number, number, number] | [number, number, number, number],
  ) => {
    setColors((prev) => {
      if (!prev) return null;
      return { ...prev, [colorType]: color };
    });

    // Emit color change event for renderer to pick up
    const event = new CustomEvent("sketch-color-changed", {
      detail: {
        slotIndex,
        colorType,
        color,
      },
    });
    window.dispatchEvent(event);

    // Also forward to renderer window via Tauri
    void (async () => {
      try {
        await forwardControlsEvent(`sketch_color_changed`, slotIndex);
      } catch {
        // UI state already reflects failure
      }
    })();
  };

  const handleColorReset = () => {
    if (!descriptor.colorPalette) return;

    // Reset to default colors (keep current background)
    setColors((prev) => {
      if (!prev) return null;
      return {
        startColor: descriptor.colorPalette!.startColor,
        midColor: descriptor.colorPalette!.midColor,
        endColor: descriptor.colorPalette!.endColor,
        background: prev.background,
      };
    });

    // Emit color change events for each color
    ["startColor", "midColor", "endColor"].forEach((colorType) => {
      const color =
        descriptor.colorPalette![
          colorType as "startColor" | "midColor" | "endColor"
        ];
      const event = new CustomEvent("sketch-color-changed", {
        detail: {
          slotIndex,
          colorType,
          color,
        },
      });
      window.dispatchEvent(event);
    });

    // Forward to renderer window
    void (async () => {
      try {
        await forwardControlsEvent(`sketch_color_changed`, slotIndex);
      } catch {
        // UI state already reflects failure
      }
    })();
  };

  const handleBackgroundReset = () => {
    if (!descriptor.colorPalette) return;

    // Reset background to default
    setColors((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        background: descriptor.colorPalette!.background,
      };
    });

    // Emit background color change event
    const event = new CustomEvent("sketch-color-changed", {
      detail: {
        slotIndex,
        colorType: "background",
        color: descriptor.colorPalette.background,
      },
    });
    window.dispatchEvent(event);

    // Forward to renderer window
    void (async () => {
      try {
        await forwardControlsEvent(`sketch_color_changed`, slotIndex);
      } catch {
        // UI state already reflects failure
      }
    })();
  };

  return (
    <div className={styles.container}>
      {descriptor.colorPalette && colors && !hasColorParams && (
        <ColorPalette
          startColor={colors.startColor}
          midColor={colors.midColor}
          endColor={colors.endColor}
          background={colors.background}
          defaultStartColor={descriptor.colorPalette.startColor}
          defaultMidColor={descriptor.colorPalette.midColor}
          defaultEndColor={descriptor.colorPalette.endColor}
          defaultBackground={descriptor.colorPalette.background}
          onStartColorChange={(color) => handleColorChange("startColor", color)}
          onMidColorChange={(color) => handleColorChange("midColor", color)}
          onEndColorChange={(color) => handleColorChange("endColor", color)}
          onBackgroundChange={(color) => handleColorChange("background", color)}
          onReset={handleColorReset}
          onBackgroundReset={handleBackgroundReset}
        />
      )}
      <div className={styles.controls}>
        {sortedParameters.map((template, index) => {
          const paramId = makeSlotParameterId(slotIndex, template.templateId);
          const hasMidiMapping = midiMappings?.some(
            (m) => m.parameter_id === paramId,
          );

          // Render color picker group for parameters with inputType: "color"
          // Shows a visual ColorPicker swatch + R/G/B sliders each with
          // beat / LFO / MIDI-learn controls identical to regular sliders.
          if (template.inputType === "color") {
            const baseId = `slot_${slotIndex}_${template.templateId}`;
            const r = getValue(`${baseId}_r`);
            const g = getValue(`${baseId}_g`);
            const b = getValue(`${baseId}_b`);
            const hexValue = rgbToHex(r, g, b);

            const channels = [
              { ch: "r" as const, label: "R", value: r, color: "rose" as const },
              { ch: "g" as const, label: "G", value: g, color: "emerald" as const },
              { ch: "b" as const, label: "B", value: b, color: "sky" as const },
            ];

            return (
              <div key={baseId} className={`${styles.colorParamRow} ${index > 0 ? styles.colorParamRowSpaced : ""}`}>
                {/* Color label + swatch button */}
                <div className={styles.colorParamHeader}>
                  <span className={styles.colorParamLabel}>{template.label}</span>
                  <ColorPicker
                    label={template.label}
                    value={hexValue}
                    onChange={(hex) =>
                      handleColorParamChange(slotIndex, template.templateId, hex, setValue)
                    }
                  />
                </div>
                {/* Per-channel sliders with full controls */}
                {channels.map(({ ch, label, value: chVal, color: chColor }) => {
                  const chId = `${baseId}_${ch}`;
                  const hasMidiMappingCh = midiMappings?.some(
                    (m) => m.parameter_id === chId,
                  );
                  return (
                    <ParameterSlider
                      key={chId}
                      id={`slot-${slotIndex}-${template.templateId}-${ch}`}
                      label={label}
                      value={chVal}
                      min={0}
                      max={255}
                      step={1}
                      color={chColor}
                      showSpacing
                      onChange={(val) => {
                        const newR = ch === "r" ? val : r;
                        const newG = ch === "g" ? val : g;
                        const newB = ch === "b" ? val : b;
                        handleColorParamChange(
                          slotIndex,
                          template.templateId,
                          rgbToHex(newR, newG, newB),
                          setValue,
                        );
                      }}
                      onCommit={(after, before) => {
                        if (after !== before) pushUndoEntry(chId, before, after);
                      }}
                      audioMapping={getAudioMappingIndicator(chId, audioMappings)}
                      modulationIndicator={getModulationIndicator(
                        chId,
                        modulationTargets,
                        lfos,
                      )}
                      isMidiControlled={hasMidiMappingCh}
                      pickupState={midiPickupStates?.get(chId)}
                      midiParameterId={chId}
                      onQuickBeat={
                        onQuickBeat ? () => onQuickBeat(chId, 255) : undefined
                      }
                      onQuickLfo={
                        onQuickLfo ? () => onQuickLfo(chId) : undefined
                      }
                      onUnlinkBeat={
                        onUnlinkBeat ? () => onUnlinkBeat(chId) : undefined
                      }
                      onUnlinkLfo={
                        onUnlinkLfo ? () => onUnlinkLfo(chId) : undefined
                      }
                    />
                  );
                })}
              </div>
            );
          }

          // Render select input for parameters with inputType: "select"
          if (template.inputType === "select" && template.options) {
            const selectBefore = getValue(paramId);
            return (
              <ParameterSelect
                key={paramId}
                id={`slot-${slotIndex}-${template.templateId}`}
                label={template.label}
                value={getValue(paramId)}
                options={template.options}
                showSpacing={index > 0}
                description={template.description}
                onChange={(value: number) => {
                  createChangeHandler(slotIndex, template, setValue).onChange(value);
                  pushUndoEntry(paramId, selectBefore, value);
                }}
                audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
                modulationIndicator={getModulationIndicator(
                  paramId,
                  modulationTargets,
                  lfos,
                )}
                isMidiControlled={hasMidiMapping}
                onQuickBeat={
                  onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined
                }
                onQuickLfo={
                  onQuickLfo ? () => onQuickLfo(paramId) : undefined
                }
                onUnlinkBeat={
                  onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined
                }
                onUnlinkLfo={
                  onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined
                }
              />
            );
          }

          // Default to slider input
          const { onChange: sliderOnChange, onCommit: sliderOnCommit } = createChangeHandler(
            slotIndex, template, setValue,
          );
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
              onChange={sliderOnChange}
              onCommit={sliderOnCommit}
              audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
              modulationIndicator={getModulationIndicator(
                paramId,
                modulationTargets,
                lfos,
              )}
              isMidiControlled={hasMidiMapping}
              pickupState={midiPickupStates?.get(paramId)}
              midiParameterId={paramId}
              onQuickBeat={
                onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined
              }
              onQuickLfo={
                onQuickLfo ? () => onQuickLfo(paramId) : undefined
              }
              onUnlinkBeat={
                onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined
              }
              onUnlinkLfo={
                onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export default SlotParameterControls;
