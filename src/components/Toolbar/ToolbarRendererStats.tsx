import styles from "./Toolbar.module.css";

interface ToolbarRendererStatsProps {
  fps: number;
  frameTimeMs: number;
}

export function ToolbarRendererStats({ fps, frameTimeMs }: ToolbarRendererStatsProps) {
  return (
    <div className={styles.toolbarStats}>
      <span
        className={styles.toolbarStat}
        data-fps-status={fps >= 55 ? "good" : fps >= 40 ? "ok" : "low"}
        title="Renderer FPS"
      >
        {Math.round(fps)}<span className={styles.toolbarStatUnit}>fps</span>
      </span>
      <span className={styles.toolbarStatDivider} />
      <span
        className={styles.toolbarStat}
        data-ft-status={frameTimeMs < 20 ? "good" : frameTimeMs < 33 ? "ok" : "low"}
        title="Frame time"
      >
        {frameTimeMs.toFixed(1)}<span className={styles.toolbarStatUnit}>ms</span>
      </span>
    </div>
  );
}
