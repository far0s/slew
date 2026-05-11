import { useState, useEffect, useRef } from "react";

export interface PerformanceMonitorStats {
  /** rAF-measured FPS in the Controls window */
  controlsFps: number;
}

const SAMPLE_WINDOW = 30; // frames to average

/**
 * Measures the Controls-window rAF cadence (FPS).
 * Reports at ~1 Hz to minimise React re-renders.
 *
 * Note: performance.memory is not available in WKWebView (macOS/Tauri),
 * so heap tracking is omitted.
 */
export function usePerformanceMonitor(): PerformanceMonitorStats {
  const [controlsFps, setControlsFps] = useState(0);

  const rafRef = useRef<number>(0);
  const frameTimes = useRef<number[]>([]);
  const lastTime = useRef<number>(performance.now());
  const lastReportTime = useRef<number>(performance.now());

  useEffect(() => {
    let alive = true;

    function frame() {
      if (!alive) return;

      const now = performance.now();
      const delta = now - lastTime.current;
      lastTime.current = now;

      if (delta > 0) {
        frameTimes.current.push(delta);
        if (frameTimes.current.length > SAMPLE_WINDOW) {
          frameTimes.current.shift();
        }
      }

      if (now - lastReportTime.current >= 1000) {
        lastReportTime.current = now;
        const samples = frameTimes.current;
        const avgDelta =
          samples.length > 0
            ? samples.reduce((a, b) => a + b, 0) / samples.length
            : 16.67;
        setControlsFps(Math.round(1000 / avgDelta));
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { controlsFps };
}
