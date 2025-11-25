import * as Slider from "@radix-ui/react-slider";
import { MidiLearnButton } from "../controls/MidiLearnButton";
import styles from "./ParameterSlider.module.css";

export type SliderColorVariant =
  | "emerald"
  | "indigo"
  | "cyan"
  | "amber"
  | "sky";

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
  /** Optional: Parameter ID for MIDI Learn. If provided, shows a Learn button. */
  midiParameterId?: string;
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
}: ParameterSliderProps) {
  const rangeClass = styles[`range${capitalize(color)}`] ?? styles.rangeEmerald;
  const thumbClass = styles[`thumb${capitalize(color)}`] ?? styles.thumbEmerald;

  const handleValueChange = ([next]: number[]) => {
    const newValue = Number.isFinite(next) ? next : value;
    onChange(newValue);
  };

  return (
    <div
      className={`${styles.container} ${showSpacing ? styles.containerSpaced : ""}`}
    >
      <div className={styles.labelRow}>
        <label htmlFor={id} className={styles.labelText}>
          <span className={styles.label}>{label}</span>
          <span className={styles.value}>{formatValue(value)}</span>
        </label>
        {midiParameterId && (
          <MidiLearnButton parameterId={midiParameterId} compact />
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
