import * as Select from "@radix-ui/react-select";
import { ChevronDownIcon, CheckIcon } from "@radix-ui/react-icons";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { MODULATION_INDICATOR_COLOR, type LfoShape } from "../../inputs/modulation";
import { LfoShapeIcon } from "../ModulationPanel/LfoShapeIcon";
import styles from "./ParameterSelect.module.css";

/**
 * Audio mapping indicator info for display on the select.
 */
export interface AudioMappingIndicator {
  /** Short label for the audio source (e.g., "Bass", "RMS") */
  sourceLabel: string;
  /** CSS color value for the indicator */
  color: string;
}

/**
 * Modulation indicator info for display on the select.
 */
export interface ModulationIndicator {
  /** Name of the LFO source */
  lfoName: string;
  /** Shape of the first (or only) modulating LFO */
  lfoShape?: LfoShape;
  /** Optional: number of LFOs modulating this parameter (for tooltip) */
  count?: number;
}

export interface ParameterSelectProps {
  id: string;
  label: string;
  value: number;
  options: Array<{ value: number; label: string }>;
  description?: string;
  showSpacing?: boolean;
  onChange: (value: number) => void;
  "aria-label"?: string;
  audioMapping?: AudioMappingIndicator | null;
  modulationIndicator?: ModulationIndicator | null;
  isMidiControlled?: boolean;
  onQuickBeat?: () => void;
  onQuickLfo?: () => void;
  onUnlinkBeat?: () => void;
  onUnlinkLfo?: () => void;
}

/**
 * ParameterSelect
 *
 * A reusable select dropdown component for parameter controls.
 * Wraps Radix UI Select with consistent styling and labeling.
 */
export function ParameterSelect({
  id,
  label,
  value,
  options,
  description,
  showSpacing = false,
  onChange,
  "aria-label": ariaLabel,
  audioMapping,
  modulationIndicator,
  isMidiControlled = false,
  onQuickBeat,
  onQuickLfo,
  onUnlinkBeat,
  onUnlinkLfo,
}: ParameterSelectProps) {
  const [showInfo, setShowInfo] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption?.label ?? value.toString();

  const containerClassName = [
    styles.container,
    showSpacing && styles.containerSpaced,
    isMidiControlled && styles.disabled,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClassName}>
      <div className={styles.labelRow}>
        <div className={styles.labelText}>
          <span className={styles.label}>{label}</span>
        </div>

        <div className={styles.labelActions}>
          {/* Audio mapping badge */}
          {audioMapping && !isMidiControlled && (
            onUnlinkBeat ? (
              <button
                type="button"
                className={styles.audioMappingBadge}
                style={{
                  borderColor: `color-mix(in srgb, ${audioMapping.color} 40%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${audioMapping.color} 20%, transparent)`,
                  color: audioMapping.color,
                }}
                title={`Audio-mapped to ${audioMapping.sourceLabel} — click to remove`}
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
                  borderColor: `color-mix(in srgb, ${audioMapping.color} 40%, transparent)`,
                  backgroundColor: `color-mix(in srgb, ${audioMapping.color} 20%, transparent)`,
                  color: audioMapping.color,
                }}
                title={`Audio-mapped to ${audioMapping.sourceLabel}`}
              >
                <span
                  className={styles.audioMappingDot}
                  style={{ backgroundColor: audioMapping.color }}
                />
                {audioMapping.sourceLabel}
              </span>
            )
          )}

          {/* Modulation badge */}
          {modulationIndicator && !audioMapping && !isMidiControlled && (
            onUnlinkLfo ? (
              <button
                type="button"
                className={styles.modulationBadge}
                title={`Modulated by ${modulationIndicator.lfoName}${modulationIndicator.count && modulationIndicator.count > 1 ? ` (+${modulationIndicator.count - 1} more)` : ""} — click to remove`}
                onClick={onUnlinkLfo}
              >
                {modulationIndicator.lfoShape ? (
                  <LfoShapeIcon shape={modulationIndicator.lfoShape} width={14} />
                ) : (
                  <span
                    className={styles.modulationDot}
                    style={{ backgroundColor: MODULATION_INDICATOR_COLOR }}
                  />
                )}
              </button>
            ) : (
              <span
                className={styles.modulationBadge}
                title={`Modulated by ${modulationIndicator.lfoName}${modulationIndicator.count && modulationIndicator.count > 1 ? ` (+${modulationIndicator.count - 1} more)` : ""}`}
              >
                {modulationIndicator.lfoShape ? (
                  <LfoShapeIcon shape={modulationIndicator.lfoShape} width={14} />
                ) : (
                  <span
                    className={styles.modulationDot}
                    style={{ backgroundColor: MODULATION_INDICATOR_COLOR }}
                  />
                )}
              </span>
            )
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
          {/* Info button with description popover */}
          {description && (
            <div className={styles.infoButtonWrapper}>
              <button
                type="button"
                className={`${styles.infoButton} ${showInfo ? styles.infoButtonActive : ""}`}
                onClick={() => setShowInfo(!showInfo)}
                onBlur={() => setShowInfo(false)}
                aria-label={`Info for ${label}`}
              >
                <InfoCircledIcon className={styles.infoIcon} />
              </button>
              {showInfo && (
                <div className={styles.infoPopover}>
                  <p className={styles.infoPopoverText}>{description}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Select.Root
        value={value.toString()}
        onValueChange={(v) => {
          if (!isMidiControlled) {
            onChange(Number(v));
          }
        }}
        disabled={isMidiControlled}
      >
        <Select.Trigger
          className={styles.selectTrigger}
          aria-label={ariaLabel ?? label}
          id={id}
        >
          <Select.Value>{displayValue}</Select.Value>
          <Select.Icon className={styles.selectIcon}>
            <ChevronDownIcon />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className={styles.selectContent}
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport className={styles.selectViewport}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value.toString()}
                  className={styles.selectItem}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className={styles.selectItemIndicator}>
                    <CheckIcon />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export default ParameterSelect;
