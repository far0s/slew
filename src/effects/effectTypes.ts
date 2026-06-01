import type { ParameterTemplate } from "@/sketches/types";

export interface EffectDescriptor {
  id: string;
  label: string;
  description?: string;
  parameters: ParameterTemplate[];
}

export interface EffectInstance {
  instanceId: string;
  effectId: string;
  enabled: boolean;
  params: Record<string, number>;
}

export const EFFECTS_STORAGE_KEY = "slew-effects";
export const EFFECTS_CHANGED_EVENT = "effects-changed";
