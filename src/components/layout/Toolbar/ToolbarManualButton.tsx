import styles from "./Toolbar.module.css";

interface ToolbarManualButtonProps {
  onOpen: () => void;
}

export function ToolbarManualButton({ onOpen }: ToolbarManualButtonProps) {
  return (
    <button
      type="button"
      className={styles.toolbarShortcutsButton}
      onClick={onOpen}
      aria-label="Open manual"
      title="Manual (Alt+?)"
    >
      Docs
    </button>
  );
}
