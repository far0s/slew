/**
 * ModulationPanel
 *
 * Control panel for backend modulation engine including:
 * - LFO sources with waveform visualization
 * - Modulation targets (LFO → parameter routing)
 * - Audio modulation (audio → LFO property routing)
 */

import { useState, useRef } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import {
  useLfos,
  useAudioModulations,
  type AudioModulation,
} from "@/inputs/modulation";
import type { Slot } from "@/slots/useSlots";
import styles from "./ModulationPanel.module.css";
import { ModulationMap } from "./ModulationMap";
import { LfosSection } from "./LfoEditor";
import { AudioModForm, AudioModulationsSection } from "./AudioModulator";

// ============================================================================
// Main Panel
// ============================================================================

export interface ModulationPanelProps {
  className?: string;
  slots?: Slot[];
  onHighlightParams?: (ids: Set<string>) => void;
}

export function ModulationPanel({
  className,
  slots = [],
  onHighlightParams,
}: ModulationPanelProps) {
  const [lfosOpen, setLfosOpen] = useState(true);
  const [audioModsOpen, setAudioModsOpen] = useState(true);
  const [showAddAudioMod, setShowAddAudioMod] = useState(false);
  const [confirmClearLfos, setConfirmClearLfos] = useState(false);
  const [confirmClearAudioMods, setConfirmClearAudioMods] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const addLfoFnRef = useRef<(() => Promise<void>) | null>(null);

  const { lfos, clear: clearLfos } = useLfos();
  const {
    audioModulations,
    add: addAudioMod,
    clear: clearAudioMods,
  } = useAudioModulations();

  const handleAddAudioMod = async (mod: AudioModulation) => {
    try {
      await addAudioMod(mod);
      setShowAddAudioMod(false);
    } catch {
      // UI state already reflects failure
    }
  };

  return (
    <div className={`${styles.container} ${className ?? ""}`}>
      <div className={styles.header} data-help-anchor="modulation-lfos" data-help-section="modulation">
        <h3 className={styles.title}>Modulation</h3>
        {lfos.length > 0 && (
          <button
            type="button"
            className={styles.headerAddButton}
            onClick={() => setShowMap(true)}
            aria-label="Open modulation map"
          >
            Map
          </button>
        )}
      </div>

      <ModulationMap
        isOpen={showMap}
        onClose={() => setShowMap(false)}
        slots={slots}
      />

      {/* LFOs + Targets Section */}
      <Collapsible.Root open={lfosOpen} onOpenChange={setLfosOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {lfosOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>LFOs</span>
              {lfos.length > 0 && (
                <span className={styles.sectionBadge}>{lfos.length}</span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLfosOpen(true);
              void addLfoFnRef.current?.();
            }}
            className={styles.headerAddButton}
            aria-label="Add LFO"
          >
            + Add
          </button>
          {lfos.length > 0 && !confirmClearLfos && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmClearLfos(true); }}
              className={styles.clearButton}
              aria-label="Clear all LFOs"
            >
              Clear All
            </button>
          )}
          {confirmClearLfos && (
            <span className={styles.confirmClear}>
              Sure?{ }
              <button
                type="button"
                className={styles.confirmYes}
                onClick={() => { void clearLfos(); setConfirmClearLfos(false); }}
              >
                Yes
              </button>
              { }/{ }
              <button
                type="button"
                className={styles.confirmNo}
                onClick={() => setConfirmClearLfos(false)}
              >
                No
              </button>
            </span>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          <LfosSection slots={slots} addLfoFnRef={addLfoFnRef} onHighlightParams={onHighlightParams} />
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Audio Modulations Section */}
      <Collapsible.Root open={audioModsOpen} onOpenChange={setAudioModsOpen}>
        <div className={styles.sectionHeaderWithAction}>
          <Collapsible.Trigger asChild>
            <button type="button" className={styles.sectionHeader}>
              {audioModsOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
              <span>Audio → LFO</span>
              {audioModulations.length > 0 && (
                <span className={styles.sectionBadge}>
                  {audioModulations.length}
                </span>
              )}
            </button>
          </Collapsible.Trigger>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowAddAudioMod(true);
              setAudioModsOpen(true);
            }}
            className={styles.headerAddButton}
            disabled={lfos.length === 0}
            aria-label="Add audio modulation"
          >
            + Add
          </button>
          {audioModulations.length > 0 && !confirmClearAudioMods && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmClearAudioMods(true); }}
              className={styles.clearButton}
              aria-label="Clear all audio modulations"
            >
              Clear All
            </button>
          )}
          {confirmClearAudioMods && (
            <span className={styles.confirmClear}>
              Sure?{ }
              <button
                type="button"
                className={styles.confirmYes}
                onClick={() => { void clearAudioMods(); setConfirmClearAudioMods(false); }}
              >
                Yes
              </button>
              { }/{ }
              <button
                type="button"
                className={styles.confirmNo}
                onClick={() => setConfirmClearAudioMods(false)}
              >
                No
              </button>
            </span>
          )}
        </div>
        <Collapsible.Content className={styles.sectionContent}>
          <p className={styles.sectionHint}>Route audio signals (level, bass, beat…) to modulate an LFO's rate or depth in real time.</p>
          {showAddAudioMod && lfos.length > 0 ? (
            <AudioModForm
              lfos={lfos}
              editingMod={null}
              onSave={handleAddAudioMod}
              onCancel={() => setShowAddAudioMod(false)}
            />
          ) : (
            <AudioModulationsSection />
          )}
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}

export default ModulationPanel;
