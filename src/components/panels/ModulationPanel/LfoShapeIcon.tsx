/**
 * LfoShapeIcon
 *
 * Static, hand-crafted SVG glyphs for each LFO waveform shape.
 * Zero animation overhead — intended for lists, selectors, labels.
 * Use WaveformDisplay for an animated live-value preview.
 *
 * ViewBox is 0 0 32 24 (4:3 aspect ratio).
 */

import type { LfoShape } from "@/inputs/modulation";

/**
 * SVG path data for each shape, designed for viewBox "0 0 32 24".
 * Exported so SVG-only contexts (e.g. ModulationMap) can use paths directly.
 */
export const LFO_SHAPE_PATHS: Record<LfoShape, string> = {
  // One smooth sine cycle, Y range ~4–20
  sine: "M 0 12 C 4 2 12 2 16 12 C 20 22 28 22 32 12",

  // Two sharp triangle peaks
  triangle: "M 0 20 L 8 4 L 16 20 L 24 4 L 32 20",

  // Sawtooth: ramp up, instant drop, ramp up
  saw: "M 0 20 L 16 4 L 16 20 L 32 4",

  // Square wave: high for first half, low for second
  square: "M 0 4 H 16 V 20 H 32",

  // Sample-and-hold: stepped random levels
  random: "M 0 7 H 7 V 16 H 12 V 5 H 19 V 14 H 25 V 9 H 32",

  // Smooth random: irregular wiggly curve
  smooth_random: "M 0 12 C 3 3 7 3 11 14 C 15 22 18 22 22 13 C 25 4 29 4 32 12",
};

interface LfoShapeIconProps {
  shape: LfoShape;
  /** Stroke colour — defaults to currentColor so it inherits from CSS */
  color?: string;
  /** Icon width in px. Height is always width × 0.75 (4:3). */
  width?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export function LfoShapeIcon({
  shape,
  color = "currentColor",
  width = 32,
  className,
  "aria-hidden": ariaHidden = true,
}: LfoShapeIconProps) {
  const height = Math.round(width * 0.75); // 4:3

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 24"
      fill="none"
      className={className}
      aria-hidden={ariaHidden}
      style={{ display: "block", flexShrink: 0 }}
    >
      <path
        d={LFO_SHAPE_PATHS[shape]}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
