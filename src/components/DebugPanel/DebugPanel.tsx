import * as Tabs from "@radix-ui/react-tabs";
import type { BackendParameter } from "../../controls/controlsParameters";
import { BackendInspector } from "../BackendInspector/";
import { DebugLogs, type LogEntry } from "../DebugLogs";
import { DebugMetrics, type DebugMetricsData } from "../DebugMetrics";
import { MidiPanel } from "../MidiPanel";
import { OscPanel } from "../OscPanel";
import { AudioPanel } from "../AudioPanel";
import { HidPanel } from "../HidPanel";
import styles from "./DebugPanel.module.css";

export interface DebugPanelProps {
  // Parameters tab
  backendParameters: BackendParameter[] | null;
  isLoadingParams: boolean;
  paramError: string | null;
  onRefresh: () => void;
  onResetDefaults: () => void;
  onClearParameters: () => void;

  // Logs tab
  logs: LogEntry[];
  onClearLogs: () => void;

  // Metrics tab
  metrics: DebugMetricsData;
  onResetMetrics: () => void;
}

/**
 * DebugPanel
 *
 * Tabbed debug interface with three views:
 * - Parameters: Live view of backend Parameter Server state (BackendInspector)
 * - Logs: Rolling list of recent parameter_changed events
 * - Metrics: Simple counters and statistics
 */
export function DebugPanel({
  backendParameters,
  isLoadingParams,
  paramError,
  onRefresh,
  onResetDefaults,
  onClearParameters,
  logs,
  onClearLogs,
  metrics,
  onResetMetrics,
}: DebugPanelProps) {
  return (
    <Tabs.Root defaultValue="parameters" className={styles.container}>
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
        <Tabs.Trigger value="parameters" className={styles.tabTrigger}>
          Parameters
        </Tabs.Trigger>
        <Tabs.Trigger value="logs" className={styles.tabTrigger}>
          Logs
          {logs.length > 0 && (
            <span className={styles.badge}>{logs.length}</span>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger value="metrics" className={styles.tabTrigger}>
          Metrics
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
          <AudioPanel />
        </Tabs.Content>

        <Tabs.Content value="hid" className={styles.tabContent}>
          <HidPanel />
        </Tabs.Content>

        <Tabs.Content value="parameters" className={styles.tabContent}>
          <BackendInspector
            backendParameters={backendParameters}
            isLoadingParams={isLoadingParams}
            paramError={paramError}
            onRefresh={onRefresh}
            onResetDefaults={onResetDefaults}
            onClearParameters={onClearParameters}
          />
        </Tabs.Content>

        <Tabs.Content value="logs" className={styles.tabContent}>
          <DebugLogs logs={logs} onClear={onClearLogs} />
        </Tabs.Content>

        <Tabs.Content value="metrics" className={styles.tabContent}>
          <DebugMetrics metrics={metrics} onReset={onResetMetrics} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

export default DebugPanel;
