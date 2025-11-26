import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as Select from "@radix-ui/react-select";
import { ChevronDownIcon, Cross2Icon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import type { SceneId } from "../../scenes/sceneTypes";
import { SCENE_REGISTRY, ALL_SCENE_IDS } from "../../scenes/sceneTypes";
import { SCENE_COMPONENT_REGISTRY } from "../../scenes/sceneComponents";
import type { SceneProps } from "../../scenes/sceneComponents";
import { SceneParameterControls } from "../SceneParameterControls";
import type { AudioMapping } from "../../inputs/audio";
import styles from "./SceneColumn.module.css";

/**
 * Props for the SceneColumn component.
 *
 * @property slotIndex - Slot index (0-based)
 * @property sceneId - Scene ID loaded in this slot
 * @property isActive - Whether this slot is the active (output) slot
 * @property isCrossfadeTarget - Whether this slot is the crossfade target
 * @property crossfadeProgress - Current crossfade progress (0-100) for this slot
 * @property isCrossfading - Whether crossfade is in progress
 * @property isMacropadSelected - Whether this slot is selected via macropad (keys 1-4)
 * @property excludeSceneIds - Scene IDs to exclude from dropdown (already in use)
 * @property canRemove - Whether the slot can be removed
 * @property params - Scene params for preview rendering
 * @property getValue - Get parameter value for controls
 * @property setValue - Set parameter value for controls
 * @property audioMappings - Optional audio mappings for parameter indicators
 * @property onSceneChange - Callback when scene selection changes
 * @property onCrossfade - Callback when crossfade button is clicked
 * @property onRemove - Callback when remove button is clicked
 */
export interface SceneColumnProps {
  slotIndex: number;
  sceneId: SceneId;
  isActive: boolean;
  isCrossfadeTarget: boolean;
  crossfadeProgress: number;
  isCrossfading: boolean;
  isMacropadSelected?: boolean;
  excludeSceneIds: SceneId[];
  canRemove: boolean;
  params?: SceneProps["params"];
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
  audioMappings?: AudioMapping[];
  onSceneChange: (sceneId: SceneId) => void;
  onCrossfade: () => void;
  onRemove: () => void;
}

/**
 * Get display label for a scene ID.
 */
function getSceneLabel(sceneId: SceneId): string {
  const descriptor = SCENE_REGISTRY.find((s) => s.id === sceneId);
  return descriptor?.shortLabel ?? sceneId;
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
 */
export function SceneColumn({
  slotIndex,
  sceneId,
  isActive,
  isCrossfadeTarget,
  crossfadeProgress,
  isCrossfading,
  isMacropadSelected = false,
  excludeSceneIds,
  canRemove,
  params,
  getValue,
  setValue,
  audioMappings,
  onSceneChange,
  onCrossfade,
  onRemove,
}: SceneColumnProps) {
  const SceneComponent = SCENE_COMPONENT_REGISTRY[sceneId];
  const displayLabel = getSceneLabel(sceneId);
  const displayNumber = slotIndex + 1;

  // Filter available options (exclude scenes in other slots)
  const availableOptions = ALL_SCENE_IDS.filter(
    (id) => id === sceneId || !excludeSceneIds.includes(id),
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
      aria-label={`Scene slot ${displayNumber}${isMacropadSelected ? " (macropad selected)" : ""}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      layout
    >
      {/* Preview Canvas with overlay controls */}
      <div className={styles.previewContainer}>
        {SceneComponent ? (
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
              <SceneComponent opacity={1} params={params} />
            </Canvas>
          </Suspense>
        ) : (
          <div className={styles.fallback}>Unknown scene: {sceneId}</div>
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

        {/* Bottom overlay with scene selector, crossfade button, and remove button */}
        <div className={styles.bottomOverlay}>
          {/* Scene selector (left half) */}
          <div className={styles.selectorWrapper}>
            <Select.Root
              value={sceneId}
              disabled={isSelectDisabled}
              onValueChange={(v) => onSceneChange(v as SceneId)}
            >
              <Select.Trigger
                className={styles.selectTrigger}
                aria-label={`Scene ${displayNumber} selection`}
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
                          {getSceneLabel(option)}
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
                aria-label={`Remove scene slot ${displayNumber}`}
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
          sceneId={sceneId}
          getValue={getValue}
          setValue={setValue}
          audioMappings={audioMappings}
        />
      </div>
    </motion.article>
  );
}

export default SceneColumn;
