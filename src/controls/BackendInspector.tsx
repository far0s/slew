import React from "react";
import { getSceneDescriptor, type ParameterId } from "../scenes/sceneTypes";
import type { BackendParameter } from "./controlsParameters";
import appShellStyles from "../AppShell.module.css";

export interface BackendInspectorProps {
  backendParameters: BackendParameter[] | null;
  isLoadingParams: boolean;
  paramError: string | null;
  onRefresh: () => void;
  onResetDefaults: () => void;
  onClearParameters: () => void;
}

/**
 * BackendInspector
 *
 * Extracted from App.tsx to show a structured view of the backend
 * Parameter Server state (Scene A parameters first, then globals/others),
 * plus a small action row (Refresh / Reset to defaults / Clear).
 */
export function BackendInspector({
  backendParameters,
  isLoadingParams,
  paramError,
  onRefresh,
  onResetDefaults,
  onClearParameters,
}: BackendInspectorProps) {
  // Precompute groupings only when we have some parameters.
  const sceneAParams: BackendParameter[] = React.useMemo(() => {
    if (!backendParameters || backendParameters.length === 0) return [];

    const sceneADescriptor = getSceneDescriptor("sceneA");
    if (!sceneADescriptor) return [];

    const sceneAParamIds = new Set<ParameterId>(
      sceneADescriptor.parameters.map((p) => p.id),
    );

    const backendParams: BackendParameter[] = backendParameters ?? [];

    const filtered = backendParams.filter((param: BackendParameter) =>
      sceneAParamIds.has(param.id as ParameterId),
    );

    const orderMap = new Map<ParameterId, number>();
    for (const p of sceneADescriptor.parameters) {
      if (typeof p.orderHint === "number") {
        orderMap.set(p.id, p.orderHint);
      }
    }

    return filtered.sort((a: BackendParameter, b: BackendParameter) => {
      const aOrder = orderMap.get(a.id as ParameterId) ?? Number.MAX_VALUE;
      const bOrder = orderMap.get(b.id as ParameterId) ?? Number.MAX_VALUE;
      return aOrder - bOrder;
    });
  }, [backendParameters]);

  const globalParams: BackendParameter[] = React.useMemo(() => {
    if (!backendParameters || backendParameters.length === 0) return [];

    const sceneADescriptor = getSceneDescriptor("sceneA");
    if (!sceneADescriptor) return backendParameters;

    const sceneAParamIds = new Set<ParameterId>(
      sceneADescriptor.parameters.map((p) => p.id),
    );

    const backendParams: BackendParameter[] = backendParameters ?? [];

    return backendParams.filter(
      (param: BackendParameter) => !sceneAParamIds.has(param.id as ParameterId),
    );
  }, [backendParameters]);

  const renderBody = () => {
    if (backendParameters === null && !isLoadingParams) {
      return (
        <p className={appShellStyles.caption}>No parameters loaded yet.</p>
      );
    }

    if (backendParameters && backendParameters.length === 0) {
      return (
        <p className={appShellStyles.caption}>
          Parameter store is currently empty.
        </p>
      );
    }

    return (
      <>
        {globalParams?.length > 0 && (
          <>
            <h3
              style={{
                padding: "0.35rem 0 0.1rem",
                margin: "0.4rem 0 0",
              }}
              className={appShellStyles.panelTitle}
            >
              Global / Other
            </h3>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                fontFamily:
                  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {globalParams.map((param: BackendParameter) => (
                <li
                  key={param.id}
                  style={{
                    padding: "0.3rem 0",
                    borderBottom: "1px solid rgba(148,163,184,0.18)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.08rem",
                  }}
                >
                  <span className={appShellStyles.label}>{param.id}</span>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      opacity: 0.85,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    value: {param.value.toFixed(3)} — target:{" "}
                    {param.target.toFixed(3)}
                  </span>
                  <span className={appShellStyles.caption}>
                    speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                    {param.curve}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {sceneAParams?.length > 0 && (
          <>
            <h3 className={appShellStyles.panelTitle}>Scene A</h3>
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                fontFamily:
                  "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
              }}
            >
              {sceneAParams.map((param: BackendParameter) => (
                <li
                  key={param.id}
                  style={{
                    padding: "0.3rem 0",
                    borderBottom: "1px solid rgba(148,163,184,0.18)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.08rem",
                  }}
                >
                  <span className={appShellStyles.label}>{param.id}</span>
                  <span
                    style={{
                      fontSize: "0.78rem",
                      opacity: 0.85,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    value: {param.value.toFixed(3)} — target:{" "}
                    {param.target.toFixed(3)}
                  </span>
                  <span className={appShellStyles.caption}>
                    speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                    {param.curve}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </>
    );
  };

  return (
    <aside
      aria-label="Backend parameter inspector"
      className={appShellStyles.panel}
      style={{
        flex: "1 1 360px",
        fontSize: "0.8rem",
      }}
    >
      <h2 className={appShellStyles.panelTitle}>Backend parameters</h2>

      <div
        className={appShellStyles.row}
        style={{
          alignItems: "center",
          marginTop: "0.1rem",
          flex: 0,
        }}
      >
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border border-slate-400/60 bg-transparent px-2 py-1 text-xs text-slate-100 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          {isLoadingParams ? "Refreshing…" : "Refresh"}
        </button>

        <button
          type="button"
          onClick={onResetDefaults}
          className="rounded-full border border-sky-400/70 bg-transparent px-2 py-1 text-xs text-sky-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Reset to defaults
        </button>

        <button
          type="button"
          onClick={onClearParameters}
          className="rounded-full border border-red-400/70 bg-transparent px-2 py-1 text-xs text-red-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Clear
        </button>
      </div>

      {paramError ? (
        <p
          style={{
            marginTop: "0.45rem",
            color: "#fca5a5",
            fontSize: "0.78rem",
          }}
        >
          {paramError}
        </p>
      ) : null}

      <div
        style={{
          marginTop: "0.45rem",
          overflowY: "auto",
        }}
      >
        {renderBody()}
      </div>
    </aside>
  );
}

export default BackendInspector;
