export { useSlots } from "./useSlots";
export type { Slot, SlotsConfig, SlotInitParams, SlotsState } from "./useSlots";

export {
  // Types
  type SketchId,
  type SketchDescriptor,
  type SketchProps,
  type SketchComponent,
  type ParameterTemplate,
  type ParameterTemplateId,
  type SliderColor,
  type GlobalParameterId,
  type SlotParameterId,
  type ParameterId,
  type SlotParameterDescriptor,
  // Constants
  SKETCH_REGISTRY,
  ALL_SKETCH_IDS,
  SLOT_ALPHA_TEMPLATE,
  SLOT_PARAMETER_TEMPLATES,
  // Functions
  getSketchDescriptor,
  getSketchParameterTemplateIds,
  getSketchParameterTemplate,
  makeSlotParameterId,
  parseSlotParameterId,
  isSlotParameterId,
  isGlobalParameterId,
  getParameterTemplateDefault,
  getParameterTemplate,
  getSlotParameterRange,
  buildSlotDefaultParameters,
  buildAllSlotsDefaultParameters,
  copySlotParameters,
  getSlotParameterIds,
  getAllSlotParameterIds,
  getAllParameterIds,
  buildSlotParameterDescriptors,
  getParameterDefault,
  getParameterDescriptor,
  getParameterDropdownLabel,
} from "./slotTypes";
