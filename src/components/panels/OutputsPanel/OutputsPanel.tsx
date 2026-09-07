/**
 * OutputsPanel
 *
 * Unified panel listing all output destinations (Syphon/NDI/Spout video
 * backends and WLED LED fixtures) as expandable device cards.
 * Replaces the OutputSection from VideoOutputPanel and the WLED tab.
 */

import { useState, useCallback, useMemo } from "react";
import { WledPanel } from "@/components/panels/WledPanel";
import {
  useVideoOutputBackends,
  type BackendStatus,
} from "@/outputs/videoOutput";
import { useWled } from "@/outputs/wled";
import type { OutputDevice, OutputDeviceType, DeviceStatus } from "@/devices/types";
import { DeviceCard, type DeviceStatusTone } from "@/components/layout/DeviceCard";
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

const STATUS_LABELS: Record<DeviceStatus, string> = {
  connected: "Connected",
  active: "Active",
  disconnected: "Ready",
  searching: "Searching…",
  error: "Error",
};

const STATUS_TONES: Record<DeviceStatus, DeviceStatusTone> = {
  connected: "success",
  active: "success",
  disconnected: "muted",
  searching: "warning",
  error: "danger",
};

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
            tag={DEVICE_TYPE_LABELS[device.type]}
            name={device.name}
            meta={device.mappingCount > 0 ? `${device.mappingCount} mapping${device.mappingCount !== 1 ? "s" : ""}` : undefined}
            status={STATUS_LABELS[device.status]}
            statusTone={STATUS_TONES[device.status]}
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
