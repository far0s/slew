/**
 * MidiLearnButton
 *
 * A compact button that can be placed next to any parameter control
 * to enable MIDI Learn mode for that parameter. Shows current mapping
 * status and allows entering learn mode or clearing existing mappings.
 */

import { useState, useEffect } from "react";
import { useMidiLearn, useMidiMappings, type MidiMapping } from "../../inputs/midi";
import styles from "./MidiLearnButton.module.css";

export interface MidiLearnButtonProps {
  /** The parameter ID this button controls MIDI Learn for */
  parameterId: string;
  /** Optional: compact mode for tighter layouts */
  compact?: boolean;
  /** Optional: additional class name */
  className?: string;
}

/**
 * Format a mapping for display in a tooltip or badge.
 */
function formatMappingShort(mapping: MidiMapping): string {
  const channel = mapping.channel !== null ? mapping.channel + 1 : "*";
  return `CC${mapping.cc_number}@${channel}`;
}

/**
 * MidiLearnButton
 *
 * States:
 * - No mapping: Shows "Learn" button
 * - Has mapping: Shows mapping info with option to clear
 * - Learning (this param): Shows "Waiting…" with cancel option
 * - Learning (other param): Disabled
 */
export function MidiLearnButton({
  parameterId,
  compact = false,
  className,
}: MidiLearnButtonProps) {
  const { isLearning, learningParameterId, startLearn, cancelLearn } = useMidiLearn();
  const { getMappingForParameter, removeMapping } = useMidiMappings();
  const [isProcessing, setIsProcessing] = useState(false);

  // Get current mapping for this parameter
  const [currentMapping, setCurrentMapping] = useState<MidiMapping | undefined>(
    undefined
  );

  // Update mapping when mappings change
  useEffect(() => {
    setCurrentMapping(getMappingForParameter(parameterId));
  }, [getMappingForParameter, parameterId]);

  const isLearningThis = isLearning && learningParameterId === parameterId;
  const isLearningOther = isLearning && learningParameterId !== parameterId;
  const hasMapping = currentMapping !== undefined;

  const handleClick = async () => {
    setIsProcessing(true);
    try {
      if (isLearningThis) {
        // Cancel learn mode
        await cancelLearn();
      } else if (hasMapping) {
        // Clear existing mapping
        await removeMapping(parameterId);
        setCurrentMapping(undefined);
      } else {
        // Start learn mode
        await startLearn(parameterId);
      }
    } catch (e) {
      console.error("[MidiLearnButton] Action failed:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Determine button content and style
  let buttonContent: React.ReactNode;
  let buttonTitle: string;
  let buttonClass = styles.button;

  if (isLearningThis) {
    buttonContent = compact ? "…" : "Waiting…";
    buttonTitle = "Click to cancel MIDI Learn";
    buttonClass = `${styles.button} ${styles.learning}`;
  } else if (hasMapping) {
    buttonContent = compact
      ? formatMappingShort(currentMapping)
      : formatMappingShort(currentMapping);
    buttonTitle = `Mapped to ${formatMappingShort(currentMapping)}. Click to remove.`;
    buttonClass = `${styles.button} ${styles.mapped}`;
  } else {
    buttonContent = compact ? "M" : "Learn";
    buttonTitle = "Click to start MIDI Learn for this parameter";
  }

  if (compact) {
    buttonClass = `${buttonClass} ${styles.compact}`;
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={isProcessing || isLearningOther}
      className={`${buttonClass} ${className ?? ""}`}
      title={buttonTitle}
      aria-label={buttonTitle}
    >
      {buttonContent}
    </button>
  );
}

export default MidiLearnButton;
