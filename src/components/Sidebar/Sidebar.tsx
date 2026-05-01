import { useCallback, useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { invoke } from "@tauri-apps/api/core";
import {
  SunIcon,
  MoonIcon,
  MinusIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import { MidiPanel } from "../MidiPanel";
import { OscPanel } from "../OscPanel";
import { AudioPanel } from "../AudioPanel";
import { HidPanel } from "../HidPanel";
import { ModulationPanel } from "../ModulationPanel";
import { VideoOutputPanel } from "../VideoOutputPanel";
import { ParameterSlider } from "../ParameterSlider";
import type { Slot } from "../../slots/useSlots";
import {
  useWindowManager,
  useLayoutPreferences,
  useTheme,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../../hooks";
import styles from "./Sidebar.module.css";

/**
 * Collapsible section wrapper (matches VideoOutputPanel pattern)
 */
function Section({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.sectionHeader}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDownIcon className={styles.sectionChevron} />
        ) : (
          <ChevronRightIcon className={styles.sectionChevron} />
        )}
        <span className={styles.sectionTitle}>{title}</span>
        {badge}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, overflow: "hidden" }}
            animate={{ height: "auto", opacity: 1, overflow: "visible" }}
            exit={{ height: 0, opacity: 0, overflow: "hidden" }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={styles.sectionContent}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Props for the Sidebar component.
 *
 * @property macropadSelectedIndex - Currently selected slot via macropad (for HID panel display)
 */
export interface SidebarProps {
  // HID/Macropad
  macropadSelectedIndex?: number | null;
  // Active slots for parameter filtering
  slots?: Slot[];
  // Parameter store access for settings
  getValue?: (id: string) => number;
  setValue?: (id: string, value: number) => void;
}

/**
 * Theme controls component for mode and accent selection
 */
function ThemeControls() {
  const { mode, accent, setMode, setAccent } = useTheme();

  return (
    <div className={styles.layoutControls}>
      {/* Theme Mode */}
      <div className={styles.layoutRow}>
        <span className={styles.layoutLabel}>Mode</span>
        <button
          type="button"
          className={styles.toggleGroup}
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          aria-label={`Theme mode: ${mode}. Click to switch to ${mode === "dark" ? "light" : "dark"}`}
        >
          <span
            className={`${styles.toggleSegment} ${mode === "dark" ? styles.toggleSegmentActive : ""}`}
            aria-hidden="true"
          >
            <MoonIcon className={styles.toggleIcon} />
            Dark
          </span>
          <span
            className={`${styles.toggleSegment} ${mode === "light" ? styles.toggleSegmentActive : ""}`}
            aria-hidden="true"
          >
            <SunIcon className={styles.toggleIcon} />
            Light
          </span>
        </button>
      </div>

      {/* Theme Warmth */}
      <div className={styles.layoutRow}>
        <span className={styles.layoutLabel}>Warmth</span>
        <div
          className={styles.toggleGroup}
          role="group"
          aria-label="Theme warmth"
        >
          <button
            type="button"
            className={`${styles.toggleSegment} ${accent === "standard" ? styles.toggleSegmentActive : ""}`}
            onClick={() => setAccent("standard")}
            aria-pressed={accent === "standard"}
          >
            Cool
          </button>
          <button
            type="button"
            className={`${styles.toggleSegment} ${accent === "neutral" ? styles.toggleSegmentActive : ""}`}
            onClick={() => setAccent("neutral")}
            aria-pressed={accent === "neutral"}
          >
            Neutral
          </button>
          <button
            type="button"
            className={`${styles.toggleSegment} ${accent === "amber" ? styles.toggleSegmentActive : ""}`}
            onClick={() => setAccent("amber")}
            aria-pressed={accent === "amber"}
          >
            Warm
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Layout controls component for sidebar position and UI zoom
 */
function LayoutControls() {
  const {
    sidebarPosition,
    toggleSidebarPosition,
    uiZoom,
    increaseZoom,
    decreaseZoom,
    resetZoom,
  } = useLayoutPreferences();

  return (
    <div className={styles.layoutControls}>
      {/* Sidebar Position */}
      <div className={styles.layoutRow}>
        <span className={styles.layoutLabel}>Sidebar</span>
        <button
          type="button"
          className={styles.toggleGroup}
          onClick={toggleSidebarPosition}
          aria-label={`Sidebar position: ${sidebarPosition}. Click to move to ${sidebarPosition === "left" ? "right" : "left"}`}
        >
          <span
            className={`${styles.toggleSegment} ${sidebarPosition === "left" ? styles.toggleSegmentActive : ""}`}
            aria-hidden="true"
          >
            Left
          </span>
          <span
            className={`${styles.toggleSegment} ${sidebarPosition === "right" ? styles.toggleSegmentActive : ""}`}
            aria-hidden="true"
          >
            Right
          </span>
        </button>
      </div>

      {/* UI Zoom */}
      <div className={styles.layoutRow}>
        <span className={styles.layoutLabel}>UI Zoom</span>
        <div className={styles.zoomControls}>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={decreaseZoom}
            disabled={uiZoom <= MIN_ZOOM}
            aria-label="Decrease zoom"
          >
            <MinusIcon className={styles.zoomIcon} />
          </button>
          <button
            type="button"
            className={styles.zoomValue}
            onClick={resetZoom}
            aria-label="Reset zoom to 100%"
            title="Click to reset"
          >
            {uiZoom}%
          </button>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={increaseZoom}
            disabled={uiZoom >= MAX_ZOOM}
            aria-label="Increase zoom"
          >
            <PlusIcon className={styles.zoomIcon} />
          </button>
        </div>
      </div>
    </div>
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
      }).catch(() => {
        // UI state already reflects failure
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
 * Sidebar
 *
 * Tabbed interface for input configuration and monitoring:
 * - Settings: Theme, layout, transition times, actions
 * - MIDI: Device selection and mapping
 * - OSC: Endpoint management
 * - Audio: Input configuration and mappings
 * - HID: Macropad/controller status
 * - Modulation: LFO and modulation matrix
 * - Video: Renderer stats, video output backends
 */
export function Sidebar({
  macropadSelectedIndex,
  slots = [],
  getValue,
  setValue,
}: SidebarProps) {
  // Window manager for restart and fullscreen functionality
  const {
    isRestarting,
    restartControls,
    restartRenderer,
    toggleFullscreenControls,
    toggleFullscreenRenderer,
  } = useWindowManager({
    windowLabel: "controls",
    enableHeartbeat: false, // Heartbeat is handled in App.tsx
    enableStatusPolling: false,
  });

  const handleRestartControls = useCallback(async () => {
    if (isRestarting) return;
    await restartControls();
  }, [isRestarting, restartControls]);

  const handleRestartRenderer = useCallback(async () => {
    if (isRestarting) return;
    await restartRenderer();
  }, [isRestarting, restartRenderer]);

  return (
    <Tabs.Root defaultValue="settings" className={styles.container}>
      <Tabs.List className={styles.tabList} aria-label="Sidebar tabs">
        <Tabs.Trigger value="settings" className={styles.tabTrigger}>
          Settings
        </Tabs.Trigger>
        <Tabs.Trigger value="video" className={styles.tabTrigger}>
          Video
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
        <Tabs.Trigger value="mod" className={styles.tabTrigger}>
          Mod
        </Tabs.Trigger>
        <Tabs.Trigger value="appearance" className={styles.tabTrigger}>
          Appearance
        </Tabs.Trigger>
      </Tabs.List>

      <div className={styles.tabBody}>
        <Tabs.Content value="settings" className={styles.tabContent}>
          <div className={styles.settingsPanel}>
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
                <button
                  type="button"
                  onClick={() => toggleFullscreenControls()}
                  className={styles.actionButton}
                >
                  <span className={styles.actionLabel}>
                    Toggle Fullscreen (Controls)
                  </span>
                  <kbd className={styles.actionShortcut}>⌘⇧F</kbd>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFullscreenRenderer()}
                  className={styles.actionButton}
                >
                  <span className={styles.actionLabel}>
                    Toggle Fullscreen (Renderer)
                  </span>
                </button>
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

        <Tabs.Content value="video" className={styles.tabContent}>
          <VideoOutputPanel />
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

        <Tabs.Content value="mod" className={styles.tabContent}>
          <ModulationPanel slots={slots} />
        </Tabs.Content>

        <Tabs.Content value="appearance" className={styles.tabContent}>
          <div className={styles.settingsPanel}>
            <div className={styles.settingsSection}>
              <h4 className={styles.settingsHeader}>Theme</h4>
              <ThemeControls />
            </div>

            <div className={styles.settingsSection}>
              <h4 className={styles.settingsHeader}>Layout</h4>
              <LayoutControls />
            </div>

            <Section
              title="Custom CSS"
              badge={
                <span className={styles.comingSoonBadge}>Coming Soon</span>
              }
              defaultOpen={false}
            >
              <p className={styles.placeholderText}>
                Custom CSS is not yet available. This feature will allow you to
                load your own stylesheet to customize the UI appearance.
              </p>
            </Section>
          </div>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

export default Sidebar;
