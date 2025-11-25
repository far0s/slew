import { Button } from "../ui/Button";
import styles from "./DebugLogs.module.css";

export interface LogEntry {
  id: string;
  timestamp: number;
  parameterId: string;
  value: number;
  target: number;
  transitionSpeed: number;
  curve: string;
}

export interface DebugLogsProps {
  logs: LogEntry[];
  onClear: () => void;
}

/**
 * DebugLogs
 *
 * Displays a scrollable list of recent parameter_changed events.
 * Each entry shows timestamp, parameter ID, current value, target, and transition info.
 */
export function DebugLogs({ logs, onClear }: DebugLogsProps) {
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${hours}:${minutes}:${seconds}.${ms}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.eventCount}>
          {logs.length} event{logs.length !== 1 ? "s" : ""}
        </span>
        <Button onClick={onClear} disabled={logs.length === 0}>
          Clear
        </Button>
      </div>

      <div className={styles.scrollArea}>
        {logs.length === 0 ? (
          <p className={styles.emptyState}>
            No events logged yet.
            <br />
            <span className={styles.emptyStateHint}>
              Parameter changes will appear here.
            </span>
          </p>
        ) : (
          <ul className={styles.list}>
            {logs.map((entry) => (
              <li key={entry.id} className={styles.entry}>
                <div className={styles.entryHeader}>
                  <span className={styles.parameterId}>
                    {entry.parameterId}
                  </span>
                  <span className={styles.timestamp}>
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <div className={styles.entryDetails}>
                  <span>
                    val:{" "}
                    <span className={styles.value}>
                      {entry.value.toFixed(3)}
                    </span>
                  </span>
                  <span>
                    target:{" "}
                    <span className={styles.target}>
                      {entry.target.toFixed(3)}
                    </span>
                  </span>
                  <span className={styles.curve}>
                    {entry.curve} @ {entry.transitionSpeed.toFixed(2)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DebugLogs;
