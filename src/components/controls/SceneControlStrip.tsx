import * as Select from "@radix-ui/react-select";
import * as Progress from "@radix-ui/react-progress";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import type { SceneId } from "../../scenes/sceneTypes";
import type { SetSceneId } from "../../controls/scenePairing";
import { setScenePairingOnBackend } from "../../controls/scenePairing";
import type { SceneProps } from "../../scenes/sceneComponents";
import { ScenePreview } from "./ScenePreview";
import styles from "./SceneControlStrip.module.css";

export interface SceneControlStripProps {
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  setActiveSceneId: SetSceneId;
  setNextSceneId: SetSceneId;
  crossfade: number;
  onCrossfadeChange: (value: number) => Promise<void>;
  /** Scene params for the active scene preview */
  activeSceneParams?: SceneProps["params"];
  /** Scene params for the next scene preview */
  nextSceneParams?: SceneProps["params"];
}

const SCENE_OPTIONS: { value: SceneId; label: string }[] = [
  { value: "sceneA", label: "Scene A" },
  { value: "sceneB", label: "Scene B" },
  { value: "sceneC", label: "Scene C" },
];

interface SceneSelectProps {
  value: SceneId;
  disabled: boolean;
  ariaLabel: string;
  /** Scene ID to exclude from the options (the other selector's current value) */
  excludeSceneId: SceneId;
  onValueChange: (value: SceneId) => void;
}

function SceneSelect({
  value,
  disabled,
  ariaLabel,
  excludeSceneId,
  onValueChange,
}: SceneSelectProps) {
  // Filter out the scene that's already selected in the other dropdown
  const availableOptions = SCENE_OPTIONS.filter(
    (option) => option.value !== excludeSceneId,
  );

  return (
    <Select.Root
      value={value}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v as SceneId)}
    >
      <Select.Trigger className={styles.selectTrigger} aria-label={ariaLabel}>
        <Select.Value />
        <Select.Icon>
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
                key={option.value}
                value={option.value}
                className={styles.selectItem}
              >
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

interface CrossfadeProgressProps {
  value: number;
  isActive: boolean;
}

function CrossfadeProgress({ value, isActive }: CrossfadeProgressProps) {
  // For active scene: show how much of active is visible (1 - crossfade)
  // For next scene: show how much of next is visible (crossfade)
  const displayPercent = isActive ? (1 - value) * 100 : value * 100;
  const translateX = isActive ? value * 100 : (value - 1) * 100;

  return (
    <div className={styles.progressContainer}>
      <Progress.Root
        value={displayPercent}
        max={100}
        className={styles.progressRoot}
      >
        <Progress.Indicator
          className={styles.progressIndicator}
          style={{ transform: `translateX(${translateX}%)` }}
        />
        <span className={styles.progressText}>
          {displayPercent.toFixed(0)}%
        </span>
      </Progress.Root>
    </div>
  );
}

/**
 * SceneControlStrip
 *
 * The main scene control panel showing:
 * - Active and Next scene selection dropdowns
 * - Live 3D previews for each scene
 * - Crossfade progress indicators for each scene
 * - Crossfade buttons to transition between scenes
 *
 * Lock rules:
 * - While crossfading (mid-range), both combos and buttons are disabled
 * - At crossfade ≈ 0, Active combo+CTA are disabled (scene is fully live)
 * - At crossfade ≈ 1, Next combo+CTA are disabled
 *
 * Scene selection rules:
 * - Each dropdown excludes the scene selected in the other dropdown
 * - This prevents selecting the same scene for both Active and Next
 */
export function SceneControlStrip({
  activeSceneId,
  nextSceneId,
  setActiveSceneId,
  setNextSceneId,
  crossfade,
  onCrossfadeChange,
  activeSceneParams,
  nextSceneParams,
}: SceneControlStripProps) {
  // Disable pairing controls while crossfading to avoid mid-transition changes
  const isCrossfading = crossfade > 0.01 && crossfade < 0.99;

  // At the endpoints, lock the corresponding scene combo
  const isActiveLocked = crossfade <= 0.01;
  const isNextLocked = crossfade >= 0.99;

  const handleActiveSceneChange = (id: SceneId) => {
    void setScenePairingOnBackend({
      currentActive: id,
      currentNext: nextSceneId,
      setActiveSceneId,
      setNextSceneId,
    });
  };

  const handleNextSceneChange = (id: SceneId) => {
    void setScenePairingOnBackend({
      currentActive: activeSceneId,
      currentNext: id,
      setActiveSceneId,
      setNextSceneId,
    });
  };

  const handleCrossfadeToActive = () => {
    if (!isCrossfading) {
      void onCrossfadeChange(0);
    }
  };

  const handleCrossfadeToNext = () => {
    if (!isCrossfading) {
      void onCrossfadeChange(1);
    }
  };

  return (
    <section aria-label="Scene control strip" className={styles.container}>
      <div className={styles.scenePairRow}>
        {/* Active Scene Column */}
        <div className={styles.sceneColumn}>
          <div className={styles.scenePairRow}>
            <div className={styles.sceneColumn}>
              <div className={styles.sceneColumnHeader}>
                <p className={styles.sceneLabel}>
                  <span className={styles.sceneLabelText}>Active</span>
                  <CrossfadeProgress value={crossfade} isActive />
                </p>
              </div>

              <div className={styles.sceneColumnBody}>
                {/* Controls */}
                <div className={styles.sceneColumnControls}>
                  <div className={styles.sceneSelectRow}>
                    <SceneSelect
                      value={activeSceneId}
                      disabled={isCrossfading || isActiveLocked}
                      ariaLabel="Active scene"
                      excludeSceneId={nextSceneId}
                      onValueChange={handleActiveSceneChange}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCrossfadeToActive}
                    disabled={isCrossfading || isActiveLocked}
                    className={styles.crossfadeButton}
                  >
                    Crossfade to Active
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.sceneColumn}>
              {/* Preview */}
              <div className={styles.sceneColumnPreview}>
                <ScenePreview
                  sceneId={activeSceneId}
                  params={activeSceneParams}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Next Scene Column */}
        <div className={styles.sceneColumn}>
          <div className={styles.scenePairRow}>
            <div className={styles.sceneColumn}>
              <div className={styles.sceneColumnHeader}>
                <p className={styles.sceneLabel}>
                  <span className={styles.sceneLabelText}>Next</span>
                  <CrossfadeProgress value={crossfade} isActive={false} />
                </p>
              </div>

              <div className={styles.sceneColumnBody}>
                {/* Controls */}
                <div className={styles.sceneColumnControls}>
                  <div className={styles.sceneSelectRow}>
                    <SceneSelect
                      value={nextSceneId}
                      disabled={isCrossfading || isNextLocked}
                      ariaLabel="Next scene"
                      excludeSceneId={activeSceneId}
                      onValueChange={handleNextSceneChange}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleCrossfadeToNext}
                    disabled={isCrossfading || isNextLocked}
                    className={styles.crossfadeButton}
                  >
                    Crossfade to Next
                  </button>
                </div>
              </div>
            </div>
            <div className={styles.sceneColumn}>
              {/* Preview */}
              <div className={styles.sceneColumnPreview}>
                <ScenePreview sceneId={nextSceneId} params={nextSceneParams} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SceneControlStrip;
