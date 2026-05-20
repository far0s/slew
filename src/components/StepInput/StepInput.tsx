import { useRef, useState, useCallback, KeyboardEvent } from "react";
import NumberFlow from "@number-flow/react";
import styles from "./StepInput.module.css";
import type { KnobColorVariant } from "../KnobInput";

export interface StepInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  color?: KnobColorVariant;
  onChange: (value: number) => void;
  onCommit?: (after: number, before: number) => void;
  "aria-label"?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// ── Component ─────────────────────────────────────────────────────────────

export function StepInput({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  color = "emerald",
  onChange,
  onCommit,
  "aria-label": ariaLabel,
}: StepInputProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // Track value at start of an interaction for onCommit
  const beforeRef = useRef<number>(value);
  // Track whether a keyboard interaction is in progress on the wrapper
  const kbActiveRef = useRef(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Commit helper ────────────────────────────────────────────────────────

  const commitEdit = useCallback(
    (text: string) => {
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) {
        const next = clamp(Math.round(parsed / step) * step, min, max);
        onChange(next);
        onCommit?.(next, beforeRef.current);
      }
      setEditing(false);
      setEditText("");
    },
    [min, max, step, onChange, onCommit]
  );

  const cancelRef = useRef(false);

  const cancelEdit = useCallback(() => {
    cancelRef.current = true;
    setEditing(false);
    setEditText("");
  }, []);

  // ── Button handlers ──────────────────────────────────────────────────────

  const handleButtonMouseDown = useCallback(
    (delta: number) => (e: React.MouseEvent) => {
      // Only record before on first press (not repeated)
      beforeRef.current = value;
      const next = clamp(value + delta, min, max);
      onChange(next);

      // Fire onCommit on pointerup to close out this interaction
      const handleUp = () => {
        onCommit?.(next, beforeRef.current);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointerup", handleUp, { once: true });

      // Prevent focus theft from wrapper
      e.preventDefault();
    },
    [value, min, max, onChange, onCommit]
  );

  // ── Value display click → edit mode ─────────────────────────────────────

  const handleValueClick = useCallback(() => {
    beforeRef.current = value;
    setEditText(String(value));
    setEditing(true);
    // Focus the input on next frame
    requestAnimationFrame(() => inputRef.current?.select());
  }, [value]);

  // ── Keyboard on wrapper ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return; // let input handle it

      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!kbActiveRef.current) {
          beforeRef.current = value;
          kbActiveRef.current = true;
        }
        const coarse = e.shiftKey ? step * 10 : step;
        const delta = e.key === "ArrowUp" ? coarse : -coarse;
        const next = clamp(value + delta, min, max);
        onChange(next);
      }
    },
    [editing, value, min, max, step, onChange]
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (kbActiveRef.current) {
          kbActiveRef.current = false;
          onCommit?.(value, beforeRef.current);
        }
      }
    },
    [value, onCommit]
  );

  const handleWrapperBlur = useCallback(() => {
    // If keyboard interaction was in progress and focus leaves, commit
    if (kbActiveRef.current) {
      kbActiveRef.current = false;
      onCommit?.(value, beforeRef.current);
    }
  }, [value, onCommit]);

  // ── Inline input handlers ────────────────────────────────────────────────

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        commitEdit(editText);
        wrapperRef.current?.focus();
      } else if (e.key === "Escape") {
        cancelEdit();
        wrapperRef.current?.focus();
      }
    },
    [editText, commitEdit, cancelEdit]
  );

  const handleInputBlur = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current = false;
      return;
    }
    commitEdit(editText);
  }, [editText, commitEdit]);

  // ── Color class ──────────────────────────────────────────────────────────

  const colorClass = styles[`color_${color}` as keyof typeof styles] ?? "";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      id={id}
      className={`${styles.wrapper} ${colorClass}`}
      tabIndex={0}
      role="spinbutton"
      aria-label={ariaLabel ?? label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={handleWrapperBlur}
    >
      {/* Square stepper block: +, value, − with shared border */}
      <div className={styles.stepper}>

      {/* Increment button */}
      <button
        className={styles.btn}
        aria-label={`Increase ${label}`}
        tabIndex={-1}
        onMouseDown={handleButtonMouseDown(step)}
      >
        +
      </button>

      {/* Value display / edit */}
      <div className={styles.valueArea} onClick={editing ? undefined : handleValueClick}>
        {editing ? (
          <input
            ref={inputRef}
            className={styles.editInput}
            type="number"
            value={editText}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            autoFocus
          />
        ) : (
          <NumberFlow
            value={value}
            className={styles.numberFlow}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Decrement button */}
      <button
        className={styles.btn}
        aria-label={`Decrease ${label}`}
        tabIndex={-1}
        onMouseDown={handleButtonMouseDown(-step)}
      >
        −
      </button>

      </div> {/* end .stepper */}

      {/* Label */}
      <span className={styles.label}>{label}</span>
    </div>
  );
}

export default StepInput;
