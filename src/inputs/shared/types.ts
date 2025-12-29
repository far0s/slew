// Shared types for input module hooks

// Device hook types
export interface DeviceHookConfig<_TDevice> {
  listDevicesCommand: string;
  connectCommand: string;
  disconnectCommand: string;
  devicesChangedEvent: string;
  getAutoReconnectCommand?: string;
  setAutoReconnectCommand?: string;
  deviceIdParam?: string;
}

export interface DeviceHookResult<TDevice> {
  devices: TDevice[];
  isLoading: boolean;
  error: string | null;
  connect: (deviceId: string) => Promise<void>;
  disconnect: (deviceId: string) => Promise<void>;
  refresh: () => Promise<void>;
  autoReconnect?: boolean;
  setAutoReconnect?: (enabled: boolean) => Promise<void>;
}

// Mapping hook types
export interface MappingHookConfig<_TMapping> {
  getMappingsCommand: string;
  addMappingCommand: string;
  removeMappingCommand: string;
  mappingsChangedEvent: string;
  clearMappingsCommand?: string;
  mappingParam?: string;
  idParam?: string;
}

export interface MappingHookResult<TMapping, TId = string> {
  mappings: TMapping[];
  isLoading: boolean;
  add: (mapping: TMapping) => Promise<TMapping | void>;
  remove: (id: TId) => Promise<boolean | void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

// Status hook types
export interface BaseStatus {
  is_running?: boolean;
  is_connected?: boolean;
  error: string | null;
}

export interface StatusHookConfig<_TStatus extends BaseStatus> {
  getStatusCommand: string;
  statusChangedEvent: string;
}

// Activity/event hook types
export interface ActivityHookConfig<_TMessage> {
  messageEvent: string;
  maxHistory?: number;
}

export interface ActivityHookResult<TMessage> {
  lastMessage: TMessage | null;
  messageCount: number;
  resetCount: () => void;
}

export interface HistoryHookResult<TMessage> {
  messages: TMessage[];
  clear: () => void;
}

// Utility types
export type MappingId<T> = T extends { id: infer U } ? U : string;
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface AsyncState {
  isLoading: boolean;
  error: string | null;
}
