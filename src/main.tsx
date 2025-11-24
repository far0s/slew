import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { listen } from "@tauri-apps/api/event";

/**
 * Entry point for the Tauri app.
 *
 * We support two windows:
 * - Renderer window:   Tauri `label: "renderer"`, URL `/renderer`
 * - Controls window:   Tauri `label: "controls"`, URL `/`
 *
 * Tauri loads the same bundled frontend for both windows, but we choose
 * what to render based on `window.location.pathname`. For now:
 *
 * - `/renderer` → basic renderer visualization that listens for crossfade events
 * - `/` (or anything else) → control UI (`App`)
 *
 * As the project grows:
 * - The renderer entrypoint will mount a dedicated React tree that hosts
 *   the r3f/WebGPU canvas and scene system.
 * - The controls entrypoint will mount the dashboard UI.
 */

const pathname = window.location.pathname;

function RendererRoot() {
  /**
   * Listen for `renderer:crossfade` events emitted by the backend
   * (originating from the controls window via `forward_controls_event`),
   * and visualize the current crossfade value.
   */
  const [crossfade, setCrossfade] = useState(0.5);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    // Listen for events forwarded from the controls window. The payload is
    // expected to be a JSON string with shape: { value: number }.
    void (async () => {
      unlisten = await listen<string>("renderer:crossfade", (event) => {
        try {
          const parsed = JSON.parse(event.payload ?? "{}") as {
            value?: unknown;
          };

          if (typeof parsed.value === "number") {
            // Clamp for safety in case of out-of-range values.
            const clamped = Math.max(0, Math.min(1, parsed.value));
            setCrossfade(clamped);
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to parse renderer:crossfade payload", error);
        }
      });
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const percent = Math.round(crossfade * 100);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        color: "white",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "0.75rem 1.25rem",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <h1
            style={{
              fontSize: "1rem",
              margin: 0,
              letterSpacing: 0.04,
              textTransform: "uppercase",
              opacity: 0.9,
            }}
          >
            sebcat-vj — Renderer
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              opacity: 0.7,
            }}
          >
            Listening for crossfade events from Controls…
          </p>
        </header>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <div
            aria-label="Crossfade visualization"
            style={{
              width: "min(520px, 90vw)",
              maxWidth: 520,
              borderRadius: "0.75rem",
              border: "1px solid rgba(255,255,255,0.16)",
              background:
                "radial-gradient(circle at top left, #1f2937 0, #020617 60%)",
              padding: "1.5rem 1.75rem 1.75rem",
              boxShadow:
                "0 18px 45px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.02)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "0.75rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.9rem",
                  letterSpacing: 0.08,
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                Crossfade
              </span>
              <span
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontSize: "0.9rem",
                  opacity: 0.9,
                }}
              >
                {percent}%
              </span>
            </div>

            <div
              style={{
                position: "relative",
                height: 18,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, rgba(31,41,55,1) 0%, rgba(15,23,42,1) 100%)",
                overflow: "hidden",
              }}
            >
              {/* Scene A portion */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${100 - percent}%`,
                  background:
                    "linear-gradient(90deg, #38bdf8 0%, rgba(15,23,42,0.3) 100%)",
                  transition: "width 120ms ease-out",
                }}
              />
              {/* Scene B portion */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  left: `${100 - percent}%`,
                  width: `${percent}%`,
                  background:
                    "linear-gradient(90deg, rgba(15,23,42,0.2) 0%, #f97316 100%)",
                  transition: "left 120ms ease-out, width 120ms ease-out",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "0.85rem",
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.78rem",
                opacity: 0.8,
              }}
            >
              <span>A (0%)</span>
              <span>B (100%)</span>
            </div>

            <p
              style={{
                marginTop: "0.9rem",
                fontSize: "0.8rem",
                opacity: 0.8,
                lineHeight: 1.5,
              }}
            >
              This is a temporary visualization. In the real renderer, this
              value will drive the blend between Scene&nbsp;A and
              Scene&nbsp;B&apos;s render targets and postprocessing pipeline.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  // Hard fail early; Tauri's HTML template should always include #root.
  throw new Error("Root element #root not found");
}

const root = ReactDOM.createRoot(rootElement);

// Route based on pathname. Later we can refine this (e.g. hash, search params)
// or read the window label from Tauri if needed.
if (pathname === "/renderer") {
  root.render(
    <React.StrictMode>
      <RendererRoot />
    </React.StrictMode>,
  );
} else {
  // Default to the controls UI
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
