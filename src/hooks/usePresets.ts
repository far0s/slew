import { invoke } from "@tauri-apps/api/core";
import { useState, useCallback, useEffect } from "react";
import type { SketchId } from "@/sketches";

export interface Preset {
  name: string;
  sketch_id: string;
  parameters: Record<string, number>;
  thumbnail?: string;
}

export function usePresets(sketchId: SketchId | undefined) {
  const [presets, setPresets] = useState<Preset[]>([]);

  const refresh = useCallback(async () => {
    if (!sketchId) {
      setPresets([]);
      return;
    }
    const result = await invoke<Preset[]>("list_presets_for_sketch", { sketchId });
    setPresets(result);
  }, [sketchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const savePreset = useCallback(
    async (name: string, parameters: Record<string, number>, thumbnail?: string): Promise<Preset> => {
      const result = await invoke<Preset>("save_preset", { sketchId, name, parameters, thumbnail: thumbnail ?? null });
      await refresh();
      return result;
    },
    [sketchId, refresh],
  );

  const loadPreset = useCallback(
    async (name: string): Promise<Preset> => {
      return invoke<Preset>("load_preset", { sketchId, name });
    },
    [sketchId],
  );

  const deletePreset = useCallback(
    async (name: string): Promise<void> => {
      await invoke<void>("delete_preset", { sketchId, name });
      await refresh();
    },
    [sketchId, refresh],
  );

  const renamePreset = useCallback(
    async (oldName: string, newName: string): Promise<Preset> => {
      const result = await invoke<Preset>("rename_preset", { sketchId, oldName, newName });
      await refresh();
      return result;
    },
    [sketchId, refresh],
  );

  return { presets, savePreset, loadPreset, deletePreset, renamePreset, refresh };
}
