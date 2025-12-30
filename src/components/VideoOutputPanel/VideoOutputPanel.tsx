/**
 * VideoOutputPanel
 *
 * Control panel for video output backends (Syphon, Spout, NDI).
 * Allows enabling/disabling backends and shows status.
 */

import { useState } from "react";
import { CheckCircledIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import {
  useVideoOutputBackends,
  type BackendStatus,
} from "../../inputs/videoOutput";
import styles from "./VideoOutputPanel.module.css";

/**
 * Backend card showing status and toggle control.
 */
function BackendCard({
  backend,
  onToggle,
  isLoading,
}: {
  backend: BackendStatus;
  onToggle: () => void;
  isLoading: boolean;
}) {
  const canToggle = backend.available;

  return (
    <div
      className={`${styles.backendCard} ${
        backend.active ? styles.active : ""
      } ${!backend.available ? styles.unavailable : ""}`}
    >
      <div className={styles.backendHeader}>
        <div className={styles.backendInfo}>
          <span className={styles.backendName}>{backend.name}</span>
          <span className={styles.backendId}>{backend.id}</span>
        </div>

        <div className={styles.backendStatus}>
          {backend.available ? (
            backend.active ? (
              <span className={styles.statusActive}>
                <CheckCircledIcon className={styles.statusIcon} />
                Active
              </span>
            ) : (
              <span className={styles.statusInactive}>Ready</span>
            )
          ) : (
            <span className={styles.statusUnavailable}>
              <CrossCircledIcon className={styles.statusIcon} />
              Unavailable
            </span>
          )}
        </div>
      </div>

      {backend.active && (
        <motion.div
          className={styles.backendStats}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
        >
          <div className={styles.stat}>
            <span className={styles.statLabel}>Frames</span>
            <span className={styles.statValue}>
              {backend.frames_published.toLocaleString()}
            </span>
          </div>
          {backend.receivers !== null && (
            <div className={styles.stat}>
              <span className={styles.statLabel}>Receivers</span>
              <span className={styles.statValue}>{backend.receivers}</span>
            </div>
          )}
        </motion.div>
      )}

      {backend.last_error && (
        <div className={styles.errorMessage}>{backend.last_error}</div>
      )}

      <button
        className={`${styles.toggleButton} ${
          backend.active ? styles.toggleOff : styles.toggleOn
        }`}
        onClick={onToggle}
        disabled={!canToggle || isLoading}
      >
        {isLoading ? "..." : backend.active ? "Disable" : "Enable"}
      </button>
    </div>
  );
}

/**
 * VideoOutputPanel
 *
 * Panel for managing video output backends.
 */
export function VideoOutputPanel() {
  const [loadingBackend, setLoadingBackend] = useState<string | null>(null);
  const { backends, loading, error, toggle, refresh } =
    useVideoOutputBackends();

  const handleToggle = async (backendId: string) => {
    setLoadingBackend(backendId);
    try {
      await toggle(backendId);
    } finally {
      setLoadingBackend(null);
    }
  };

  const activeCount = backends.filter((b) => b.active).length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>Video Output</h3>
        <span
          className={`${styles.statusBadge} ${activeCount > 0 ? styles.active : ""}`}
        >
          {activeCount > 0 ? `${activeCount} active` : "Inactive"}
        </span>
      </div>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loadingState}>Loading backends…</div>
        ) : error ? (
          <div className={styles.errorState}>
            <span>Error: {error}</span>
            <button onClick={refresh} className={styles.retryButton}>
              Retry
            </button>
          </div>
        ) : backends.length === 0 ? (
          <div className={styles.emptyState}>
            No video output backends available
          </div>
        ) : (
          <div className={styles.backendList}>
            {backends.map((backend) => (
              <BackendCard
                key={backend.id}
                backend={backend}
                onToggle={() => handleToggle(backend.id)}
                isLoading={loadingBackend === backend.id}
              />
            ))}
          </div>
        )}

        <div className={styles.hint}>
          <strong>Tip:</strong> Enable Syphon to share visuals with Resolume,
          VDMX, or OBS on macOS.
        </div>
      </div>
    </div>
  );
}
