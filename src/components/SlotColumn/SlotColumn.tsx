import { Suspense, useCallback } from "react";
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
import type { Slot } from "../../slots/useSlots";
import { SlotParameterControls } from "../SlotParameterControls";
import { WebGPUCanvas } from "../../renderer/WebGPUCanvas";
import type { AudioMapping } from "../../inputs/audio";
import type { ModulationTarget, LfoSource } from "../../inputs/modulation";
import type { MidiMapping } from "../../inputs/midi";
import styles from "./SlotColumn.module.css";

export interface SlotColumnProps {
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

function getSketchLabel(sketchId: SketchId): string {
  const descriptor = SKETCH_REGISTRY.find((s) => s.id === sketchId);
  return descriptor?.shortLabel ?? sketchId;
}

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
      <div className={styles.inlineBrowserHeader}>
        <div className={styles.inlineSlotBadge}>{displayNumber}</div>
        <span className={styles.inlineBrowserTitle}>Choose a sketch</span>
      </div>

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

// A single column in the slot management UI containing preview, selector, and controls.
export function SlotColumn({
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
}: SlotColumnProps) {
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

  const availableOptions = ALL_SKETCH_IDS.filter(
    (id) => id === sketchId || !excludeSketchIds.includes(id),
  );

  const isSelectDisabled = isActive || isCrossfading;
  const isCrossfadeDisabled = isActive || isCrossfading;

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

  const showRemoveButton = canRemove && !isActive;

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
      <div className={styles.previewContainer}>
        {SketchComponent ? (
          <Suspense fallback={<div className={styles.fallback}>Loading…</div>}>
            <WebGPUCanvas
              camera={{ position: [0, 0, 4], fov: 50 }}
              frameloop="always"
              fallback={<div className={styles.fallback}>Initializing…</div>}
            >
              <color attach="background" args={["#020617"]} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[4, 6, 3]} intensity={1.1} />
              <directionalLight position={[-4, -4, -2]} intensity={0.4} />
              <SketchComponent opacity={1} params={previewParams ?? params} />
            </WebGPUCanvas>
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

        <div
          className={`${styles.slotBadge} ${isMacropadSelected ? styles.slotBadgeSelected : ""}`}
        >
          {displayNumber}
          {isMacropadSelected && (
            <span className={styles.macropadIndicator}>⎈</span>
          )}
        </div>

        <div className={styles.bottomOverlay}>
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

      <div className={styles.controls}>
        <SlotParameterControls
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

export default SlotColumn;
