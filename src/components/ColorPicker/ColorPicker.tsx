import { useState, useEffect, useCallback, useRef, useContext } from "react";
import {
  Button,
  ColorArea,
  ColorField,
  ColorPicker as AriaColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorSwatchPicker,
  ColorSwatchPickerItem,
  ColorThumb,
  Dialog,
  DialogTrigger,
  Input,
  Label,
  Popover,
  SliderTrack,
  ColorPickerStateContext,
  parseColor,
  type Color,
} from "react-aria-components";
import styles from "./ColorPicker.module.css";

const HISTORY_STORAGE_KEY = "slew-color-history";
const MAX_HISTORY_SIZE = 5;

export interface ColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  label?: string;
  swatches?: string[];
  showAlpha?: boolean;
  disabled?: boolean;
}

function loadColorHistory(): string[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_HISTORY_SIZE);
      }
    }
  } catch {
    // Ignore localStorage errors
  }
  return [];
}

function saveColorHistory(history: string[]): void {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY_SIZE)),
    );
  } catch {
    // Ignore localStorage errors
  }
}

function addToHistory(color: string, history: string[]): string[] {
  const normalizedColor = color.toUpperCase();
  const filtered = history.filter((c) => c.toUpperCase() !== normalizedColor);
  return [normalizedColor, ...filtered].slice(0, MAX_HISTORY_SIZE);
}

// EyeDropper API type declaration (not yet in TypeScript lib)
declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

function EyeDropperButton() {
  const state = useContext(ColorPickerStateContext);

  // Check browser support
  if (typeof window === "undefined" || !window.EyeDropper) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.eyeDropperButton}
      aria-label="Pick color from screen"
      onClick={() => {
        new window.EyeDropper!()
          .open()
          .then((result: { sRGBHex: string }) => {
            state?.setColor(parseColor(result.sRGBHex));
          })
          .catch(() => {
            // User cancelled or error occurred
          });
      }}
    >
      <svg
        className={styles.eyeDropperIcon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m2 22 1-1h3l9-9" />
        <path d="M3 21v-3l9-9" />
        <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
      </svg>
    </button>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
  swatches = [],
  disabled = false,
}: ColorPickerProps) {
  const [color, setColor] = useState<Color>(() => {
    try {
      return parseColor(value);
    } catch {
      return parseColor("#000000");
    }
  });
  const [history, setHistory] = useState<string[]>(loadColorHistory);
  const lastCommittedValue = useRef(value);

  // Sync internal state when external value changes
  useEffect(() => {
    try {
      const newColor = parseColor(value);
      // Only update if the value actually changed (avoid loops)
      if (newColor.toString("hex") !== color.toString("hex")) {
        setColor(newColor);
      }
    } catch {
      // Invalid color, ignore
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleColorChange = useCallback(
    (newColor: Color) => {
      setColor(newColor);
      const hex = newColor.toString("hex");
      onChange(hex);
    },
    [onChange],
  );

  const handleColorChangeEnd = useCallback(() => {
    const hex = color.toString("hex");
    if (hex !== lastCommittedValue.current) {
      lastCommittedValue.current = hex;
      // Add to history when user commits a color
      const newHistory = addToHistory(hex, history);
      setHistory(newHistory);
      saveColorHistory(newHistory);
    }
  }, [color, history]);

  return (
    <AriaColorPicker value={color} onChange={handleColorChange}>
      <DialogTrigger>
        <Button
          className={styles.trigger}
          isDisabled={disabled}
          aria-label={label || "Choose color"}
        >
          <ColorSwatch className={styles.swatch} />
        </Button>
        <Popover placement="bottom start" className={styles.popover}>
          <Dialog className={styles.dialog}>
            {/* Color Area + Hue Slider */}
            <ColorArea
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
              className={styles.colorArea}
              onChangeEnd={handleColorChangeEnd}
            >
              <ColorThumb className={styles.colorThumb} />
            </ColorArea>
            <ColorSlider
              colorSpace="hsb"
              channel="hue"
              onChangeEnd={handleColorChangeEnd}
            >
              <SliderTrack className={styles.sliderTrack}>
                <ColorThumb
                  className={`${styles.colorThumb} ${styles.colorThumbSlider}`}
                />
              </SliderTrack>
            </ColorSlider>

            <div className={styles.content}>
              {/* Hex Input */}
              <ColorField className={styles.field}>
                <Label className={styles.label}>Hex</Label>
                <div className={styles.fieldRow}>
                  <Input
                    className={styles.input}
                    onBlur={handleColorChangeEnd}
                  />
                  <EyeDropperButton />
                </div>
              </ColorField>

              {/* Preset Swatches */}
              {swatches.length > 0 && (
                <div className={styles.swatchSection}>
                  <span className={styles.swatchLabel}>Presets</span>
                  <ColorSwatchPicker
                    className={styles.swatchPicker}
                    onChange={handleColorChangeEnd}
                  >
                    {swatches.map((swatch) => (
                      <ColorSwatchPickerItem
                        key={swatch}
                        color={swatch}
                        className={styles.swatchPickerItem}
                      >
                        <ColorSwatch className={styles.swatchInner} />
                      </ColorSwatchPickerItem>
                    ))}
                  </ColorSwatchPicker>
                </div>
              )}

              {/* History Swatches */}
              {history.length > 0 && (
                <div className={styles.swatchSection}>
                  <span className={styles.swatchLabel}>Recent</span>
                  <ColorSwatchPicker
                    className={styles.swatchPicker}
                    onChange={handleColorChangeEnd}
                  >
                    {history.map((historyColor) => (
                      <ColorSwatchPickerItem
                        key={historyColor}
                        color={historyColor}
                        className={styles.swatchPickerItem}
                      >
                        <ColorSwatch className={styles.swatchInner} />
                      </ColorSwatchPickerItem>
                    ))}
                  </ColorSwatchPicker>
                </div>
              )}
            </div>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </AriaColorPicker>
  );
}

export default ColorPicker;
