/**
 * OutputsPanel
 *
 * Unified panel listing all output destinations (Syphon/NDI/Spout video
 * backends and WLED LED fixtures) as expandable device cards.
 * Replaces the OutputSection from VideoOutputPanel and the WLED tab.
 */

import { useState, useCallback, useMemo } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { motion, AnimatePresence } from "motion/react";
import { WledPanel } from "@/components/panels/WledPanel";
import {
  useVideoOutputBackends,
  type BackendStatus,
} from "@/outputs/videoOutput";
import { useWled } from "@/outputs/wled";
import type { OutputDevice, OutputDeviceType, DeviceStatus } from "@/devices/types";
import styles from "./OutputsPanel.module.css";

// ============================================================================
// Backend metadata
// ============================================================================

const BACKEND_DESCRIPTIONS: Record<string, string> = {
  syphon: "Share frames with other apps on this Mac",
  ndi: "Stream over your local network",
  spout: "Share frames with other apps on Windows",
};

const BACKEND_TYPES: Record<string, OutputDeviceType> = {
  syphon: "video_syphon",
  ndi: "video_ndi",
  spout: "video_spout",
};

// ============================================================================
// Type labels
// ============================================================================

const DEVICE_TYPE_LABELS: Record<OutputDeviceType, string> = {
  video_syphon: "Syphon",
  video_ndi: "NDI",
  video_spout: "Spout",
  wled_fixture: "WLED",
};

// ============================================================================
// Status label
// ============================================================================

function StatusLabel({ status }: { status: DeviceStatus }) {
  const labels: Record<DeviceStatus, string> = {
    connected: "Connected",
    active: "Active",
    disconnected: "Ready",
    searching: "Searching…",
    error: "Error",
  };
  return (
    <span
      className={`${styles.statusLabel} ${styles[`status_${status}`]}`}
    >
      {labels[status]}
    </span>
  );
}

// ============================================================================
// Device card
// ============================================================================

interface DeviceCardProps {
  device: OutputDevice;
  expanded: boolean;
  onToggle: () => void;
  helpAnchor?: string;
  helpSection?: string;
  children: React.ReactNode;
}

function DeviceCard({ device, expanded, onToggle, helpAnchor, helpSection, children }: DeviceCardProps) {
  return (
    <div className={`${styles.deviceCard} ${expanded ? styles.cardExpanded : ""}`}>
      <button
        type="button"
        className={styles.cardHeader}
        onClick={onToggle}
        aria-expanded={expanded}
        data-help-anchor={helpAnchor}
        data-help-section={helpSection}
      >
        <span className={styles.deviceTypeLabel}>
          {DEVICE_TYPE_LABELS[device.type]}
        </span>

        <div className={styles.cardInfo}>
          <span className={styles.cardName}>{device.name}</span>
          {device.mappingCount > 0 && (
            <span className={styles.mappingCount}>
              {device.mappingCount} mapping{device.mappingCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <StatusLabel status={device.status} />

        {expanded ? (
          <ChevronDownIcon className={styles.chevron} />
        ) : (
          <ChevronRightIcon className={styles.chevron} />
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className={styles.cardBody}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Video backend detail (expanded content)
// ============================================================================

const BACKEND_ANCHORS: Record<string, string> = {
  syphon: "syphon-macos",
  ndi: "ndi-all-platforms",
  spout: "spout-windows-output-not-working",
};

function VideoBackendDetail({
  backend,
  onToggle,
  isLoading,
}: {
  backend: BackendStatus;
  onToggle: () => void;
  isLoading: boolean;
}) {
  const description = BACKEND_DESCRIPTIONS[backend.id] ?? "";
  const anchor = BACKEND_ANCHORS[backend.id];

  return (
    <div className={styles.backendDetail} data-help-anchor={anchor} data-help-section="video-output">
      {description && (
        <p className={styles.backendDescription}>{description}</p>
      )}
      {backend.last_error && (
        <p className={styles.errorMessage}>{backend.last_error}</p>
      )}
      <button
        type="button"
        className={`${styles.toggleButton} ${backend.active ? styles.toggleOff : styles.toggleOn}`}
        onClick={onToggle}
        disabled={isLoading}
      >
        {isLoading ? "…" : backend.active ? "Disable" : "Enable"}
      </button>
    </div>
  );
}

// ============================================================================
// Panel
// ============================================================================

export function OutputsPanel() {
  const { backends, toggle } = useVideoOutputBackends();
  const { config: wledConfig } = useWled();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingBackend, setLoadingBackend] = useState<string | null>(null);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleVideoToggle = useCallback(
    async (backendId: string) => {
      setLoadingBackend(backendId);
      try {
        await toggle(backendId);
      } finally {
        setLoadingBackend(null);
      }
    },
    [toggle],
  );

  const devices: OutputDevice[] = useMemo(() => {
    const list: OutputDevice[] = [];

    for (const backend of backends) {
      if (!backend.available) continue;
      const type = BACKEND_TYPES[backend.id];
      if (!type) continue;
      const status: DeviceStatus =
        backend.last_error && !backend.active
          ? "error"
          : backend.active
            ? "active"
            : "disconnected";
      list.push({
        id: `video:${backend.id}`,
        type,
        name: backend.name,
        status,
        mappingCount: 0,
        error: backend.last_error ?? undefined,
      });
    }

    if (wledConfig !== null) {
      list.push({
        id: "wled:fixture",
        type: "wled_fixture",
        name: wledConfig.ip ? `WLED ${wledConfig.ip}` : "WLED",
        status: wledConfig.enabled ? "connected" : "disconnected",
        mappingCount: wledConfig.mappings.length,
      });
    }

    return list;
  }, [backends, wledConfig]);

  if (devices.length === 0) {
    return (
      <div className={styles.emptyState}>No output devices configured.</div>
    );
  }

  return (
    <div className={styles.panel}>
      {devices.map((device) => {
        const backendId = device.id.replace("video:", "");
        const backend = backends.find((b) => b.id === backendId);

        return (
          <DeviceCard
            key={device.id}
            device={device}
            expanded={expandedId === device.id}
            onToggle={() => handleToggle(device.id)}
            helpAnchor={backend ? BACKEND_ANCHORS[backendId] : undefined}
            helpSection={backend ? "video-output" : undefined}
          >
            {backend && (
              <VideoBackendDetail
                backend={backend}
                onToggle={() => handleVideoToggle(backendId)}
                isLoading={loadingBackend === backendId}
              />
            )}
            {device.type === "wled_fixture" && <WledPanel />}
          </DeviceCard>
        );
      })}
    </div>
  );
}
