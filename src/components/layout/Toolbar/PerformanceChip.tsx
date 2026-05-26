import { useState } from "react";
import type { PerformanceMonitorStats } from "@/hooks/usePerformanceMonitor";
import styles from "./Toolbar.module.css";

interface PerformanceChipProps {
  controls: PerformanceMonitorStats;
  rendererFps: number | null;
  rendererFrameTimeMs: number | null;
}

type ChipStatus = "green" | "amber" | "red";

function getStatus(rendererFps: number | null): ChipStatus {
  const fps = rendererFps ?? 60;
  if (fps < 25) return "red";
  if (fps < 45) return "amber";
  return "green";
}

export function PerformanceChip({ controls, rendererFps, rendererFrameTimeMs }: PerformanceChipProps) {
  const [open, setOpen] = useState(false);
  const status = getStatus(rendererFps);

  const rFps = rendererFps !== null ? Math.round(rendererFps) : null;
  const rFt = rendererFrameTimeMs !== null ? rendererFrameTimeMs.toFixed(1) : null;
  const cFps = controls.controlsFps > 0 ? controls.controlsFps : null;

  return (
    <div
      className={styles.perfDot}
      data-status={status}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-label={`Performance: ${status}`}
    >
      <span className={styles.perfDotIndicator} data-status={status} />

      {open && (
        <div className={styles.perfPopover}>
          <div className={styles.perfPopoverTitle}>Performance</div>

          <div className={styles.perfPopoverRow}>
            <span className={styles.perfPopoverLabel}>Renderer</span>
            <span
              className={styles.perfPopoverValue}
              data-status={
                rFps === null ? "neutral"
                : rFps < 25 ? "red"
                : rFps < 45 ? "amber"
                : "green"
              }
            >
              {rFps !== null ? `${rFps} fps` : "—"}
              {rFt !== null && (
                <span className={styles.perfPopoverSub}> / {rFt} ms</span>
              )}
            </span>
          </div>

          <div className={styles.perfPopoverRow}>
            <span className={styles.perfPopoverLabel}>Controls</span>
            <span
              className={styles.perfPopoverValue}
              data-status={cFps === null ? "neutral" : cFps < 30 ? "amber" : "green"}
            >
              {cFps !== null ? `${cFps} fps` : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
