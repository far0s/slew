import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import * as Select from "@radix-ui/react-select";
import {
  ChevronDownIcon,
  Cross2Icon,
  PlusIcon,
  CopyIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { motion } from "motion/react";
import type { SketchId, SketchProps } from "../../sketches";
import {
  SKETCH_REGISTRY,
  ALL_SKETCH_IDS,
  SKETCH_COMPONENT_REGISTRY,
  getSketchDescriptor,
} from "../../sketches";
import type { Slot } from "../../scenes/useSceneSlots";
import { SceneParameterControls } from "../SceneParameterControls";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping } from "../../inputs/midi";
import styles from "./SceneColumn.module.css";

/**
 * Props for the SceneColumn component.
 *
 * @property slotIndex - Slot index (0-based)
 * @property sketchId - Sketch ID loaded in this slot, or null if empty
 * @property isActive - Whether this slot is the active (output) slot
 * @property isCrossfadeTarget - Whether this slot is the crossfade target
 * @property crossfadeProgress - Current crossfade progress (0-100) for this slot
 * @property isCrossfading - Whether crossfade is in progress
 * @property isMacropadSelected - Whether this slot is selected via macropad (keys 1-4)
 * @property excludeSketchIds - Sketch IDs to exclude from dropdown (already in use)
 * @property canRemove - Whether the slot can be removed
 * @property params - Scene params for controls (target values)
 * @property previewParams - Scene params for preview rendering (interpolated values for smooth animation)
 * @property alpha - Slot alpha (master opacity) value for preview rendering
 * @property getValue - Get parameter value for controls
 * @property setValue - Set parameter value for controls
 * @property audioMappings - Optional audio mappings for parameter indicators
 * @property modulationTargets - Optional modulation targets for parameter indicators
 * @property lfos - Optional LFO sources (for modulation indicator labels)
 * @property midiMappings - Optional MIDI mappings to disable direct input for mapped controls
 * @property onSketchChange - Callback when sketch selection changes
 * @property onCrossfade - Callback when crossfade button is clicked
 * @property onRemove - Callback when remove button is clicked (clears the slot)
 * @property filledSlots - All slots with sketches (for copy-from feature)
 * @property onCopyToSlot - Callback to copy from another slot
 */
export interface SceneColumnProps {
  slotIndex: number;
  sketchId: SketchId | null;
  isActive: boolean;
  isCrossfadeTarget: boolean;
  crossfadeProgress: number;
  isCrossfading: boolean;
  isMacropadSelected?: boolean;
  excludeSketchIds: SketchId[];
  canRemove: boolean;
  params?: SketchProps["params"];
  previewParams?: SketchProps["params"];
  alpha?: number;
  audioReactivity?: number;
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  modulationTargets?: ModulationTarget[];
  lfos?: LfoSource[];
  midiMappings?: MidiMapping[];
  filledSlots?: Array<Slot & { sketchId: SketchId }>;
  onSketchChange: (sketchId: SketchId) => void;
  onCrossfade: () => void;
  onRemove: () => void;
  onCopyToSlot?: (sourceSlotIndex: number) => void;
}

/**
 * Get display label for a sketch ID.
 */
function getSketchLabel(sketchId: SketchId): string {
  const descriptor = SKETCH_REGISTRY.find((s) => s.id === sketchId);
  return descriptor?.shortLabel ?? sketchId;
}

/**
 * InlineSketchBrowser
 *
 * Displayed directly in empty slots - shows all available sketches
 * and copy-from options without requiring an extra click.
 */
function InlineSketchBrowser({
  slotIndex,
  filledSlots,
  onSelectSketch,
  onCopySlot,
}: {
  slotIndex: number;
  filledSlots: Array<Slot & { sketchId: SketchId }>;
  onSelectSketch: (sketchId: SketchId) => void;
  onCopySlot?: (sourceSlotIndex: number) => void;
}) {
  const displayNumber = slotIndex + 1;

  const handleSelectSketch = useCallback(
    (sketchId: SketchId) => {
      onSelectSketch(sketchId);
    },
    [onSelectSketch],
  );

  return (
    <motion.article
      className={styles.emptyColumn}
      aria-label={`Slot ${displayNumber} - choose a sketch`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
    >
      {/* Header with slot number */}
      <div className={styles.inlineBrowserHeader}>
        <div className={styles.inlineSlotBadge}>{displayNumber}</div>
        <span className={styles.inlineBrowserTitle}>Choose a sketch</span>
      </div>

      {/* Sketch list */}
      <div className={styles.inlineSketchList}>
        {SKETCH_REGISTRY.map((descriptor) => (
          <button
            key={descriptor.id}
            type="button"
            className={styles.inlineSketchItem}
            onClick={() => handleSelectSketch(descriptor.id as SketchId)}
            aria-label={`Add ${descriptor.label} to slot ${displayNumber}`}
          >
            <PlusIcon className={styles.inlineSketchItemIcon} />
            <span className={styles.inlineSketchItemLabel}>
              {descriptor.shortLabel}
            </span>
          </button>
        ))}
      </div>

      {/* Copy from slot section */}
      {filledSlots.length > 0 && onCopySlot && (
        <div className={styles.inlineCopySection}>
          <span className={styles.inlineCopySectionLabel}>Or copy from</span>
          <div className={styles.inlineCopyOptions}>
            {filledSlots.map((slot) => {
              const sketchLabel =
                getSketchDescriptor(slot.sketchId)?.shortLabel ?? slot.sketchId;
              return (
                <button
                  key={`copy-${slot.index}`}
                  type="button"
                  className={styles.inlineCopyButton}
                  onClick={() => onCopySlot(slot.index)}
                  aria-label={`Copy from slot ${slot.index + 1}`}
                >
                  <CopyIcon className={styles.inlineCopyIcon} />
                  <span className={styles.inlineCopySlotNumber}>
                    {slot.index + 1}
                  </span>
                  <span className={styles.inlineCopySketchName}>
                    {sketchLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </motion.article>
  );
}

/**
 * SceneColumn
 *
 * A single column in the scene management UI containing:
 * - Scene preview (16:9 canvas) with overlay controls
 * - Scene selector dropdown (bottom-left of preview)
 * - Crossfade/Active button (bottom-right of preview)
 * - Remove button (bottom-right of preview, next to crossfade)
 * - Auto-generated parameter controls below
 *
 * If sketchId is null, renders InlineSketchBrowser instead.
 */
export function SceneColumn({
  slotIndex,
  sketchId,
  isActive,
  isCrossfadeTarget,
  crossfadeProgress,
  isCrossfading,
  isMacropadSelected = false,
  excludeSketchIds,
  canRemove,
  params,
  previewParams,
  alpha = 1,
  audioReactivity = 1,
  getValue,
  setValue,
  audioMappings,
  modulationTargets,
  lfos,
  midiMappings,
  onSketchChange,
  onCrossfade,
  onRemove,
  filledSlots = [],
  onCopyToSlot,
}: SceneColumnProps) {
  // If no sketch loaded, render inline browser
  if (sketchId === null) {
    return (
      <InlineSketchBrowser
        slotIndex={slotIndex}
        filledSlots={filledSlots}
        onSelectSketch={onSketchChange}
        onCopySlot={onCopyToSlot}
      />
    );
  }

  const SketchComponent = SKETCH_COMPONENT_REGISTRY[sketchId];
  const displayLabel = getSketchLabel(sketchId);
  const displayNumber = slotIndex + 1;

  // Filter available options (exclude sketches in other slots)
  const availableOptions = ALL_SKETCH_IDS.filter(
    (id) => id === sketchId || !excludeSketchIds.includes(id),
  );

  // Determine button state and label
  const isSelectDisabled = isActive || isCrossfading;
  const isCrossfadeDisabled = isActive || isCrossfading;

  // Crossfade button label integrates the status
  let crossfadeButtonLabel: string;
  if (isActive && !isCrossfading) {
    crossfadeButtonLabel = "Active";
  } else if (isActive && isCrossfading) {
    crossfadeButtonLabel = `${Math.round(100 - crossfadeProgress)}%`;
  } else if (isCrossfadeTarget && isCrossfading) {
    crossfadeButtonLabel = `${Math.round(crossfadeProgress)}%`;
  } else {
    crossfadeButtonLabel = "Crossfade";
  }

  // Show remove button only if allowed and not active
  const showRemoveButton = canRemove && !isActive;

  // Build column class names
  const columnClassNames = [
    styles.column,
    isActive && styles.activeColumn,
    isMacropadSelected && !isActive && styles.macropadSelected,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.article
      className={columnClassNames}
      aria-label={`Slot ${displayNumber}${isMacropadSelected ? " (macropad selected)" : ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
    >
      {/* Preview Canvas with overlay controls */}
      <div className={styles.previewContainer}>
        {SketchComponent ? (
          <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
            <Canvas
              className={styles.canvas}
              camera={{ position: [0, 0, 4], fov: 50 }}
              dpr={[1, 1.5]}
              frameloop="always"
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "low-power",
              }}
            >
              <color attach="background" args={["#020617"]} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[4, 6, 3]} intensity={1.1} />
              <directionalLight position={[-4, -4, -2]} intensity={0.4} />
              <SketchComponent opacity={1} params={previewParams ?? params} />
            </Canvas>
            {/* Alpha and mute indicator overlay (top-right) */}
            {(alpha < 0.99 || audioReactivity < 0.5) && (
              <div className={styles.alphaOverlay}>
                {audioReactivity < 0.5 && (
                  <span className={styles.mutedIndicator} title="Audio muted">
                    <SpeakerOffIcon />
                  </span>
                )}
                {alpha < 0.99 && (
                  <span className={styles.alphaValue}>
                    {Math.round(alpha * 100)}%
                  </span>
                )}
              </div>
            )}
          </Suspense>
        ) : (
          <div className={styles.fallback}>Unknown sketch: {sketchId}</div>
        )}

        {/* Slot number badge (top-left) - highlight when macropad selected */}
        <div
          className={`${styles.slotBadge} ${isMacropadSelected ? styles.slotBadgeSelected : ""}`}
        >
          {displayNumber}
          {isMacropadSelected && (
            <span className={styles.macropadIndicator}>⎈</span>
          )}
        </div>

        {/* Bottom overlay with sketch selector, crossfade button, and remove button */}
        <div className={styles.bottomOverlay}>
          {/* Sketch selector (left half) */}
          <div className={styles.selectorWrapper}>
            <Select.Root
              value={sketchId}
              disabled={isSelectDisabled}
              onValueChange={(v) => onSketchChange(v as SketchId)}
            >
              <Select.Trigger
                className={styles.selectTrigger}
                aria-label={`Slot ${displayNumber} sketch selection`}
              >
                <Select.Value>{displayLabel}</Select.Value>
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
                    {availableOptions.map((option) => (
                      <Select.Item
                        key={option}
                        value={option}
                        className={styles.selectItem}
                      >
                        <Select.ItemText>
                          {getSketchLabel(option)}
                        </Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>

          {/* Right side: crossfade button + optional remove button */}
          <div className={styles.actionsWrapper}>
            <button
              type="button"
              className={`${styles.crossfadeButton} ${isActive ? styles.crossfadeActive : ""} ${isCrossfadeTarget ? styles.crossfadeTarget : ""}`}
              onClick={onCrossfade}
              disabled={isCrossfadeDisabled}
            >
              {crossfadeButtonLabel}
            </button>

            {showRemoveButton && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={onRemove}
                aria-label={`Remove slot ${displayNumber}`}
              >
                <Cross2Icon />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Parameter Controls */}
      <div className={styles.controls}>
        <SceneParameterControls
          slotIndex={slotIndex}
          sketchId={sketchId}
          getValue={getValue}
          setValue={setValue}
          audioMappings={audioMappings}
          modulationTargets={modulationTargets}
          lfos={lfos}
          midiMappings={midiMappings}
        />
      </div>
    </motion.article>
  );
}

export default SceneColumn;
