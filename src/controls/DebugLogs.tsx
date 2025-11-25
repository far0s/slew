import appShellStyles from "../AppShell.module.css";

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
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
          flex: "0 0 auto",
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            color: "rgba(148, 163, 184, 0.9)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {logs.length} event{logs.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={logs.length === 0}
          className="rounded-full border border-slate-500/60 bg-transparent px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Clear
        </button>
      </div>

      <div
        style={{
          flex: "1 1 auto",
          overflowY: "auto",
          minHeight: 0,
        }}
      >
        {logs.length === 0 ? (
          <p
            className={appShellStyles.caption}
            style={{ textAlign: "center", marginTop: "1rem" }}
          >
            No events logged yet.
            <br />
            <span style={{ opacity: 0.7 }}>
              Parameter changes will appear here.
            </span>
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            {logs.map((entry) => (
              <li
                key={entry.id}
                style={{
                  padding: "0.35rem 0.5rem",
                  borderRadius: "0.25rem",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(71, 85, 105, 0.3)",
                  fontSize: "0.72rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: "#e2e8f0",
                    }}
                  >
                    {entry.parameterId}
                  </span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: "0.68rem",
                      color: "rgba(148, 163, 184, 0.8)",
                    }}
                  >
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: "0.15rem",
                    display: "flex",
                    gap: "0.75rem",
                    color: "rgba(203, 213, 225, 0.9)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>
                    val:{" "}
                    <span style={{ color: "#7dd3fc" }}>
                      {entry.value.toFixed(3)}
                    </span>
                  </span>
                  <span>
                    target:{" "}
                    <span style={{ color: "#a5b4fc" }}>
                      {entry.target.toFixed(3)}
                    </span>
                  </span>
                  <span style={{ opacity: 0.7 }}>
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
