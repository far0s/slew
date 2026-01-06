import { useState, useEffect } from "react";
import { ResetIcon } from "@radix-ui/react-icons";
import { ColorPicker } from "../ColorPicker";
import styles from "./ColorPalette.module.css";

export interface ColorPaletteProps {
  startColor: [number, number, number];
  midColor: [number, number, number];
  endColor: [number, number, number];
  background?: [number, number, number, number];
  defaultStartColor?: [number, number, number];
  defaultMidColor?: [number, number, number];
  defaultEndColor?: [number, number, number];
  defaultBackground?: [number, number, number, number];
  onStartColorChange?: (color: [number, number, number]) => void;
  onMidColorChange?: (color: [number, number, number]) => void;
  onEndColorChange?: (color: [number, number, number]) => void;
  onBackgroundChange?: (color: [number, number, number, number]) => void;
  onReset?: () => void;
  onBackgroundReset?: () => void;
}

/**
 * Convert normalized RGB (0-1) to hex color string
 */
function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Convert normalized RGBA (0-1) to hex color string (ignoring alpha for color picker)
 */
function rgbaToHex(rgba: [number, number, number, number]): string {
  return rgbToHex([rgba[0], rgba[1], rgba[2]]);
}

/**
 * Convert hex color string to normalized RGB (0-1)
 */
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}

/**
 * Convert hex color string to normalized RGBA (0-1), preserving existing alpha
 */
function hexToRgba(
  hex: string,
  existingAlpha: number = 1,
): [number, number, number, number] {
  const rgb = hexToRgb(hex);
  return [rgb[0], rgb[1], rgb[2], existingAlpha];
}

/**
 * Check if two RGB colors are equal (within small tolerance for floating point)
 */
function colorsEqual(
  a: [number, number, number],
  b: [number, number, number],
): boolean {
  const tolerance = 0.001;
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance
  );
}

/**
 * Check if two RGBA colors are equal (within small tolerance for floating point)
 */
function colorsEqualRgba(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  const tolerance = 0.001;
  return (
    Math.abs(a[0] - b[0]) < tolerance &&
    Math.abs(a[1] - b[1]) < tolerance &&
    Math.abs(a[2] - b[2]) < tolerance &&
    Math.abs(a[3] - b[3]) < tolerance
  );
}

export function ColorPalette({
  startColor,
  midColor,
  endColor,
  background,
  defaultStartColor,
  defaultMidColor,
  defaultEndColor,
  defaultBackground,
  onStartColorChange,
  onMidColorChange,
  onEndColorChange,
  onBackgroundChange,
  onReset,
  onBackgroundReset,
}: ColorPaletteProps) {
  // Build palette swatches from the current colors only
  const paletteSwatches = [
    rgbToHex(startColor),
    rgbToHex(midColor),
    rgbToHex(endColor),
    ...(background ? [rgbaToHex(background)] : []),
  ];

  // Deduplicate swatches (case-insensitive)
  const uniqueSwatches = paletteSwatches.reduce<string[]>((acc, swatch) => {
    const normalized = swatch.toUpperCase();
    if (!acc.some((s) => s.toUpperCase() === normalized)) {
      acc.push(swatch);
    }
    return acc;
  }, []);

  const [startHex, setStartHex] = useState(rgbToHex(startColor));

  const [midHex, setMidHex] = useState(rgbToHex(midColor));
  const [endHex, setEndHex] = useState(rgbToHex(endColor));
  const [backgroundHex, setBackgroundHex] = useState(
    background ? rgbaToHex(background) : "#000000",
  );

  // Update local state when props change
  useEffect(() => {
    setStartHex(rgbToHex(startColor));
  }, [startColor]);

  useEffect(() => {
    setMidHex(rgbToHex(midColor));
  }, [midColor]);

  useEffect(() => {
    setEndHex(rgbToHex(endColor));
  }, [endColor]);

  useEffect(() => {
    if (background) {
      setBackgroundHex(rgbaToHex(background));
    }
  }, [background]);

  const handleStartColorChange = (hex: string) => {
    setStartHex(hex);
    if (onStartColorChange) {
      onStartColorChange(hexToRgb(hex));
    }
  };

  const handleMidColorChange = (hex: string) => {
    setMidHex(hex);
    if (onMidColorChange) {
      onMidColorChange(hexToRgb(hex));
    }
  };

  const handleEndColorChange = (hex: string) => {
    setEndHex(hex);
    if (onEndColorChange) {
      onEndColorChange(hexToRgb(hex));
    }
  };

  const handleBackgroundChange = (hex: string) => {
    setBackgroundHex(hex);
    if (onBackgroundChange && background) {
      // Preserve existing alpha when changing color
      onBackgroundChange(hexToRgba(hex, background[3]));
    }
  };

  // Check if any colors differ from defaults
  const hasColorChanges =
    (defaultStartColor && !colorsEqual(startColor, defaultStartColor)) ||
    (defaultMidColor && !colorsEqual(midColor, defaultMidColor)) ||
    (defaultEndColor && !colorsEqual(endColor, defaultEndColor));

  const hasBackgroundChanges =
    background &&
    defaultBackground &&
    !colorsEqualRgba(background, defaultBackground);

  const handleReset = () => {
    if (onReset) {
      onReset();
    }
  };

  const handleBackgroundReset = () => {
    if (onBackgroundReset) {
      onBackgroundReset();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        {/* Colors section - 50% */}
        <div className={styles.section}>
          <div className={styles.label}>Colors</div>
          <div className={styles.palette}>
            <ColorPicker
              value={startHex}
              onChange={handleStartColorChange}
              label="Start color"
              swatches={uniqueSwatches}
            />
            <ColorPicker
              value={midHex}
              onChange={handleMidColorChange}
              label="Mid color"
              swatches={uniqueSwatches}
            />
            <ColorPicker
              value={endHex}
              onChange={handleEndColorChange}
              label="End color"
              swatches={uniqueSwatches}
            />
            {hasColorChanges && (
              <button
                type="button"
                className={styles.resetButton}
                onClick={handleReset}
                title="Reset to default colors"
                aria-label="Reset colors to default"
              >
                <ResetIcon className={styles.resetIcon} />
              </button>
            )}
          </div>
        </div>

        {/* Background section - 50% */}
        {background && (
          <div className={styles.section}>
            <div className={styles.label}>Background</div>
            <div className={styles.palette}>
              <ColorPicker
                value={backgroundHex}
                onChange={handleBackgroundChange}
                label="Background color"
                swatches={uniqueSwatches}
              />
              {hasBackgroundChanges && (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={handleBackgroundReset}
                  title="Reset to default background"
                  aria-label="Reset background to default"
                >
                  <ResetIcon className={styles.resetIcon} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ColorPalette;
