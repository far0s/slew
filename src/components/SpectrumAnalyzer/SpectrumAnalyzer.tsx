/**
 * SpectrumAnalyzer
 *
 * Canvas-based audio spectrum + waveform visualizer.
 * Draws entirely via canvas 2D — no React state updates on the hot path.
 * The parent passes the latest AudioLevels via a ref so this component
 * only re-renders when mode/size props change.
 */

import { useRef, useEffect, useCallback } from "react";
import type { AudioLevels } from "../../inputs/audio";
import styles from "./SpectrumAnalyzer.module.css";

export type VisualizerMode = "spectrum" | "waveform" | "both";

export interface SpectrumAnalyzerProps {
  /** Latest audio levels. Pass as a ref-backed value to avoid re-renders. */
  levelsRef: React.RefObject<AudioLevels | null>;
  mode?: VisualizerMode;
  /** Canvas height in px */
  height?: number;
  className?: string;
}

// Bar colors matching the theme (CSS vars not available in canvas — use literals)
const BAR_COLOR = "rgba(99, 102, 241, 0.85)";
const BAR_BEAT_COLOR = "rgba(99, 102, 241, 1)";
const WAVE_COLOR = "rgba(34, 197, 94, 0.8)";

/**
 * Draw the spectrum bars onto the canvas.
 * Called on every animation frame — must be allocation-free.
 */
function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  spectrum: number[],
  beat: boolean,
): void {
  ctx.clearRect(0, 0, w, h);

  const n = spectrum.length;
  if (n === 0) return;

  const gap = Math.max(1, Math.floor(w / n / 8));
  const barW = (w - gap * (n - 1)) / n;
  const color = beat ? BAR_BEAT_COLOR : BAR_COLOR;

  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const v = spectrum[i];
    const barH = Math.max(1, v * h);
    const x = i * (barW + gap);
    const y = h - barH;
    ctx.fillRect(x, y, barW, barH);
  }
}

/**
 * Draw the waveform line onto the canvas.
 * Called on every animation frame — must be allocation-free.
 */
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  waveform: number[],
): void {
  ctx.clearRect(0, 0, w, h);

  const n = waveform.length;
  if (n === 0) return;

  const midY = h / 2;

  // Draw centre line
  ctx.beginPath();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  // Draw waveform
  ctx.beginPath();
  ctx.strokeStyle = WAVE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";

  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = midY - waveform[i] * midY * 0.9;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function SpectrumAnalyzer({
  levelsRef,
  mode = "spectrum",
  height = 48,
  className,
}: SpectrumAnalyzerProps) {
  const specCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const draw = useCallback(() => {
    if (!mountedRef.current) return;

    const levels = levelsRef?.current;

    const spectrum = levels?.spectrum ?? [];
    const waveform = levels?.waveform ?? [];
    const beat = levels?.beat ?? false;

    if (mode === "spectrum" || mode === "both") {
      const canvas = specCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) drawSpectrum(ctx, canvas.width, canvas.height, spectrum, beat);
      }
    }
    if (mode === "waveform" || mode === "both") {
      const canvas = waveCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) drawWaveform(ctx, canvas.width, canvas.height, waveform);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [levelsRef, mode]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  const showSpectrum = mode === "spectrum" || mode === "both";
  const showWaveform = mode === "waveform" || mode === "both";

  return (
    <div
      className={`${styles.container} ${className ?? ""}`}
      style={{ height: mode === "both" ? height * 2 + 4 : height }}
    >
      {showSpectrum && (
        <canvas
          ref={specCanvasRef}
          className={styles.canvas}
          width={300}
          height={height}
          aria-hidden="true"
        />
      )}
      {showWaveform && (
        <canvas
          ref={waveCanvasRef}
          className={styles.canvas}
          width={300}
          height={height}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
