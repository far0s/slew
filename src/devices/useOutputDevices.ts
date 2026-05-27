import { useMemo } from "react";
import { useVideoOutputBackends } from "@/outputs/videoOutput";
import { useWled } from "@/outputs/wled";
import type { OutputDevice, OutputDeviceType, DeviceStatus } from "./types";

const VIDEO_BACKEND_TYPES: Record<string, OutputDeviceType> = {
  syphon: "video_syphon",
  ndi: "video_ndi",
  spout: "video_spout",
};

export function useOutputDevices(): OutputDevice[] {
  const { backends } = useVideoOutputBackends();
  const { config: wledConfig } = useWled();

  return useMemo(() => {
    const devices: OutputDevice[] = [];

    // One card per available video backend
    for (const backend of backends) {
      if (!backend.available) continue;
      const type = VIDEO_BACKEND_TYPES[backend.id];
      if (!type) continue;
      const status: DeviceStatus =
        backend.last_error && !backend.active
          ? "error"
          : backend.active
            ? "active"
            : "disconnected";
      devices.push({
        id: `video:${backend.id}`,
        type,
        name: backend.name,
        status,
        mappingCount: 0,
        error: backend.last_error ?? undefined,
      });
    }

    // WLED fixture
    if (wledConfig !== null) {
      const wledStatus: DeviceStatus = wledConfig.enabled
        ? "connected"
        : "disconnected";
      devices.push({
        id: "wled:fixture",
        type: "wled_fixture",
        name: wledConfig.ip ? `WLED ${wledConfig.ip}` : "WLED",
        status: wledStatus,
        mappingCount: wledConfig.mappings.length,
      });
    }

    return devices;
  }, [backends, wledConfig]);
}
