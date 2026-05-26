/**
 * AudioModulator
 *
 * Audio modulation internal components for the ModulationPanel:
 * - AudioModRow (internal)
 * - AudioModForm (exported — used directly by ModulationPanel for "Add Audio Mod" inline flow)
 * - AudioModulationsSection (exported — used by ModulationPanel)
 */

import { useState } from "react";
import {
  useLfos,
  useAudioModulations,
  LFO_SHAPE_LABELS,
  LFO_PROPERTIES,
  LFO_PROPERTY_LABELS,
  type LfoSource,
  type AudioModulation,
  type LfoProperty,
} from "@/inputs/modulation";
import {
  AUDIO_SOURCES,
  AUDIO_SOURCE_LABELS,
  AUDIO_SOURCE_COLORS,
  type AudioSource,
} from "@/inputs/audio";
import styles from "./ModulationPanel.module.css";

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

export interface AudioModFormProps {
  lfos: LfoSource[];
  editingMod: AudioModulation | null;
  onSave: (mod: AudioModulation) => void;
  onCancel: () => void;
}

export function AudioModForm({
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
                {lfo.name} ({LFO_SHAPE_LABELS[lfo.shape]})
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

export function AudioModulationsSection() {
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
      alert(`Failed to save: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove(id);
    } catch {
      // UI state already reflects failure
    }
  };

  const handleToggle = async (mod: AudioModulation) => {
    try {
      await add({ ...mod, enabled: !mod.enabled });
    } catch {
      // UI state already reflects failure
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
