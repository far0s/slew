import * as Tabs from "@radix-ui/react-tabs";
import type { BackendParameter } from "./controlsParameters";
import BackendInspector from "./BackendInspector";
import DebugLogs, { type LogEntry } from "./DebugLogs";
import DebugMetrics, { type DebugMetricsData } from "./DebugMetrics";
import appShellStyles from "../AppShell.module.css";

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
    <Tabs.Root
      defaultValue="parameters"
      className={appShellStyles.debugPanel}
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <Tabs.List
        className={appShellStyles.debugTabs}
        aria-label="Debug panel tabs"
        style={{
          flexShrink: 0,
        }}
      >
        <Tabs.Trigger
          value="parameters"
          className="flex-1 px-3 py-1.5 text-xs transition-colors data-[state=active]:bg-blue-600/30 data-[state=active]:font-semibold data-[state=active]:text-slate-100 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset first:rounded-tl-[0.45rem] border-r border-blue-800/50"
        >
          Parameters
        </Tabs.Trigger>
        <Tabs.Trigger
          value="logs"
          className="flex-1 px-3 py-1.5 text-xs transition-colors data-[state=active]:bg-blue-600/30 data-[state=active]:font-semibold data-[state=active]:text-slate-100 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset border-r border-blue-800/50"
        >
          Logs
          {logs.length > 0 && (
            <span
              style={{
                marginLeft: "0.35rem",
                padding: "0.1rem 0.35rem",
                borderRadius: "9999px",
                background: "rgba(56, 189, 248, 0.25)",
                fontSize: "0.65rem",
                fontVariantNumeric: "tabular-nums",
                color: "#7dd3fc",
              }}
            >
              {logs.length}
            </span>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger
          value="metrics"
          className="flex-1 px-3 py-1.5 text-xs transition-colors data-[state=active]:bg-blue-600/30 data-[state=active]:font-semibold data-[state=active]:text-slate-100 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-inset last:rounded-tr-[0.45rem]"
        >
          Metrics
        </Tabs.Trigger>
      </Tabs.List>

      <div
        className={appShellStyles.debugBody}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Tabs.Content
          value="parameters"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            outline: "none",
          }}
        >
          <BackendInspector
            backendParameters={backendParameters}
            isLoadingParams={isLoadingParams}
            paramError={paramError}
            onRefresh={onRefresh}
            onResetDefaults={onResetDefaults}
            onClearParameters={onClearParameters}
          />
        </Tabs.Content>

        <Tabs.Content
          value="logs"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            outline: "none",
            height: "100%",
            maxHeight: "100%",
          }}
        >
          <DebugLogs logs={logs} onClear={onClearLogs} />
        </Tabs.Content>

        <Tabs.Content
          value="metrics"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            outline: "none",
          }}
        >
          <DebugMetrics metrics={metrics} onReset={onResetMetrics} />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

export default DebugPanel;
