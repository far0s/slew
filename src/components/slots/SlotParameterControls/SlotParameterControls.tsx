import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback } from "react";
import { useEventListener } from "@/inputs/shared/useEventListener";
import type { SketchId, ParameterTemplate } from "@/sketches";
import { getSketchDescriptor } from "@/sketches";
import { makeSlotParameterId, SLOT_PARAMETER_TEMPLATES } from "@/slots/slotTypes";
import { type AudioMapping } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import { ColorPalette } from "@/components/parameters/ColorPalette";
import { ParameterControl } from "@/components/parameters/ParameterControl";
import { rgbToHex } from "@/lib/color";
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
  highlightedParamIds?: Set<string>;
  onQuickBeat?: (parameterId: string, paramMax: number) => void;
  onQuickLfo?: (parameterId: string, paramMin: number, paramMax: number) => void;
  onUnlinkBeat?: (parameterId: string) => void;
  onUnlinkLfo?: (parameterId: string) => void;
}

const HIDDEN_PARAMS_STORAGE_PREFIX = "slew:hidden-params:";
const LOCKED_PARAMS_STORAGE_PREFIX = "slew:locked-params:";
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
    localStorage.setItem(`${COLLAPSED_GROUPS_STORAGE_PREFIX}${sketchId}`, JSON.stringify([...collapsed]));
  } catch {
    // ignore
  }
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
    localStorage.setItem(`${HIDDEN_PARAMS_STORAGE_PREFIX}${sketchId}`, JSON.stringify([...hidden]));
  } catch {
    // ignore
  }
}

function loadLockedParams(sketchId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${LOCKED_PARAMS_STORAGE_PREFIX}${sketchId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveLockedParams(sketchId: string, locked: Set<string>): void {
  try {
    localStorage.setItem(`${LOCKED_PARAMS_STORAGE_PREFIX}${sketchId}`, JSON.stringify([...locked]));
  } catch {
    // ignore
  }
}

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

function getOffsetRelativeTo(el: HTMLElement, ancestor: HTMLElement): number {
  let offset = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    offset += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return offset;
}

async function forwardControlsEvent(event: string, value: number): Promise<void> {
  await invoke("forward_controls_event", {
    event,
    payload: JSON.stringify({ value }),
  });
}

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
  highlightedParamIds,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
}: SlotParameterControlsProps) {
  const descriptor = getSketchDescriptor(sketchId);

  const [hiddenParams, setHiddenParams] = useState<Set<string>>(() => loadHiddenParams(sketchId));
  const [lockedParams, setLockedParams] = useState<Set<string>>(() => loadLockedParams(sketchId));
  const [chromaActiveMap, setChromaActiveMap] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => loadCollapsedGroups(sketchId));

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

  useEffect(() => {
    setHiddenParams(loadHiddenParams(sketchId));
    setLockedParams(loadLockedParams(sketchId));
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

  const toggleLock = useCallback(
    (templateId: string) => {
      setLockedParams((prev) => {
        const next = new Set(prev);
        if (next.has(templateId)) next.delete(templateId);
        else next.add(templateId);
        saveLockedParams(sketchId, next);
        return next;
      });
    },
    [sketchId],
  );

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isUserInteractingRef = useRef(false);
  const modulationTargetsRef = useRef(modulationTargets);
  const lfosRef = useRef(lfos);
  useEffect(() => { modulationTargetsRef.current = modulationTargets; }, [modulationTargets]);
  useEffect(() => { lfosRef.current = lfos; }, [lfos]);

  useEffect(() => {
    const reset = () => { isUserInteractingRef.current = false; };
    window.addEventListener("pointerup", reset);
    window.addEventListener("pointercancel", reset);
    return () => {
      window.removeEventListener("pointerup", reset);
      window.removeEventListener("pointercancel", reset);
    };
  }, []);

  const lastManualScrollRef = useRef(0);
  const scrollerListenerRef = useRef<{ el: HTMLElement; handler: () => void } | null>(null);
  useEffect(() => {
    return () => {
      if (scrollerListenerRef.current) {
        const { el, handler } = scrollerListenerRef.current;
        el.removeEventListener("wheel", handler);
        el.removeEventListener("touchstart", handler);
      }
    };
  }, []);

  useEventListener<{ id: string; value: number; target: number }>("parameter_changed", (payload) => {
    if (isUserInteractingRef.current) return;
    if (Date.now() - lastManualScrollRef.current < 1000) return;
    const { id } = payload;
    const targets = modulationTargetsRef.current;
    const lfos = lfosRef.current;
    if (targets && lfos) {
      const hasActiveLfo = targets.some(
        (t) => t.parameter_id === id && lfos.some((l) => l.id === t.source_id && l.enabled),
      );
      if (hasActiveLfo) return;
    }
    const row = rowRefs.current.get(id);
    if (row) {
      const scroller = findScrollParent(row);
      if (scroller) {
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

  if (!descriptor) {
    return (
      <div className={styles.container}>
        <p className={styles.errorMessage}>Unknown sketch: {sketchId}</p>
      </div>
    );
  }

  const allParameters = [...SLOT_PARAMETER_TEMPLATES, ...descriptor.parameters];
  const sortedParameters = allParameters.sort((a, b) => (a.orderHint ?? 0) - (b.orderHint ?? 0));
  const hasColorParams = descriptor.parameters.some((p) => p.inputType === "color");

  // Legacy color palette state (for sketches that haven't migrated to color params)
  const [colors, setColors] = useState<{
    startColor: [number, number, number];
    midColor: [number, number, number];
    endColor: [number, number, number];
    background: [number, number, number, number];
  } | null>(null);

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
    setColors((prev) => (prev ? { ...prev, [colorType]: color } : null));
    window.dispatchEvent(new CustomEvent("sketch-color-changed", { detail: { slotIndex, colorType, color } }));
    void forwardControlsEvent("sketch_color_changed", slotIndex).catch(() => {});
  };

  const handleColorReset = () => {
    if (!descriptor.colorPalette) return;
    setColors((prev) => prev ? {
      startColor: descriptor.colorPalette!.startColor,
      midColor: descriptor.colorPalette!.midColor,
      endColor: descriptor.colorPalette!.endColor,
      background: prev.background,
    } : null);
    ["startColor", "midColor", "endColor"].forEach((colorType) => {
      const color = descriptor.colorPalette![colorType as "startColor" | "midColor" | "endColor"];
      window.dispatchEvent(new CustomEvent("sketch-color-changed", { detail: { slotIndex, colorType, color } }));
    });
    void forwardControlsEvent("sketch_color_changed", slotIndex).catch(() => {});
  };

  const handleBackgroundReset = () => {
    if (!descriptor.colorPalette) return;
    setColors((prev) => prev ? { ...prev, background: descriptor.colorPalette!.background } : null);
    window.dispatchEvent(new CustomEvent("sketch-color-changed", {
      detail: { slotIndex, colorType: "background", color: descriptor.colorPalette.background },
    }));
    void forwardControlsEvent("sketch_color_changed", slotIndex).catch(() => {});
  };

  const handleRandomize = useCallback(() => {
    isUserInteractingRef.current = true;
    const params = [...SLOT_PARAMETER_TEMPLATES, ...descriptor.parameters];
    for (const template of params) {
      if (template.templateId === "alpha") continue;
      if (template.inputType === "color") continue;
      if (lockedParams.has(template.templateId)) continue;
      const paramId = makeSlotParameterId(slotIndex, template.templateId);
      const raw = template.min + Math.random() * (template.max - template.min);
      const snapped = Math.round(raw / template.step) * template.step;
      const clamped = Math.min(template.max, Math.max(template.min, snapped));
      setValue(paramId, clamped);
      void invoke("set_parameter", { id: paramId, value: clamped, app: undefined }).catch(() => {});
    }
    setTimeout(() => { isUserInteractingRef.current = false; }, 300);
  }, [descriptor, lockedParams, slotIndex, setValue]);

  const hiddenCount = hiddenParams.size;

  const renderParameterControl = (template: ParameterTemplate, index: number) => {
    const paramId = makeSlotParameterId(slotIndex, template.templateId);
    const mainId = template.inputType === "color"
      ? `slot_${slotIndex}_${template.templateId}`
      : paramId;

    const siblingSwatches = template.inputType === "color"
      ? sortedParameters
          .filter((t) => t.inputType === "color" && t.templateId !== template.templateId)
          .map((t) => {
            const sid = `slot_${slotIndex}_${t.templateId}`;
            return rgbToHex(getValue(`${sid}_r`), getValue(`${sid}_g`), getValue(`${sid}_b`));
          })
          .filter((hex) => hex !== "#000000")
      : undefined;

    return (
      <ParameterControl
        key={mainId}
        template={template}
        slotIndex={slotIndex}
        index={index}
        getValue={getValue}
        setValue={setValue}
        audioMappings={audioMappings}
        modulationTargets={modulationTargets}
        lfos={lfos}
        midiMappings={midiMappings}
        midiPickupStates={midiPickupStates}
        highlighted={highlightedParamIds?.has(paramId)}
        chromaActive={chromaActiveMap[template.templateId]}
        onChromaActiveChange={(active) =>
          setChromaActiveMap((prev) => ({ ...prev, [template.templateId]: active }))
        }
        onHide={() => hideParam(template.templateId)}
        onInteractionStart={() => { isUserInteractingRef.current = true; }}
        onInteractionEnd={() => { isUserInteractingRef.current = false; }}
        onQuickBeat={onQuickBeat}
        onQuickLfo={onQuickLfo}
        onUnlinkBeat={onUnlinkBeat}
        onUnlinkLfo={onUnlinkLfo}
        siblingSwatches={siblingSwatches}
        rowRef={(el) => {
          if (el) rowRefs.current.set(mainId, el);
          else rowRefs.current.delete(mainId);
        }}
        locked={lockedParams.has(template.templateId)}
        onToggleLock={() => toggleLock(template.templateId)}
      />
    );
  };

  const groupedParameters = (() => {
    const groups = new Map<string | undefined, ParameterTemplate[]>();
    for (const template of sortedParameters) {
      const key = template.group;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(template);
    }
    return groups;
  })();

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
      <div className={styles.toolbar}>
        <button type="button" className={styles.randomizeButton} onClick={handleRandomize}>
          Randomize
        </button>
      </div>
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
                      <span className={`${styles.groupChevron} ${isCollapsed ? styles.groupChevronCollapsed : ""}`}>
                        ▾
                      </span>
                      <span className={styles.groupLabel}>{label}</span>
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className={styles.paramGroupKnobs}>
                      {groupTemplates
                        .filter((t) => !hiddenParams.has(t.templateId))
                        .map((template, index) => renderParameterControl(template, index))}
                    </div>
                  )}
                </div>
              );
            })
          : sortedParameters
              .filter((t) => !hiddenParams.has(t.templateId))
              .map((template, index) => renderParameterControl(template, index))}
      </div>
      {hiddenCount > 0 && (
        <button type="button" className={styles.showHiddenChip} onClick={showAllParams}>
          Show hidden ({hiddenCount})
        </button>
      )}
    </div>
  );
}

export default SlotParameterControls;
