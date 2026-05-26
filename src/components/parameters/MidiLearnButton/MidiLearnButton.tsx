/**
 * MidiLearnButton
 *
 * A compact button for MIDI Learn functionality.
 * - One click to start learn mode → move any MIDI knob → binding complete
 * - One click on mapped control to unbind
 */

import { useState, useEffect, useRef } from "react";
import {
  useMidiLearn,
  useMidiMappings,
  type MidiMapping,
} from "@/inputs/midi";
import styles from "./MidiLearnButton.module.css";

/**
 * @property parameterId - The parameter ID this button controls MIDI Learn for
 * @property min - Minimum value for the parameter (used for MIDI scaling)
 * @property max - Maximum value for the parameter (used for MIDI scaling)
 * @property compact - Optional: compact mode for tighter layouts
 * @property className - Optional: additional class name
 */
export interface MidiLearnButtonProps {
  parameterId: string;
  min: number;
  max: number;
  compact?: boolean;
  className?: string;
}

function formatMappingShort(mapping: MidiMapping): string {
  const channel = mapping.channel !== null ? mapping.channel + 1 : "*";
  return `CC${mapping.cc_number}@${channel}`;
}

export function MidiLearnButton({
  parameterId,
  min,
  max,
  compact = false,
  className,
}: MidiLearnButtonProps) {
  const { isLearning, learningParameterId, startLearn, cancelLearn } =
    useMidiLearn();
  const { getMappingForParameter, removeMapping } = useMidiMappings();
  const [isProcessing, setIsProcessing] = useState(false);
  const [justMapped, setJustMapped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const previousMappingRef = useRef<MidiMapping | undefined>(undefined);
  const [currentMapping, setCurrentMapping] = useState<MidiMapping | undefined>(
    undefined,
  );

  useEffect(() => {
    const newMapping = getMappingForParameter(parameterId);

    if (newMapping && !previousMappingRef.current) {
      setJustMapped(true);
      const timer = setTimeout(() => setJustMapped(false), 600);
      previousMappingRef.current = newMapping;
      setCurrentMapping(newMapping);
      return () => clearTimeout(timer);
    }

    previousMappingRef.current = newMapping;
    setCurrentMapping(newMapping);
  }, [getMappingForParameter, parameterId]);

  const isLearningThis = isLearning && learningParameterId === parameterId;
  const isLearningOther = isLearning && learningParameterId !== parameterId;
  const hasMapping = currentMapping !== undefined;

  const handleClick = async () => {
    setIsProcessing(true);
    try {
      if (isLearningThis) {
        await cancelLearn();
      } else if (hasMapping) {
        await removeMapping(parameterId);
        setCurrentMapping(undefined);
        previousMappingRef.current = undefined;
      } else {
        await startLearn(parameterId, min, max);
      }
    } catch {
      // UI state already reflects failure
    } finally {
      setIsProcessing(false);
    }
  };

  let buttonContent: React.ReactNode;
  let buttonTitle: string;
  let buttonClass = styles.button;

  if (isLearningThis) {
    buttonContent = compact ? (
      <span className={styles.learningIcon}>◎</span>
    ) : (
      "Twist knob…"
    );
    buttonTitle = "Move any MIDI knob or fader to bind. Click to cancel.";
    buttonClass = `${styles.button} ${styles.learning}`;
  } else if (hasMapping) {
    const mappingText = formatMappingShort(currentMapping);
    buttonContent = (
      <span className={styles.mappedContent}>
        <span className={styles.mappingText}>{mappingText}</span>
        {isHovered && <span className={styles.removeIcon}>×</span>}
      </span>
    );
    buttonTitle = `Mapped to ${mappingText}. Click to unbind.`;
    buttonClass = `${styles.button} ${styles.mapped}${justMapped ? ` ${styles.success}` : ""}`;
  } else {
    buttonContent = compact ? (
      <span className={styles.midiIcon}>M</span>
    ) : (
      "Learn"
    );
    buttonTitle = "Click, then move a MIDI control to bind";
  }

  if (compact) {
    buttonClass = `${buttonClass} ${styles.compact}`;
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      disabled={isProcessing || isLearningOther}
      className={`${buttonClass} ${className ?? ""}`}
      title={isLearningOther ? "Another parameter is being learned — cancel it first (Esc)" : buttonTitle}
      aria-label={buttonTitle}
    >
      {buttonContent}
    </button>
  );
}

export default MidiLearnButton;
