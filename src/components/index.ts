// UI Components
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./Button";
export {
  ParameterSlider,
  type ParameterSliderProps,
  type SliderColorVariant,
} from "./ParameterSlider";

// Scene Components
export { SceneAControls, type SceneAControlsProps } from "./SceneAControls";
export { SceneBControls, type SceneBControlsProps } from "./SceneBControls";
export { SceneCControls, type SceneCControlsProps } from "./SceneCControls";
export { ScenePreview, type ScenePreviewProps } from "./ScenePreview";
export {
  SceneControlStrip,
  type SceneControlStripProps,
} from "./SceneControlStrip";
export { RendererPreview, type RendererPreviewProps } from "./RendererPreview";

// Input Panel Components
export { MidiPanel, type MidiPanelProps } from "./MidiPanel";
export { MidiLearnButton, type MidiLearnButtonProps } from "./MidiLearnButton";
export { OscPanel, type OscPanelProps } from "./OscPanel";
export { AudioPanel, type AudioPanelProps } from "./AudioPanel";
export { HidPanel, type HidPanelProps } from "./HidPanel";

// Debug Components
export {
  BackendInspector,
  type BackendInspectorProps,
} from "./BackendInspector";
export { DebugLogs, type DebugLogsProps, type LogEntry } from "./DebugLogs";
export {
  DebugMetrics,
  type DebugMetricsProps,
  type DebugMetricsData,
} from "./DebugMetrics";
export { DebugPanel, type DebugPanelProps } from "./DebugPanel";
