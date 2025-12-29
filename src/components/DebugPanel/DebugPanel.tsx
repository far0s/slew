import { useCallback } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { MidiPanel } from "../MidiPanel";
import { OscPanel } from "../OscPanel";
import { AudioPanel } from "../AudioPanel";
import { HidPanel } from "../HidPanel";
import { ModulationPanel } from "../ModulationPanel";
import { VideoOutputPanel } from "../VideoOutputPanel";
import type { Slot } from "../../scenes/useSceneSlots";
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
