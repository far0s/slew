import { useState, useEffect, useRef } from "react";
import {
  useTapTempo,
  useBpmBeat,
  formatTapShortcut,
  isTapShortcutDefault,
  setTapShortcut,
  resetTapShortcut,
  subscribeTapShortcut,
  setManualBpmDirect,
  resyncBeatPhase,
  type TapShortcut,
} from "../../inputs/tapTempo";
import { useLinkStatus } from "../../inputs/bpmSource";
import { useActiveBpmSource } from "../../inputs/bpmSource";
import { useScrollAdjust } from "../../inputs/shared/useScrollAdjust";
import styles from "./Toolbar.module.css";

const BPM_MIN = 20;
const BPM_MAX = 300;

export function ToolbarTapBpm() {
  const tapTempo = useTapTempo();
  const tapGroupRef = useRef<HTMLDivElement>(null);
  const { status: linkStatus } = useLinkStatus();
  const activeSource = useActiveBpmSource();

  // The displayed BPM: prefer Link when active, otherwise tap tempo
  const displayBpm =
    activeSource.source === "link" && linkStatus.bpm !== null
      ? linkStatus.bpm
      : tapTempo.bpm;

  // Editable BPM field state
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Beat grid counter — drives both the grid and the bar-start border pulse.
  // Reset to null when BPM clears so no cell is active.
  const [beatIndex, setBeatIndex] = useState<number | null>(null);
  const nextBeatIndexRef = useRef<number>(0);
  useBpmBeat(() => {
    const next = nextBeatIndexRef.current;
    nextBeatIndexRef.current = (next + 1) % 4;
    setBeatIndex(next);

    // Border flash only on bar start (beat 0)
    if (next === 0) {
      const el = tapGroupRef.current;
      if (!el) return;
      el.classList.remove(styles.toolbarTapBeat);
      void el.offsetWidth;
      el.classList.add(styles.toolbarTapBeat);
    }
  });

  // Reset grid when BPM changes (cleared or updated to a new value)
  useEffect(() => {
    if (displayBpm === null) {
      setBeatIndex(null);
    }
    nextBeatIndexRef.current = 0;
  }, [displayBpm]);

  // Keyboard shortcut wiring
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

  // Scroll-to-nudge on the BPM field container
  const { ref: scrollRef, isHovered: scrollHovered } = useScrollAdjust(
    displayBpm ?? 120,
    (next) => {
      if (activeSource.source === "link") return; // don't override Link
      setManualBpmDirect(next);
      // Sync tap tempo state so the reset button appears
      // (tapTempo.bpm is updated via notifyBpm which setBpm doesn't track —
      //  this is fine; the display shows displayBpm which reads activeSource)
    },
    1,
    BPM_MIN,
    BPM_MAX,
    activeSource.source === "link",
  );

  // Start editing
  const handleBpmClick = () => {
    if (activeSource.source === "link") return; // Link is driving; not editable
    setEditValue(String(displayBpm ?? ""));
    setIsEditing(true);
  };

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commitEdit = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed) && parsed >= BPM_MIN && parsed <= BPM_MAX) {
      setManualBpmDirect(parsed);
    }
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { commitEdit(); return; }
    if (e.key === "Escape") { setIsEditing(false); return; }
  };

  const linkIsActive = activeSource.source === "link";
  const hasBpm = displayBpm !== null;

  return (
    <div className={styles.toolbarTapGroup} ref={tapGroupRef}>
      {/* Tap button */}
      <button
        type="button"
        className={`${styles.toolbarTapButton} ${tapTempo.isPulsing ? styles.toolbarTapPulse : ""}`}
        onClick={tapTempo.tap}
        aria-label="Tap tempo"
      >
        Tap
      </button>

      {/* Beat grid — 2×2, clockwise: TL→TR→BR→BL */}
      <div className={styles.toolbarBeatGrid} aria-hidden="true">
        {/* Grid positions: 0=TL 1=TR 2=BL 3=BR; beat order: TL TR BR BL */}
        {([0, 1, 3, 2] as const).map((beatPos, gridPos) => (
          <div
            key={gridPos}
            className={`${styles.toolbarBeatCell} ${beatIndex === beatPos ? styles.toolbarBeatCellActive : ""}`}
          />
        ))}
      </div>

      {/* BPM display / editable field */}
      <div
        className={`${styles.toolbarBpmDisplay} ${scrollHovered ? styles.toolbarBpmScrollHint : ""}`}
        ref={scrollRef}
        onClick={handleBpmClick}
        title={linkIsActive ? "BPM controlled by Link" : "Click to edit BPM, scroll horizontally to nudge"}
        style={{ cursor: linkIsActive ? "default" : "text" }}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            className={styles.toolbarBpmInput}
            value={editValue}
            min={BPM_MIN}
            max={BPM_MAX}
            step={1}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleInputKeyDown}
            aria-label="BPM value"
          />
        ) : hasBpm ? (
          <>
            {linkIsActive && (
              <span className={styles.toolbarLinkLabel}>Link</span>
            )}
            <span className={styles.toolbarBpmValue}>{displayBpm}</span>
            <span className={styles.toolbarBpmUnit}>BPM</span>
          </>
        ) : (
          <span className={styles.toolbarBpmHint}>--</span>
        )}
      </div>

      {/* Resync button — always visible, disabled when no BPM */}
      <button
        type="button"
        className={styles.toolbarResyncButton}
        onClick={resyncBeatPhase}
        disabled={!hasBpm}
        title={hasBpm ? "Resync beat phase to now" : "No BPM set"}
        aria-label="Resync beat"
      >
        ↺
      </button>

      {/* Clear tap tempo — always visible, disabled when no tap BPM or Link driving */}
      <button
        type="button"
        className={styles.toolbarTapReset}
        onClick={tapTempo.reset}
        disabled={tapTempo.bpm === null || linkIsActive}
        aria-label="Clear tap tempo"
      >
        ×
      </button>

      {/* Tap shortcut badge */}
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
