// Parameter widgets
export { ParameterControl, type ParameterControlProps } from "./parameters/ParameterControl";

// UI Components
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./layout/Button";
export { ColorPicker, type ColorPickerProps } from "./parameters/ColorPicker";
export {
  ParameterSlider,
  type ParameterSliderProps,
  type SliderColorVariant,
  type AudioMappingIndicator,
} from "./parameters/ParameterSlider";

// Slot Components
export {
  SlotParameterControls,
  type SlotParameterControlsProps,
} from "./slots/SlotParameterControls";
export { SlotColumn, type SlotColumnProps } from "./slots/SlotColumn";
export { SlotsArea, type SlotsAreaProps } from "./slots/SlotsArea";

// Preview Components
export { RendererPreview, type RendererPreviewProps } from "./preview/RendererPreview";
export { StreamedPreview } from "./preview/StreamedPreview";

// Input Panel Components
export { MidiPanel, type MidiPanelProps } from "./panels/MidiPanel";
export { MidiLearnButton, type MidiLearnButtonProps } from "./parameters/MidiLearnButton";
export { OscPanel, type OscPanelProps } from "./panels/OscPanel";
export { AudioPanel, type AudioPanelProps } from "./panels/AudioPanel";
export { HidPanel, type HidPanelProps } from "./panels/HidPanel";
export { ModulationPanel, type ModulationPanelProps } from "./panels/ModulationPanel";
export { VideoOutputPanel } from "./panels/VideoOutputPanel";

// Sidebar Component
export { Sidebar, type SidebarProps } from "./layout/Sidebar";

// Update
export { UpdateBanner } from "./layout/UpdateBanner";

// Additional components
export { WledPanel } from "./panels/WledPanel";
export { ShortcutsModal } from "./layout/ShortcutsModal/ShortcutsModal";
export { KnobInput, type KnobInputProps, type KnobColorVariant } from "./parameters/KnobInput";
export { StepInput, type StepInputProps } from "./parameters/StepInput";
export { SpectrumAnalyzer, type SpectrumAnalyzerProps, type VisualizerMode } from "./panels/SpectrumAnalyzer";
export { AudioIndicator } from "./panels/AudioIndicator";
