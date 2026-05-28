/**
 * HidLearnButton
 *
 * A compact button for HID Encoder Learn functionality.
 * - One click to start learn mode → turn any encoder → binding complete
 * - One click on mapped control to unbind
 *
 * Mirrors MidiLearnButton but for HID encoder mappings.
 * Only 3 encoders exist (Enc0/1/2), so learn resolves on the first
 * encoder movement detected after learn mode is activated.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useHidLearn,
  useHidMappings,
  addHidMapping as addMapping,
  type HidMapping,
  type HidEncoderEvent,
} from "@/inputs/hid";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import styles from "./HidLearnButton.module.css";

const ENCODER_LABELS = ["Enc0", "Enc1", "Enc2"] as const;

function formatEncoderLabel(encoderIndex: number): string {
  return ENCODER_LABELS[encoderIndex] ?? `Enc${encoderIndex}`;
}

export interface HidLearnButtonProps {
  parameterId: string;
  compact?: boolean;
  className?: string;
}

/**
 * @property parameterId - The parameter ID this button controls HID Learn for
 * @property compact - Optional: compact mode for tighter layouts
 * @property className - Optional: additional class name
 */
export function HidLearnButton({
  parameterId,
  compact = false,
  className,
}: HidLearnButtonProps) {
  const { isLearning, learningParameterId, startLearn, cancelLearn } =
    useHidLearn();
  const { getMappingForParameter, removeMappingForParameter } =
    useHidMappings();
  const [isProcessing, setIsProcessing] = useState(false);
  const [justMapped, setJustMapped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const previousMappingRef = useRef<HidMapping | undefined>(undefined);
  const [currentMapping, setCurrentMapping] = useState<HidMapping | undefined>(
    getMappingForParameter(parameterId),
  );

  // Sync current mapping from the store whenever mappings change
  useEffect(() => {
    setCurrentMapping(getMappingForParameter(parameterId));
  }, [getMappingForParameter, parameterId]);

  const isLearningThis = isLearning && learningParameterId === parameterId;

  // While in learn mode for this parameter, listen for the first encoder event
  useEffect(() => {
    if (!isLearningThis) return;

    let unlisten: UnlistenFn | undefined;

    void (async () => {
      unlisten = await listen<HidEncoderEvent>("hid_encoder", (event) => {
        const encoderIndex = event.payload.encoder_index;

        // Capture ref before clearing learn state so success flash fires
        previousMappingRef.current = getMappingForParameter(parameterId);

        // Cancel learn mode first so no other component picks up the event
        cancelLearn();

        void (async () => {
          setIsProcessing(true);
          try {
            await addMapping({
              encoder_index: encoderIndex,
              parameter_id: parameterId,
              sensitivity: 0.02,
              inverted: false,
            });
            const updated = getMappingForParameter(parameterId);
            setCurrentMapping(updated);
            setJustMapped(true);
            setTimeout(() => setJustMapped(false), 1200);
          } finally {
            setIsProcessing(false);
          }
        })();
      });
    })();

    return () => {
      if (unlisten) void unlisten();
    };
  }, [isLearningThis, parameterId, cancelLearn, getMappingForParameter]);

  const handleClick = useCallback(async () => {
    if (isProcessing) return;

    if (isLearningThis) {
      cancelLearn();
      return;
    }

    if (currentMapping) {
      setIsProcessing(true);
      try {
        await removeMappingForParameter(parameterId);
        setCurrentMapping(undefined);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    startLearn(parameterId);
  }, [
    isProcessing,
    isLearningThis,
    currentMapping,
    cancelLearn,
    removeMappingForParameter,
    parameterId,
    startLearn,
  ]);

  const isLearningOther = isLearning && learningParameterId !== parameterId;
  const hasMapping = currentMapping !== undefined;

  // ── Render ────────────────────────────────────────────────────────────────
  let buttonContent: React.ReactNode;
  let buttonTitle: string;
  let buttonClass = styles.button;

  if (compact) buttonClass += ` ${styles.compact}`;
  if (className) buttonClass += ` ${className}`;

  if (isLearningThis) {
    buttonContent = compact ? (
      <span className={styles.learningIcon}>◎</span>
    ) : (
      "Learning…"
    );
    buttonTitle = "Turn any encoder to bind. Click to cancel.";
    buttonClass += ` ${styles.learning}`;
  } else if (hasMapping) {
    const label = formatEncoderLabel(currentMapping.encoder_index);
    buttonContent = (
      <span className={styles.mappedContent}>
        <span className={styles.mappingText}>{label}</span>
        {isHovered && <span className={styles.removeIcon}>×</span>}
      </span>
    );
    buttonTitle = `HID mapped to ${label}. Click to unbind.`;
    buttonClass += ` ${styles.mapped}${justMapped ? ` ${styles.success}` : ""}`;
  } else {
    buttonContent = compact ? <span className={styles.hidIcon}>⌨</span> : "HID";
    buttonTitle = "Click to bind a HID encoder";
    // no extra class — default idle state
  }

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={() => void handleClick()}
      disabled={isProcessing || isLearningOther}
      title={buttonTitle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {buttonContent}
    </button>
  );
}
