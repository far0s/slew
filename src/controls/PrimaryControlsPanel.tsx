import * as Select from "@radix-ui/react-select";
import * as Progress from "@radix-ui/react-progress";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import type { SceneId } from "../scenes/sceneTypes";
import appShellStyles from "../AppShell.module.css";
import type { SetSceneId } from "./scenePairing";
import { setScenePairingOnBackend } from "./scenePairing";

export interface PrimaryControlsPanelProps {
  // Scene pairing state
  activeSceneId: SceneId;
  nextSceneId: SceneId;
  setActiveSceneId: SetSceneId;
  setNextSceneId: SetSceneId;

  // Crossfade state
  crossfade: number;

  // Actions
  handleCrossfadeChange: (value: number) => Promise<void>;
}

/**
 * PrimaryControlsPanel
 *
 * Extracted from App.tsx: this component owns the main "live" controls:
 * - Crossfade + pairing context (but not scene selection dropdowns).
 * - Scene A brightness / wobble.
 * - Rotation speed.
 * - Scene A tint + tint LFO depth.
 *
 * It is intentionally "dumb" about backend wiring: all state and handlers
 * are passed in via props so App.tsx can continue to centralize business
 * logic and Parameter Server integration.
 */
export function PrimaryControlsPanel(props: PrimaryControlsPanelProps) {
  const {
    activeSceneId,
    nextSceneId,
    setActiveSceneId,
    setNextSceneId,
    crossfade,
    handleCrossfadeChange,
  } = props;

  // Disable pairing controls while crossfading to avoid mid-transition changes
  const isCrossfading = crossfade > 0.01 && crossfade < 0.99;

  // At the endpoints, lock the corresponding scene combo:
  // - When crossfade === 0 → Active scene is fully visible; its combo is locked.
  // - When crossfade === 1 → Next scene is fully visible; its combo is locked.
  const isActiveLocked = crossfade <= 0.01;
  const isNextLocked = crossfade >= 0.99;

  return (
    <section
      aria-label="Scene control strip"
      className={appShellStyles.panel}
      style={{
        flex: "0 1 auto",
      }}
    >
      <header className={appShellStyles.stack}>
        <div className={appShellStyles.row}>
          <h2 className={appShellStyles.panelTitle}>Scene control</h2>
        </div>
      </header>

      <div
        className={appShellStyles.stack}
        style={{
          marginTop: "0.5rem",
        }}
      >
        <div className={appShellStyles.stack}>
          <div className={appShellStyles.row}>
            <div className={appShellStyles.stack} style={{ flex: 1, gap: 0 }}>
              <p
                style={{
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                Active
                <div
                  style={{
                    flex: 0.4,
                    minWidth: "140px",
                  }}
                >
                  <Progress.Root
                    value={crossfade * 100}
                    max={100}
                    className="relative h-5 w-1/2 overflow-hidden rounded-full border border-slate-600/70 bg-slate-900/90"
                  >
                    <Progress.Indicator
                      className="h-full w-full bg-sky-500/80 transition-transform duration-200 ease-out"
                      style={{
                        transform: `translateX(${crossfade * 100}%)`,
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: "0.75rem",
                        color: "#e5e7eb",
                        textShadow: "0 1px 2px rgba(15,23,42,0.9)",
                      }}
                    >
                      {((1 - crossfade) * 100).toFixed(0)}%
                    </span>
                  </Progress.Root>
                </div>
              </p>
              <div className={appShellStyles.row}>
                <Select.Root
                  value={activeSceneId}
                  disabled={isCrossfading || isActiveLocked}
                  onValueChange={(nextId: string) => {
                    const id = nextId as SceneId;
                    void setScenePairingOnBackend({
                      currentActive: id,
                      currentNext: nextSceneId,
                      setActiveSceneId,
                      setNextSceneId,
                    });
                  }}
                >
                  <Select.Trigger
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-t-lg rounded-b-none border border-slate-500/70 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 shadow-subtle disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-label="Active scene"
                  >
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDownIcon />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="z-50 overflow-hidden rounded-md border border-slate-700 bg-slate-950 text-xs text-slate-100 shadow-subtle-elevated"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport className="p-1">
                        <Select.Item
                          className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                          value="sceneA"
                        >
                          <Select.ItemText>Scene A</Select.ItemText>
                        </Select.Item>
                        <Select.Item
                          className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                          value="sceneB"
                        >
                          <Select.ItemText>Scene B</Select.ItemText>
                        </Select.Item>
                        <Select.Item
                          className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                          value="sceneC"
                        >
                          <Select.ItemText>Scene C</Select.ItemText>
                        </Select.Item>
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <button
                type="button"
                onClick={() => {
                  // Crossfade fully to the active scene (crossfade → 0).
                  if (!isCrossfading) {
                    void handleCrossfadeChange(0);
                  }
                }}
                disabled={isCrossfading || isActiveLocked}
                className="flex-1 rounded-b-lg rounded-t-none border border-slate-500/70 border-t-0 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Crossfade to Active
              </button>
            </div>
            <div className={appShellStyles.stack} style={{ flex: 1, gap: 0 }}>
              <p
                style={{
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                Next
                <div
                  style={{
                    flex: 0.4,
                    minWidth: "140px",
                  }}
                >
                  <Progress.Root
                    value={crossfade * 100}
                    max={100}
                    className="relative h-5 w-1/2 overflow-hidden rounded-full border border-slate-600/70 bg-slate-900/90"
                  >
                    <Progress.Indicator
                      className="h-full w-full bg-sky-500/80 transition-transform duration-200 ease-out"
                      style={{
                        transform: `translateX(${(crossfade - 1) * 100}%)`,
                      }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontVariantNumeric: "tabular-nums",
                        fontSize: "0.75rem",
                        color: "#e5e7eb",
                        textShadow: "0 1px 2px rgba(15,23,42,0.9)",
                      }}
                    >
                      {(crossfade * 100).toFixed(0)}%
                    </span>
                  </Progress.Root>
                </div>
              </p>
              <div
                aria-label="Scene crossfade pairing"
                className={appShellStyles.stack}
                style={{
                  gap: "0.3rem",
                }}
              >
                <div className={appShellStyles.row}>
                  <div
                    className={appShellStyles.row}
                    style={{ gap: "0.35rem" }}
                  >
                    <Select.Root
                      value={nextSceneId}
                      disabled={isCrossfading || isNextLocked}
                      onValueChange={(nextId: string) => {
                        const id = nextId as SceneId;
                        void setScenePairingOnBackend({
                          currentActive: activeSceneId,
                          currentNext: id,
                          setActiveSceneId,
                          setNextSceneId,
                        });
                      }}
                    >
                      <Select.Trigger
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-t-lg rounded-b-none border border-slate-500/70 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 shadow-subtle disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                        aria-label="Next scene"
                      >
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDownIcon />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content
                          className="z-50 overflow-hidden rounded-md border border-slate-700 bg-slate-950 text-xs text-slate-100 shadow-subtle-elevated"
                          position="popper"
                          sideOffset={4}
                        >
                          <Select.Viewport className="p-1">
                            <Select.Item
                              className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                              value="sceneA"
                            >
                              <Select.ItemText>Scene A</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                              value="sceneB"
                            >
                              <Select.ItemText>Scene B</Select.ItemText>
                            </Select.Item>
                            <Select.Item
                              className="flex cursor-pointer select-none items-center gap-1 rounded px-2 py-1 data-[highlighted]:bg-slate-800 data-[highlighted]:text-slate-100 data-[state=checked]:font-semibold"
                              value="sceneC"
                            >
                              <Select.ItemText>Scene C</Select.ItemText>
                            </Select.Item>
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  // Crossfade fully to the next scene (crossfade → 1).
                  if (!isCrossfading) {
                    void handleCrossfadeChange(1);
                  }
                }}
                disabled={isCrossfading}
                className="flex-1 rounded-b-lg rounded-t-none border border-slate-500/70 border-t-0 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Crossfade to Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default PrimaryControlsPanel;
