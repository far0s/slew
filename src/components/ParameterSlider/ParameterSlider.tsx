import * as Slider from "@radix-ui/react-slider";
import { MidiLearnButton } from "../MidiLearnButton";
import { MODULATION_INDICATOR_COLOR } from "../../inputs/modulation";
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
}: ParameterSliderProps) {
  const rangeClass = styles[`range${capitalize(color)}`] ?? styles.rangeEmerald;
  const thumbClass = styles[`thumb${capitalize(color)}`] ?? styles.thumbEmerald;
  const disabledClass = isMidiControlled ? styles.disabled : "";

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
          {audioMapping && (
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
          )}
          {modulationIndicator && (
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
          )}
          <span className={styles.value}>{formatValue(value)}</span>
        </label>
        {midiParameterId && (
          <MidiLearnButton
            parameterId={midiParameterId}
            min={min}
            max={max}
            compact
          />
        )}
      </div>

      <Slider.Root
        id={id}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={handleValueChange}
        className={styles.sliderRoot}
        aria-label={ariaLabel ?? label}
        disabled={isMidiControlled}
      >
        <Slider.Track className={styles.sliderTrack}>
          <Slider.Range className={`${styles.sliderRange} ${rangeClass}`} />
        </Slider.Track>
        <Slider.Thumb className={`${styles.sliderThumb} ${thumbClass}`} />
      </Slider.Root>

      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default ParameterSlider;
