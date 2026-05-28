/**
 * LearnButton
 *
 * Small circular CTA button for MIDI + HID encoder Learn.
 * - Click to start learn — move any MIDI control OR turn any encoder
 * - First-responder wins; the other is cancelled
 * - Click mapped button to unbind both MIDI and HID
 *
 * Styled to match the KnobInput CTA buttons (22×22 circle).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMidiLearn, useMidiMappings, type MidiMapping } from "@/inputs/midi";
import {
  useHidLearn,
  useHidMappings,
  commitHidMapping,
  type HidMapping,
  type HidEncoderEvent,
} from "@/inputs/hid";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { logger } from "@/lib/logger";
import styles from "./LearnButton.module.css";

export interface LearnButtonProps {
  parameterId: string;
  min: number;
  max: number;
  className?: string;
}

function formatMidi(m: MidiMapping): string {
  const ch = m.channel !== null ? m.channel + 1 : "*";
  return `CC${m.cc_number}@${ch}`;
}

function formatHid(m: HidMapping): string {
  return `Enc${m.encoder_index}`;
}

export function LearnButton({
  parameterId,
  min,
  max,
  className,
}: LearnButtonProps) {
  // ── MIDI ────────────────────────────────────────────────────────────────
  const {
    isLearning: midiIsLearning,
    learningParameterId: midiLearningId,
    startLearn: midiStartLearn,
    cancelLearn: midiCancelLearn,
  } = useMidiLearn();
  const {
    getMappingForParameter: getMidiMapping,
    removeMapping: removeMidiMapping,
  } = useMidiMappings();

  // ── HID ─────────────────────────────────────────────────────────────────
  const {
    isLearning: hidIsLearning,
    learningParameterId: hidLearningId,
    startLearn: hidStartLearn,
    cancelLearn: hidCancelLearn,
  } = useHidLearn();
  const {
    getMappingForParameter: getHidMapping,
    removeMappingForParameter: removeHidMapping,
  } = useHidMappings();

  // ── Local state ──────────────────────────────────────────────────────────
  const [isProcessing, setIsProcessing] = useState(false);
  const [isActive, setIsActive] = useState(false); // success flash
  const [midiMapping, setMidiMapping] = useState<MidiMapping | undefined>(
    undefined,
  );
  const [hidMapping, setHidMapping] = useState<HidMapping | undefined>(
    undefined,
  );
  const prevMidiRef = useRef<MidiMapping | undefined>(undefined);
  const prevHidRef = useRef<HidMapping | undefined>(undefined);

  // Sync MIDI mapping — flash on new binding
  useEffect(() => {
    const next = getMidiMapping(parameterId);
    if (next && !prevMidiRef.current) {
      logger.debug(
        "[LearnButton]",
        `MIDI resolved for ${parameterId}: ${formatMidi(next)}`,
      );
      setIsActive(true);
      const t = setTimeout(() => setIsActive(false), 600);
      prevMidiRef.current = next;
      setMidiMapping(next);
      return () => clearTimeout(t);
    }
    prevMidiRef.current = next;
    setMidiMapping(next);
  }, [getMidiMapping, parameterId]);

  // Sync HID mapping — flash on new binding
  useEffect(() => {
    const next = getHidMapping(parameterId);
    if (next && !prevHidRef.current) {
      logger.debug(
        "[LearnButton]",
        `HID resolved for ${parameterId}: ${formatHid(next)}`,
      );
      setIsActive(true);
      const t = setTimeout(() => setIsActive(false), 600);
      prevHidRef.current = next;
      setHidMapping(next);
      return () => clearTimeout(t);
    }
    prevHidRef.current = next;
    setHidMapping(next);
  }, [getHidMapping, parameterId]);

  // ── Learn state ──────────────────────────────────────────────────────────
  const isLearningThis =
    (midiIsLearning && midiLearningId === parameterId) ||
    (hidIsLearning && hidLearningId === parameterId);

  const isLearningOther =
    (midiIsLearning && midiLearningId !== parameterId) ||
    (hidIsLearning && hidLearningId !== parameterId);

  // While learning: listen for first HID encoder event
  useEffect(() => {
    if (!isLearningThis) return;

    let unlisten: UnlistenFn | undefined;
    let resolved = false;

    void (async () => {
      unlisten = await listen<HidEncoderEvent>("hid_encoder", (event) => {
        if (resolved) return;
        resolved = true;

        const encoderIndex = event.payload.encoder_index;
        logger.debug(
          "[LearnButton]",
          `HID encoder ${encoderIndex} captured for ${parameterId}`,
        );

        midiCancelLearn();
        hidCancelLearn();

        void (async () => {
          setIsProcessing(true);
          try {
            // commitHidMapping writes to backend AND broadcasts to all
            // useHidMappings instances — the sync effect above will fire
            await commitHidMapping({
              encoder_index: encoderIndex,
              parameter_id: parameterId,
              sensitivity: 0.02,
              inverted: false,
            });
          } catch (err) {
            logger.error("[LearnButton]", "commitHidMapping failed", err);
          } finally {
            setIsProcessing(false);
          }
        })();
      });
    })();

    return () => {
      if (unlisten) void unlisten();
    };
  }, [isLearningThis, parameterId, midiCancelLearn, hidCancelLearn]);

  // ── Click ────────────────────────────────────────────────────────────────
  const handleClick = useCallback(async () => {
    logger.debug(
      "[LearnButton]",
      `click: isProcessing=${isProcessing} isLearningThis=${isLearningThis} midiMapping=${!!midiMapping} hidMapping=${!!hidMapping} parameterId=${parameterId}`,
    );
    if (isProcessing) return;

    if (isLearningThis) {
      midiCancelLearn();
      hidCancelLearn();
      return;
    }

    if (midiMapping || hidMapping) {
      logger.debug("[LearnButton]", `unbinding ${parameterId}`);
      setIsProcessing(true);
      try {
        if (midiMapping) await removeMidiMapping(parameterId);
        if (hidMapping) await removeHidMapping(parameterId);
        setMidiMapping(undefined);
        setHidMapping(undefined);
        prevMidiRef.current = undefined;
        prevHidRef.current = undefined;
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    logger.debug("[LearnButton]", `starting learn for ${parameterId}`);
    await midiStartLearn(parameterId, min, max);
    hidStartLearn(parameterId);
  }, [
    isProcessing,
    isLearningThis,
    midiMapping,
    hidMapping,
    midiCancelLearn,
    hidCancelLearn,
    removeMidiMapping,
    removeHidMapping,
    parameterId,
    midiStartLearn,
    hidStartLearn,
    min,
    max,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────
  const hasMapping = !!(midiMapping || hidMapping);
  const mappingLabel = midiMapping
    ? formatMidi(midiMapping)
    : hidMapping
      ? formatHid(hidMapping)
      : null;

  let btnClass = styles.btn;
  if (isLearningThis) btnClass += ` ${styles.learning}`;
  else if (hasMapping && isActive) btnClass += ` ${styles.success}`;
  else if (hasMapping) btnClass += ` ${styles.mapped}`;
  if (className) btnClass += ` ${className}`;

  const title =
    isLearningOther && !hasMapping
      ? "Another parameter is being learned — cancel it first"
      : isLearningThis
        ? "Listening… move a MIDI control or encoder. Click to cancel."
        : hasMapping
          ? `Mapped to ${mappingLabel}. Click to unbind.`
          : "Click to learn — move any MIDI control or encoder";

  return (
    <button
      type="button"
      className={btnClass}
      onClick={() => void handleClick()}
      disabled={isProcessing || (isLearningOther && !hasMapping)}
      title={title}
      aria-label={title}
    >
      {/* Plug icon — same as KnobInput's learn CTA */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="3.2" cy="4" r="0.8" fill="currentColor" />
        <circle cx="6.8" cy="4" r="0.8" fill="currentColor" />
        <circle cx="5" cy="6.5" r="0.8" fill="currentColor" />
      </svg>
    </button>
  );
}
