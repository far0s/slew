import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * sebcat-vj — Control UI (Window B)
 *
 * This is a minimal placeholder for the future VJ control surface.
 * It:
 * - Exposes a single slider (“Crossfade”) to prove out the controls window
 * - Is keyboard-accessible and screen-reader-friendly
 * - Forwards the value to the backend via `forward_controls_event`
 * - Will later expand into scene selection, parameter panels, MIDI/OSC/audio config, etc.
 */

function App() {
  const [crossfade, setCrossfade] = useState(0.5);

  async function handleCrossfadeChange(next: number) {
    setCrossfade(next);

    // Fire-and-forget call into the backend. The backend will forward this
    // event to the renderer window as `renderer:crossfade`, with the payload
    // as a JSON string (for now just `{ value: number }`).
    try {
      await invoke("forward_controls_event", {
        event: "crossfade",
        payload: JSON.stringify({ value: next }),
      });
    } catch (error) {
      // In a real UI we might surface this in a toast/log panel.
      // For now we just log to the console.
      // eslint-disable-next-line no-console
      console.error("Failed to forward crossfade event", error);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#05060a",
        color: "#f5f5f5",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      <header
        style={{
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.1rem",
              letterSpacing: 0.02,
              margin: 0,
            }}
          >
            sebcat-vj — Controls
          </h1>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "0.8rem",
              opacity: 0.75,
            }}
          >
            Placeholder control UI. This window will drive parameters for the
            renderer window.
          </p>
        </div>

        <div
          style={{
            fontSize: "0.75rem",
            opacity: 0.75,
            textAlign: "right",
          }}
        >
          <div>Phase 1 — Foundations</div>
          <div>Basic messaging &amp; layout</div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "center",
          padding: "1.5rem",
          gap: "1.5rem",
        }}
      >
        <section
          aria-label="Primary controls"
          style={{
            flex: "0 1 480px",
            borderRadius: "0.75rem",
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "radial-gradient(circle at top left, #1b2735 0, #05060a 55%)",
            padding: "1.25rem 1.5rem 1.5rem",
            boxShadow:
              "0 18px 35px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.02)",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <header>
            <h2
              style={{
                fontSize: "0.95rem",
                margin: 0,
                letterSpacing: 0.03,
                textTransform: "uppercase",
                opacity: 0.9,
              }}
            >
              Live Controls (Placeholder)
            </h2>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.8rem",
                opacity: 0.8,
              }}
            >
              In the prototype, these values will be pushed to the renderer via
              the backend event bus.
            </p>
          </header>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              marginTop: "0.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <label
                htmlFor="crossfade"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 500,
                }}
              >
                <span>Crossfade</span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontSize: "0.8rem",
                    opacity: 0.8,
                  }}
                >
                  {(crossfade * 100).toFixed(0)}%
                </span>
              </label>

              <input
                id="crossfade"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={crossfade}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value);
                  // Keep the UI responsive by updating local state immediately,
                  // then asynchronously forwarding the change to the backend.
                  void handleCrossfadeChange(next);
                }}
                style={{
                  width: "100%",
                  accentColor: "#f97316",
                  cursor: "pointer",
                }}
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={crossfade}
                aria-label="Scene crossfade between A and B"
              />

              <p
                style={{
                  margin: 0,
                  fontSize: "0.78rem",
                  opacity: 0.8,
                  lineHeight: 1.5,
                }}
              >
                This will eventually control the blend between Scene&nbsp;A and
                Scene&nbsp;B in the renderer window. It’s a simple placeholder
                to validate messaging and parameter wiring.
              </p>
            </div>
          </div>
        </section>

        <aside
          aria-label="Upcoming panels"
          style={{
            flex: "0 1 320px",
            borderRadius: "0.75rem",
            border: "1px dashed rgba(255,255,255,0.18)",
            background:
              "linear-gradient(135deg, rgba(16,24,40,0.9), rgba(5,6,10,0.95))",
            padding: "1.1rem 1.25rem 1.3rem",
            fontSize: "0.8rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "0.9rem",
              textTransform: "uppercase",
              letterSpacing: 0.06,
              opacity: 0.85,
            }}
          >
            Roadmap (this window)
          </h2>
          <ul
            style={{
              margin: "0.35rem 0 0",
              paddingLeft: "1.1rem",
              lineHeight: 1.55,
              opacity: 0.9,
            }}
          >
            <li>Scene selection &amp; switching</li>
            <li>Parameter panels (Leva-like)</li>
            <li>MIDI learn &amp; mappings</li>
            <li>OSC &amp; audio input configuration</li>
            <li>Preset / project management</li>
          </ul>
        </aside>
      </main>
    </div>
  );
}

export default App;
