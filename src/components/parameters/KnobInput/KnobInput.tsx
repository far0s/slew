import { useState, useRef, useCallback, useEffect } from "react";
import { useScrollAdjust } from "@/inputs/shared";
import { useMidiLearn, useMidiMappings } from "@/inputs/midi";
import { LfoShapeIcon } from "@/components/panels/ModulationPanel/LfoShapeIcon";
import type { MidiPickupState } from "@/inputs/midi";
import type { AudioMappingIndicator, ModulationIndicator } from "@/components/parameters/ParameterSlider";
import styles from "./KnobInput.module.css";

// Re-export shared types so consumers can import from one place
export type { AudioMappingIndicator, ModulationIndicator } from "@/components/parameters/ParameterSlider";

export type KnobColorVariant =
  | "emerald"
  | "indigo"
  | "cyan"
  | "amber"
  | "rose"
  | "violet"
  | "lime"
  | "orange"
  | "sky"
  | "fuchsia";

export interface KnobInputProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color?: KnobColorVariant;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit?: (after: number, before: number) => void;
  "aria-label"?: string;
  midiParameterId?: string;
  audioMapping?: AudioMappingIndicator | null;
  modulationIndicator?: ModulationIndicator | null;
  isMidiControlled?: boolean;
  pickupState?: MidiPickupState | null;
  onQuickBeat?: () => void;
  onQuickLfo?: () => void;
  onUnlinkBeat?: () => void;
  onUnlinkLfo?: () => void;
}

// Knob sweep: 270° total, gap centered at the bottom.
// 225° = 7:30 o'clock (lower-left), +270° CW = 495° = 135° = 4:30 o'clock (lower-right).
// Note: END_ANGLE (135) < START_ANGLE (225) numerically — always use START_ANGLE + SWEEP
// for arc paths so describeArc's normalisation gives the correct 270°.
const START_ANGLE = 225;
const SWEEP = 270;
const SIZE = 68; // px — knob fills most of the cell width
const CX = SIZE / 2;
const CY = SIZE / 2;
const RADIUS = 26;
const STROKE = 5;

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CX + r * Math.cos(rad),
    y: CY + r * Math.sin(rad),
  };
}

function describeArc(fromDeg: number, toDeg: number, r: number) {
  // Work around the full-circle edge case
  const normalised = ((toDeg - fromDeg) % 360 + 360) % 360;
  if (normalised < 0.5) return ""; // empty arc
  const large = normalised > 180 ? 1 : 0;
  const start = polarToXY(fromDeg, r);
  const end = polarToXY(toDeg, r);
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

function valueToAngle(value: number, min: number, max: number): number {
  const t = max > min ? (value - min) / (max - min) : 0;
  return START_ANGLE + t * SWEEP;
}

export function KnobInput({
  id,
  label,
  value,
  min,
  max,
  step,
  color = "emerald",
  formatValue = (v) => v.toFixed(2),
  onChange,
  onCommit,
  "aria-label": ariaLabel,
  midiParameterId,
  audioMapping,
  modulationIndicator,
  isMidiControlled = false,
  pickupState,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
}: KnobInputProps) {
  // --- inline edit state ---
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const beforeRef = useRef(value);

  // --- drag state ---
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  // --- scroll-to-adjust (horizontal scroll) ---
  const { ref: scrollRef, isHovered } = useScrollAdjust(
    value,
    (next) => {
      if (!isMidiControlled) onChange(next);
    },
    step,
    min,
    max,
    isMidiControlled,
  );

  // --- pickup flash ---
  const [showPickupFlash, setShowPickupFlash] = useState(false);
  const prevPickedUpRef = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (pickupState?.picked_up && prevPickedUpRef.current === false) {
      setShowPickupFlash(true);
      const t = setTimeout(() => setShowPickupFlash(false), 400);
      return () => clearTimeout(t);
    }
    prevPickedUpRef.current = pickupState?.picked_up;
  }, [pickupState?.picked_up]);

  // --- MIDI learn state (for Learn CTA) ---
  const { isLearning, learningParameterId, startLearn, cancelLearn } = useMidiLearn();
  const { getMappingForParameter, removeMapping } = useMidiMappings();
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentMapping, setCurrentMapping] = useState(() =>
    midiParameterId ? getMappingForParameter(midiParameterId) : undefined,
  );
  useEffect(() => {
    if (!midiParameterId) return;
    setCurrentMapping(getMappingForParameter(midiParameterId));
  }, [getMappingForParameter, midiParameterId]);

  const isLearningThis = midiParameterId ? isLearning && learningParameterId === midiParameterId : false;
  const isLearningOther = isLearning && !isLearningThis;
  const hasMapping = currentMapping !== undefined;

  const handleLearnClick = useCallback(async () => {
    if (!midiParameterId) return;
    setIsProcessing(true);
    try {
      if (isLearningThis) {
        await cancelLearn();
      } else if (hasMapping) {
        await removeMapping(midiParameterId);
        setCurrentMapping(undefined);
      } else {
        await startLearn(midiParameterId, min, max);
      }
    } catch {
      // ignore
    } finally {
      setIsProcessing(false);
    }
  }, [midiParameterId, isLearningThis, hasMapping, cancelLearn, removeMapping, startLearn, min, max]);

  // --- drag handlers ---
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isMidiControlled || editing) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      beforeRef.current = value;
      dragRef.current = { startY: e.clientY, startValue: value };
    },
    [isMidiControlled, editing, value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || isMidiControlled) return;
      const dy = dragRef.current.startY - e.clientY; // up = positive
      let multiplier = 1;
      if (e.shiftKey) multiplier = 0.1;
      else if (e.ctrlKey || e.metaKey) multiplier = 10;
      const range = max - min;
      const sensitivity = range / 200; // 200px drag = full range
      const raw = dragRef.current.startValue + dy * sensitivity * multiplier;
      const next = Math.min(max, Math.max(min, parseFloat(raw.toPrecision(10))));
      const snapped = Math.round((next - min) / step) * step + min;
      const clamped = Math.min(max, Math.max(min, parseFloat(snapped.toPrecision(10))));
      if (clamped !== value) onChange(clamped);
    },
    [isMidiControlled, min, max, step, value, onChange],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current) return;
      onCommit?.(value, beforeRef.current);
      dragRef.current = null;
    },
    [value, onCommit],
  );

  // --- click-to-edit ---
  const handleValueClick = useCallback(
    (e: React.MouseEvent) => {
      if (isMidiControlled) return;
      e.stopPropagation();
      beforeRef.current = value;
      setEditText(formatValue(value));
      setEditing(true);
    },
    [isMidiControlled, value, formatValue],
  );

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    const parsed = parseFloat(editText);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
      onCommit?.(clamped, beforeRef.current);
    }
    setEditing(false);
  }, [editText, min, max, onChange, onCommit]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") commitEdit();
      else if (e.key === "Escape") setEditing(false);
    },
    [commitEdit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (isMidiControlled) return;
      const big = step * 10;
      let next = value;
      if (e.key === "ArrowRight" || e.key === "ArrowUp")        next = Math.min(max, value + (e.shiftKey ? step * 0.1 : e.ctrlKey || e.metaKey ? big : step));
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(min, value - (e.shiftKey ? step * 0.1 : e.ctrlKey || e.metaKey ? big : step));
      else if (e.key === "Home") next = min;
      else if (e.key === "End")  next = max;
      else return;
      e.preventDefault();
      const snapped = parseFloat((Math.round((next - min) / step) * step + min).toPrecision(10));
      const clamped = Math.min(max, Math.max(min, snapped));
      if (clamped !== value) onChange(clamped);
    },
    [isMidiControlled, value, min, max, step, onChange],
  );

  // --- SVG arc geometry ---
  // END_ANGLE (135) < START_ANGLE (225) numerically, so always pass START + SWEEP
  // to describeArc — the normalisation then gives the correct 270° sweep.
  const fillAngle = valueToAngle(value, min, max);
  const trackPath = describeArc(START_ANGLE, START_ANGLE + SWEEP, RADIUS);
  const fillPath = describeArc(START_ANGLE, fillAngle, RADIUS);

  // Indicator dot at current value position
  const dotPos = polarToXY(fillAngle, RADIUS);

  // Ghost marker for MIDI pickup
  const showGhostMarker = pickupState && !pickupState.picked_up;
  const ghostAngle = showGhostMarker
    ? valueToAngle(pickupState.midi_value, min, max)
    : 0;
  const ghostPos = showGhostMarker ? polarToXY(ghostAngle, RADIUS) : null;


  // Beat CTA: show if can link OR is linked (unlink possible)
  const showBeat = !!(onQuickBeat || onUnlinkBeat);
  const beatActive = !!audioMapping; // linked when audio mapping present
  // LFO CTA: show if can link OR is linked
  const showLfo = !!(onQuickLfo || onUnlinkLfo);
  const lfoActive = !!modulationIndicator; // linked when modulation present
  // MIDI Learn CTA: show if param is mapped
  const showLearn = !!midiParameterId;

  const showCtaRow = showLearn || showBeat || showLfo;

  const wrapperClass = [
    styles.wrapper,
    styles[`color_${color}`] ?? styles.color_emerald,
    isMidiControlled && styles.disabled,
    showPickupFlash && styles.pickupFlash,
    isHovered && !isMidiControlled && styles.hovered,
  ].filter(Boolean).join(" ");

  return (
    <div className={wrapperClass}
      title={isMidiControlled ? "Controlled via MIDI — adjust using your controller" : undefined}
    >
      {/* SVG knob */}
      <div className={styles.knobArea} ref={scrollRef as (el: HTMLDivElement | null) => void}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className={styles.svg}
          role="slider"
          aria-label={ariaLabel ?? label}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          tabIndex={isMidiControlled ? -1 : 0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {/* Track arc — always visible */}
          <path
            d={trackPath}
            fill="none"
            className={styles.track}
            strokeWidth={STROKE}
            strokeLinecap="round"
          />
          {/* Fill arc */}
          {fillPath && (
            <path
              d={fillPath}
              fill="none"
              className={styles.fill}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          )}
          {/* Indicator dot */}
          <circle
            cx={dotPos.x}
            cy={dotPos.y}
            r={3}
            className={styles.dot}
          />
          {/* Ghost dot — MIDI physical knob position, rendered on top so always visible */}
          {ghostPos && (
            <circle
              cx={ghostPos.x}
              cy={ghostPos.y}
              r={3}
              className={styles.ghostDot}
            />
          )}

          {/* Value centered inside the knob circle */}
          <foreignObject
            x={CX - (RADIUS - STROKE - 3)}
            y={CY - 8}
            width={(RADIUS - STROKE - 3) * 2}
            height={16}
          >
            {editing ? (
              <input
                ref={inputRef}
                className={styles.centerInput}
                type="number"
                value={editText}
                min={min}
                max={max}
                step={step}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <button
                type="button"
                className={styles.centerValue}
                onClick={handleValueClick}
                tabIndex={-1}
                title="Click to enter value"
                disabled={isMidiControlled}
              >
                {formatValue(value)}
              </button>
            )}
          </foreignObject>
        </svg>
      </div>

      {/* Label + CTA row — together at bottom */}
      {showCtaRow ? (
        <div className={styles.labelCtaGroup}>
          <label htmlFor={id} className={styles.label}>{label}</label>
          <div className={styles.ctaRow}>
          {/* MIDI Learn CTA */}
          {showLearn && (
            <button
              type="button"
              className={`${styles.ctaBtn} ${styles.ctaLearn}${isLearningThis || hasMapping ? ` ${styles.ctaLearnActive}` : ""}`}
              onClick={() => void handleLearnClick()}
              disabled={isProcessing || isLearningOther}
              title={
                isLearningThis
                  ? "Listening… move a MIDI control. Click to cancel."
                  : hasMapping
                  ? `MIDI mapped. Click to unbind.`
                  : "Click to MIDI learn"
              }
            >
              {/* MIDI plug icon */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2"/>
                <circle cx="3.2" cy="4" r="0.8" fill="currentColor"/>
                <circle cx="6.8" cy="4" r="0.8" fill="currentColor"/>
                <circle cx="5" cy="6.5" r="0.8" fill="currentColor"/>
              </svg>
            </button>
          )}

          {/* Beat / audio-map CTA */}
          {showBeat && (
            <button
              type="button"
              className={`${styles.ctaBtn} ${styles.ctaBeat}${beatActive ? ` ${styles.ctaBeatActive}` : ""}`}
              onClick={beatActive ? onUnlinkBeat : onQuickBeat}
              title={
                beatActive
                  ? `Beat-mapped: ${audioMapping?.sourceLabel ?? ""}. Click to unlink.`
                  : "Link to beat — pulses on detected beat"
              }
            >
              ♩
            </button>
          )}

          {/* LFO CTA */}
          {showLfo && (
            <button
              type="button"
              className={`${styles.ctaBtn} ${styles.ctaLfo}${lfoActive ? ` ${styles.ctaLfoActive}` : ""}`}
              onClick={lfoActive ? onUnlinkLfo : onQuickLfo}
              title={
                lfoActive
                  ? (modulationIndicator?.count && modulationIndicator.count > 1
                    ? `Modulated by ${modulationIndicator.count} LFOs. Click to unlink.`
                    : `Modulated by ${modulationIndicator?.lfoName ?? "LFO"}. Click to unlink.`)
                  : "Link to LFO — continuous oscillation"
              }
            >
              {lfoActive && modulationIndicator?.lfoShape ? (
                <LfoShapeIcon shape={modulationIndicator.lfoShape} width={10} />
              ) : (
                "~"
              )}
            </button>
          )}
          </div>
        </div>
      ) : (
        <label htmlFor={id} className={styles.label}>{label}</label>
      )}
    </div>
  );
}

export default KnobInput;
