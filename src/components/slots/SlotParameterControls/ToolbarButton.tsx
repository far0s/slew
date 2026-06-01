import styles from "./ToolbarButton.module.css";

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}

export function ToolbarButton({ onClick, active, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button}${active ? ` ${styles.active}` : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
