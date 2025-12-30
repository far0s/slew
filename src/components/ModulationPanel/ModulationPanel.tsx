/**
 * ModulationPanel
 *
 * Control panel for backend modulation engine including:
 * - LFO sources with waveform visualization
 * - Modulation targets (LFO → parameter routing)
 * - Audio modulation (audio → LFO property routing)
 */

import { useState, useMemo } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import {
  useLfos,
  useModulationTargets,
  useAudioModulations,
  useLfoValues,
  createLfo,
  getTargetsForLfo,
  LFO_SHAPES,
  LFO_SHAPE_LABELS,
  LFO_SHAPE_COLORS,
  LFO_PROPERTIES,
  LFO_PROPERTY_LABELS,
  type LfoSource,
  type LfoShape,
  type ModulationTarget,
  type AudioModulation,
  type LfoProperty,
} from "../../inputs/modulation";
import {
  AUDIO_SOURCES,
  AUDIO_SOURCE_LABELS,
  AUDIO_SOURCE_COLORS,
  type AudioSource,
} from "../../inputs/audio";
import {
  getAllSlotParameterIds,
  getParameterDropdownLabel,
  type ParameterId,
} from "../../slots/slotTypes";
import type { Slot } from "../../slots/useSlots";
import styles from "./ModulationPanel.module.css";

// ============================================================================
// LFO Waveform Visualization
// ============================================================================

interface WaveformDisplayProps {
  shape: LfoShape;
  value: number;
  color: string;
  size?: number;
}

function WaveformDisplay({
  shape,
  value = 0,
  color,
  size = 32,
}: WaveformDisplayProps) {
  // Ensure value is a valid number to prevent undefined cx/cy errors
  const safeValue =
    typeof value === "number" && !Number.isNaN(value) ? value : 0;
  // Generate waveform path
  const points = useMemo(() => {
    const numPoints = 40;
    const pts: string[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const phase = i / numPoints;
      let y: number;

      switch (shape) {
        case "sine":
          y = Math.sin(phase * 2 * Math.PI);
          break;
        case "triangle":
          if (phase < 0.25) y = phase * 4;
          else if (phase < 0.75) y = 1 - (phase - 0.25) * 4;
          else y = -1 + (phase - 0.75) * 4;
          break;
        case "saw":
          y = 2 * phase - 1;
          break;
        case "square":
          y = phase < 0.5 ? 1 : -1;
          break;
        case "random":
          y = Math.sin(phase * 8 + i * 0.5) * 0.7;
          break;
        default:
          y = 0;
      }

      const x = (i / numPoints) * size;
      const yPos = size / 2 - (y * size) / 2.5;
      pts.push(`${i === 0 ? "M" : "L"} ${x} ${yPos}`);
    }

    return pts.join(" ");
  }, [shape, size]);

  // Value indicator position (use safeValue to prevent NaN)
  const indicatorX = Math.abs(safeValue) * size;
  const indicatorY = size / 2 - (safeValue * size) / 2.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={styles.waveformSvg}
    >
      {/* Grid line */}
      <line
        x1={0}
        y1={size / 2}
        x2={size}
        y2={size / 2}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
      />
      {/* Waveform path */}
      <path
        d={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      {/* Current value indicator */}
      <motion.circle
        cx={indicatorX}
        cy={indicatorY}
        r={3}
        fill={color}
        animate={{ cx: indicatorX, cy: indicatorY }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </svg>
  );
}

// ============================================================================
// LFO Row
// ============================================================================

interface LfoRowProps {
  lfo: LfoSource;
  value: number;
  targetCount: number;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function LfoRow({
  lfo,
  value,
  targetCount,
  onEdit,
  onToggle,
  onDelete,
}: LfoRowProps) {
  const color = LFO_SHAPE_COLORS[lfo.shape];

  return (
    <div
      className={`${styles.lfoRow} ${!lfo.enabled ? styles.lfoDisabled : ""}`}
    >
      <button
        type="button"
        className={`${styles.lfoToggle} ${lfo.enabled ? styles.enabled : ""}`}
        onClick={onToggle}
        aria-label={lfo.enabled ? "Disable LFO" : "Enable LFO"}
      >
        {lfo.enabled ? "●" : "○"}
      </button>

      <WaveformDisplay
        shape={lfo.shape}
        value={value}
        color={color}
        size={28}
      />

      <button type="button" className={styles.lfoInfo} onClick={onEdit}>
        <span className={styles.lfoName}>{lfo.name}</span>
        <span className={styles.lfoRate}>
          {lfo.sync_to_bpm
            ? `1/${lfo.bpm_division} beat`
            : `${lfo.rate.toFixed(2)} Hz`}
        </span>
        {targetCount > 0 && (
          <span className={styles.lfoTargetCount}>{targetCount} targets</span>
        )}
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
  );
}

// ============================================================================
// LFO Form
// ============================================================================

interface LfoFormProps {
  editingLfo: LfoSource | null;
  onSave: (lfo: LfoSource) => void;
  onCancel: () => void;
}

function LfoForm({ editingLfo, onSave, onCancel }: LfoFormProps) {
  const isEditing = editingLfo !== null;

  const [name, setName] = useState(editingLfo?.name ?? "LFO");
  const [shape, setShape] = useState<LfoShape>(editingLfo?.shape ?? "sine");
  const [rate, setRate] = useState(editingLfo?.rate ?? 1.0);
  const [depth, setDepth] = useState(editingLfo?.depth ?? 1.0);
  const [offset, setOffset] = useState(editingLfo?.offset ?? 0.0);
  const [phase, setPhase] = useState(editingLfo?.phase ?? 0.0);
  const [syncToBpm, setSyncToBpm] = useState(editingLfo?.sync_to_bpm ?? false);
  const [bpmDivision, setBpmDivision] = useState(
    editingLfo?.bpm_division ?? 1.0,
  );

  const handleSubmit = () => {
    const lfo: LfoSource = {
      id: editingLfo?.id ?? "",
      name,
      shape,
      rate,
      depth,
      offset,
      phase,
      enabled: editingLfo?.enabled ?? true,
      sync_to_bpm: syncToBpm,
      bpm_division: bpmDivision,
    };
    onSave(lfo);
  };

  const color = LFO_SHAPE_COLORS[shape];

  return (
    <div className={styles.lfoForm}>
      <div className={styles.formHeader}>
        {isEditing ? "Edit LFO" : "New LFO"}
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Name</span>
          <input
            type="text"
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="LFO name…"
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Shape</span>
          <div className={styles.shapeSelectWrapper}>
            <div
              className={styles.shapePreview}
              style={{ backgroundColor: color }}
            />
            <select
              className={styles.formSelect}
              value={shape}
              onChange={(e) => setShape(e.target.value as LfoShape)}
            >
              {LFO_SHAPES.map((s) => (
                <option key={s} value={s}>
                  {LFO_SHAPE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Rate {syncToBpm ? "(BPM sync)" : `(${rate.toFixed(2)} Hz)`}
          </span>
          <div className={styles.rateControls}>
            <input
              type="range"
              className={styles.formRange}
              min={0.01}
              max={10}
              step={0.01}
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
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
            </select>
          )}
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
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
        <label className={styles.formLabel}>
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
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Phase ({(phase * 360).toFixed(0)}°)
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
          {isEditing ? "Save" : "Add LFO"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// LFOs Section
// ============================================================================

function LfosSection() {
  const { lfos, add, update, remove } = useLfos();
  const { targets } = useModulationTargets();
  const { values } = useLfoValues();

  const [editingLfo, setEditingLfo] = useState<LfoSource | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleSave = async (lfo: LfoSource) => {
    try {
      if (lfo.id) {
        await update(lfo);
      } else {
        await add(createLfo(lfo));
      }
      setEditingLfo(null);
      setShowForm(false);
    } catch (e) {
      console.error("[Modulation] Failed to save LFO:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch (e) {
      console.error("[Modulation] Failed to delete LFO:", e);
    }
  };

  const handleToggle = async (lfo: LfoSource) => {
    try {
      await update({ ...lfo, enabled: !lfo.enabled });
    } catch (e) {
      console.error("[Modulation] Failed to toggle LFO:", e);
    }
  };

  if (showForm || editingLfo) {
    return (
      <LfoForm
        editingLfo={editingLfo}
        onSave={handleSave}
        onCancel={() => {
          setEditingLfo(null);
          setShowForm(false);
        }}
      />
    );
  }

  return (
    <div className={styles.lfosSection}>
      {lfos.length === 0 ? (
        <p className={styles.noItems}>No LFOs. Click "+ Add" to create one.</p>
      ) : (
        <div className={styles.lfosList}>
          {lfos.map((lfo) => (
            <LfoRow
              key={lfo.id}
              lfo={lfo}
              value={values[lfo.id] ?? 0}
              targetCount={getTargetsForLfo(targets, lfo.id).length}
              onEdit={() => setEditingLfo(lfo)}
              onToggle={() => handleToggle(lfo)}
              onDelete={() => handleDelete(lfo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Modulation Target Row
// ============================================================================

interface TargetRowProps {
  target: ModulationTarget;
  lfoName: string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function TargetRow({
  target,
  lfoName,
  onEdit,
  onToggle,
  onDelete,
}: TargetRowProps) {
  const paramLabel = getParameterDropdownLabel(
    target.parameter_id as ParameterId,
  );

  return (
    <div
      className={`${styles.targetRow} ${!target.enabled ? styles.targetDisabled : ""}`}
    >
      <button
        type="button"
        className={`${styles.targetToggle} ${target.enabled ? styles.enabled : ""}`}
        onClick={onToggle}
        aria-label={target.enabled ? "Disable target" : "Enable target"}
      >
        {target.enabled ? "●" : "○"}
      </button>

      <button type="button" className={styles.targetInfo} onClick={onEdit}>
        <span className={styles.targetLfo}>{lfoName}</span>
        <span className={styles.targetArrow}>→</span>
        <span className={styles.targetParam}>{paramLabel}</span>
        <span className={styles.targetDepth}>
          {target.bipolar ? "±" : ""}
          {(target.depth * 100).toFixed(0)}%
        </span>
      </button>

      <button
        type="button"
        className={styles.targetDelete}
        onClick={onDelete}
        aria-label="Delete target"
      >
        ×
      </button>
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
  onSave: (target: ModulationTarget) => void;
  onCancel: () => void;
}

function TargetForm({
  lfos,
  slots,
  editingTarget,
  onSave,
  onCancel,
}: TargetFormProps) {
  const isEditing = editingTarget !== null;

  const [sourceId, setSourceId] = useState(
    editingTarget?.source_id ?? lfos[0]?.id ?? "",
  );
  const [parameterId, setParameterId] = useState<string>(
    editingTarget?.parameter_id ?? "",
  );
  const [depth, setDepth] = useState(editingTarget?.depth ?? 0.5);
  const [bipolar, setBipolar] = useState(editingTarget?.bipolar ?? true);

  // Get parameter IDs only for active slots (filter out empty slots)
  const allParameterIds = useMemo(
    () =>
      getAllSlotParameterIds(
        slots
          .filter((s) => s.sketchId !== null)
          .map((s) => ({ index: s.index, sketchId: s.sketchId as string })),
      ),
    [slots],
  );

  const handleSubmit = () => {
    if (!sourceId || !parameterId) return;

    const target: ModulationTarget = {
      id: editingTarget?.id ?? "",
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
      <div className={styles.formHeader}>
        {isEditing ? "Edit Modulation Target" : "New Modulation Target"}
      </div>

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

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Target Parameter</span>
          <select
            className={styles.formSelect}
            value={parameterId}
            onChange={(e) => setParameterId(e.target.value)}
          >
            <option value="">Select parameter…</option>
            {allParameterIds.map((id) => (
              <option key={id} value={id}>
                {getParameterDropdownLabel(id)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Depth ({bipolar ? "±" : ""}
            {(depth * 100).toFixed(0)}%)
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
          {isEditing ? "Save" : "Add Target"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Targets Section
// ============================================================================

interface TargetsSectionProps {
  slots: Slot[];
}

function TargetsSection({ slots }: TargetsSectionProps) {
  const { lfos } = useLfos();
  const { targets, add, remove } = useModulationTargets();
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<ModulationTarget | null>(
    null,
  );

  const handleSave = async (target: ModulationTarget) => {
    try {
      await add(target);
      setShowForm(false);
      setEditingTarget(null);
    } catch (e) {
      console.error("[Modulation] Failed to save target:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch (e) {
      console.error("[Modulation] Failed to delete target:", e);
    }
  };

  const handleToggle = async (target: ModulationTarget) => {
    try {
      await add({ ...target, enabled: !target.enabled });
    } catch (e) {
      console.error("[Modulation] Failed to toggle target:", e);
    }
  };

  const getLfoName = (id: string): string => {
    return lfos.find((lfo) => lfo.id === id)?.name ?? "Unknown LFO";
  };

  if (lfos.length === 0) {
    return (
      <p className={styles.noItems}>
        Create an LFO first before adding modulation targets.
      </p>
    );
  }

  if (showForm || editingTarget) {
    return (
      <TargetForm
        lfos={lfos}
        slots={slots}
        editingTarget={editingTarget}
        onSave={handleSave}
        onCancel={() => {
          setShowForm(false);
          setEditingTarget(null);
        }}
      />
    );
  }

  return (
    <div className={styles.targetsSection}>
      {targets.length === 0 ? (
        <p className={styles.noItems}>
          No targets. Click "+ Add" to route an LFO to a parameter.
        </p>
      ) : (
        <div className={styles.targetsList}>
          {targets.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              lfoName={getLfoName(target.source_id)}
              onEdit={() => setEditingTarget(target)}
              onToggle={() => handleToggle(target)}
              onDelete={() => handleDelete(target.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Audio Modulation Row
// ============================================================================

interface AudioModRowProps {
  mod: AudioModulation;
  lfoName: string;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function AudioModRow({
  mod,
  lfoName,
  onEdit,
  onToggle,
  onDelete,
}: AudioModRowProps) {
  const sourceColor = AUDIO_SOURCE_COLORS[mod.source];

  return (
    <div
      className={`${styles.audioModRow} ${!mod.enabled ? styles.audioModDisabled : ""}`}
    >
      <button
        type="button"
        className={`${styles.audioModToggle} ${mod.enabled ? styles.enabled : ""}`}
        onClick={onToggle}
        aria-label={mod.enabled ? "Disable modulation" : "Enable modulation"}
      >
        {mod.enabled ? "●" : "○"}
      </button>

      <button type="button" className={styles.audioModInfo} onClick={onEdit}>
        <div
          className={styles.audioSourceDot}
          style={{ backgroundColor: sourceColor }}
        />
        <span className={styles.audioModSource}>
          {AUDIO_SOURCE_LABELS[mod.source]}
        </span>
        <span className={styles.audioModArrow}>→</span>
        <span className={styles.audioModLfo}>{lfoName}</span>
        <span className={styles.audioModProperty}>
          {LFO_PROPERTY_LABELS[mod.property]}
        </span>
      </button>

      <button
        type="button"
        className={styles.audioModDelete}
        onClick={onDelete}
        aria-label="Delete audio modulation"
      >
        ×
      </button>
    </div>
  );
}

// ============================================================================
// Audio Modulation Form
// ============================================================================

interface AudioModFormProps {
  lfos: LfoSource[];
  editingMod: AudioModulation | null;
  onSave: (mod: AudioModulation) => void;
  onCancel: () => void;
}

function AudioModForm({
  lfos,
  editingMod,
  onSave,
  onCancel,
}: AudioModFormProps) {
  const isEditing = editingMod !== null;

  const [source, setSource] = useState<AudioSource>(
    editingMod?.source ?? "rms",
  );
  const [lfoId, setLfoId] = useState(editingMod?.lfo_id ?? lfos[0]?.id ?? "");
  const [property, setProperty] = useState<LfoProperty>(
    editingMod?.property ?? "rate",
  );
  const [amount, setAmount] = useState(editingMod?.amount ?? 1.0);
  const [minOutput, setMinOutput] = useState(editingMod?.min_output ?? 0.0);
  const [maxOutput, setMaxOutput] = useState(editingMod?.max_output ?? 1.0);

  const handleSubmit = () => {
    if (!lfoId) return;

    const mod: AudioModulation = {
      id: editingMod?.id ?? "",
      source,
      lfo_id: lfoId,
      property,
      amount,
      min_output: minOutput,
      max_output: maxOutput,
      enabled: editingMod?.enabled ?? true,
    };
    onSave(mod);
  };

  const sourceColor = AUDIO_SOURCE_COLORS[source];

  return (
    <div className={styles.audioModForm}>
      <div className={styles.formHeader}>
        {isEditing ? "Edit Audio Modulation" : "New Audio Modulation"}
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Audio Source</span>
          <div className={styles.sourceSelectWrapper}>
            <div
              className={styles.sourceColorDot}
              style={{ backgroundColor: sourceColor }}
            />
            <select
              className={styles.formSelect}
              value={source}
              onChange={(e) => setSource(e.target.value as AudioSource)}
            >
              {AUDIO_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {AUDIO_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Target LFO</span>
          <select
            className={styles.formSelect}
            value={lfoId}
            onChange={(e) => setLfoId(e.target.value)}
          >
            {lfos.map((lfo) => (
              <option key={lfo.id} value={lfo.id}>
                {lfo.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>LFO Property</span>
          <select
            className={styles.formSelect}
            value={property}
            onChange={(e) => setProperty(e.target.value as LfoProperty)}
          >
            {LFO_PROPERTIES.map((p) => (
              <option key={p} value={p}>
                {LFO_PROPERTY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>
            Amount ({(amount * 100).toFixed(0)}%)
          </span>
          <input
            type="range"
            className={styles.formRange}
            min={0}
            max={2}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
          />
        </label>
      </div>

      <div className={styles.formRow}>
        <label className={styles.formLabel}>
          <span className={styles.formLabelText}>Output Range</span>
          <div className={styles.rangeInputs}>
            <input
              type="number"
              className={styles.formInput}
              value={minOutput}
              onChange={(e) => setMinOutput(parseFloat(e.target.value) || 0)}
              step={0.1}
            />
            <span className={styles.rangeSeparator}>→</span>
            <input
              type="number"
              className={styles.formInput}
              value={maxOutput}
              onChange={(e) => setMaxOutput(parseFloat(e.target.value) || 1)}
              step={0.1}
            />
          </div>
        </label>
      </div>

      <div className={styles.formActions}>
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
          disabled={!lfoId}
        >
          {isEditing ? "Save" : "Add Audio Mod"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Audio Modulations Section
// ============================================================================

function AudioModulationsSection() {
  const { lfos } = useLfos();
  const { audioModulations, add, remove } = useAudioModulations();
  const [showForm, setShowForm] = useState(false);
  const [editingMod, setEditingMod] = useState<AudioModulation | null>(null);

  const handleSave = async (mod: AudioModulation) => {
    try {
      await add(mod);
      setShowForm(false);
      setEditingMod(null);
    } catch (e) {
      console.error("[Modulation] Failed to save audio modulation:", e);
      alert(`Failed to save: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch (e) {
      console.error("[Modulation] Failed to delete audio modulation:", e);
    }
  };

  const handleToggle = async (mod: AudioModulation) => {
    try {
      await add({ ...mod, enabled: !mod.enabled });
    } catch (e) {
      console.error("[Modulation] Failed to toggle audio modulation:", e);
    }
  };

  const getLfoName = (id: string): string => {
    return lfos.find((lfo) => lfo.id === id)?.name ?? "Unknown LFO";
  };

  if (lfos.length === 0) {
    return (
      <p className={styles.noItems}>
        Create an LFO first before adding audio modulations.
      </p>
    );
  }

  if (showForm || editingMod) {
    return (
      <AudioModForm
        lfos={lfos}
        editingMod={editingMod}
        onSave={handleSave}
        onCancel={() => {
          setShowForm(false);
          setEditingMod(null);
        }}
      />
    );
  }

  return (
    <div className={styles.audioModsSection}>
      {audioModulations.length === 0 ? (
        <p className={styles.noItems}>
          No audio modulations. Click "+ Add" to make audio control an LFO.
        </p>
      ) : (
        <div className={styles.audioModsList}>
          {audioModulations.map((mod) => (
            <AudioModRow
              key={mod.id}
              mod={mod}
              lfoName={getLfoName(mod.lfo_id)}
              onEdit={() => setEditingMod(mod)}
              onToggle={() => handleToggle(mod)}
              onDelete={() => handleDelete(mod.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export interface ModulationPanelProps {
  className?: string;
  slots?: Slot[];
}

export function ModulationPanel({
  className,
  slots = [],
}: ModulationPanelProps) {
  const [lfosOpen, setLfosOpen] = useState(true);
  const [targetsOpen, setTargetsOpen] = useState(true);
  const [audioModsOpen, setAudioModsOpen] = useState(true);
  const [showAddLfo, setShowAddLfo] = useState(false);
  const [showAddTarget, setShowAddTarget] = useState(false);
  const [showAddAudioMod, setShowAddAudioMod] = useState(false);

  const { lfos, add: addLfo, clear: clearLfos } = useLfos();
  const {
    targets,
    add: addTarget,
    clear: clearTargets,
  } = useModulationTargets();
  const {
    audioModulations,
    add: addAudioMod,
    clear: clearAudioMods,
  } = useAudioModulations();

  const handleAddLfo = async (lfo: LfoSource) => {
    try {
      await addLfo(lfo.id ? lfo : createLfo(lfo));
      setShowAddLfo(false);
    } catch (e) {
      console.error("[Modulation] Failed to add LFO:", e);
    }
  };

  const handleAddTarget = async (target: ModulationTarget) => {
    try {
      await addTarget(target);
      setShowAddTarget(false);
    } catch (e) {
      console.error("[Modulation] Failed to add target:", e);
    }
  };

  const handleAddAudioMod = async (mod: AudioModulation) => {
    try {
      await addAudioMod(mod);
      setShowAddAudioMod(false);
    } catch (e) {
      console.error("[Modulation] Failed to add audio mod:", e);
    }
  };

  const totalActive =
    lfos.filter((l) => l.enabled).length +
    targets.filter((t) => t.enabled).length +
    audioModulations.filter((m) => m.enabled).length;

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header}>
        <h3 className={styles.title}>Modulation</h3>
        <span
          className={`${styles.statusBadge} ${totalActive > 0 ? styles.active : ""}`}
        >
          {totalActive > 0 ? `${totalActive} active` : "Inactive"}
        </span>
      </div>

      {/* LFOs Section */}
      <Collapsible.Root open={lfosOpen} onOpenChange={setLfosOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {lfosOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>LFOs</span>
              {lfos.length > 0 && (
                <span className={styles.sectionBadge}>{lfos.length}</span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddLfo(true);
              setLfosOpen(true);
            }}
            className={styles.headerAddButton}
            aria-label="Add LFO"
          >
            + Add
          </button>
          {lfos.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(
                    "Clear all LFOs? This will also remove all modulation targets.",
                  )
                ) {
                  void clearLfos();
                }
              }}
              className={styles.clearButton}
              aria-label="Clear all LFOs"
            >
              Clear All
            </button>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          {showAddLfo ? (
            <LfoForm
              editingLfo={null}
              onSave={handleAddLfo}
              onCancel={() => setShowAddLfo(false)}
            />
          ) : (
            <LfosSection />
          )}
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Targets Section */}
      <Collapsible.Root open={targetsOpen} onOpenChange={setTargetsOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {targetsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>Targets</span>
              {targets.length > 0 && (
                <span className={styles.sectionBadge}>{targets.length}</span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddTarget(true);
              setTargetsOpen(true);
            }}
            className={styles.headerAddButton}
            disabled={lfos.length === 0}
            aria-label="Add modulation target"
          >
            + Add
          </button>
          {targets.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Clear all modulation targets?")) {
                  void clearTargets();
                }
              }}
              className={styles.clearButton}
              aria-label="Clear all targets"
            >
              Clear All
            </button>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          {showAddTarget && lfos.length > 0 ? (
            <TargetForm
              lfos={lfos}
              slots={slots}
              editingTarget={null}
              onSave={handleAddTarget}
              onCancel={() => setShowAddTarget(false)}
            />
          ) : (
            <TargetsSection slots={slots} />
          )}
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Audio Modulations Section */}
      <Collapsible.Root open={audioModsOpen} onOpenChange={setAudioModsOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {audioModsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>Audio → LFO</span>
              {audioModulations.length > 0 && (
                <span className={styles.sectionBadge}>
                  {audioModulations.length}
                </span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddAudioMod(true);
              setAudioModsOpen(true);
            }}
            className={styles.headerAddButton}
            disabled={lfos.length === 0}
            aria-label="Add audio modulation"
          >
            + Add
          </button>
          {audioModulations.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm("Clear all audio modulations?")) {
                  void clearAudioMods();
                }
              }}
              className={styles.clearButton}
              aria-label="Clear all audio modulations"
            >
              Clear All
            </button>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          {showAddAudioMod && lfos.length > 0 ? (
            <AudioModForm
              lfos={lfos}
              editingMod={null}
              onSave={handleAddAudioMod}
              onCancel={() => setShowAddAudioMod(false)}
            />
          ) : (
            <AudioModulationsSection />
          )}
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default ModulationPanel;
