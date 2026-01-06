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

type ColorFormat = "hex" | "rgb" | "hsl";

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
    /* ignore */
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
    /* ignore */
  }
}

function clearColorHistory(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function addToHistory(color: string, history: string[]): string[] {
  const normalizedColor = color.toUpperCase();
  const filtered = history.filter((c) => c.toUpperCase() !== normalizedColor);
  return [normalizedColor, ...filtered].slice(0, MAX_HISTORY_SIZE);
}

function formatColor(color: Color, format: ColorFormat): string {
  switch (format) {
    case "hex":
      return color.toString("hex");
    case "rgb": {
      const rgb = color.toFormat("rgb");
      const r = Math.round(rgb.getChannelValue("red"));
      const g = Math.round(rgb.getChannelValue("green"));
      const b = Math.round(rgb.getChannelValue("blue"));
      return `rgb(${r}, ${g}, ${b})`;
    }
    case "hsl": {
      const hsl = color.toFormat("hsl");
      const h = Math.round(hsl.getChannelValue("hue"));
      const s = Math.round(hsl.getChannelValue("saturation"));
      const l = Math.round(hsl.getChannelValue("lightness"));
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }
}

function formatColorWithAlpha(color: Color, format: ColorFormat): string {
  const alpha = color.getChannelValue("alpha");
  switch (format) {
    case "hex": {
      const hex = color.toString("hex");
      if (alpha < 1) {
        const alphaHex = Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0");
        return hex + alphaHex;
      }
      return hex;
    }
    case "rgb": {
      const rgb = color.toFormat("rgb");
      const r = Math.round(rgb.getChannelValue("red"));
      const g = Math.round(rgb.getChannelValue("green"));
      const b = Math.round(rgb.getChannelValue("blue"));
      if (alpha < 1) {
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`;
      }
      return `rgb(${r}, ${g}, ${b})`;
    }
    case "hsl": {
      const hsl = color.toFormat("hsl");
      const h = Math.round(hsl.getChannelValue("hue"));
      const s = Math.round(hsl.getChannelValue("saturation"));
      const l = Math.round(hsl.getChannelValue("lightness"));
      if (alpha < 1) {
        return `hsla(${h}, ${s}%, ${l}%, ${alpha.toFixed(2)})`;
      }
      return `hsl(${h}, ${s}%, ${l}%)`;
    }
  }
}

function getNextFormat(current: ColorFormat): ColorFormat {
  const formats: ColorFormat[] = ["hex", "rgb", "hsl"];
  const index = formats.indexOf(current);
  return formats[(index + 1) % formats.length];
}

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

function EyeDropperButton() {
  const state = useContext(ColorPickerStateContext);
  if (typeof window === "undefined" || !window.EyeDropper) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label="Pick color from screen"
      onClick={() => {
        new window.EyeDropper!()
          .open()
          .then((result: { sRGBHex: string }) => {
            state?.setColor(parseColor(result.sRGBHex));
          })
          .catch(() => {});
      }}
    >
      <svg
        className={styles.iconSmall}
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

interface CopyButtonProps {
  value: string;
}

function CopyButton({ value }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [value]);

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={copied ? "Copied!" : "Copy color value"}
      onClick={handleCopy}
    >
      {copied ? (
        <svg
          className={styles.iconSmall}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          className={styles.iconSmall}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </button>
  );
}

interface PasteButtonProps {
  onPaste: (value: string) => void;
}

function PasteButton({ onPaste }: PasteButtonProps) {
  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onPaste(text.trim());
      }
    } catch {
      /* ignore */
    }
  }, [onPaste]);

  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return null;
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label="Paste color from clipboard"
      onClick={handlePaste}
    >
      <svg
        className={styles.iconSmall}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      </svg>
    </button>
  );
}

interface FormatToggleProps {
  format: ColorFormat;
  onToggle: () => void;
}

function FormatToggle({ format, onToggle }: FormatToggleProps) {
  return (
    <button
      type="button"
      className={styles.formatToggle}
      aria-label={`Color format: ${format.toUpperCase()}. Click to change.`}
      onClick={onToggle}
    >
      {format.toUpperCase()}
    </button>
  );
}

interface ClearHistoryButtonProps {
  onClear: () => void;
}

function ClearHistoryButton({ onClear }: ClearHistoryButtonProps) {
  return (
    <button
      type="button"
      className={styles.clearHistoryButton}
      aria-label="Clear color history"
      onClick={onClear}
    >
      <svg
        className={styles.iconTiny}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    </button>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
  swatches = [],
  showAlpha = false,
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
  const [format, setFormat] = useState<ColorFormat>("hex");
  const lastCommittedValue = useRef(value);

  useEffect(() => {
    try {
      const newColor = parseColor(value);
      if (newColor.toString("hex") !== color.toString("hex")) {
        setColor(newColor);
      }
    } catch {
      /* ignore */
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
      const newHistory = addToHistory(hex, history);
      setHistory(newHistory);
      saveColorHistory(newHistory);
    }
  }, [color, history]);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    clearColorHistory();
  }, []);

  const handleToggleFormat = useCallback(() => {
    setFormat((prev) => getNextFormat(prev));
  }, []);

  const handlePasteColor = useCallback(
    (text: string) => {
      try {
        const parsedColor = parseColor(text);
        handleColorChange(parsedColor);
        handleColorChangeEnd();
      } catch {
        /* ignore */
      }
    },
    [handleColorChange, handleColorChangeEnd],
  );

  const displayValue = showAlpha
    ? formatColorWithAlpha(color, format)
    : formatColor(color, format);

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

            {showAlpha && (
              <ColorSlider channel="alpha" onChangeEnd={handleColorChangeEnd}>
                <SliderTrack className={styles.alphaSliderTrack}>
                  <ColorThumb
                    className={`${styles.colorThumb} ${styles.colorThumbSlider}`}
                  />
                </SliderTrack>
              </ColorSlider>
            )}

            <div className={styles.content}>
              <ColorField className={styles.field}>
                <div className={styles.labelRow}>
                  <Label className={styles.label}>Color</Label>
                  <FormatToggle format={format} onToggle={handleToggleFormat} />
                </div>
                <div className={styles.fieldRow}>
                  <Input
                    className={styles.input}
                    onBlur={handleColorChangeEnd}
                    value={format === "hex" ? undefined : displayValue}
                    readOnly={format !== "hex"}
                  />
                  <CopyButton value={displayValue} />
                  <PasteButton onPaste={handlePasteColor} />
                  <EyeDropperButton />
                </div>
              </ColorField>

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

              {history.length > 0 && (
                <div className={styles.swatchSection}>
                  <div className={styles.swatchLabelRow}>
                    <span className={styles.swatchLabel}>Recent</span>
                    <ClearHistoryButton onClear={handleClearHistory} />
                  </div>
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
