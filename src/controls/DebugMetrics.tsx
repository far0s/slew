import { useMemo, useState, useEffect } from "react";
import appShellStyles from "../AppShell.module.css";

export interface DebugMetricsData {
  totalParameterUpdates: number;
  parameterUpdateCounts: Record<string, number>;
  lastEventTime: number | null;
  sessionStartTime: number;
  crossfadeTransitions: number;
}

export interface DebugMetricsProps {
  metrics: DebugMetricsData;
  onReset: () => void;
}

/**
 * DebugMetrics
 *
 * Displays simple counters and statistics about parameter activity:
 * - Total parameter updates
 * - Per-parameter update counts
 * - Time since last event
 * - Session duration
 * - Crossfade transition count
 */
export function DebugMetrics({ metrics, onReset }: DebugMetricsProps) {
  const {
    totalParameterUpdates,
    parameterUpdateCounts,
    lastEventTime,
    sessionStartTime,
    crossfadeTransitions,
  } = metrics;

  // Tick state to force re-render of time-based values
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const timeSinceLastEvent = useMemo(() => {
    if (!lastEventTime) return null;
    const now = Date.now();
    const diff = now - lastEventTime;
    if (diff < 1000) return "just now";
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventTime, tick]);

  const sessionDuration = useMemo(() => {
    const now = Date.now();
    const diff = now - sessionStartTime;
    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / 60000) % 60;
    const hours = Math.floor(diff / 3600000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStartTime, tick]);

  const sortedParamCounts = useMemo(() => {
    return Object.entries(parameterUpdateCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8); // Show top 8 most active parameters
  }, [parameterUpdateCounts]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      <div
        className={appShellStyles.row}
        style={{
          justifyContent: "flex-end",
          marginBottom: "0.5rem",
          flex: "0 0 auto",
        }}
      >
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-slate-500/60 bg-transparent px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Reset
        </button>
      </div>

      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          <MetricCard label="Total updates" value={totalParameterUpdates} />
          <MetricCard label="Crossfades" value={crossfadeTransitions} />
          <MetricCard
            label="Last event"
            value={timeSinceLastEvent ?? "—"}
            isText
          />
          <MetricCard label="Session" value={sessionDuration} isText />
        </div>

        {/* Per-parameter breakdown */}
        {sortedParamCounts.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <h3
              style={{
                fontSize: "0.7rem",
                fontWeight: 600,
                color: "rgba(148, 163, 184, 0.9)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "0.35rem",
              }}
            >
              Updates by parameter
            </h3>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.2rem",
              }}
            >
              {sortedParamCounts.map(([paramId, count]) => (
                <div
                  key={paramId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.25rem 0.4rem",
                    borderRadius: "0.2rem",
                    background: "rgba(15, 23, 42, 0.5)",
                    fontSize: "0.72rem",
                  }}
                >
                  <span style={{ color: "#e2e8f0" }}>{paramId}</span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "#7dd3fc",
                      fontWeight: 500,
                    }}
                  >
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedParamCounts.length === 0 && (
          <p
            className={appShellStyles.caption}
            style={{ textAlign: "center", marginTop: "0.5rem" }}
          >
            No parameter activity yet.
          </p>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  isText?: boolean;
}

function MetricCard({ label, value, isText = false }: MetricCardProps) {
  return (
    <div
      style={{
        padding: "0.5rem",
        borderRadius: "0.35rem",
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(71, 85, 105, 0.3)",
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
      }}
    >
      <span
        style={{
          fontSize: "0.65rem",
          color: "rgba(148, 163, 184, 0.8)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: isText ? "0.8rem" : "1.1rem",
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: isText ? "#cbd5e1" : "#f1f5f9",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default DebugMetrics;
