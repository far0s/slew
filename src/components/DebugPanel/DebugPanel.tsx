import { useCallback, useMemo, useState, useEffect } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { invoke } from "@tauri-apps/api/core";
import { SunIcon, MoonIcon } from "@radix-ui/react-icons";
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

type Theme = "dark" | "light";

function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("slew-theme") as Theme | null;
    return stored ?? "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("slew-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}

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
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={styles.themeToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <>
          <SunIcon className={styles.themeIcon} />
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <MoonIcon className={styles.themeIcon} />
          <span>Dark Mode</span>
        </>
      )}
    </button>
  );
}

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
    <Tabs.Root defaultValue="settings" className={styles.container}>
      <Tabs.List className={styles.tabList} aria-label="Debug panel tabs">
        <Tabs.Trigger value="settings" className={styles.tabTrigger}>
          Settings
        </Tabs.Trigger>
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
        <Tabs.Content value="settings" className={styles.tabContent}>
          <div className={styles.settingsPanel}>
            <div className={styles.settingsSection}>
              <h4 className={styles.settingsHeader}>Appearance</h4>
              <ThemeToggle />
            </div>

            <div className={styles.settingsSection}>
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

            <div className={styles.settingsSection}>
              <h4 className={styles.settingsHeader}>Actions</h4>
              <div className={styles.actionsList}>
                <div className={styles.actionItem}>
                  <span className={styles.actionLabel}>
                    Toggle stats overlay
                  </span>
                  <kbd className={styles.actionShortcut}>D</kbd>
                </div>
                <button
                  type="button"
                  onClick={handleRestartRenderer}
                  disabled={isRestarting}
                  className={styles.actionButton}
                >
                  <span className={styles.actionLabel}>
                    {isRestarting ? "Restarting…" : "Restart Renderer"}
                  </span>
                  <kbd className={styles.actionShortcut}>⌘⇧R</kbd>
                </button>
                <button
                  type="button"
                  onClick={handleRestartControls}
                  disabled={isRestarting}
                  className={styles.actionButton}
                >
                  <span className={styles.actionLabel}>
                    {isRestarting ? "Restarting…" : "Restart Controls"}
                  </span>
                  <kbd className={styles.actionShortcut}>⌘⇧C</kbd>
                </button>
              </div>
            </div>
          </div>
        </Tabs.Content>

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
    </Tabs.Root>
  );
}

export default DebugPanel;
