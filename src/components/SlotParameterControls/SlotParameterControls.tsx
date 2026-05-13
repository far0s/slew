import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeBpm } from "../../inputs/tapTempo";
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

const HIDDEN_PARAMS_STORAGE_PREFIX = "slew:hidden-params:";
const COLLAPSED_GROUPS_STORAGE_PREFIX = "slew:collapsed-groups:";

const GROUP_LABELS: Record<string, string> = {
  sketch: "Sketch",
  transition: "Transition",
  global: "Global",
};

function loadCollapsedGroups(sketchId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${COLLAPSED_GROUPS_STORAGE_PREFIX}${sketchId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsedGroups(sketchId: string, collapsed: Set<string>): void {
  try {
    localStorage.setItem(
      `${COLLAPSED_GROUPS_STORAGE_PREFIX}${sketchId}`,
      JSON.stringify([...collapsed]),
    );
  } catch {
    // ignore
  }
}

/** Walk up the DOM to find the nearest ancestor that scrolls vertically. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Compute the offsetTop of `el` relative to `ancestor` by summing offsetTop chain. */
function getOffsetRelativeTo(el: HTMLElement, ancestor: HTMLElement): number {
  let offset = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    offset += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return offset;
}

function loadHiddenParams(sketchId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${HIDDEN_PARAMS_STORAGE_PREFIX}${sketchId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveHiddenParams(sketchId: string, hidden: Set<string>): void {
  try {
    localStorage.setItem(
      `${HIDDEN_PARAMS_STORAGE_PREFIX}${sketchId}`,
      JSON.stringify([...hidden]),
    );
  } catch {
    // ignore
  }
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

/** Transition speed (seconds) used when picking a new color via the color picker swatch. */
const COLOR_PICK_TRANSITION = 0.35;

async function setParameterWithTransition(
  id: string,
  value: number,
  transitionSpeed: number,
): Promise<void> {
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

// ---------------------------------------------------------------------------
// ChromaLoop — BPM-synced or free-running hue rotation per colour param
// ---------------------------------------------------------------------------

/** Pre-defined loop period options shown in the UI */
const LOOP_PRESETS: { label: string; beats: number | null; seconds: number | null }[] = [
  { label: "4 beats",  beats: 4,    seconds: null },
  { label: "8 beats",  beats: 8,    seconds: null },
  { label: "16 beats", beats: 16,   seconds: null },
  { label: "32 beats", beats: 32,   seconds: null },
  { label: "64 beats", beats: 64,   seconds: null },
  { label: "30 s",     beats: null, seconds: 30   },
  { label: "1 min",    beats: null, seconds: 60   },
  { label: "5 min",    beats: null, seconds: 300  },
  { label: "15 min",   beats: null, seconds: 900  },
  { label: "30 min",   beats: null, seconds: 1800 },
  { label: "60 min",   beats: null, seconds: 3600 },
];

/** Convert RGB (0-255) to HSL (h 0-360, s 0-1, l 0-1) */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

/** Convert HSL (h 0-360, s 0-1, l 0-1) back to RGB (0-255) */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = h / 360;
  return [
    Math.round(hue2rgb(p, q, hn + 1/3) * 255),
    Math.round(hue2rgb(p, q, hn) * 255),
    Math.round(hue2rgb(p, q, hn - 1/3) * 255),
  ];
}

interface ChromaLoopProps {
  slotIndex: number;
  templateId: string;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
}

function ChromaLoop({ slotIndex, templateId, getValue, setValue }: ChromaLoopProps) {
  const [active, setActive] = useState(false);
  const [presetIndex, setPresetIndex] = useState(3); // "32 beats" default
  const [bpm, setBpm] = useState<number | null>(null);
  const phaseRef = useRef(0);           // 0-1 hue phase within the loop
  const lastTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const baseHsl = useRef<[number, number, number]>([0, 1, 0.5]);

  // Track current BPM
  useEffect(() => {
    return subscribeBpm((b) => setBpm(b));
  }, []);

  // Capture base color when loop is activated so we rotate around it
  const startLoop = useCallback(() => {
    const baseId = `slot_${slotIndex}_${templateId}`;
    const r = getValue(`${baseId}_r`);
    const g = getValue(`${baseId}_g`);
    const b = getValue(`${baseId}_b`);
    baseHsl.current = rgbToHsl(r, g, b);
    phaseRef.current = 0;
    lastTimeRef.current = performance.now();
    setActive(true);
  }, [slotIndex, templateId, getValue]);

  const stopLoop = useCallback(() => {
    setActive(false);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // rAF loop
  useEffect(() => {
    if (!active) return;

    const preset = LOOP_PRESETS[presetIndex];

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = now;

      // Compute period in seconds
      let periodSec: number;
      if (preset.beats !== null && bpm !== null && bpm > 0) {
        periodSec = (60 / bpm) * preset.beats;
      } else if (preset.seconds !== null) {
        periodSec = preset.seconds;
      } else {
        // No BPM set yet for a beat-based preset — wait
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
          // Atomic single call — all three channels land in the same backend lock,
          // and their parameter_changed events are emitted together so the renderer
          // never sees a partial RGB update that causes flicker.
          await invoke("set_color_channels", {
            baseId,
            r,
            g,
            b,
            transitionSpeed: 0, // instant — we're driving the animation ourselves
          });
        } catch { /* best-effort */ }
      })();

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, presetIndex, bpm, slotIndex, templateId, setValue]);

  const preset = LOOP_PRESETS[presetIndex];
  const needsBpm = preset.beats !== null && bpm === null;

  return (
    <div className={styles.chromaLoop}>
      <button
        type="button"
        className={`${styles.chromaLoopToggle} ${active ? styles.chromaLoopActive : ""}`}
        onClick={active ? stopLoop : startLoop}
        title={active ? "Stop chroma loop" : "Start chroma loop (hue rotation)"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.chromaLoopIcon}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="0.4" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>Chroma</span>
      </button>

      <select
        className={styles.chromaLoopSelect}
        value={presetIndex}
        onChange={(e) => {
          const idx = Number(e.target.value);
          setPresetIndex(idx);
          if (active) {
            // Restart with new period, keeping current phase
          }
        }}
        title="Loop period"
      >
        {LOOP_PRESETS.map((p, i) => (
          <option key={i} value={i}>{p.label}</option>
        ))}
      </select>

      {needsBpm && active && (
        <span className={styles.chromaLoopNoBpm}>tap BPM</span>
      )}
    </div>
  );
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

  // Hidden parameters, persisted per sketch ID
  const [hiddenParams, setHiddenParams] = useState<Set<string>>(() =>
    loadHiddenParams(sketchId),
  );

  // Collapsed groups, persisted per sketch ID
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() =>
    loadCollapsedGroups(sketchId),
  );

  const toggleGroup = useCallback(
    (group: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        saveCollapsedGroups(sketchId, next);
        return next;
      });
    },
    [sketchId],
  );

  // Reset hidden params when sketch changes
  useEffect(() => {
    setHiddenParams(loadHiddenParams(sketchId));
    setCollapsedGroups(loadCollapsedGroups(sketchId));
  }, [sketchId]);

  const hideParam = useCallback(
    (templateId: string) => {
      setHiddenParams((prev) => {
        const next = new Set(prev);
        next.add(templateId);
        saveHiddenParams(sketchId, next);
        return next;
      });
    },
    [sketchId],
  );

  const showAllParams = useCallback(() => {
    const empty = new Set<string>();
    saveHiddenParams(sketchId, empty);
    setHiddenParams(empty);
  }, [sketchId]);

  // Scroll-into-view: refs to each param row element
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // Track whether the user is actively dragging a slider to avoid self-triggering
  const isUserInteractingRef = useRef(false);
  // Safety reset: if the pointer is released anywhere (or cancelled), clear the flag.
  // This prevents isUserInteractingRef from getting stuck `true` if the user lifts
  // the mouse outside the slider thumb, which would block all MIDI auto-scroll.
  useEffect(() => {
    const reset = () => { isUserInteractingRef.current = false; };
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
    return () => {
      window.removeEventListener("pointerup", reset);
      window.removeEventListener("pointercancel", reset);
    };
  }, []);

  // Timestamp of the last manual scroll — auto-scroll is suppressed for 1s after.
  const lastManualScrollRef = useRef(0);
  // The scroller element we've attached the manual-scroll listener to.
  const scrollerListenerRef = useRef<{ el: HTMLElement; handler: () => void } | null>(null);
  // Clean up the scroller listener on unmount.
  useEffect(() => {
    return () => {
      if (scrollerListenerRef.current) {
        const { el, handler } = scrollerListenerRef.current;
        el.removeEventListener("wheel", handler);
        el.removeEventListener("touchstart", handler);
      }
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{ id: string; value: number; target: number }>("parameter_changed", (event) => {
      if (isUserInteractingRef.current) return;
      if (Date.now() - lastManualScrollRef.current < 1000) return;
      const { id } = event.payload;
      const row = rowRefs.current.get(id);
      if (row) {
        // Walk up the DOM to find the nearest scrolling ancestor
        const scroller = findScrollParent(row);
        if (scroller) {
          // Lazily attach manual-scroll listener to the scroller the first time we see it
          if (scrollerListenerRef.current?.el !== scroller) {
            if (scrollerListenerRef.current) {
              const { el, handler } = scrollerListenerRef.current;
              el.removeEventListener("wheel", handler);
              el.removeEventListener("touchstart", handler);
            }
            const handler = () => { lastManualScrollRef.current = Date.now(); };
            scroller.addEventListener("wheel", handler, { passive: true });
            scroller.addEventListener("touchstart", handler, { passive: true });
            scrollerListenerRef.current = { el: scroller, handler };
          }

          const rowTop = getOffsetRelativeTo(row, scroller);
          const rowBottom = rowTop + row.offsetHeight;
          const scrollTop = scroller.scrollTop;
          const containerHeight = scroller.clientHeight;
          if (rowTop < scrollTop) {
            scroller.scrollTo({ top: rowTop, behavior: "smooth" });
          } else if (rowBottom > scrollTop + containerHeight) {
            scroller.scrollTo({ top: rowBottom - containerHeight, behavior: "smooth" });
          }
        }
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [slotIndex, sketchId]);

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

  const hiddenCount = hiddenParams.size;

  const renderParameter = (template: ParameterTemplate, index: number) => {
    const paramId = makeSlotParameterId(slotIndex, template.templateId);
    const hasMidiMapping = midiMappings?.some(
      (m) => m.parameter_id === paramId,
    );

    // Render color picker group for parameters with inputType: "color"
    if (template.inputType === "color") {
      if (hiddenParams.has(template.templateId)) return null;
      const baseId = `slot_${slotIndex}_${template.templateId}`;
      const r = getValue(`${baseId}_r`);
      const g = getValue(`${baseId}_g`);
      const b = getValue(`${baseId}_b`);
      const hexValue = rgbToHex(r, g, b);
      const siblingSwatches = sortedParameters
        .filter((t) => t.inputType === "color" && t.templateId !== template.templateId)
        .map((t) => {
          const sid = `slot_${slotIndex}_${t.templateId}`;
          return rgbToHex(getValue(`${sid}_r`), getValue(`${sid}_g`), getValue(`${sid}_b`));
        })
        .filter((hex) => hex !== "#000000");
      const channels = [
        { ch: "r" as const, label: "R", value: r, color: "rose" as const },
        { ch: "g" as const, label: "G", value: g, color: "emerald" as const },
        { ch: "b" as const, label: "B", value: b, color: "sky" as const },
      ];
      return (
        <div
          key={baseId}
          ref={(el) => {
            if (el) rowRefs.current.set(baseId, el);
            else rowRefs.current.delete(baseId);
          }}
          className={`${styles.colorParamRow} ${index > 0 ? styles.colorParamRowSpaced : ""}`}
          onContextMenu={(e) => { e.preventDefault(); hideParam(template.templateId); }}
        >
          <div className={styles.colorParamHeader}>
            <span className={styles.colorParamLabel}>{template.label}</span>
            <ColorPicker
              label={template.label}
              value={hexValue}
              swatches={siblingSwatches}
              onChange={(hex) =>
                handleColorParamChange(slotIndex, template.templateId, hex, setValue, COLOR_PICK_TRANSITION)
              }
            />
          </div>
          <ChromaLoop
            slotIndex={slotIndex}
            templateId={template.templateId}
            getValue={getValue}
            setValue={setValue}
          />
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
                  isUserInteractingRef.current = true;
                  const newR = ch === "r" ? val : r;
                  const newG = ch === "g" ? val : g;
                  const newB = ch === "b" ? val : b;
                  handleColorParamChange(slotIndex, template.templateId, rgbToHex(newR, newG, newB), setValue);
                }}
                onCommit={(after, before) => {
                  isUserInteractingRef.current = false;
                  if (after !== before) pushUndoEntry(chId, before, after);
                }}
                audioMapping={getAudioMappingIndicator(chId, audioMappings)}
                modulationIndicator={getModulationIndicator(chId, modulationTargets, lfos)}
                isMidiControlled={hasMidiMappingCh}
                pickupState={midiPickupStates?.get(chId)}
                midiParameterId={chId}
                onQuickBeat={onQuickBeat ? () => onQuickBeat(chId, 255) : undefined}
                onQuickLfo={onQuickLfo ? () => onQuickLfo(chId) : undefined}
                onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(chId) : undefined}
                onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(chId) : undefined}
              />
            );
          })}
        </div>
      );
    }

    // Skip hidden parameters
    if (hiddenParams.has(template.templateId)) return null;

    // Render select input
    if (template.inputType === "select" && template.options) {
      const selectBefore = getValue(paramId);
      return (
        <div
          key={paramId}
          ref={(el) => {
            if (el) rowRefs.current.set(paramId, el);
            else rowRefs.current.delete(paramId);
          }}
          onContextMenu={(e) => { e.preventDefault(); hideParam(template.templateId); }}
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
            onQuickLfo={onQuickLfo ? () => onQuickLfo(paramId) : undefined}
            onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined}
            onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined}
          />
        </div>
      );
    }

    // Default: slider input
    const { onChange: sliderOnChange, onCommit: sliderOnCommit } = createChangeHandler(slotIndex, template, setValue);
    return (
      <div
        key={paramId}
        ref={(el) => {
          if (el) rowRefs.current.set(paramId, el);
          else rowRefs.current.delete(paramId);
        }}
        onContextMenu={(e) => { e.preventDefault(); hideParam(template.templateId); }}
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
          onChange={(v) => { isUserInteractingRef.current = true; sliderOnChange(v); }}
          onCommit={(after, before) => { isUserInteractingRef.current = false; sliderOnCommit(after, before); }}
          audioMapping={getAudioMappingIndicator(paramId, audioMappings)}
          modulationIndicator={getModulationIndicator(paramId, modulationTargets, lfos)}
          isMidiControlled={hasMidiMapping}
          pickupState={midiPickupStates?.get(paramId)}
          midiParameterId={paramId}
          onQuickBeat={onQuickBeat ? () => onQuickBeat(paramId, template.max) : undefined}
          onQuickLfo={onQuickLfo ? () => onQuickLfo(paramId) : undefined}
          onUnlinkBeat={onUnlinkBeat ? () => onUnlinkBeat(paramId) : undefined}
          onUnlinkLfo={onUnlinkLfo ? () => onUnlinkLfo(paramId) : undefined}
        />
      </div>
    );
  };

  // Group parameters by their group field for rendering
  const groupedParameters = (() => {
    const groups = new Map<string | undefined, ParameterTemplate[]>();
    for (const template of sortedParameters) {
      const key = template.group;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(template);
    }
    return groups;
  })();

  // Show group headers when there are multiple distinct named groups
  const namedGroups = [...groupedParameters.keys()].filter(Boolean) as string[];
  const showGroupHeaders = namedGroups.length > 1;

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
        {showGroupHeaders
          ? [...groupedParameters.entries()].map(([group, groupTemplates]) => {
              const isCollapsed = group ? collapsedGroups.has(group) : false;
              const label = group ? (GROUP_LABELS[group] ?? group) : undefined;
              return (
                <div key={group ?? "__ungrouped__"} className={styles.paramGroup}>
                  {label && (
                    <button
                      type="button"
                      className={styles.groupHeader}
                      onClick={() => group && toggleGroup(group)}
                      aria-expanded={!isCollapsed}
                    >
                      <span className={`${styles.groupChevron} ${isCollapsed ? styles.groupChevronCollapsed : ""}`}>▾</span>
                      <span className={styles.groupLabel}>{label}</span>
                    </button>
                  )}
                  {!isCollapsed && groupTemplates.map((template, index) =>
                    renderParameter(template, index)
                  )}
                </div>
              );
            })
          : sortedParameters.map((template, index) => renderParameter(template, index))
        }
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className={styles.showHiddenChip}
          onClick={showAllParams}
        >
          Show hidden ({hiddenCount})
        </button>
      )}
    </div>
  );
}

export default SlotParameterControls;
