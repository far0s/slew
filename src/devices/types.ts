export type InputDeviceType =
  | "midi_controller"
  | "hid_device"
  | "osc_listener"
  | "audio_source";

export type OutputDeviceType =
  | "video_syphon"
  | "video_ndi"
  | "video_spout"
  | "wled_fixture";

export type DeviceStatus =
  | "connected"
  | "active"
  | "disconnected"
  | "searching"
  | "error";

export interface InputDevice {
  /** Stable unique ID, e.g. "midi:APC Mini mk2", "osc:server" */
  id: string;
  type: InputDeviceType;
  name: string;
  status: DeviceStatus;
  mappingCount: number;
  error?: string;
}

export interface OutputDevice {
  /** Stable unique ID, e.g. "video:syphon", "wled:fixture" */
  id: string;
  type: OutputDeviceType;
  name: string;
  status: DeviceStatus;
  mappingCount: number;
  error?: string;
}

export type Device = InputDevice | OutputDevice;
