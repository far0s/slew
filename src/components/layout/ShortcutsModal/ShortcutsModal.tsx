import { useEffect, useState } from "react";
import {
  getTapShortcut,
  formatTapShortcut,
  subscribeTapShortcut,
} from "@/inputs/tapTempo";
import styles from "./ShortcutsModal.module.css";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const [tapShortcut, setTapShortcut] = useState(() =>
    formatTapShortcut(getTapShortcut())
  );

  useEffect(() => {
    return subscribeTapShortcut((s) => {
      setTapShortcut(formatTapShortcut(s));
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close shortcuts panel"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.group}>
            <h4 className={styles.groupHeader}>General</h4>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.label}>Tap Tempo</span>
                <kbd className={styles.kbd}>{tapShortcut}</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Undo</span>
                <kbd className={styles.kbd}>⌘Z</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Redo</span>
                <kbd className={styles.kbd}>⌘⇧Z</kbd>
              </div>
            </div>
          </div>

          <div className={styles.group}>
            <h4 className={styles.groupHeader}>Help</h4>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.label}>Open Manual</span>
                <kbd className={styles.kbd}>Docs button</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Context Help</span>
                <kbd className={styles.kbd}>⌥ click</kbd>
              </div>
            </div>
          </div>

          <div className={styles.group}>
            <h4 className={styles.groupHeader}>Windows</h4>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={styles.label}>Toggle Fullscreen (Controls)</span>
                <kbd className={styles.kbd}>⌘⇧F</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Restart Renderer</span>
                <kbd className={styles.kbd}>⌘⇧R</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Restart Controls</span>
                <kbd className={styles.kbd}>⌘⇧C</kbd>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Cancel MIDI Learn</span>
                <kbd className={styles.kbd}>Esc</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
