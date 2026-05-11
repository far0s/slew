import { useState, useEffect, useRef } from "react";
import {
  useTapTempo,
  useBpmBeat,
  formatTapShortcut,
  isTapShortcutDefault,
  setTapShortcut,
  resetTapShortcut,
  subscribeTapShortcut,
  type TapShortcut,
} from "../../inputs/tapTempo";
import styles from "./Toolbar.module.css";

export function ToolbarTapBpm() {
  const tapTempo = useTapTempo();
  const tapGroupRef = useRef<HTMLDivElement>(null);

  useBpmBeat(() => {
    const el = tapGroupRef.current;
    if (!el) return;
    el.classList.remove(styles.toolbarTapBeat);
    // Force reflow so removing+re-adding the class restarts the animation
    void el.offsetWidth;
    el.classList.add(styles.toolbarTapBeat);
  });

  const [shortcutLabel, setShortcutLabel] = useState(() =>
    formatTapShortcut({ key: " ", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })
  );
  const [shortcutIsDefault, setShortcutIsDefault] = useState(() => isTapShortcutDefault());
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);

  useEffect(() => {
    return subscribeTapShortcut((s) => {
      setShortcutLabel(formatTapShortcut(s));
      setShortcutIsDefault(s.key === " " && !s.ctrlKey && !s.metaKey && !s.altKey && !s.shiftKey);
    });
  }, []);

  useEffect(() => {
    if (!isCapturingShortcut) return;
    const handleCapture = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setIsCapturingShortcut(false); return; }
      if (["Control", "Meta", "Alt", "Shift"].includes(e.key)) return;
      const s: TapShortcut = { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey };
      setTapShortcut(s);
      setIsCapturingShortcut(false);
    };
    window.addEventListener("keydown", handleCapture, true);
    return () => window.removeEventListener("keydown", handleCapture, true);
  }, [isCapturingShortcut]);

  return (
    <div ref={tapGroupRef} className={styles.toolbarTapGroup}>
      <button
        type="button"
        className={`${styles.toolbarTapButton} ${tapTempo.isPulsing ? styles.toolbarTapPulse : ""}`}
        onClick={tapTempo.tap}
        aria-label="Tap tempo"
      >
        Tap
      </button>
      <div className={styles.toolbarBpmDisplay}>
        {tapTempo.bpm !== null ? (
          <>
            <span className={styles.toolbarBpmValue}>{tapTempo.bpm}</span>
            <span className={styles.toolbarBpmUnit}>BPM</span>
          </>
        ) : (
          <span className={styles.toolbarBpmHint}>--</span>
        )}
      </div>
      {tapTempo.bpm !== null && (
        <button
          type="button"
          className={styles.toolbarTapReset}
          onClick={tapTempo.reset}
          aria-label="Clear tap tempo"
        >
          ×
        </button>
      )}
      {isCapturingShortcut ? (
        <button
          type="button"
          className={styles.toolbarShortcutCapturing}
          onClick={() => setIsCapturingShortcut(false)}
          aria-label="Cancel shortcut capture"
        >
          Press key…
        </button>
      ) : shortcutIsDefault ? (
        <button
          type="button"
          className={styles.toolbarShortcutBadge}
          onClick={() => setIsCapturingShortcut(true)}
          title={`Tap shortcut: ${shortcutLabel} — click to change`}
          aria-label={`Tap shortcut is ${shortcutLabel}, click to change`}
        >
          {shortcutLabel}
        </button>
      ) : (
        <button
          type="button"
          className={`${styles.toolbarShortcutBadge} ${styles.toolbarShortcutCustom}`}
          onClick={() => resetTapShortcut()}
          title={`Custom shortcut: ${shortcutLabel} — click to reset to Space`}
          aria-label="Reset tap shortcut to Space"
        >
          Reset to Space
        </button>
      )}
    </div>
  );
}
