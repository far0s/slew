import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  EFFECTS_CHANGED_EVENT,
  EFFECTS_STORAGE_KEY,
  type EffectInstance,
} from "./effectTypes";
import { getEffectDefaultParams } from "./effectDescriptors";
import type { BackendParameter } from "@/hooks/useParameterStore";

export const FX_PARAM_PREFIX = "fx_";

export function makeFxParamId(instanceId: string, paramId: string): string {
  return `${FX_PARAM_PREFIX}${instanceId}_${paramId}`;
}

function parseFxParamId(id: string): { instanceId: string; paramId: string } | null {
  if (!id.startsWith(FX_PARAM_PREFIX)) return null;
  const withoutPrefix = id.slice(FX_PARAM_PREFIX.length);
  const lastUnderscore = withoutPrefix.lastIndexOf("_");
  if (lastUnderscore === -1) return null;
  return {
    instanceId: withoutPrefix.slice(0, lastUnderscore),
    paramId: withoutPrefix.slice(lastUnderscore + 1),
  };
}

let _instanceCounter = 0;
function nextInstanceId(): string {
  return `effect_${Date.now()}_${++_instanceCounter}`;
}

function loadEffects(): EffectInstance[] {
  try {
    const stored = localStorage.getItem(EFFECTS_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as EffectInstance[];
  } catch {
    // ignore
  }
  return [];
}

function saveEffects(effects: EffectInstance[]): void {
  try {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(effects));
  } catch {
    // ignore
  }
}

interface EffectsContextValue {
  effects: EffectInstance[];
  addEffect: (effectId: string) => void;
  removeEffect: (instanceId: string) => void;
  toggleEffect: (instanceId: string) => void;
  setParam: (instanceId: string, paramId: string, value: number) => void;
  moveEffect: (fromIndex: number, toIndex: number) => void;
  reorderEffects: (newOrder: EffectInstance[]) => void;
}

const EffectsContext = createContext<EffectsContextValue | null>(null);

export function EffectsProvider({ children }: { children: ReactNode }) {
  const [effects, setEffects] = useState<EffectInstance[]>(loadEffects);

  const publish = useCallback((next: EffectInstance[]) => {
    saveEffects(next);
    emit(EFFECTS_CHANGED_EVENT, next).catch(() => {});
  }, []);

  const update = useCallback(
    (updater: (prev: EffectInstance[]) => EffectInstance[]) => {
      setEffects((prev) => {
        const next = updater(prev);
        publish(next);
        return next;
      });
    },
    [publish],
  );

  // Sync from other windows
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<EffectInstance[]>(EFFECTS_CHANGED_EVENT, (event) => {
      setEffects(event.payload);
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  // Apply MIDI/HID input — update effect params without save/emit (avoids write storms)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<BackendParameter>("parameter_changed", (event) => {
      const { id, target } = event.payload;
      const parsed = parseFxParamId(id);
      if (!parsed) return;
      const { instanceId, paramId } = parsed;
      setEffects((prev) => {
        const idx = prev.findIndex((e) => e.instanceId === instanceId);
        if (idx === -1) return prev;
        const effect = prev[idx];
        if (effect.params[paramId] === target) return prev;
        const next = [...prev];
        next[idx] = { ...effect, params: { ...effect.params, [paramId]: target } };
        return next;
      });
    })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const addEffect = useCallback(
    (effectId: string) => {
      const instance: EffectInstance = {
        instanceId: nextInstanceId(),
        effectId,
        enabled: true,
        params: getEffectDefaultParams(effectId),
      };
      update((prev) => [...prev, instance]);
    },
    [update],
  );

  const removeEffect = useCallback(
    (instanceId: string) => {
      update((prev) => prev.filter((e) => e.instanceId !== instanceId));
    },
    [update],
  );

  const toggleEffect = useCallback(
    (instanceId: string) => {
      update((prev) =>
        prev.map((e) =>
          e.instanceId === instanceId ? { ...e, enabled: !e.enabled } : e,
        ),
      );
    },
    [update],
  );

  const setParam = useCallback(
    (instanceId: string, paramId: string, value: number) => {
      update((prev) =>
        prev.map((e) =>
          e.instanceId === instanceId
            ? { ...e, params: { ...e.params, [paramId]: value } }
            : e,
        ),
      );
    },
    [update],
  );

  const moveEffect = useCallback(
    (fromIndex: number, toIndex: number) => {
      update((prev) => {
        const next = [...prev];
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item);
        return next;
      });
    },
    [update],
  );

  const reorderEffects = useCallback(
    (newOrder: EffectInstance[]) => {
      update(() => newOrder);
    },
    [update],
  );

  return (
    <EffectsContext.Provider
      value={{ effects, addEffect, removeEffect, toggleEffect, setParam, moveEffect, reorderEffects }}
    >
      {children}
    </EffectsContext.Provider>
  );
}

export function useEffects(): EffectsContextValue {
  const ctx = useContext(EffectsContext);
  if (!ctx) throw new Error("useEffects must be used within EffectsProvider");
  return ctx;
}
