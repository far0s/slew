import { useMemo } from "react";
import { useMidiCombinedDevices, useMidiMappings } from "@/inputs/midi";
import { useOscServer, useOscMappings } from "@/inputs/osc";
import { useAudioCapture, useAudioMappings } from "@/inputs/audio";
import { useHidDevice, useHidMappings } from "@/inputs/hid";
import type { InputDevice, DeviceStatus } from "./types";

export function useInputDevices(): InputDevice[] {
  const { devices: midiDevices } = useMidiCombinedDevices();
  const { mappings: midiMappings } = useMidiMappings();

  const { isRunning: oscRunning, port: oscPort, error: oscError } = useOscServer();
  const { mappings: oscMappings } = useOscMappings();

  const {
    isRunning: audioRunning,
    deviceName: audioDeviceName,
    error: audioError,
  } = useAudioCapture();
  const { mappings: audioMappings } = useAudioMappings();

  const {
    isConnected: hidConnected,
    isSearching: hidSearching,
    connectedDevice: hidDevice,
    error: hidError,
  } = useHidDevice();
  const { mappings: hidMappings } = useHidMappings();

  return useMemo(() => {
    const devices: InputDevice[] = [];

    // One card per MIDI controller (available or connected)
    for (const device of midiDevices) {
      const inputId = device.input?.id ?? null;
      const mappingCount = midiMappings.filter(
        (m) => m.device_id === null || m.device_id === inputId,
      ).length;
      const status: DeviceStatus = device.inputConnected
        ? "connected"
        : "disconnected";
      devices.push({
        id: `midi:${device.name}`,
        type: "midi_controller",
        name: device.name,
        status,
        mappingCount,
      });
    }

    // OSC server (always present as virtual device)
    const oscStatus: DeviceStatus = oscError
      ? "error"
      : oscRunning
        ? "active"
        : "disconnected";
    devices.push({
      id: "osc:server",
      type: "osc_listener",
      name: oscPort ? `OSC :${oscPort}` : "OSC Server",
      status: oscStatus,
      mappingCount: oscMappings.length,
      error: oscError ?? undefined,
    });

    // Audio source
    const audioStatus: DeviceStatus = audioError
      ? "error"
      : audioRunning
        ? "active"
        : "disconnected";
    devices.push({
      id: "audio:source",
      type: "audio_source",
      name: audioDeviceName ?? "Audio Input",
      status: audioStatus,
      mappingCount: audioMappings.length,
      error: audioError ?? undefined,
    });

    // HID controller (single macropad device)
    const hidStatus: DeviceStatus = hidError
      ? "error"
      : hidSearching
        ? "searching"
        : hidConnected
          ? "connected"
          : "disconnected";
    devices.push({
      id: "hid:device",
      type: "hid_device",
      name: hidDevice?.product ?? "HID Controller",
      status: hidStatus,
      mappingCount: hidMappings.length,
      error: hidError ?? undefined,
    });

    return devices;
  }, [
    midiDevices,
    midiMappings,
    oscRunning,
    oscPort,
    oscError,
    oscMappings,
    audioRunning,
    audioDeviceName,
    audioError,
    audioMappings,
    hidConnected,
    hidSearching,
    hidDevice,
    hidError,
    hidMappings,
  ]);
}
