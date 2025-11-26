import styles from "./Button.module.css";

export type ButtonVariant = "default" | "primary" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingText?: string;
}

/**
 * Button
 *
 * Reusable button component with consistent styling across the app.
 * Supports different variants (default, primary, danger) and sizes.
 */
export function Button({
  variant = "default",
  size = "sm",
  isLoading = false,
  loadingText,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const variantClass = styles[variant] ?? styles.default;
  const sizeClass = styles[size] ?? styles.sm;

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      className={`${styles.button} ${variantClass} ${sizeClass} ${className ?? ""}`}
      {...props}
    >
      {isLoading ? (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export default Button;
