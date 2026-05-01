import { useState, useEffect, useRef } from "react";
import * as Slider from "@radix-ui/react-slider";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { MidiLearnButton } from "../MidiLearnButton";
import { MODULATION_INDICATOR_COLOR } from "../../inputs/modulation";
import type { MidiPickupState } from "../../inputs/midi";
import styles from "./ParameterSlider.module.css";

export type SliderColorVariant =
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

/**
 * Audio mapping indicator info for display on the slider.
 */
export interface AudioMappingIndicator {
  /** Short label for the audio source (e.g., "Bass", "RMS") */
  sourceLabel: string;
  /** CSS color value for the indicator */
  color: string;
}

/**
 * Modulation indicator info for display on the slider.
 */
export interface ModulationIndicator {
  /** Name of the LFO source */
  lfoName: string;
  /** Optional: number of LFOs modulating this parameter (for tooltip) */
  count?: number;
}

/**
 * Props for the ParameterSlider component.
 *
 * @property id - Unique identifier for the slider element
 * @property label - Display label for the parameter
 * @property value - Current value
 * @property min - Minimum value
 * @property max - Maximum value
 * @property step - Step increment
 * @property description - Optional description text shown below the slider
 * @property color - Color variant for the slider track and thumb
 * @property showSpacing - Whether to add top margin for visual separation
 * @property formatValue - Custom value formatter function
 * @property onChange - Callback when value changes
 * @property aria-label - Accessible label override
 * @property midiParameterId - Parameter ID for MIDI Learn; if provided, shows a Learn button
 * @property audioMapping - Audio mapping indicator info; if provided, shows mapping badge
 * @property modulationIndicator - Modulation indicator info; if provided, shows modulation badge
 * @property isMidiControlled - If true, disables direct user input (controlled via MIDI only)
 * @property pickupState - MIDI pickup state for soft takeover indicator
 */
export interface ParameterSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  description?: string;
  color?: SliderColorVariant;
  showSpacing?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
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

/**
 * ParameterSlider
 *
 * A reusable slider component for parameter controls.
 * Wraps Radix UI Slider with consistent styling and labeling.
 */

export function ParameterSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  description,
  color = "emerald",
  showSpacing = false,
  formatValue = (v) => v.toFixed(2),
  onChange,
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
}: ParameterSliderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [showPickupFlash, setShowPickupFlash] = useState(false);
  const prevPickedUpRef = useRef<boolean | undefined>(undefined);

  // Detect when pickup state transitions from not picked up to picked up
  useEffect(() => {
    if (pickupState?.picked_up && prevPickedUpRef.current === false) {
      setShowPickupFlash(true);
      const timer = setTimeout(() => setShowPickupFlash(false), 400);
      return () => clearTimeout(timer);
    }
    prevPickedUpRef.current = pickupState?.picked_up;
  }, [pickupState?.picked_up]);

  const rangeClass = styles[`range${capitalize(color)}`] ?? styles.rangeEmerald;
  const thumbClass = styles[`thumb${capitalize(color)}`] ?? styles.thumbEmerald;
  const disabledClass = isMidiControlled ? styles.disabled : "";

  // Calculate ghost marker position as percentage
  const showGhostMarker = pickupState && !pickupState.picked_up;
  const ghostMarkerPercent = showGhostMarker
    ? ((pickupState.midi_value - min) / (max - min)) * 100
    : 0;

  const handleValueChange = ([next]: number[]) => {
    const newValue = Number.isFinite(next) ? next : value;
    onChange(newValue);
  };

  return (
    <div
      className={`${styles.container} ${showSpacing ? styles.containerSpaced : ""} ${disabledClass}`}
      title={
        isMidiControlled
          ? "Controlled via MIDI - adjust using your MIDI controller"
          : undefined
      }
    >
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.labelText}>
          <span className={styles.label}>{label}</span>
          {showGhostMarker && pickupState.direction && (
            <span
              className={styles.pickupBadge}
              title={`Move ${pickupState.direction} to pick up`}
            >
              <span className={styles.pickupArrow}>
                {pickupState.direction === "right" ? "▸" : "◂"}
              </span>
              pickup
            </span>
          )}
          <span className={styles.value}>{formatValue(value)}</span>
        </label>
        <div className={styles.labelActions}>
          {audioMapping && (
            onUnlinkBeat ? (
              <button
                type="button"
                className={styles.audioMappingBadge}
                style={{
                  backgroundColor: `color-mix(in srgb, ${audioMapping.color} 20%, transparent)`,
                  borderColor: `color-mix(in srgb, ${audioMapping.color} 40%, transparent)`,
                  color: audioMapping.color,
                }}
                title={`Audio mapped: ${audioMapping.sourceLabel} — click to remove`}
                onClick={onUnlinkBeat}
              >
                <span
                  className={styles.audioMappingDot}
                  style={{ backgroundColor: audioMapping.color }}
                />
                {audioMapping.sourceLabel}
              </button>
            ) : (
              <span
                className={styles.audioMappingBadge}
                style={{
                  backgroundColor: `color-mix(in srgb, ${audioMapping.color} 20%, transparent)`,
                  borderColor: `color-mix(in srgb, ${audioMapping.color} 40%, transparent)`,
                  color: audioMapping.color,
                }}
                title={`Audio mapped: ${audioMapping.sourceLabel}`}
              >
                <span
                  className={styles.audioMappingDot}
                  style={{ backgroundColor: audioMapping.color }}
                />
                {audioMapping.sourceLabel}
              </span>
            )
          )}
          {modulationIndicator && (
            onUnlinkLfo ? (
              <button
                type="button"
                className={styles.modulationBadge}
                title={
                  modulationIndicator.count && modulationIndicator.count > 1
                    ? `Modulated by ${modulationIndicator.count} LFOs — click to remove`
                    : `Modulated by ${modulationIndicator.lfoName} — click to remove`
                }
                onClick={onUnlinkLfo}
              >
                <span
                  className={styles.modulationDot}
                  style={{ backgroundColor: MODULATION_INDICATOR_COLOR }}
                />
                LFO
              </button>
            ) : (
              <span
                className={styles.modulationBadge}
                title={
                  modulationIndicator.count && modulationIndicator.count > 1
                    ? `Modulated by ${modulationIndicator.count} LFOs including ${modulationIndicator.lfoName}`
                    : `Modulated by ${modulationIndicator.lfoName}`
                }
              >
                <span
                  className={styles.modulationDot}
                  style={{ backgroundColor: MODULATION_INDICATOR_COLOR }}
                />
                LFO
              </span>
            )
          )}
          {description && (
            <div
              className={styles.infoButtonWrapper}
              onMouseEnter={() => setShowInfo(true)}
              onMouseLeave={() => setShowInfo(false)}
            >
              <button
                type="button"
                className={`${styles.infoButton} ${showInfo ? styles.infoButtonActive : ""}`}
                aria-label={`Info: ${description}`}
              >
                <InfoCircledIcon className={styles.infoIcon} />
              </button>
              {showInfo && (
                <div className={styles.infoPopover} role="tooltip">
                  <p className={styles.infoPopoverText}>{description}</p>
                </div>
              )}
            </div>
          )}
          {onQuickBeat && !audioMapping && (
            <button
              type="button"
              className={styles.quickBeatButton}
              onClick={onQuickBeat}
              title="Quick-wire Beat trigger"
              aria-label="Quick-wire Beat trigger"
            >
              ♩
            </button>
          )}
          {onQuickLfo && !modulationIndicator && (
            <button
              type="button"
              className={styles.quickLfoButton}
              onClick={onQuickLfo}
              title="Quick-wire LFO"
              aria-label="Quick-wire LFO"
            >
              ~
            </button>
          )}
          {midiParameterId && (
            <MidiLearnButton
              parameterId={midiParameterId}
              min={min}
              max={max}
              // compact
            />
          )}
        </div>
      </div>

      <Slider.Root
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={handleValueChange}
        className={`${styles.sliderRoot} ${showPickupFlash ? styles.pickupFlash : ""}`}
        aria-label={ariaLabel ?? label}
        disabled={isMidiControlled}
      >
        <Slider.Track className={styles.sliderTrack}>
          <Slider.Range className={`${styles.sliderRange} ${rangeClass}`} />
        </Slider.Track>
        {showGhostMarker && (
          <div
            className={styles.ghostMarker}
            style={{ left: `${ghostMarkerPercent}%` }}
            aria-hidden="true"
            title={`MIDI position: ${formatValue(pickupState.midi_value)}`}
          />
        )}
        <Slider.Thumb className={`${styles.sliderThumb} ${thumbClass}`} />
      </Slider.Root>
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default ParameterSlider;
