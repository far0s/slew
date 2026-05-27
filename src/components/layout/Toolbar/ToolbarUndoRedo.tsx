import { memo } from "react";
import styles from "./Toolbar.module.css";

interface ToolbarUndoRedoProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isMidiLearning: boolean;
  onCancelMidiLearn: () => void;
}

export const ToolbarUndoRedo = memo(function ToolbarUndoRedo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isMidiLearning,
  onCancelMidiLearn,
}: ToolbarUndoRedoProps) {
  return (
    <>
      <button
        className={styles.toolbarButton}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Cmd+Z)"
        aria-label="Undo"
      >
        ↩ Undo
      </button>
      <button
        className={styles.toolbarButton}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Cmd+Shift+Z)"
        aria-label="Redo"
      >
        ↪ Redo
      </button>
      {isMidiLearning && (
        <button
          type="button"
          className={`${styles.toolbarButton} ${styles.toolbarButtonLearning}`}
          onClick={onCancelMidiLearn}
          title="Cancel MIDI learn (Esc)"
          aria-label="Cancel MIDI learn"
        >
          ✕ Cancel Learn
        </button>
      )}
    </>
  );
});
