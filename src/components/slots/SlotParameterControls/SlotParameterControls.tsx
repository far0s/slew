import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import { useEventListener } from "@/inputs/shared/useEventListener";
import type { SketchId, ParameterTemplate } from "@/sketches";
import { getSketchDescriptor } from "@/sketches";
import { makeSlotParameterId, SLOT_PARAMETER_TEMPLATES } from "@/slots/slotTypes";
import { type AudioMapping } from "@/inputs/audio";
import type { ModulationTarget, LfoSource } from "@/inputs/modulation";
import type { MidiMapping, MidiPickupState } from "@/inputs/midi";
import { ColorPalette } from "@/components/parameters/ColorPalette";
import { ParameterControl } from "@/components/parameters/ParameterControl";
import { ImageInput } from "@/components/parameters/ImageInput";
import { rgbToHex } from "@/lib/color";
import { usePresets } from "@/hooks/usePresets";
import { useSketchThumbnailHover } from "@/components/slots/SketchThumbnailPopover/SketchThumbnailPopover";
import { captureCompositeFrameAsDataUrl } from "@/lib/frameCapture";
import { PlusIcon, Pencil1Icon, Cross2Icon } from "@radix-ui/react-icons";
import styles from "./SlotParameterControls.module.css";

export interface SlotParameterControlsHandle {
  randomize: () => void;
}

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

export const SlotParameterControls = forwardRef<SlotParameterControlsHandle, SlotParameterControlsProps>(function SlotParameterControls({
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
}: SlotParameterControlsProps, ref) {
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

  useEventListener<{ id: string; value: number; target: number }>("parameter_changed_by_user", (payload) => {
    if (Date.now() - lastManualScrollRef.current < 1000) return;
    const { id } = payload;
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

  // For sketches with dynamicColorRange, animate color_item_N params in/out based on count.
  const dynamicRange = descriptor.dynamicColorRange;
  const activeItemCount = dynamicRange
    ? Math.round(getValue(makeSlotParameterId(slotIndex, dynamicRange.linkedParam)) ?? 1)
    : 0;

  // isDynamicItemVisible: true if param is a dynamic color item within the active count.
  // We keep all params in DOM (for smooth animation) but filter from sibling swatches.
  const isDynamicItemVisible = (templateId: string): boolean | null => {
    if (!dynamicRange || !templateId.startsWith(dynamicRange.itemPrefix)) return null;
    const idx = parseInt(templateId.slice(dynamicRange.itemPrefix.length), 10);
    return Number.isFinite(idx) ? idx <= activeItemCount : null;
  };

  // filteredParameters excludes invisible dynamic items from sibling swatch computation.
  const filteredParameters = dynamicRange
    ? sortedParameters.filter((t) => {
        const visible = isDynamicItemVisible(t.templateId);
        return visible !== false;
      })
    : sortedParameters;

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
      if (template.inputType === "image") continue;
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

  useImperativeHandle(ref, () => ({ randomize: handleRandomize }), [handleRandomize]);

  // ---- Preset state ----
  const { presets, savePreset, deletePreset, renamePreset } = usePresets(sketchId);
  const { onMouseEnter: onPresetMouseEnter, onMouseLeave: onPresetMouseLeave, popover: presetPopover } =
    useSketchThumbnailHover();
  const [savingPreset, setSavingPreset] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const saveInputRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollFades = useCallback(() => {
    const el = chipsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollFades();
  }, [presets, updateScrollFades]);

  useEffect(() => {
    if (savingPreset) saveInputRef.current?.focus();
  }, [savingPreset]);

  const defaultPresetParams = useMemo((): Record<string, number> => {
    const params: Record<string, number> = {};
    for (const template of descriptor.parameters) {
      if (template.inputType === "color") {
        const [r, g, b] = template.defaultColorValue ?? [0, 0, 0];
        params[`${template.templateId}_r`] = r;
        params[`${template.templateId}_g`] = g;
        params[`${template.templateId}_b`] = b;
      } else {
        params[template.templateId] = template.defaultValue;
      }
    }
    return params;
  }, [descriptor.parameters]);

  const collectCurrentParams = useCallback((): Record<string, number> => {
    const params: Record<string, number> = {};
    for (const template of descriptor.parameters) {
      if (template.inputType === "color") {
        const baseId = makeSlotParameterId(slotIndex, template.templateId);
        params[`${template.templateId}_r`] = getValue(`${baseId}_r`);
        params[`${template.templateId}_g`] = getValue(`${baseId}_g`);
        params[`${template.templateId}_b`] = getValue(`${baseId}_b`);
      } else {
        params[template.templateId] = getValue(makeSlotParameterId(slotIndex, template.templateId));
      }
    }
    return params;
  }, [descriptor.parameters, slotIndex, getValue]);

  const handleSavePreset = useCallback(async () => {
    const name = saveName.trim();
    if (!name) return;
    const thumbnail = await captureCompositeFrameAsDataUrl().catch(() => undefined);
    await savePreset(name, collectCurrentParams(), thumbnail);
    setSaveName("");
    setSavingPreset(false);
  }, [saveName, savePreset, collectCurrentParams]);

  const handleLoadPreset = useCallback(async (presetParams: Record<string, number>) => {
    isUserInteractingRef.current = true;
    for (const [key, value] of Object.entries(presetParams)) {
      const paramId = `slot_${slotIndex}_${key}`;
      setValue(paramId, value);
      void invoke("set_parameter", { id: paramId, value }).catch(() => {});
    }
    setTimeout(() => { isUserInteractingRef.current = false; }, 300);
  }, [slotIndex, setValue]);

  const handleStartRename = useCallback((name: string) => {
    setRenamingName(name);
    setRenameValue(name);
  }, []);

  const handleConfirmRename = useCallback(async (oldName: string) => {
    const newName = renameValue.trim();
    if (newName && newName !== oldName) {
      await renamePreset(oldName, newName);
    }
    setRenamingName(null);
  }, [renameValue, renamePreset]);

  const hiddenCount = hiddenParams.size;

  const renderParameterControl = (template: ParameterTemplate, _index: number) => {
    if (template.inputType === "image") {
      return (
        <div key={template.templateId} className={styles.dynamicParamFullWidth}>
          <ImageInput
            sketchId={sketchId}
            templateId={template.templateId}
            label={template.label}
          />
        </div>
      );
    }

    const index = _index;
    const paramId = makeSlotParameterId(slotIndex, template.templateId);
    const mainId = template.inputType === "color"
      ? `slot_${slotIndex}_${template.templateId}`
      : paramId;

    const siblingSwatches = template.inputType === "color"
      ? filteredParameters
          .filter((t) => t.inputType === "color" && t.templateId !== template.templateId)
          .map((t) => {
            const sid = `slot_${slotIndex}_${t.templateId}`;
            return rgbToHex(getValue(`${sid}_r`), getValue(`${sid}_g`), getValue(`${sid}_b`));
          })
          .filter((hex) => hex !== "#000000")
      : undefined;

    const dynamicVisible = isDynamicItemVisible(template.templateId);
    const control = (
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

    if (dynamicVisible === null) return control;
    return (
      <div
        key={`dynamic-wrap-${mainId}`}
        className={`${dynamicVisible ? styles.dynamicParamVisible : styles.dynamicParamHidden} ${styles.dynamicParamFullWidth}`}
        aria-hidden={!dynamicVisible}
      >
        {control}
      </div>
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
      <div className={styles.presetsSection}>
        <div className={styles.presetsHeader}>
          <span className={styles.presetsSectionLabel}>Presets</span>
          {savingPreset ? (
            <div className={styles.presetSaveInline}>
              <input
                ref={saveInputRef}
                className={styles.presetSaveInlineInput}
                type="text"
                placeholder="Name…"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSavePreset();
                  if (e.key === "Escape") { setSavingPreset(false); setSaveName(""); }
                }}
                onBlur={() => { if (!saveName.trim()) { setSavingPreset(false); setSaveName(""); } }}
              />
              <button
                type="button"
                className={styles.presetSaveConfirmBtn}
                onClick={() => void handleSavePreset()}
                disabled={!saveName.trim()}
              >
                Save
              </button>
              <button
                type="button"
                className={styles.presetSaveCancelBtn}
                onClick={() => { setSavingPreset(false); setSaveName(""); }}
                aria-label="Cancel"
              >
                <Cross2Icon />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.presetAddBtn}
              onClick={() => setSavingPreset(true)}
              title="Save current params as preset"
              aria-label="Save preset"
            >
              <PlusIcon />
            </button>
          )}
        </div>
        <div className={styles.presetsScrollWrap}>
          <div
            className={styles.presetsChips}
            ref={chipsRef}
            onScroll={updateScrollFades}
          >
            <button
              type="button"
              className={`${styles.presetChip} ${styles.presetChipDefault}`}
              onClick={() => void handleLoadPreset(defaultPresetParams)}
              onMouseEnter={(e) => onPresetMouseEnter(e, descriptor.thumbnail)}
              onMouseLeave={onPresetMouseLeave}
            >
              Default
            </button>
            {presets.map((preset) => (
              <div key={preset.name} className={styles.presetChipWrap}>
                {renamingName === preset.name ? (
                  <input
                    className={styles.presetChipRenameInput}
                    type="text"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleConfirmRename(preset.name);
                      if (e.key === "Escape") setRenamingName(null);
                    }}
                    onBlur={() => void handleConfirmRename(preset.name)}
                  />
                ) : (
                  <button
                    type="button"
                    className={styles.presetChip}
                    onClick={() => void handleLoadPreset(preset.parameters)}
                    onMouseEnter={(e) => onPresetMouseEnter(e, preset.thumbnail ?? descriptor.thumbnail)}
                    onMouseLeave={onPresetMouseLeave}
                  >
                    {preset.name}
                  </button>
                )}
                <div className={styles.presetChipActions}>
                  <button
                    type="button"
                    className={styles.presetChipActionBtn}
                    title="Rename"
                    onClick={() => handleStartRename(preset.name)}
                    aria-label="Rename preset"
                  >
                    <Pencil1Icon />
                  </button>
                  <button
                    type="button"
                    className={styles.presetChipActionBtn}
                    title="Delete"
                    onClick={() => void deletePreset(preset.name)}
                    aria-label="Delete preset"
                  >
                    <Cross2Icon />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {canScrollLeft && <div className={styles.fadeLeft} aria-hidden="true" />}
          {canScrollRight && <div className={styles.fadeRight} aria-hidden="true" />}
          {presetPopover}
        </div>
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
});

export default SlotParameterControls;
