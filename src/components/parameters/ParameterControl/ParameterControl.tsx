import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeBpm } from "@/inputs/tapTempo";
import { pushUndoEntry } from "@/hooks/useUndoHistory";
import type { ParameterTemplate } from "@/sketches";
import { makeSlotParameterId } from "@/slots/slotTypes";
import { ParameterSlider } from "@/components/parameters/ParameterSlider";
import type { AudioMappingIndicator, ModulationIndicator } from "@/components/parameters/ParameterSlider";
import { KnobInput } from "@/components/parameters/KnobInput";
import { StepInput } from "@/components/parameters/StepInput";
import { ParameterSelect } from "@/components/parameters/ParameterSelect";
import { type AudioMapping, AUDIO_SOURCE_SHORT_LABELS, AUDIO_SOURCE_COLORS } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import { ColorPicker } from "@/components/parameters/ColorPicker";
import { sendColorOsc } from "@/inputs/osc";
import { rgbToHex, hexToRgb, rgbToHsl, hslToRgb } from "@/lib/color";
import styles from "./ParameterControl.module.css";

export interface ParameterControlProps {
  template: ParameterTemplate;
  slotIndex: number;
  index: number;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  midiMappings?: MidiMapping[];
  midiPickupStates?: Map<string, MidiPickupState>;
  highlighted?: boolean;
  chromaActive?: boolean;
  onChromaActiveChange?: (active: boolean) => void;
  onHide?: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (parameterId: string, paramMin: number, paramMax: number) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
  siblingSwatches?: string[];
  rowRef?: (el: HTMLDivElement | null) => void;
}

// ---------------------------------------------------------------------------

const COLOR_PICK_TRANSITION = 0.35;

async function setParameter(id: string, value: number): Promise<void> {
  await invoke("set_parameter", { id, value, app: undefined });
}

async function setParameterWithTransition(id: string, value: number, transitionSpeed: number): Promise<void> {
  await invoke("set_parameter_with_transition", { id, value, transitionSpeed });
}

function handleColorParamChange(
  slotIndex: number,
  templateId: string,
  hex: string,
  setValue: (id: string, value: number) => void,
  transitionSpeed = 0,
): void {
  const [r, g, b] = hexToRgb(hex);
  const baseId = `slot_${slotIndex}_${templateId}`;

  setValue(`${baseId}_r`, r);
  setValue(`${baseId}_g`, g);
  setValue(`${baseId}_b`, b);

  void (async () => {
    try {
      if (transitionSpeed > 0) {
        await setParameterWithTransition(`${baseId}_r`, r, transitionSpeed);
        await setParameterWithTransition(`${baseId}_g`, g, transitionSpeed);
        await setParameterWithTransition(`${baseId}_b`, b, transitionSpeed);
      } else {
        await setParameter(`${baseId}_r`, r);
        await setParameter(`${baseId}_g`, g);
        await setParameter(`${baseId}_b`, b);
      }
      await sendColorOsc(slotIndex, templateId, r, g, b);
    } catch {
      // best-effort
    }
  })();

  const colorTypeMap: Record<string, "startColor" | "midColor" | "endColor"> = {
    color_primary: "startColor",
    color_secondary: "midColor",
    color_bg: "endColor",
  };
  const colorType = colorTypeMap[templateId];
  if (colorType) {
    window.dispatchEvent(
      new CustomEvent("sketch-color-changed", {
        detail: { slotIndex, colorType, color: [r, g, b] as [number, number, number] },
      }),
    );
  }
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
          await invoke("forward_controls_event", {
            event: paramId,
            payload: JSON.stringify({ value }),
          });
        }
      } catch {
        // UI state already reflects failure
      }
    })();
  };

  const onCommit = (after: number, before: number) => {
    if (after !== before) pushUndoEntry(paramId, before, after);
  };

  return { onChange, onCommit };
}

function getAudioMappingIndicator(parameterId: string, audioMappings?: AudioMapping[]): AudioMappingIndicator | null {
  if (!audioMappings) return null;
  const mapping = audioMappings.find((m) => m.parameter_id === parameterId && m.enabled);
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
  const activeTargets = modulationTargets.filter((t) => t.parameter_id === parameterId && t.enabled);
  if (activeTargets.length === 0) return null;
  const firstTarget = activeTargets[0];
  const lfo = lfos.find((l) => l.id === firstTarget.source_id && l.enabled);
  if (!lfo) return null;
  return { lfoName: lfo.name, lfoShape: lfo.shape, count: activeTargets.length };
}

// ---------------------------------------------------------------------------
// ChromaLoop — BPM-synced hue rotation for color parameters
// ---------------------------------------------------------------------------

const LOOP_PRESETS: { label: string; beats: number | null; seconds: number | null }[] = [
  { label: "4 beats", beats: 4, seconds: null },
  { label: "8 beats", beats: 8, seconds: null },
  { label: "16 beats", beats: 16, seconds: null },
  { label: "32 beats", beats: 32, seconds: null },
  { label: "64 beats", beats: 64, seconds: null },
  { label: "30 s", beats: null, seconds: 30 },
  { label: "1 min", beats: null, seconds: 60 },
  { label: "5 min", beats: null, seconds: 300 },
  { label: "15 min", beats: null, seconds: 900 },
  { label: "30 min", beats: null, seconds: 1800 },
  { label: "60 min", beats: null, seconds: 3600 },
];

interface ChromaLoopProps {
  slotIndex: number;
  templateId: string;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  onActiveChange?: (active: boolean) => void;
}

function ChromaLoop({ slotIndex, templateId, getValue, setValue, onActiveChange }: ChromaLoopProps) {
  const [active, setActive] = useState(false);
  const [presetIndex, setPresetIndex] = useState(3);
  const [bpm, setBpm] = useState<number | null>(null);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const baseHsl = useRef<[number, number, number]>([0, 1, 0.5]);

  useEffect(() => {
    return subscribeBpm((b) => setBpm(b));
  }, []);

  const startLoop = useCallback(() => {
    const baseId = `slot_${slotIndex}_${templateId}`;
    const r = getValue(`${baseId}_r`);
    const g = getValue(`${baseId}_g`);
    const b = getValue(`${baseId}_b`);
    baseHsl.current = rgbToHsl(r, g, b);
    phaseRef.current = 0;
    lastTimeRef.current = performance.now();
    setActive(true);
    onActiveChange?.(true);
  }, [slotIndex, templateId, getValue, onActiveChange]);

  const stopLoop = useCallback(() => {
    setActive(false);
    cancelAnimationFrame(rafRef.current);
    onActiveChange?.(false);
  }, [onActiveChange]);

  useEffect(() => {
    if (!active) return;

    const preset = LOOP_PRESETS[presetIndex];

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      let periodSec: number;
      if (preset.beats !== null && bpm !== null && bpm > 0) {
        periodSec = (60 / bpm) * preset.beats;
      } else if (preset.seconds !== null) {
        periodSec = preset.seconds;
      } else {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      phaseRef.current = (phaseRef.current + dt / periodSec) % 1;

      const [baseH, s, l] = baseHsl.current;
      const h = (baseH + phaseRef.current * 360) % 360;
      const [r, g, b] = hslToRgb(h, s, l);

      const baseId = `slot_${slotIndex}_${templateId}`;
      setValue(`${baseId}_r`, r);
      setValue(`${baseId}_g`, g);
      setValue(`${baseId}_b`, b);

      void (async () => {
        try {
          await invoke("set_color_channels", { baseId, r, g, b, transitionSpeed: 0 });
        } catch {
          /* best-effort */
        }
      })();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, presetIndex, bpm, slotIndex, templateId, setValue]);

  return (
    <>
      <button
        type="button"
        className={`${styles.chromaLoopToggle} ${active ? styles.chromaLoopActive : ""}`}
        onClick={active ? stopLoop : startLoop}
        title={active ? "Stop chroma loop" : "Start chroma loop (hue rotation)"}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.chromaLoopIcon}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.4" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>Chroma</span>
      </button>

      <select
        className={styles.chromaLoopSelect}
        value={presetIndex}
        onChange={(e) => setPresetIndex(Number(e.target.value))}
        title="Loop period"
      >
        {LOOP_PRESETS.map((p, i) => (
          <option key={i} value={i}>
            {p.label}
          </option>
        ))}
      </select>
    </>
  );
}

// ---------------------------------------------------------------------------

export function ParameterControl({
  template,
  slotIndex,
  index,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  midiPickupStates,
  highlighted,
  chromaActive,
  onChromaActiveChange,
  onHide,
  onInteractionStart,
  onInteractionEnd,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
  siblingSwatches,
  rowRef,
}: ParameterControlProps) {
  const paramId = makeSlotParameterId(slotIndex, template.templateId);
  const hasMidiMapping = midiMappings?.some((m) => m.parameter_id === paramId);

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
      <div
        ref={rowRef}
        className={`${styles.colorParamRow} ${styles.fullWidthRow} ${styles.paramRow} ${index > 0 ? styles.colorParamRowSpaced : ""} ${highlighted ? styles.paramHighlighted : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onHide?.();
        }}
      >
        <div className={styles.colorParamHeader}>
          <span className={styles.colorParamLabel}>{template.label}</span>
          <ChromaLoop
            slotIndex={slotIndex}
            templateId={template.templateId}
            getValue={getValue}
            setValue={setValue}
            onActiveChange={onChromaActiveChange}
          />
          <ColorPicker
            label={template.label}
            value={hexValue}
            swatches={siblingSwatches ?? []}
            onChange={(hex) =>
              handleColorParamChange(slotIndex, template.templateId, hex, setValue, COLOR_PICK_TRANSITION)
            }
          />
        </div>
        <div className={styles.colorSliders} data-collapsed={chromaActive ? "true" : "false"}>
          <div className={styles.colorSlidersInner}>
            {channels.map(({ ch, label: chLabel, value: chVal, color: chColor }) => {
              const chId = `${baseId}_${ch}`;
              const hasMidiMappingCh = midiMappings?.some((m) => m.parameter_id === chId);
              return (
                <ParameterSlider
                  key={chId}
                  id={`slot-${slotIndex}-${template.templateId}-${ch}`}
                  label={chLabel}
                  value={chVal}
                  min={0}
                  max={255}
                  step={1}
                  color={chColor}
                  inline
                  onChange={(val) => {
                    onInteractionStart?.();
                    const newR = ch === "r" ? val : r;
                    const newG = ch === "g" ? val : g;
                    const newB = ch === "b" ? val : b;
                    handleColorParamChange(slotIndex, template.templateId, rgbToHex(newR, newG, newB), setValue);
                  }}
                  onCommit={(after, before) => {
                    onInteractionEnd?.();
                    if (after !== before) pushUndoEntry(chId, before, after);
                  }}
                  audioMapping={getAudioMappingIndicator(chId, audioMappings)}
                  modulationIndicator={getModulationIndicator(chId, modulationTargets, lfos)}
                  isMidiControlled={hasMidiMappingCh}
                  pickupState={midiPickupStates?.get(chId)}
                  midiParameterId={chId}
                  onQuickBeat={onQuickBeat ? () => onQuickBeat(chId, 255) : undefined}
                  onQuickLfo={onQuickLfo ? () => onQuickLfo(chId, 0, 255) : undefined}
                  onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(chId) : undefined}
                  onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(chId) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (template.inputType === "select" && template.options) {
    const selectBefore = getValue(paramId);
    return (
      <div
        ref={rowRef}
        className={`${styles.fullWidthRow} ${styles.paramRow} ${highlighted ? styles.paramHighlighted : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onHide?.();
        }}
      >
        <ParameterSelect
          id={`slot-${slotIndex}-${template.templateId}`}
          label={template.label}
          value={getValue(paramId)}
          options={template.options}
          showSpacing={index > 0}
          description={undefined}
          onChange={(value: number) => {
            createChangeHandler(slotIndex, template, setValue).onChange(value);
            pushUndoEntry(paramId, selectBefore, value);
          }}
          audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
          modulationIndicator={getModulationIndicator(paramId, modulationTargets, lfos)}
          isMidiControlled={hasMidiMapping}
          onQuickBeat={onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined}
          onQuickLfo={onQuickLfo ? () => onQuickLfo(paramId, template.min, template.max) : undefined}
          onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined}
          onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined}
        />
      </div>
    );
  }

  if (template.inputType === "integer") {
    const { onChange: stepOnChange, onCommit: stepOnCommit } = createChangeHandler(slotIndex, template, setValue);
    return (
      <div
        ref={rowRef}
        className={`${styles.paramRow} ${highlighted ? styles.paramHighlighted : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onHide?.();
        }}
      >
        <StepInput
          id={`slot-${slotIndex}-${template.templateId}`}
          label={template.label}
          value={getValue(paramId)}
          min={template.min}
          max={template.max}
          step={template.step}
          color={template.color ?? "emerald"}
          onChange={(v) => {
            onInteractionStart?.();
            stepOnChange(v);
          }}
          onCommit={(after, before) => {
            onInteractionEnd?.();
            stepOnCommit(after, before);
          }}
        />
      </div>
    );
  }

  const { onChange: sliderOnChange, onCommit: sliderOnCommit } = createChangeHandler(slotIndex, template, setValue);
  const useSlider = template.group === "transition" || template.group === "global" || template.inputType === "slider";

  if (useSlider) {
    return (
      <div
        ref={rowRef}
        className={`${styles.fullWidthRow} ${styles.paramRow} ${highlighted ? styles.paramHighlighted : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          onHide?.();
        }}
      >
        <ParameterSlider
          id={`slot-${slotIndex}-${template.templateId}`}
          label={template.label}
          value={getValue(paramId)}
          min={template.min}
          max={template.max}
          step={template.step}
          color={template.color ?? "emerald"}
          showSpacing={index > 0}
          description={undefined}
          onChange={(v) => {
            onInteractionStart?.();
            sliderOnChange(v);
          }}
          onCommit={(after, before) => {
            onInteractionEnd?.();
            sliderOnCommit(after, before);
          }}
          audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
          modulationIndicator={getModulationIndicator(paramId, modulationTargets, lfos)}
          isMidiControlled={hasMidiMapping}
          pickupState={midiPickupStates?.get(paramId)}
          midiParameterId={paramId}
          onQuickBeat={onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined}
          onQuickLfo={onQuickLfo ? () => onQuickLfo(paramId, template.min, template.max) : undefined}
          onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined}
          onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined}
        />
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={`${styles.paramRow} ${highlighted ? styles.paramHighlighted : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onHide?.();
      }}
    >
      <KnobInput
        id={`slot-${slotIndex}-${template.templateId}`}
        label={template.label}
        value={getValue(paramId)}
        min={template.min}
        max={template.max}
        step={template.step}
        color={template.color ?? "emerald"}
        onChange={(v) => {
          onInteractionStart?.();
          sliderOnChange(v);
        }}
        onCommit={(after, before) => {
          onInteractionEnd?.();
          sliderOnCommit(after, before);
        }}
        audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
        modulationIndicator={getModulationIndicator(paramId, modulationTargets, lfos)}
        isMidiControlled={hasMidiMapping}
        pickupState={midiPickupStates?.get(paramId)}
        midiParameterId={paramId}
        onQuickBeat={onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined}
        onQuickLfo={onQuickLfo ? () => onQuickLfo(paramId, template.min, template.max) : undefined}
        onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined}
        onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined}
      />
    </div>
  );
}
