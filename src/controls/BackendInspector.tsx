import React from "react";
import { getSceneDescriptor, type ParameterId } from "../scenes/sceneTypes";
import type { BackendParameter } from "./controlsParameters";

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
      const aOrder =
        orderMap.get(a.id as ParameterId) ?? Number.MAX_VALUE;
      const bOrder =
        orderMap.get(b.id as ParameterId) ?? Number.MAX_VALUE;
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
      (param: BackendParameter) =>
        !sceneAParamIds.has(param.id as ParameterId),
    );
  }, [backendParameters]);

  const renderBody = () => {
    if (backendParameters === null && !isLoadingParams) {
      return (
        <p
          style={{
            opacity: 0.8,
            fontSize: "0.78rem",
          }}
        >
          No parameters loaded yet.
        </p>
      );
    }

    if (backendParameters && backendParameters.length === 0) {
      return (
        <p
          style={{
            opacity: 0.8,
            fontSize: "0.78rem",
          }}
        >
          Parameter store is currently empty.
        </p>
      );
    }

    return (
      <>
        <h3
          style={{
            padding: "0.25rem 0",
            margin: 0,
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: 0.08,
            opacity: 0.8,
          }}
        >
          Scene A
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
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              >
                {param.id}
              </span>
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
              <span
                style={{
                  fontSize: "0.74rem",
                  opacity: 0.75,
                }}
              >
                speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                {param.curve}
              </span>
            </li>
          ))}
        </ul>

        <h3
          style={{
            padding: "0.35rem 0 0.1rem",
            margin: "0.4rem 0 0",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: 0.08,
            opacity: 0.8,
          }}
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
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                }}
              >
                {param.id}
              </span>
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
              <span
                style={{
                  fontSize: "0.74rem",
                  opacity: 0.75,
                }}
              >
                speed: {param.transition_speed.toFixed(3)}, curve:{" "}
                {param.curve}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <aside
      aria-label="Backend parameter inspector"
      style={{
        flex: "0 1 360px",
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
        Backend parameters
      </h2>

      <p
        style={{
          margin: "0.3rem 0 0.4rem",
          opacity: 0.85,
          lineHeight: 1.4,
        }}
      >
        Live view of the backend Parameter Server. Values shown here are the
        backend&apos;s canonical state, not the renderer&apos;s local copy.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "0.1rem",
        }}
      >
        <button
          type="button"
          onClick={onRefresh}
          style={{
            padding: "0.25rem 0.6rem",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: "1px solid rgba(148,163,184,0.6)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
          }}
        >
          {isLoadingParams ? "Refreshing…" : "Refresh"}
        </button>

        <button
          type="button"
          onClick={onResetDefaults}
          style={{
            padding: "0.25rem 0.6rem",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: "1px solid rgba(96,165,250,0.7)",
            background: "transparent",
            color: "#bfdbfe",
            cursor: "pointer",
          }}
        >
          Reset to defaults
        </button>

        <button
          type="button"
          onClick={onClearParameters}
          style={{
            padding: "0.25rem 0.6rem",
            fontSize: "0.78rem",
            borderRadius: "999px",
            border: "1px solid rgba(248,113,113,0.7)",
            background: "transparent",
            color: "#fecaca",
            cursor: "pointer",
          }}
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
          maxHeight: 220,
          overflowY: "auto",
          paddingRight: "0.25rem",
        }}
      >
        {renderBody()}
      </div>
    </aside>
  );
}

export default BackendInspector;
