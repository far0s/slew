import { useState, useEffect, useRef, useCallback } from "react";

/**
 * useScrollAdjust
 *
 * Attaches a non-passive wheel listener to the target element so that
 * preventDefault() actually works — React's synthetic onWheel is passive
 * in modern browsers and cannot stop parent scroll containers.
 *
 * Scroll direction conventions:
 *   - Scroll up / right  → increment
 *   - Scroll down / left → decrement
 *   Uses whichever axis has larger magnitude, so a pure horizontal trackpad
 *   swipe also works.
 *
 * Modifier keys:
 *   - Shift:    ÷10 step  (fine)
 *   - Cmd/Ctrl: ×10 steps (coarse)
 *
 * Returns:
 *   - `ref`       callback ref — attach to the target element as `ref={ref}`
 *   - `isHovered` true while the pointer is inside — use for a visual indicator
 */
export function useScrollAdjust(
  value: number,
  onChange: (next: number) => void,
  step: number,
  min: number,
  max: number,
  disabled = false,
): { ref: (el: HTMLElement | null) => void; isHovered: boolean } {
  const [isHovered, setIsHovered] = useState(false);

  // Stable refs so event handlers never go stale.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const stepRef = useRef(step);
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const disabledRef = useRef(disabled);
  const isHoveredRef = useRef(false);

  valueRef.current = value;
  onChangeRef.current = onChange;
  stepRef.current = step;
  minRef.current = min;
  maxRef.current = max;
  disabledRef.current = disabled;

  // cleanupRef holds the teardown for the currently attached element.
  const cleanupRef = useRef<(() => void) | null>(null);

  // Callback ref — fires whenever React assigns or removes the element.
  const ref = useCallback((el: HTMLElement | null) => {
    // Detach listeners from previous element.
    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (disabledRef.current) return;
      if (!isHoveredRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      let multiplier = 1;
      if (e.shiftKey) multiplier = 0.1;
      else if (e.ctrlKey || e.metaKey) multiplier = 10;

      // Use the axis with larger magnitude so horizontal trackpad swipes work.
      const axisDelta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : -e.deltaY;
      const delta = axisDelta > 0 ? 1 : axisDelta < 0 ? -1 : 0;
      if (delta === 0) return;

      const raw = valueRef.current + delta * stepRef.current * multiplier;
      const next = Math.min(
        maxRef.current,
        Math.max(minRef.current, parseFloat(raw.toPrecision(10))),
      );
      if (next !== valueRef.current) onChangeRef.current(next);
    };

    const handleMouseEnter = () => {
      isHoveredRef.current = true;
      setIsHovered(true);
    };
    const handleMouseLeave = () => {
      isHoveredRef.current = false;
      setIsHovered(false);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("mouseenter", handleMouseEnter);
    el.addEventListener("mouseleave", handleMouseLeave);

    cleanupRef.current = () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("mouseenter", handleMouseEnter);
      el.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []); // stable — all live values read via refs

  // Final cleanup on unmount.
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return { ref, isHovered };
}
