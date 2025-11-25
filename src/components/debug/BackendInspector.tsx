import React from "react";
import { getSceneDescriptor, type ParameterId } from "../../scenes/sceneTypes";
import type { BackendParameter } from "../../controls/controlsParameters";
import { Button } from "../ui/Button";
import styles from "./BackendInspector.module.css";

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
 * Shows a structured view of the backend Parameter Server state
 * (Scene A parameters first, then globals/others), plus action buttons.
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

    const filtered = backendParameters.filter((param: BackendParameter) =>
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

    return backendParameters.filter(
      (param: BackendParameter) => !sceneAParamIds.has(param.id as ParameterId),
    );
  }, [backendParameters]);

  const renderParamList = (params: BackendParameter[]) => (
    <ul className={styles.paramList}>
      {params.map((param: BackendParameter) => (
        <li key={param.id} className={styles.paramItem}>
          <span className={styles.paramId}>{param.id}</span>
          <span className={styles.paramValues}>
            value: {param.value.toFixed(3)} — target: {param.target.toFixed(3)}
          </span>
          <span className={styles.paramMeta}>
            speed: {param.transition_speed.toFixed(3)}, curve: {param.curve}
          </span>
        </li>
      ))}
    </ul>
  );

  const renderBody = () => {
    if (backendParameters === null && !isLoadingParams) {
      return <p className={styles.emptyState}>No parameters loaded yet.</p>;
    }

    if (backendParameters && backendParameters.length === 0) {
      return (
        <p className={styles.emptyState}>Parameter store is currently empty.</p>
      );
    }

    return (
      <>
        {globalParams?.length > 0 && (
          <>
            <h3 className={styles.sectionTitle}>Global / Other</h3>
            {renderParamList(globalParams)}
          </>
        )}

        {sceneAParams?.length > 0 && (
          <>
            <h3 className={styles.sectionTitle}>Scene A</h3>
            {renderParamList(sceneAParams)}
          </>
        )}
      </>
    );
  };

  return (
    <aside aria-label="Backend parameter inspector" className={styles.container}>
      <h2 className={styles.title}>Backend parameters</h2>

      <div className={styles.actions}>
        <Button onClick={onRefresh} isLoading={isLoadingParams} loadingText="Refreshing…">
          Refresh
        </Button>
        <Button variant="primary" onClick={onResetDefaults}>
          Reset to defaults
        </Button>
        <Button variant="danger" onClick={onClearParameters}>
          Clear
        </Button>
      </div>

      {paramError && <p className={styles.error}>{paramError}</p>}

      <div className={styles.scrollArea}>{renderBody()}</div>
    </aside>
  );
}

export default BackendInspector;
