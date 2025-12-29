import { useCallback, useMemo } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { invoke } from "@tauri-apps/api/core";
import { MidiPanel } from "../MidiPanel";
import { OscPanel } from "../OscPanel";
import { AudioPanel } from "../AudioPanel";
import { HidPanel } from "../HidPanel";
import { ModulationPanel } from "../ModulationPanel";
import { VideoOutputPanel } from "../VideoOutputPanel";
import { ParameterSlider } from "../ParameterSlider";
import type { Slot } from "../../slots/useSlots";
import { useWindowManager } from "../../hooks";
import styles from "./DebugPanel.module.css";

/**
 * Props for the DebugPanel component.
 *
 * @property macropadSelectedIndex - Currently selected slot via macropad (for HID panel display)
 */
export interface DebugPanelProps {
  // HID/Macropad
  macropadSelectedIndex?: number | null;
  // Active slots for parameter filtering
  slots?: Slot[];
  // Parameter store access for settings
  getValue?: (id: string) => number;
  setValue?: (id: string, value: number) => void;
}

/**
 * SettingsSliders
 *
 * Extracted component for settings sliders that syncs values to both
 * local state and the backend via invoke.
 */
function SettingsSliders({
  getValue,
  setValue,
}: {
  getValue: (id: string) => number;
  setValue: (id: string, value: number) => void;
}) {
  // Handler that updates both local state and backend
  const handleChange = useCallback(
    (id: string, value: number) => {
      // Update local state for immediate UI feedback
      setValue(id, value);

      // Sync to backend so MIDI handlers can read the new value
      void invoke("set_parameter", {
        id,
        value,
        app: undefined,
      }).catch((error) => {
        console.error(`[Settings] Failed to set ${id}:`, error);
      });
    },
    [setValue],
  );

  // Memoize handlers to avoid recreating on every render
  const handleMuteFadeChange = useMemo(
    () => (v: number) => handleChange("global_mute_fade_time", v),
    [handleChange],
  );

  const handleSoloFadeChange = useMemo(
    () => (v: number) => handleChange("global_solo_fade_time", v),
    [handleChange],
  );

  return (
    <div className={styles.settingsControls}>
      <ParameterSlider
        id="global_mute_fade_time"
        label="Mute Fade"
        value={getValue("global_mute_fade_time") ?? 0.25}
        onChange={handleMuteFadeChange}
        min={0}
        max={2}
        step={0.05}
        color="cyan"
        description="Fade time when toggling audio mute (seconds)"
      />
      <ParameterSlider
        id="global_solo_fade_time"
        label="Solo Fade"
        value={getValue("global_solo_fade_time") ?? 0.3}
        onChange={handleSoloFadeChange}
        min={0}
        max={2}
        step={0.05}
        color="amber"
        description="Fade time when isolating a slot via solo (seconds)"
      />
    </div>
  );
}

/**
 * DebugPanel
 *
 * Tabbed debug interface for input configuration and monitoring:
 * - MIDI: Device selection and mapping
 * - OSC: Endpoint management
 * - Audio: Input configuration and mappings
 * - HID: Macropad/controller status
 * - Modulation: LFO and modulation matrix
 */
export function DebugPanel({
  macropadSelectedIndex,
  slots = [],
  getValue,
  setValue,
}: DebugPanelProps) {
  // Window manager for restart functionality
  const { isRestarting, restartControls, restartRenderer } = useWindowManager({
    windowLabel: "controls",
    enableHeartbeat: false, // Heartbeat is handled in App.tsx
    enableStatusPolling: false,
  });

  const handleRestartControls = useCallback(async () => {
    if (isRestarting) return;
    if (
      !window.confirm("Restart the Controls window? This will reload the UI.")
    )
      return;
    await restartControls();
  }, [isRestarting, restartControls]);

  const handleRestartRenderer = useCallback(async () => {
    if (isRestarting) return;
    if (
      !window.confirm(
        "Restart the Renderer window? Visuals will briefly reset.",
      )
    )
      return;
    await restartRenderer();
  }, [isRestarting, restartRenderer]);

  return (
    <Tabs.Root defaultValue="midi" className={styles.container}>
      <Tabs.List className={styles.tabList} aria-label="Debug panel tabs">
        <Tabs.Trigger value="midi" className={styles.tabTrigger}>
          MIDI
        </Tabs.Trigger>
        <Tabs.Trigger value="osc" className={styles.tabTrigger}>
          OSC
        </Tabs.Trigger>
        <Tabs.Trigger value="audio" className={styles.tabTrigger}>
          Audio
        </Tabs.Trigger>
        <Tabs.Trigger value="hid" className={styles.tabTrigger}>
          HID
        </Tabs.Trigger>
        <Tabs.Trigger value="modulation" className={styles.tabTrigger}>
          Mod
        </Tabs.Trigger>
        <Tabs.Trigger value="video" className={styles.tabTrigger}>
          Video
        </Tabs.Trigger>
        <Tabs.Trigger value="settings" className={styles.tabTrigger}>
          Settings
        </Tabs.Trigger>
      </Tabs.List>

      <div className={styles.tabBody}>
        <Tabs.Content value="midi" className={styles.tabContent}>
          <MidiPanel />
        </Tabs.Content>

        <Tabs.Content value="osc" className={styles.tabContent}>
          <OscPanel />
        </Tabs.Content>

        <Tabs.Content value="audio" className={styles.tabContent}>
          <AudioPanel slots={slots} />
        </Tabs.Content>

        <Tabs.Content value="hid" className={styles.tabContent}>
          <HidPanel selectedSlotIndex={macropadSelectedIndex} />
        </Tabs.Content>

        <Tabs.Content value="modulation" className={styles.tabContent}>
          <ModulationPanel slots={slots} />
        </Tabs.Content>

        <Tabs.Content value="video" className={styles.tabContent}>
          <VideoOutputPanel />
        </Tabs.Content>

        <Tabs.Content value="settings" className={styles.tabContent}>
          <div className={styles.settingsPanel}>
            <h4 className={styles.settingsHeader}>Transition Times</h4>
            <p className={styles.settingsDescription}>
              Control how quickly mute and solo actions fade in/out.
            </p>
            {getValue && setValue ? (
              <SettingsSliders getValue={getValue} setValue={setValue} />
            ) : (
              <p className={styles.settingsNote}>
                Settings unavailable - parameter store not connected.
              </p>
            )}
          </div>
        </Tabs.Content>
      </div>

      <footer className={styles.footer}>
        <div className={styles.shortcuts}>
          <span className={styles.shortcut}>
            <kbd>D</kbd> Toggle stats
          </span>
          <span className={styles.shortcut}>
            <kbd>⌘⇧C</kbd> Restart Controls
          </span>
          <span className={styles.shortcut}>
            <kbd>⌘⇧R</kbd> Restart Renderer
          </span>
        </div>
        <div className={styles.restartButtons}>
          <button
            type="button"
            onClick={handleRestartRenderer}
            disabled={isRestarting}
            className={styles.restartButton}
            title="Restart Renderer window (⌘⇧R)"
          >
            {isRestarting ? "…" : "Restart Renderer"}
          </button>
          <button
            type="button"
            onClick={handleRestartControls}
            disabled={isRestarting}
            className={styles.restartButton}
            title="Restart Controls window (⌘⇧C)"
          >
            {isRestarting ? "…" : "Restart Controls"}
          </button>
        </div>
      </footer>
    </Tabs.Root>
  );
}

export default DebugPanel;
