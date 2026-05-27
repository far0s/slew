/**
 * LfoEditor
 *
 * LFO-related internal components for the ModulationPanel:
 * - Rate helpers: RATE_MIN_HZ, RATE_MAX_HZ, hzToSlider, sliderToHz, formatPeriod
 * - LfoForm (internal)
 * - TargetForm (internal — used by LfoRow for inline target editing)
 * - LfoRow (internal)
 * - LfosSection (exported — used by ModulationPanel)
 */

import { useState, useMemo, useEffect, useRef } from "react";
import type React from "react";
import { useScrollAdjust } from "@/inputs/shared";
import {
  useLfos,
  useModulationTargets,
  useLfoValues,
  createLfo,
  generateLfoName,
  LFO_SHAPES,
  LFO_SHAPE_LABELS,
  type LfoSource,
  type LfoShape,
  type ModulationTarget,
} from "@/inputs/modulation";
import {
  getAllSlotParameterIds,
  getSlotParameterIds,
  getParameterDropdownLabel,
  getParameterDescriptor,
  parseSlotParameterId,
  type ParameterId,
} from "@/slots/slotTypes";
import { getSketchDescriptor } from "@/sketches";
import type { Slot } from "@/slots/useSlots";
import styles from "./ModulationPanel.module.css";
import { LfoShapeIcon } from "./LfoShapeIcon";

// ============================================================================
// Rate Helpers
// ============================================================================

export const RATE_MIN_HZ = 0.001; // ~17 min cycle
export const RATE_MAX_HZ = 20;

export function hzToSlider(hz: number): number {
  const lo = Math.log(RATE_MIN_HZ);
  const hi = Math.log(RATE_MAX_HZ);
  return (Math.log(Math.max(hz, RATE_MIN_HZ)) - lo) / (hi - lo);
}

export function sliderToHz(pos: number): number {
  const lo = Math.log(RATE_MIN_HZ);
  const hi = Math.log(RATE_MAX_HZ);
  return Math.exp(lo + pos * (hi - lo));
}

export function formatPeriod(hz: number): string {
  const period = 1 / hz;
  if (period >= 3600) {
    return `${(period / 3600).toFixed(1)}h`;
  }
  if (period >= 60) {
    const mins = Math.floor(period / 60);
    const secs = Math.round(period % 60);
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  if (period >= 10) return `${period.toFixed(0)}s`;
  if (period >= 1) return `${period.toFixed(1)}s`;
  return `${hz.toFixed(2)} Hz`;
}

// ============================================================================
// LFO Form
// ============================================================================

interface LfoFormProps {
  editingLfo: LfoSource | null;
  onSave: (lfo: LfoSource) => void;
  onCancel: () => void;
  mode?: 'inline' | 'modal';
  onLiveChange?: (lfo: LfoSource) => void;
}

function LfoForm({ editingLfo, onSave, onCancel, mode = 'modal', onLiveChange }: LfoFormProps) {
  const isEditing = editingLfo !== null;
  const isInline = mode === 'inline';

  const [shape, setShape] = useState<LfoShape>(editingLfo?.shape ?? 'sine');
  const [rate, setRate] = useState(editingLfo?.rate ?? 0.5);
  const [name, setName] = useState(
    editingLfo?.name ?? generateLfoName(editingLfo?.shape ?? 'sine', editingLfo?.rate ?? 0.5),
  );
  const [nameManuallyEdited, setNameManuallyEdited] = useState(isEditing);
  const [depth, setDepth] = useState(editingLfo?.depth ?? 1.0);
  const [offset, setOffset] = useState(editingLfo?.offset ?? 0.0);
  const [phase, setPhase] = useState(editingLfo?.phase ?? 0.0);
  const [syncToBpm, setSyncToBpm] = useState(editingLfo?.sync_to_bpm ?? true);
  const [bpmDivision, setBpmDivision] = useState(
    editingLfo?.bpm_division ?? 4.0,
  );

  const isMountedRef = useRef(false);

  // Auto-update name when shape or rate changes (only for new LFOs with unedited name)
  useEffect(() => {
    if (!nameManuallyEdited) {
      setName(generateLfoName(shape, rate));
    }
  }, [shape, rate, nameManuallyEdited]);

  // Live update in inline mode
  useEffect(() => {
    if (!isInline || !onLiveChange || !editingLfo) return;
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    onLiveChange({
      id: editingLfo.id,
      name,
      shape,
      rate,
      depth,
      offset,
      phase,
      enabled: editingLfo.enabled,
      sync_to_bpm: syncToBpm,
      bpm_division: bpmDivision,
      order: editingLfo.order,
      pinned: editingLfo.pinned,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, rate, name, depth, offset, phase, syncToBpm, bpmDivision]);

  const rateScroll = useScrollAdjust(hzToSlider(rate), (v) => setRate(sliderToHz(v)), 0.001, 0, 1, syncToBpm);
  const depthScroll = useScrollAdjust(depth, setDepth, 0.01, 0, 1);
  const offsetScroll = useScrollAdjust(offset, setOffset, 0.01, -1, 1);
  const phaseScroll = useScrollAdjust(phase, setPhase, 0.01, 0, 1);

  const handleSubmit = () => {
    const lfo: LfoSource = {
      id: editingLfo?.id ?? '',
      name,
      shape,
      rate,
      depth,
      offset,
      phase,
      enabled: editingLfo?.enabled ?? true,
      sync_to_bpm: syncToBpm,
      bpm_division: bpmDivision,
      order: editingLfo?.order ?? 0,
      pinned: editingLfo?.pinned ?? false,
    };
    onSave(lfo);
  };

  return (
    <div className={styles.lfoForm}>
      {!isInline && (
        <div className={styles.formHeader}>
          {isEditing ? 'Edit LFO' : 'New LFO'}
        </div>
      )}

      <div className={styles.formRow}>
        <div className={styles.shapeNameRow}>
          <div className={styles.shapeColumn}>
            <span className={styles.formLabelText}>Shape</span>
            <div className={styles.shapePickerGrid}>
            {LFO_SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                className={`${styles.shapePickerBtn} ${s === shape ? styles.shapePickerBtnActive : ""}`}
                onClick={() => setShape(s)}
                title={LFO_SHAPE_LABELS[s]}
                aria-label={LFO_SHAPE_LABELS[s]}
                aria-pressed={s === shape}
              >
                <LfoShapeIcon shape={s} width={16} />
              </button>
            ))}
            </div>
          </div>
          <label className={styles.shapeNameLabel}>
            <span className={styles.formLabelText}>Name</span>
            <input
              type="text"
              className={styles.formInput}
              value={name}
              onChange={(e) => { setName(e.target.value); setNameManuallyEdited(true); }}
              placeholder="LFO name…"
            />
          </label>
        </div>
      </div>

      <div className={styles.formRow}>
        <label ref={rateScroll.ref} className={`${styles.formLabel} ${rateScroll.isHovered && !syncToBpm ? styles.formLabelScrollFocus : ""}`}>
          <span className={styles.formLabelText}>
            Rate{" "}
            {syncToBpm ? "(BPM sync)" : `(${formatPeriod(rate)})`}
          </span>
          <div className={styles.rateControls}>
            <input
              type="range"
              className={styles.formRange}
              min={0}
              max={1}
              step={0.001}
              value={hzToSlider(rate)}
              onChange={(e) => setRate(sliderToHz(parseFloat(e.target.value)))}
              disabled={syncToBpm}
            />
            <label className={styles.syncCheckbox}>
              <input
                type="checkbox"
                checked={syncToBpm}
                onChange={(e) => setSyncToBpm(e.target.checked)}
              />
              <span>BPM</span>
            </label>
          </div>
          {syncToBpm && (
            <select
              className={styles.formSelect}
              value={bpmDivision}
              onChange={(e) => setBpmDivision(parseFloat(e.target.value))}
            >
              <option value={0.25}>1/4 beat</option>
              <option value={0.5}>1/2 beat</option>
              <option value={1}>1 beat</option>
              <option value={2}>2 beats</option>
              <option value={4}>4 beats (1 bar)</option>
              <option value={8}>8 beats (2 bars)</option>
              <option value={16}>16 beats (4 bars)</option>
              <option value={32}>32 beats (8 bars)</option>
              <option value={64}>64 beats (16 bars)</option>
            </select>
          )}
        </label>
      </div>

      <div className={styles.formRow}>
        <label ref={depthScroll.ref} className={`${styles.formLabel} ${depthScroll.isHovered ? styles.formLabelScrollFocus : ""}`}>
          <span className={styles.formLabelText}>
            Depth ({(depth * 100).toFixed(0)}%)
          </span>
          <input
            type="range"
            className={styles.formRange}
            min={0}
            max={1}
            step={0.01}
            value={depth}
            onChange={(e) => setDepth(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label ref={offsetScroll.ref} className={`${styles.formLabel} ${offsetScroll.isHovered ? styles.formLabelScrollFocus : ""}`}>
          <span className={styles.formLabelText}>
            Offset ({offset >= 0 ? "+" : ""}
            {(offset * 100).toFixed(0)}%)
          </span>
          <input
            type="range"
            className={styles.formRange}
            min={-1}
            max={1}
            step={0.01}
            value={offset}
            onChange={(e) => setOffset(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label ref={phaseScroll.ref} className={`${styles.formLabel} ${phaseScroll.isHovered ? styles.formLabelScrollFocus : ""}`}>
          <span className={styles.formLabelText}>
            Phase offset ({(phase * 360).toFixed(0)}°)
          </span>
          <input
            type="range"
            className={styles.formRange}
            min={0}
            max={1}
            step={0.01}
            value={phase}
            onChange={(e) => setPhase(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.formActions}>
        {isInline ? (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSubmit}
            >
              {isEditing ? 'Save' : 'Add LFO'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Target Form
// ============================================================================

interface TargetFormProps {
  lfos: LfoSource[];
  slots: Slot[];
  editingTarget: ModulationTarget | null;
  preselectedLfoId?: string;
  onSave: (target: ModulationTarget) => void;
  onCancel: () => void;
  mode?: 'inline' | 'modal';
  onLiveChange?: (target: ModulationTarget) => void;
}

function TargetForm({
  lfos,
  slots,
  editingTarget,
  preselectedLfoId,
  onSave,
  onCancel,
  mode = 'modal',
  onLiveChange,
}: TargetFormProps) {
  const isEditing = editingTarget !== null;
  const isInline = mode === 'inline';

  const [sourceId, setSourceId] = useState(
    editingTarget?.source_id ?? preselectedLfoId ?? lfos[0]?.id ?? '',
  );
  const [parameterId, setParameterId] = useState<string>(
    editingTarget?.parameter_id ?? '',
  );
  const [depth, setDepth] = useState(editingTarget?.depth ?? 0.5);
  const [bipolar, setBipolar] = useState(editingTarget?.bipolar ?? true);

  const isMountedRef = useRef(false);

  // Resolve parameter descriptor to show depth in native units
  const paramDescriptor = useMemo(() => {
    if (!parameterId) return undefined;
    const parsed = parseSlotParameterId(parameterId);
    const sketchId = parsed
      ? (slots.find((s) => s.index === parsed.slotIndex)?.sketchId ?? undefined)
      : undefined;
    return getParameterDescriptor(parameterId, sketchId ?? undefined);
  }, [parameterId, slots]);

  // Get active slots for grouped parameter select
  const activeSlots = useMemo(
    () => slots.filter((s) => s.sketchId !== null),
    [slots],
  );

  // Live update in inline mode
  useEffect(() => {
    if (!isInline || !onLiveChange || !editingTarget) return;
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    if (!sourceId || !parameterId) return;
    onLiveChange({
      id: editingTarget.id,
      source_id: sourceId,
      parameter_id: parameterId,
      depth,
      bipolar,
      enabled: editingTarget.enabled,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, parameterId, depth, bipolar]);

  const handleSubmit = () => {
    if (!sourceId || !parameterId) return;

    const target: ModulationTarget = {
      id: editingTarget?.id ?? '',
      source_id: sourceId,
      parameter_id: parameterId,
      depth,
      bipolar,
      enabled: editingTarget?.enabled ?? true,
    };
    onSave(target);
  };

  return (
    <div className={styles.targetForm}>
      {!isInline && (
        <div className={styles.formHeader}>
          {isEditing ? 'Edit Modulation Target' : 'New Modulation Target'}
        </div>
      )}

      {!isInline && (
        <div className={styles.formRow}>
          <label className={styles.formLabel}>
            <span className={styles.formLabelText}>Source LFO</span>
            <select
              className={styles.formSelect}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              {lfos.map((lfo) => (
                <option key={lfo.id} value={lfo.id}>
                  {lfo.name} ({LFO_SHAPE_LABELS[lfo.shape]})
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Target Parameter</span>
          <select
            className={styles.formSelect}
            value={parameterId}
            onChange={(e) => setParameterId(e.target.value)}
          >
            <option value="">Select parameter…</option>
            <optgroup label="Global">
              <option value="crossfade">Crossfade</option>
            </optgroup>
            {activeSlots.map((slot) => {
              const sketchId = slot.sketchId as string;
              const descriptor = getSketchDescriptor(sketchId as Parameters<typeof getSketchDescriptor>[0]);
              const slotLabel = `Slot ${slot.index + 1} — ${descriptor?.label ?? sketchId}`;
              const paramIds = getSlotParameterIds(slot.index, sketchId as Parameters<typeof getSlotParameterIds>[1]);
              return (
                <optgroup key={slot.index} label={slotLabel}>
                  {paramIds.map((id) => {
                    const parsed = parseSlotParameterId(id);
                    const paramDesc = parsed ? getParameterDescriptor(id, sketchId) : undefined;
                    const label = paramDesc?.label ?? parsed?.templateId ?? id;
                    return (
                      <option key={id} value={id}>{label}</option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Depth ({bipolar ? "±" : ""}{(depth * 100).toFixed(0)}%
            {paramDescriptor && (
              <> · {bipolar ? "±" : ""}{depth.toFixed(paramDescriptor.step < 0.01 ? 3 : 2)}</>
            )}
            )
          </span>
          <input
            type="range"
            className={styles.formRange}
            min={0}
            max={1}
            step={0.01}
            value={depth}
            onChange={(e) => setDepth(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={bipolar}
            onChange={(e) => setBipolar(e.target.checked)}
          />
          <span>Bipolar (modulates ± around base value)</span>
        </label>
      </div>

      <div className={styles.formActions}>
        {isInline ? (
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Done
          </button>
        ) : (
          <>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={!sourceId || !parameterId}
            >
              {isEditing ? 'Save' : 'Add Target'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// LFO Row
// ============================================================================

interface LfoRowProps {
  lfo: LfoSource;
  lfos: LfoSource[];
  value: number;
  targets: ModulationTarget[];
  slots: Slot[];
  isExpanded: boolean;
  expandedTargetId: string | null;
  onExpand: () => void;
  onCollapse: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onPin: () => void;
  onAddTarget: (lfoId: string) => void;
  onExpandTarget: (target: ModulationTarget) => void;
  onCollapseTarget: () => void;
  onToggleTarget: (target: ModulationTarget) => void;
  onDeleteTarget: (id: string) => void;
  onLiveUpdateLfo: (lfo: LfoSource) => void;
  onLiveUpdateTarget: (target: ModulationTarget) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDragging?: boolean;
}

function LfoRow({
  lfo,
  lfos,
  value: _value,
  targets,
  slots,
  isExpanded,
  expandedTargetId,
  onExpand,
  onCollapse,
  onToggle,
  onDelete,
  onPin,
  onAddTarget,
  onExpandTarget,
  onCollapseTarget,
  onToggleTarget,
  onDeleteTarget,
  onLiveUpdateLfo,
  onLiveUpdateTarget,
  dragHandleProps,
  isDragging,
}: LfoRowProps) {
  const lfoTargets = targets.filter((t) => t.source_id === lfo.id);

  return (
    <div
      className={`${styles.lfoCard} ${!lfo.enabled ? styles.lfoDisabled : ''} ${isDragging ? styles.lfoDragging : ''} ${lfo.pinned ? styles.lfoPinned : ''}`}
    >
      {/* LFO header row */}
      <div className={styles.lfoRow}>
        <div
          className={styles.lfoDragHandle}
          aria-label="Drag to reorder"
          {...dragHandleProps}
        >
          ⠿
        </div>

        <button
          type="button"
          className={`${styles.lfoToggle} ${lfo.enabled ? styles.enabled : ''}`}
          onClick={onToggle}
          aria-label={lfo.enabled ? 'Disable LFO' : 'Enable LFO'}
        />

        <LfoShapeIcon
          shape={lfo.shape}
          width={18}
        />

        <button type="button" className={styles.lfoInfo} onClick={isExpanded ? onCollapse : onExpand}>
          <span className={styles.lfoName}>{lfo.name}</span>
          <span className={styles.lfoRate}>
            {lfo.sync_to_bpm
              ? lfo.bpm_division >= 4
                ? `${lfo.bpm_division / 4} bar${lfo.bpm_division >= 8 ? 's' : ''}`
                : `${lfo.bpm_division} beat${lfo.bpm_division !== 1 ? 's' : ''}`
              : formatPeriod(lfo.rate)}
          </span>
        </button>

        <button
          type="button"
          className={`${styles.lfoPinButton} ${lfo.pinned ? styles.pinned : ''}`}
          onClick={onPin}
          aria-label={lfo.pinned ? 'Unpin LFO' : 'Pin LFO'}
          title={lfo.pinned ? 'Pinned — survives Clear All' : 'Pin LFO'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
          </svg>
        </button>

        <button
          type="button"
          className={styles.lfoDelete}
          onClick={onDelete}
          aria-label="Delete LFO"
        >
          ×
        </button>
      </div>

      {/* Inline LFO form */}
      <div className={`${styles.inlineFormWrapper} ${isExpanded ? styles.inlineFormOpen : ''}`}>
        <div className={styles.inlineFormInner}>
          <LfoForm
            editingLfo={lfo}
            mode="inline"
            onLiveChange={isExpanded ? onLiveUpdateLfo : undefined}
            onSave={() => onCollapse()}
            onCancel={onCollapse}
          />
        </div>
      </div>

      {/* Inline targets */}
      {lfoTargets.length > 0 && (
        <div className={styles.lfoTargetsList}>
          {lfoTargets.map((target) => {
            const paramLabel = getParameterDropdownLabel(
              target.parameter_id as ParameterId,
            );
            const isTargetExpanded = expandedTargetId === target.id;
            return (
              <div key={target.id}>
                <div
                  className={`${styles.inlineTargetRow} ${!target.enabled ? styles.targetDisabled : ''}`}
                >
                  <div className={styles.targetToggleSpacer} />
                  <button
                    type="button"
                    className={`${styles.targetToggle} ${target.enabled ? styles.enabled : ''}`}
                    onClick={() => onToggleTarget(target)}
                    aria-label={target.enabled ? 'Disable' : 'Enable'}
                  />
                  <button
                    type="button"
                    className={styles.inlineTargetInfo}
                    onClick={() => isTargetExpanded ? onCollapseTarget() : onExpandTarget(target)}
                  >
                    <span className={styles.targetArrow}>→</span>
                    <span className={styles.targetParam}>{paramLabel}</span>
                    <span className={styles.targetDepth}>
                      {target.bipolar ? '±' : ''}
                      {(target.depth * 100).toFixed(0)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.targetDelete}
                    onClick={() => onDeleteTarget(target.id)}
                    aria-label="Remove target"
                  >
                    ×
                  </button>
                </div>
                <div className={`${styles.inlineFormWrapper} ${isTargetExpanded ? styles.inlineFormOpen : ''}`}>
                  <div className={styles.inlineFormInner}>
                    <TargetForm
                      lfos={lfos}
                      slots={slots}
                      editingTarget={target}
                      mode="inline"
                      onLiveChange={isTargetExpanded ? onLiveUpdateTarget : undefined}
                      onSave={() => onCollapseTarget()}
                      onCancel={onCollapseTarget}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add target button */}
      <button
        type="button"
        className={styles.addTargetButton}
        onClick={() => onAddTarget(lfo.id)}
      >
        + Add Target
      </button>
    </div>
  );
}

// ============================================================================
// LFOs Section (with inline targets, drag reorder, pin)
// ============================================================================

export interface LfosSectionProps {
  slots: Slot[];
  addLfoFnRef?: React.MutableRefObject<(() => Promise<void>) | null>;
  onHighlightParams?: (ids: Set<string>) => void;
}

export function LfosSection({ slots, addLfoFnRef, onHighlightParams }: LfosSectionProps) {
  const { lfos, add, update, remove } = useLfos();
  const { targets, add: addTarget, remove: removeTarget } = useModulationTargets();
  const { values } = useLfoValues();

  const [expandedLfoId, setExpandedLfoId] = useState<string | null>(null);
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);

  // Local drag-reorder state (display order of lfo ids)
  const [dragOrder, setDragOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; startY: number; currentY: number } | null>(null);
  const itemHeights = useRef<Map<string, number>>(new Map());
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const liveUpdateLfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveUpdateTargetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep dragOrder in sync with lfos (preserve existing order, add new ones at end)
  useEffect(() => {
    setDragOrder((prev) => {
      const lfoIds = lfos.map((l) => l.id);
      const filtered = prev.filter((id) => lfoIds.includes(id));
      const added = lfoIds.filter((id) => !filtered.includes(id));
      return [...filtered, ...added];
    });
  }, [lfos]);

  // Sort: pinned first (by order), then unpinned (by order)
  const sortedLfos = useMemo(() => {
    const ordered = dragOrder
      .map((id) => lfos.find((l) => l.id === id))
      .filter((l): l is LfoSource => l !== undefined);
    const pinned = ordered.filter((l) => l.pinned);
    const unpinned = ordered.filter((l) => !l.pinned);
    return [...pinned, ...unpinned];
  }, [dragOrder, lfos]);

  // Highlight params based on expanded LFO/target
  useEffect(() => {
    if (!onHighlightParams) {
      return;
    }
    if (expandedTargetId) {
      const target = targets.find((t) => t.id === expandedTargetId);
      const ids = target ? new Set([target.parameter_id]) : new Set<string>();
      onHighlightParams(ids);
    } else if (expandedLfoId) {
      const lfoTargets = targets.filter((t) => t.source_id === expandedLfoId);
      const ids = new Set(lfoTargets.map((t) => t.parameter_id));
      onHighlightParams(ids);
    } else {
      onHighlightParams(new Set());
    }
  }, [expandedLfoId, expandedTargetId, targets, onHighlightParams]);

  // Expose addLfo via ref
  const handleAddLfo = async () => {
    try {
      const newLfo = createLfo({ order: lfos.length });
      const added = await add(newLfo);
      setExpandedLfoId(added.id);
    } catch {
      // ignore
    }
  };
  if (addLfoFnRef) {
    addLfoFnRef.current = handleAddLfo;
  }

  const handleAddTarget = async (lfoId: string) => {
    try {
      // Default to first slot parameter (skip 'crossfade') so the highlight is visible
      const activeSlots = slots
        .filter((s) => s.sketchId !== null)
        .map((s) => ({ index: s.index, sketchId: s.sketchId as string }));
      const allIds = getAllSlotParameterIds(activeSlots);
      const firstSlotParam = allIds.find((id: ParameterId) => id !== 'crossfade') ?? 'crossfade';
      const added = await addTarget({
        id: '',
        source_id: lfoId,
        parameter_id: firstSlotParam,
        depth: 0.5,
        bipolar: true,
        enabled: true,
      });
      setExpandedTargetId(added.id);
    } catch {
      // ignore
    }
  };

  const handleLiveUpdateLfo = (lfo: LfoSource) => {
    if (liveUpdateLfoTimerRef.current) clearTimeout(liveUpdateLfoTimerRef.current);
    liveUpdateLfoTimerRef.current = setTimeout(() => {
      void update(lfo);
    }, 150);
  };

  const handleLiveUpdateTarget = (target: ModulationTarget) => {
    if (liveUpdateTargetTimerRef.current) clearTimeout(liveUpdateTargetTimerRef.current);
    liveUpdateTargetTimerRef.current = setTimeout(() => {
      void addTarget(target);
    }, 150);
  };

  const handleDelete = async (id: string) => {
    try {
      if (expandedLfoId === id) setExpandedLfoId(null);
      await remove(id);
    } catch {
      // UI state already reflects failure
    }
  };

  const handleToggle = async (lfo: LfoSource) => {
    try {
      await update({ ...lfo, enabled: !lfo.enabled });
    } catch {
      // UI state already reflects failure
    }
  };

  const handlePin = async (lfo: LfoSource) => {
    try {
      await update({ ...lfo, pinned: !lfo.pinned });
    } catch {
      // UI state already reflects failure
    }
  };

  const handleToggleTarget = async (target: ModulationTarget) => {
    try {
      await addTarget({ ...target, enabled: !target.enabled });
    } catch {
      // UI state already reflects failure
    }
  };

  const handleDeleteTarget = async (id: string) => {
    try {
      if (expandedTargetId === id) setExpandedTargetId(null);
      await removeTarget(id);
    } catch {
      // UI state already reflects failure
    }
  };

  // Persist order to backend after drag ends
  const persistOrder = async (orderedIds: string[]) => {
    const updates = orderedIds.map((id, index) => {
      const lfo = lfos.find((l) => l.id === id);
      return lfo ? { ...lfo, order: index } : null;
    }).filter((l): l is LfoSource => l !== null);
    for (const lfo of updates) {
      try { await update(lfo); } catch { /* ignore */ }
    }
  };

  // Drag handlers
  const handleDragStart = (id: string, e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, startY: e.clientY, currentY: e.clientY };
    setDraggingId(id);
    setExpandedLfoId(null);
    setExpandedTargetId(null);
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current.currentY = e.clientY;

    const dy = e.clientY - dragRef.current.startY;
    const currentOrder = dragOrder.filter((id) => {
      const lfo = lfos.find((l) => l.id === id);
      return lfo !== undefined;
    });
    const fromIdx = currentOrder.indexOf(dragRef.current.id);
    if (fromIdx === -1) return;

    let accumulated = 0;
    let toIdx = fromIdx;
    for (let i = 0; i < currentOrder.length; i++) {
      const h = itemHeights.current.get(currentOrder[i]) ?? 52;
      if (i === fromIdx) continue;
      if (i < fromIdx) {
        if (dy < accumulated - h / 2) { toIdx = i; break; }
        accumulated -= h;
      } else {
        accumulated += h;
        if (dy > accumulated - h / 2) toIdx = i;
      }
    }

    if (toIdx !== fromIdx) {
      setDragOrder((prev) => {
        const next = prev.filter((id) => id !== dragRef.current!.id);
        next.splice(toIdx, 0, dragRef.current!.id);
        return next;
      });
      dragRef.current.startY = e.clientY;
    }
  };

  const handleDragEnd = () => {
    if (!dragRef.current) return;
    const finalOrder = [...dragOrder];
    dragRef.current = null;
    setDraggingId(null);
    void persistOrder(finalOrder);
  };

  return (
    <div
      className={styles.lfosSection}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
      onPointerCancel={handleDragEnd}
    >
      {lfos.length === 0 ? (
        <p className={styles.noItems}>No LFOs. Click "+ Add" to create one.</p>
      ) : (
        <div className={styles.lfosList}>
          {sortedLfos.map((lfo) => (
            <div
              key={lfo.id}
              ref={(el) => {
                if (el) {
                  itemRefs.current.set(lfo.id, el);
                  itemHeights.current.set(lfo.id, el.offsetHeight);
                } else {
                  itemRefs.current.delete(lfo.id);
                }
              }}
            >
              <LfoRow
                lfo={lfo}
                lfos={sortedLfos}
                value={values[lfo.id] ?? 0}
                targets={targets}
                slots={slots}
                isExpanded={expandedLfoId === lfo.id}
                expandedTargetId={expandedTargetId}
                onExpand={() => { setExpandedLfoId(lfo.id); setExpandedTargetId(null); }}
                onCollapse={() => setExpandedLfoId(null)}
                onToggle={() => handleToggle(lfo)}
                onDelete={() => handleDelete(lfo.id)}
                onPin={() => handlePin(lfo)}
                onAddTarget={handleAddTarget}
                onExpandTarget={(target) => setExpandedTargetId(target.id)}
                onCollapseTarget={() => setExpandedTargetId(null)}
                onToggleTarget={handleToggleTarget}
                onDeleteTarget={handleDeleteTarget}
                onLiveUpdateLfo={handleLiveUpdateLfo}
                onLiveUpdateTarget={handleLiveUpdateTarget}
                isDragging={draggingId === lfo.id}
                dragHandleProps={{
                  onPointerDown: (e) => handleDragStart(lfo.id, e),
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
