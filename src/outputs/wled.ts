import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";

export interface WledSegmentMapping {
  segment_id: number;
  slot_index: number;
  template_id: string;
  color_index: number;
}

export interface WledConfig {
  enabled: boolean;
  ip: string;
  port: number;
  mappings: WledSegmentMapping[];
}

export async function getWledConfig(): Promise<WledConfig> {
  return invoke<WledConfig>("get_wled_config");
}

export async function setWledConfig(config: WledConfig): Promise<void> {
  return invoke<void>("set_wled_config", { config });
}

export async function testWledConnection(): Promise<string> {
  return invoke<string>("test_wled_connection");
}

export async function pushWledColor(
  slot: number,
  templateId: string,
  r: number,
  g: number,
  b: number,
): Promise<void> {
  return invoke<void>("push_wled_color", { slot, templateId, r, g, b });
}

// ============================================================================
// React Hooks
// ============================================================================

/** Hook for managing WLED configuration and connection. */
export function useWled() {
  const [config, setConfig] = useState<WledConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const c = await getWledConfig();
        if (isMounted) setConfig(c);
      } catch (e) {
        logger.error("WLED", "Failed to load config:", e);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void init();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateConfig = useCallback(
    async (updates: Partial<WledConfig>): Promise<void> => {
      if (!config) return;
      const next = { ...config, ...updates };
      setConfig(next);
      try {
        await setWledConfig(next);
      } catch (e) {
        logger.error("WLED", "Failed to save config:", e);
      }
    },
    [config],
  );

  const testConnection = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    setIsTesting(true);
    try {
      const msg = await testWledConnection();
      return { ok: true, message: msg };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Connection failed",
      };
    } finally {
      setIsTesting(false);
    }
  }, []);

  return { config, isLoading, isTesting, updateConfig, testConnection };
}
