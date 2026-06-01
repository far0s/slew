import { useState, useCallback } from "react";
import { Reorder, useDragControls } from "motion/react";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useEffects, makeFxParamId } from "@/effects/EffectsContext";
import { EFFECT_DESCRIPTORS, getEffectDescriptor } from "@/effects/effectDescriptors";
import type { EffectInstance } from "@/effects/effectTypes";
import { useMidiMappings, type MidiMapping } from "@/inputs/midi";
import { ParameterSlider } from "@/components/parameters/ParameterSlider";
import styles from "./EffectsPanel.module.css";

// ============================================================================
// Effect Card
// ============================================================================

interface EffectCardProps {
  effect: EffectInstance;
  onRemove: () => void;
  onToggle: () => void;
  onParamChange: (paramId: string, value: number) => void;
  midiMappings: MidiMapping[];
}

function EffectCard({ effect, onRemove, onToggle, onParamChange, midiMappings }: EffectCardProps) {
  const [expanded, setExpanded] = useState(true);
  const dragControls = useDragControls();
  const descriptor = getEffectDescriptor(effect.effectId);
  if (!descriptor) return null;

  const hasParams = descriptor.parameters.length > 0;

  return (
    <Reorder.Item
      value={effect}
      dragListener={false}
      dragControls={dragControls}
      className={`${styles.effectCard} ${!effect.enabled ? styles.effectDisabled : ""}`}
      layout
      transition={{ duration: 0.15 }}
    >
      <div className={styles.effectRow}>
        <div
          className={styles.dragHandle}
          onPointerDown={(e) => dragControls.start(e)}
          title="Drag to reorder"
        >
          ⠿
        </div>

        <button
          type="button"
          className={`${styles.enableToggle} ${effect.enabled ? styles.enableToggleOn : ""}`}
          onClick={onToggle}
          aria-label={effect.enabled ? "Disable" : "Enable"}
          aria-pressed={effect.enabled}
        />

        <button
          type="button"
          className={styles.effectInfo}
          onClick={() => hasParams && setExpanded(!expanded)}
          style={{ cursor: hasParams ? "pointer" : "default" }}
        >
          <span className={styles.effectName}>{descriptor.label}</span>
        </button>

        <button
          type="button"
          className={styles.deleteButton}
          onClick={onRemove}
          aria-label="Remove"
        >
          ×
        </button>
      </div>

      {hasParams && (
        <div className={`${styles.paramsWrapper} ${expanded ? styles.paramsOpen : ""}`}>
          <div className={styles.paramsInner}>
            {descriptor.parameters.map((param) => {
              const fxParamId = makeFxParamId(effect.instanceId, param.templateId);
              const isMidiControlled = midiMappings.some(
                (m) => m.parameter_id === fxParamId,
              );
              return (
                <ParameterSlider
                  key={param.templateId}
                  id={`effect_${effect.instanceId}_${param.templateId}`}
                  label={param.label}
                  value={effect.params[param.templateId] ?? param.defaultValue}
                  onChange={(v) => onParamChange(param.templateId, v)}
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  color={param.color}
                  midiParameterId={fxParamId}
                  isMidiControlled={isMidiControlled}
                />
              );
            })}
          </div>
        </div>
      )}
    </Reorder.Item>
  );
}

// ============================================================================
// Add Effect Picker
// ============================================================================

function AddEffectPicker({ onAdd, onClose }: { onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <span className={styles.pickerTitle}>Add Effect</span>
        <button type="button" className={styles.pickerClose} onClick={onClose} aria-label="Close">
          <Cross2Icon />
        </button>
      </div>
      <div className={styles.pickerList}>
        {EFFECT_DESCRIPTORS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={styles.pickerItem}
            onClick={() => { onAdd(d.id); onClose(); }}
          >
            <span className={styles.pickerItemLabel}>{d.label}</span>
            {d.description && (
              <span className={styles.pickerItemDesc}>{d.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function EffectsPanel() {
  const { effects, addEffect, removeEffect, toggleEffect, setParam, reorderEffects } = useEffects();
  const { mappings: midiMappings } = useMidiMappings();
  const [showPicker, setShowPicker] = useState(false);

  const handleAdd = useCallback((effectId: string) => addEffect(effectId), [addEffect]);

  const enabledCount = effects.filter((e) => e.enabled).length;

  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          Effects
          {effects.length > 0 && (
            <span className={styles.badge}>{enabledCount}</span>
          )}
        </span>
        <button
          type="button"
          className={`${styles.addButton} ${showPicker ? styles.addButtonActive : ""}`}
          onClick={() => setShowPicker(!showPicker)}
          aria-label="Add effect"
        >
          + Add
        </button>
      </div>

      {showPicker && (
        <AddEffectPicker onAdd={handleAdd} onClose={() => setShowPicker(false)} />
      )}

      {effects.length === 0 && !showPicker && (
        <p className={styles.noItems}>No effects. Click + to add one.</p>
      )}

      {effects.length > 0 && (
        <Reorder.Group
          axis="y"
          values={effects}
          onReorder={reorderEffects}
          className={styles.effectsList}
        >
          {effects.map((effect) => (
            <EffectCard
              key={effect.instanceId}
              effect={effect}
              onRemove={() => removeEffect(effect.instanceId)}
              onToggle={() => toggleEffect(effect.instanceId)}
              onParamChange={(paramId, value) => setParam(effect.instanceId, paramId, value)}
              midiMappings={midiMappings}
            />
          ))}
        </Reorder.Group>
      )}

      {effects.length > 0 && (
        <p className={styles.pipelineNote}>
          Applied top to bottom. Disabled effects are skipped entirely.
        </p>
      )}
    </div>
  );
}
