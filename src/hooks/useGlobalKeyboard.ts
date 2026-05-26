import { useEffect } from "react";
import { globalTapTempo, matchesTapShortcut } from "../inputs/tapTempo";

interface UseGlobalKeyboardParams {
  isMidiLearning: boolean;
  onCancelMidiLearn: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleFullscreen: () => void;
}

export function useGlobalKeyboard({
  isMidiLearning,
  onCancelMidiLearn,
  onUndo,
  onRedo,
  onToggleFullscreen,
}: UseGlobalKeyboardParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMidiLearning) {
        e.preventDefault();
        onCancelMidiLearn();
      }

      if (
        matchesTapShortcut(e) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        globalTapTempo();
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onToggleFullscreen();
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onUndo();
      }

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMidiLearning, onCancelMidiLearn, onUndo, onRedo, onToggleFullscreen]);
}
