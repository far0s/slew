/**
 * AudioIndicator
 *
 * Compact toolbar pill showing a live mini-spectrum + beat flash.
 * Canvas-based — zero React state updates on the hot path.
 * Only shown when audio capture is running.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AudioLevels } from "../../inputs/audio";
import styles from "./AudioIndicator.module.css";

const BINS = 12; // fewer bins for the compact size

export function AudioIndicator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const levelsRef = useRef<AudioLevels | null>(null);
  const rafRef = useRef<number>(0);
  const [isRunning, setIsRunning] = useState(false);

  // Subscribe to audio status changes
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      unlisten = await listen<{ is_running: boolean }>("audio_status_changed", (event) => {
        setIsRunning(event.payload.is_running);
      });
    })();
    return () => { unlisten?.(); };
  }, []);

  // Subscribe to audio_levels directly — no state, no re-render
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void (async () => {
      unlisten = await listen<AudioLevels>("audio_levels", (event) => {
        levelsRef.current = event.payload;
      });
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const levels = levelsRef.current;
    const spectrum = levels?.spectrum ?? [];
    const beat = levels?.beat ?? false;

    if (spectrum.length === 0) {
      // No audio data yet — draw idle placeholder bars
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      const gap = 1;
      const barW = (w - gap * (BINS - 1)) / BINS;
      for (let i = 0; i < BINS; i++) {
        ctx.fillRect(i * (barW + gap), h - 2, barW, 2);
      }
    } else {
      // Downsample spectrum to BINS
      const factor = Math.floor(spectrum.length / BINS);
      ctx.fillStyle = beat
        ? "rgba(99, 102, 241, 1)"
        : "rgba(99, 102, 241, 0.75)";
      const gap = 1;
      const barW = (w - gap * (BINS - 1)) / BINS;
      for (let i = 0; i < BINS; i++) {
        const v = spectrum[i * factor] ?? 0;
        const barH = Math.max(1, v * h);
        ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  if (!isRunning) return null;

  return (
    <div className={styles.pill} title="Audio input active">
      <span className={styles.dot} />
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={48}
        height={14}
        aria-hidden="true"
      />
    </div>
  );
}
