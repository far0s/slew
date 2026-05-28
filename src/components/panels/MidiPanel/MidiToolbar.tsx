/**
 * MidiToolbar
 *
 * Import/export MIDI mappings + controller template manager.
 * Rendered as a collapsible section at the bottom of MidiPanel.
 */

import { useRef, useState } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  exportMidiMappings,
  importMidiMappings,
  listControllerTemplates,
  importControllerTemplate,
  deleteControllerTemplate,
  type ControllerTemplateMeta,
  type ImportMode,
} from "@/inputs/midi";
import styles from "./MidiPanel.module.css";
import toolbarStyles from "./MidiToolbar.module.css";

// ============================================================================
// Import/Export
// ============================================================================

function MappingsImportExport() {
  const [status, setStatus] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const json = await exportMidiMappings();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "slew-mappings.json";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Exported.");
    } catch (e) {
      setStatus(`Export failed: ${e}`);
    }
    setTimeout(() => setStatus(null), 3000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const json = ev.target?.result as string;
      try {
        const result = await importMidiMappings(json, importMode);
        const parts: string[] = [];
        if (result.imported > 0) parts.push(`${result.imported} imported`);
        if (result.replaced > 0) parts.push(`${result.replaced} replaced`);
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
        setStatus(parts.length ? parts.join(", ") + "." : "Nothing imported.");
      } catch (err) {
        setStatus(`Import failed: ${err}`);
      }
      setTimeout(() => setStatus(null), 4000);
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className={toolbarStyles.section}>
      <p className={toolbarStyles.sectionLabel}>Mappings</p>

      <div className={toolbarStyles.row}>
        <button
          type="button"
          className={toolbarStyles.actionButton}
          onClick={() => void handleExport()}
        >
          Export
        </button>

        <select
          className={toolbarStyles.modeSelect}
          value={importMode}
          onChange={(e) => setImportMode(e.target.value as ImportMode)}
          aria-label="Import mode"
        >
          <option value="merge">Merge (overwrite conflicts)</option>
          <option value="merge_skip_conflicts">Merge (keep existing)</option>
          <option value="replace">Replace all</option>
        </select>

        <button
          type="button"
          className={toolbarStyles.actionButton}
          onClick={() => fileRef.current?.click()}
        >
          Import…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleImportFile}
        />
      </div>

      {status && <p className={toolbarStyles.statusText}>{status}</p>}
    </div>
  );
}

// ============================================================================
// Template Manager
// ============================================================================

function TemplateManager() {
  const [templates, setTemplates] = useState<ControllerTemplateMeta[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await listControllerTemplates());
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (label: string) => {
    if (!window.confirm(`Delete template "${label}"?`)) return;
    try {
      await deleteControllerTemplate(label);
      setStatus(`Deleted "${label}".`);
      await load();
    } catch (e) {
      setStatus(`Delete failed: ${e}`);
    }
    setTimeout(() => setStatus(null), 3000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const json = ev.target?.result as string;
      try {
        await importControllerTemplate(json);
        setStatus("Template imported.");
        await load();
      } catch (err) {
        setStatus(`Import failed: ${err}`);
      }
      setTimeout(() => setStatus(null), 3000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Lazy load on first expand
  const handleOpen = (open: boolean) => {
    if (open && templates === null) {
      void load();
    }
  };

  return (
    <Collapsible.Root onOpenChange={handleOpen}>
      <Collapsible.Trigger asChild>
        <button type="button" className={styles.sectionHeader}>
          <ChevronRightIcon />
          <span>Controller Templates</span>
          {templates !== null && templates.length > 0 && (
            <span className={styles.mappingsBadge}>{templates.length}</span>
          )}
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className={styles.sectionContent}>
        <div className={toolbarStyles.section}>
          {loading && <p className={toolbarStyles.hint}>Loading…</p>}

          {!loading && templates !== null && templates.length === 0 && (
            <p className={toolbarStyles.hint}>
              No user templates. Drop a{" "}
              <code>.slew-controller.json</code> file below.
            </p>
          )}

          {!loading && templates !== null && templates.length > 0 && (
            <ul className={toolbarStyles.templateList}>
              {templates.map((t) => (
                <li key={t.label} className={toolbarStyles.templateItem}>
                  <div className={toolbarStyles.templateInfo}>
                    <span className={toolbarStyles.templateLabel}>
                      {t.label}
                    </span>
                    <span className={toolbarStyles.templateMeta}>
                      {t.match_patterns.join(", ")} · {t.mapping_count}{" "}
                      mapping{t.mapping_count !== 1 ? "s" : ""}
                      {t.has_output ? " · LED" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => void handleDelete(t.label)}
                    aria-label={`Delete template ${t.label}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={toolbarStyles.row}>
            <button
              type="button"
              className={toolbarStyles.actionButton}
              onClick={() => fileRef.current?.click()}
            >
              Import template…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <button
              type="button"
              className={toolbarStyles.actionButton}
              onClick={() => void load()}
            >
              Reload
            </button>
          </div>

          {status && <p className={toolbarStyles.statusText}>{status}</p>}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

// ============================================================================
// Combined toolbar section
// ============================================================================

export function MidiToolbar() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger asChild>
        <button type="button" className={styles.sectionHeader}>
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <span>Tools</span>
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className={styles.sectionContent}>
        <MappingsImportExport />
        <TemplateManager />
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
