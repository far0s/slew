import { useState, useCallback } from "react";
import { useProjects } from "@/hooks/useProjects";
import { getSketchDescriptor } from "@/sketches";
import styles from "./ProjectsPanel.module.css";

const EFFECTS_STORAGE_KEY = "slew-effects";
const PANEL_SLOTS_KEY = "slew-panel-slots";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      ", " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return iso.slice(0, 10);
  }
}

function sketchLabel(id: string): string {
  try {
    const desc = getSketchDescriptor(id as Parameters<typeof getSketchDescriptor>[0]);
    return desc?.label ?? id;
  } catch {
    return id;
  }
}

function captureFrontendState(): string {
  let effects: unknown = [];
  try {
    const raw = localStorage.getItem(EFFECTS_STORAGE_KEY);
    if (raw) effects = JSON.parse(raw);
  } catch {
    // ignore
  }
  let panelSlots: unknown = {};
  try {
    const raw = localStorage.getItem(PANEL_SLOTS_KEY);
    if (raw) panelSlots = JSON.parse(raw);
  } catch {
    // ignore
  }
  return JSON.stringify({ effects, panelSlots });
}

interface ProjectItemProps {
  name: string;
  createdAt: string;
  sketches: Array<string | null>;
  onLoad: () => void;
  onRenameStart: () => void;
  onExport: () => void;
  onDelete: () => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
}

function ProjectItem({
  name,
  createdAt,
  sketches,
  onLoad,
  onRenameStart,
  onExport,
  onDelete,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: ProjectItemProps) {
  const filledSketches = sketches
    .map((id, i) => (id ? { slot: i, id } : null))
    .filter(Boolean) as Array<{ slot: number; id: string }>;

  return (
    <div className={styles.projectItem}>
      <div className={styles.projectRow1}>
        {isRenaming ? (
          <input
            className={styles.renameInput}
            value={renameValue}
            autoFocus
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit();
              if (e.key === "Escape") onRenameCancel();
            }}
            maxLength={64}
          />
        ) : (
          <span className={styles.projectName}>{name}</span>
        )}
        <span className={styles.projectDate}>{formatDate(createdAt)}</span>
      </div>

      <div className={styles.projectRow2}>
        {filledSketches.length === 0 ? (
          <span className={styles.emptySlots}>No sketches</span>
        ) : (
          filledSketches.map(({ slot, id }) => (
            <span key={slot} className={styles.sketchChip}>
              {sketchLabel(id)}
            </span>
          ))
        )}
      </div>

      <div className={styles.projectRow3}>
        <button className={styles.actionButton} onClick={onLoad}>
          Load
        </button>
        <button className={styles.actionButton} onClick={onRenameStart}>
          Rename
        </button>
        <button className={styles.actionButton} onClick={onExport}>
          Export
        </button>
        <button
          className={`${styles.actionButton} ${styles.actionButtonDestructive}`}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function ProjectsPanel() {
  const {
    projects,
    isLoading,
    save,
    load,
    deleteProject,
    rename,
    exportProject,
    importProject,
  } = useProjects();

  const [newName, setNewName] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    setIsSaving(true);
    try {
      await save(name, captureFrontendState());
      setNewName("");
    } finally {
      setIsSaving(false);
    }
  }, [newName, save]);

  const handleRenameStart = useCallback((name: string) => {
    setRenamingName(name);
    setRenameValue(name);
  }, []);

  const handleRenameCommit = useCallback(
    async (oldName: string) => {
      const trimmed = renameValue.trim();
      if (trimmed && trimmed !== oldName) {
        await rename(oldName, trimmed);
      }
      setRenamingName(null);
    },
    [renameValue, rename],
  );

  const visibleProjects = projects.filter((p) => !p.is_autosave);
  const autosave = projects.find((p) => p.is_autosave);

  return (
    <div className={styles.panel}>
      <div className={styles.sectionLabel}>Save session</div>
      <div className={styles.saveRow}>
        <input
          className={styles.nameInput}
          placeholder="Project name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSave();
          }}
          maxLength={64}
        />
        <button
          className={styles.actionButton}
          onClick={() => void handleSave()}
          disabled={!newName.trim() || isSaving}
        >
          Save
        </button>
      </div>

      <button className={styles.importButton} onClick={() => void importProject()}>
        Import from file…
      </button>

      {isLoading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : visibleProjects.length === 0 && !autosave ? (
        <div className={styles.emptyState}>No saved projects yet.</div>
      ) : (
        <>
          {visibleProjects.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Saved projects</div>
              <div className={styles.projectList}>
                {visibleProjects.map((p) => (
                  <ProjectItem
                    key={p.name}
                    name={p.name}
                    createdAt={p.created_at}
                    sketches={p.sketches}
                    onLoad={() => void load(p.name)}
                    onRenameStart={() => handleRenameStart(p.name)}
                    onExport={() => void exportProject(p.name)}
                    onDelete={() => {
                      if (confirm(`Delete "${p.name}"?`)) void deleteProject(p.name);
                    }}
                    isRenaming={renamingName === p.name}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameCommit={() => void handleRenameCommit(p.name)}
                    onRenameCancel={() => setRenamingName(null)}
                  />
                ))}
              </div>
            </>
          )}
          {autosave && (
            <>
              <div className={styles.sectionLabel}>Auto-save</div>
              <div className={styles.projectList}>
                <div className={styles.autosaveItem}>
                  <div className={styles.projectRow1}>
                    <span className={styles.projectName}>Recovery point</span>
                    <span className={styles.projectDate}>{formatDate(autosave.created_at)}</span>
                  </div>
                  <div className={styles.projectRow2}>
                    {autosave.sketches.filter(Boolean).map((id, i) => (
                      <span key={i} className={styles.sketchChip}>
                        {sketchLabel(id!)}
                      </span>
                    ))}
                  </div>
                  <div className={styles.projectRow3}>
                    <button
                      className={styles.actionButton}
                      onClick={() => void load(autosave.name)}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
