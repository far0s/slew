// Shared utilities for input module hooks

export type {
  DeviceHookConfig,
  DeviceHookResult,
  MappingHookConfig,
  MappingHookResult,
  BaseStatus,
  StatusHookConfig,
  ActivityHookConfig,
  ActivityHookResult,
  HistoryHookResult,
  MappingId,
  PartialBy,
  AsyncState,
} from "./types";

export {
  useEventListener,
  useEventListeners,
  useEventCallback,
  type UseEventListenerOptions,
} from "./useEventListener";

export {
  useFetchOnMount,
  useFetchMultipleOnMount,
  type UseFetchOnMountOptions,
  type UseFetchOnMountResult,
} from "./useFetchOnMount";

export {
  useMessageActivity,
  useMessageHistory,
  useMessageActivityWithHistory,
  type UseMessageActivityOptions,
  type UseMessageActivityResult,
  type UseMessageHistoryOptions,
  type UseMessageHistoryResult,
} from "./useMessageActivity";

export { useScrollAdjust } from "./useScrollAdjust";

export {
  useMappings,
  useMappingsWithLookup,
  type UseMappingsOptions,
  type UseMappingsWithLookupResult,
} from "./useMappings";
