import styles from "./Toolbar.module.css";

interface ToolbarShortcutsButtonProps {
  onOpen: () => void;
}

export function ToolbarShortcutsButton({ onOpen }: ToolbarShortcutsButtonProps) {
  return (
    <button
      type="button"
      className={styles.toolbarShortcutsButton}
      onClick={onOpen}
      aria-label="Show keyboard shortcuts"
      title="Keyboard shortcuts (?)"
    >
      ?
    </button>
  );
}
