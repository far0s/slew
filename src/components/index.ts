// UI Components
export {
  Button,
  type ButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from "./Button";
export { ColorPicker, type ColorPickerProps } from "./ColorPicker";
export {
  ParameterSlider,
  type ParameterSliderProps,
  type SliderColorVariant,
  type AudioMappingIndicator,
} from "./ParameterSlider";

// Slot Components
export {
  SlotParameterControls,
  type SlotParameterControlsProps,
} from "./SlotParameterControls";
export { SlotColumn, type SlotColumnProps } from "./SlotColumn";
export { SlotsArea, type SlotsAreaProps } from "./SlotsArea";

// Preview Components
export { RendererPreview, type RendererPreviewProps } from "./RendererPreview";
export { StreamedPreview } from "./StreamedPreview";

// Input Panel Components
export { MidiPanel, type MidiPanelProps } from "./MidiPanel";
export { MidiLearnButton, type MidiLearnButtonProps } from "./MidiLearnButton";
export { OscPanel, type OscPanelProps } from "./OscPanel";
export { AudioPanel, type AudioPanelProps } from "./AudioPanel";
export { HidPanel, type HidPanelProps } from "./HidPanel";
export { ModulationPanel, type ModulationPanelProps } from "./ModulationPanel";
export { VideoOutputPanel } from "./VideoOutputPanel";

// Sidebar Component
export { Sidebar, type SidebarProps } from "./Sidebar";

// Update
export { UpdateBanner } from "./UpdateBanner";

// Additional components
export { WledPanel } from "./WledPanel";
export { ShortcutsModal } from "./ShortcutsModal/ShortcutsModal";
export { KnobInput, type KnobInputProps, type KnobColorVariant } from "./KnobInput";
export { StepInput, type StepInputProps } from "./StepInput";
export { SpectrumAnalyzer, type SpectrumAnalyzerProps, type VisualizerMode } from "./SpectrumAnalyzer";
export { AudioIndicator } from "./AudioIndicator";
