import { useState, useEffect, useCallback } from "react";

/**
 * Hook for toggling performance stats display with the "D" key.
 *
 * Features:
 * - Listens for "D" key press (case-insensitive)
 * - Toggles stats visibility state
 * - Can be used independently in both Controls and Renderer windows
 *
 * @returns Object with showStats boolean and toggle function
 */
export function useStatsToggle() {
  const [showStats, setShowStats] = useState(false);

  const toggle = useCallback(() => {
    setShowStats((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for "D" key (case-insensitive)
      // Ignore if user is typing in an input field
      if (
        event.key.toLowerCase() === "d" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !(
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement
        )
      ) {
        toggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggle]);

  return { showStats, toggle, setShowStats };
}

export default useStatsToggle;
