import { useState } from "react";
import {
  useWled,
  type WledSegmentMapping,
} from "../../outputs/wled";
import styles from "./WledPanel.module.css";

const COLOR_PARAM_OPTIONS = [
  { value: "color_primary", label: "Primary Color" },
  { value: "color_secondary", label: "Secondary Color" },
  { value: "color_bg", label: "BG Color" },
];

const COLOR_INDEX_OPTIONS = [
  { value: 0, label: "Primary" },
  { value: 1, label: "Secondary" },
  { value: 2, label: "Tertiary" },
];

const SLOT_OPTIONS = Array.from({ length: 8 }, (_, i) => ({
  value: i,
  label: `Slot ${i + 1}`,
}));

export function WledPanel() {
  const { config, isLoading, isTesting, updateConfig, testConnection } = useWled();
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleTestConnection = async () => {
    setTestResult(null);
    const result = await testConnection();
    setTestResult(result);
  };

  const addMapping = () => {
    if (!config) return;
    const newMapping: WledSegmentMapping = {
      segment_id: 0,
      slot_index: 0,
      template_id: "color_primary",
      color_index: 0,
    };
    void updateConfig({ mappings: [...config.mappings, newMapping] });
  };

  const updateMapping = (index: number, updates: Partial<WledSegmentMapping>) => {
    if (!config) return;
    const next = [...config.mappings];
    next[index] = { ...next[index], ...updates };
    void updateConfig({ mappings: next });
  };

  const removeMapping = (index: number) => {
    if (!config) return;
    void updateConfig({ mappings: config.mappings.filter((_, i) => i !== index) });
  };

  if (isLoading || !config) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyText}>Loading…</p>
      </div>
    );
  }

  const disabled = !config.enabled;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h4 className={styles.title}>WLED</h4>
        <span className={`${styles.statusDot} ${config.enabled ? styles.statusActive : ""}`} />
      </div>

      {/* Enable + Connection */}
      <div className={styles.section}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={config.enabled}
            onChange={(e) => void updateConfig({ enabled: e.target.checked })}
          />
          <span>Enable WLED output</span>
        </label>

        <div className={`${styles.outputFields} ${disabled ? styles.outputFieldsDisabled : ""}`}>
          <div className={styles.outputFieldRow}>
            <label className={styles.fieldLabel} htmlFor="wled-ip">
              IP Address
            </label>
            <input
              id="wled-ip"
              type="text"
              className={styles.outputInput}
              value={config.ip}
              disabled={disabled}
              onChange={(e) => void updateConfig({ ip: e.target.value })}
              placeholder="192.168.1.42"
              spellCheck={false}
            />
          </div>
          <div className={styles.outputFieldRow}>
            <label className={styles.fieldLabel} htmlFor="wled-port">
              Port
            </label>
            <input
              id="wled-port"
              type="text"
              inputMode="numeric"
              className={`${styles.outputInput} ${styles.outputInputPort}`}
              value={String(config.port)}
              disabled={disabled}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!isNaN(n) && n > 0 && n <= 65535) {
                  void updateConfig({ port: n });
                }
              }}
              placeholder="80"
            />
          </div>
        </div>

        <div className={styles.testRow}>
          <button
            type="button"
            className={styles.testButton}
            onClick={() => void handleTestConnection()}
            disabled={disabled || isTesting}
          >
            {isTesting ? "Connecting…" : "Test Connection"}
          </button>
          {testResult && (
            <span
              className={`${styles.testResult} ${testResult.ok ? styles.testOk : styles.testError}`}
            >
              {testResult.message}
            </span>
          )}
        </div>
      </div>

      {/* Segment Mappings */}
      <div className={`${styles.section} ${disabled ? styles.sectionDisabled : ""}`}>
        <h5 className={styles.sectionHeader}>Segment Mappings</h5>
        <p className={styles.sectionHint}>
          Map slot color parameters to WLED segments.
        </p>

        {config.mappings.length === 0 && (
          <p className={styles.emptyText}>No mappings — add one below.</p>
        )}

        {config.mappings.map((mapping, idx) => (
          <div key={idx} className={styles.mappingRow}>
            <div className={styles.mappingCell}>
              <label className={styles.cellLabel}>Seg</label>
              <input
                type="text"
                inputMode="numeric"
                className={styles.segInput}
                value={String(mapping.segment_id)}
                disabled={disabled}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n) && n >= 0) updateMapping(idx, { segment_id: n });
                }}
              />
            </div>

            <div className={styles.mappingCell}>
              <label className={styles.cellLabel}>Slot</label>
              <select
                className={styles.mappingSelect}
                value={mapping.slot_index}
                disabled={disabled}
                onChange={(e) =>
                  updateMapping(idx, { slot_index: parseInt(e.target.value, 10) })
                }
              >
                {SLOT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.mappingCell}>
              <label className={styles.cellLabel}>Color</label>
              <select
                className={styles.mappingSelect}
                value={mapping.template_id}
                disabled={disabled}
                onChange={(e) => updateMapping(idx, { template_id: e.target.value })}
              >
                {COLOR_PARAM_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.mappingCell}>
              <label className={styles.cellLabel}>WLED slot</label>
              <select
                className={styles.mappingSelect}
                value={mapping.color_index}
                disabled={disabled}
                onChange={(e) =>
                  updateMapping(idx, { color_index: parseInt(e.target.value, 10) })
                }
              >
                {COLOR_INDEX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={styles.removeButton}
              disabled={disabled}
              onClick={() => removeMapping(idx)}
              aria-label="Remove mapping"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          className={styles.addButton}
          disabled={disabled}
          onClick={addMapping}
        >
          + Add mapping
        </button>
      </div>

      <p className={styles.hint}>
        On every color parameter change, Slew POSTs the RGB value to your WLED
        device over HTTP (≤25 updates/s). Each mapping controls one WLED
        segment's primary/secondary/tertiary color.
      </p>
    </div>
  );
}

export default WledPanel;
