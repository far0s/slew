import { useMemo, useState, useEffect } from "react";
import { Button } from "../ui/Button";
import styles from "./DebugMetrics.module.css";

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

interface MetricCardProps {
  label: string;
  value: string | number;
  isText?: boolean;
}

function MetricCard({ label, value, isText = false }: MetricCardProps) {
  return (
    <div className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <span
        className={`${styles.metricValue} ${isText ? styles.metricValueText : styles.metricValueNumeric}`}
      >
        {value}
      </span>
    </div>
  );
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
    <div className={styles.container}>
      <div className={styles.header}>
        <Button onClick={onReset}>Reset</Button>
      </div>

      <div className={styles.scrollArea}>
        {/* Summary stats */}
        <div className={styles.statsGrid}>
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
          <div className={styles.breakdownSection}>
            <h3 className={styles.breakdownTitle}>Updates by parameter</h3>
            <div className={styles.breakdownList}>
              {sortedParamCounts.map(([paramId, count]) => (
                <div key={paramId} className={styles.breakdownItem}>
                  <span className={styles.breakdownParamId}>{paramId}</span>
                  <span className={styles.breakdownCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sortedParamCounts.length === 0 && (
          <p className={styles.emptyState}>No parameter activity yet.</p>
        )}
      </div>
    </div>
  );
}

export default DebugMetrics;
