// Generic hook factory for CRUD mapping operations

import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEventListener } from "./useEventListener";
import type { MappingHookConfig, MappingHookResult } from "./types";

export interface UseMappingsOptions<TMapping> {
  initialValue?: TMapping[];
  enabled?: boolean;
}

export interface UseMappingsWithLookupResult<
  TMapping,
  TId = string,
> extends MappingHookResult<TMapping, TId> {
  getById: (id: TId) => TMapping | undefined;
  findMappings: (predicate: (mapping: TMapping) => boolean) => TMapping[];
}

export function useMappings<TMapping, TId = string>(
  config: MappingHookConfig<TMapping>,
  options: UseMappingsOptions<TMapping> = {},
): MappingHookResult<TMapping, TId> {
  const { initialValue = [], enabled = true } = options;
  const {
    getMappingsCommand,
    addMappingCommand,
    removeMappingCommand,
    mappingsChangedEvent,
    clearMappingsCommand,
    mappingParam = "mapping",
    idParam = "id",
  } = config;

  const [mappings, setMappings] = useState<TMapping[]>(initialValue);
  const [isLoading, setIsLoading] = useState(enabled);

  const fetchMappings = useCallback(async () => {
    try {
      const result = await invoke<TMapping[]>(getMappingsCommand);
      setMappings(result);
      return result;
    } catch (e) {
      console.error(`[useMappings] Failed to fetch mappings:`, e);
      throw e;
    }
  }, [getMappingsCommand]);

  // Initial fetch on mount
  useState(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const doFetch = async () => {
      try {
        await fetchMappings();
      } catch {
        // Error already logged
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void doFetch();

    return () => {
      isMounted = false;
    };
  });

  useEventListener<TMapping[]>(
    mappingsChangedEvent,
    (payload) => setMappings(payload),
    { enabled },
  );

  const add = useCallback(
    async (mapping: TMapping): Promise<TMapping | void> => {
      setIsLoading(true);
      try {
        const result = await invoke<TMapping | void>(addMappingCommand, {
          [mappingParam]: mapping,
        });
        await fetchMappings();
        return result;
      } catch (e) {
        console.error(`[useMappings] Failed to add mapping:`, e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [addMappingCommand, mappingParam, fetchMappings],
  );

  const remove = useCallback(
    async (id: TId): Promise<boolean | void> => {
      setIsLoading(true);
      try {
        const result = await invoke<boolean | void>(removeMappingCommand, {
          [idParam]: id,
        });
        await fetchMappings();
        return result;
      } catch (e) {
        console.error(`[useMappings] Failed to remove mapping:`, e);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [removeMappingCommand, idParam, fetchMappings],
  );

  const clear = useCallback(async (): Promise<void> => {
    if (!clearMappingsCommand) {
      console.warn(`[useMappings] No clear command configured`);
      return;
    }

    setIsLoading(true);
    try {
      await invoke(clearMappingsCommand);
      setMappings([]);
    } catch (e) {
      console.error(`[useMappings] Failed to clear mappings:`, e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [clearMappingsCommand]);

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetchMappings();
    } finally {
      setIsLoading(false);
    }
  }, [fetchMappings]);

  return { mappings, isLoading, add, remove, clear, refresh };
}

export function useMappingsWithLookup<TMapping, TId = string>(
  config: MappingHookConfig<TMapping>,
  idExtractor: (mapping: TMapping) => TId,
  options: UseMappingsOptions<TMapping> = {},
): UseMappingsWithLookupResult<TMapping, TId> {
  const base = useMappings<TMapping, TId>(config, options);

  const getById = useCallback(
    (id: TId): TMapping | undefined => {
      return base.mappings.find((m) => idExtractor(m) === id);
    },
    [base.mappings, idExtractor],
  );

  const findMappings = useCallback(
    (predicate: (mapping: TMapping) => boolean): TMapping[] => {
      return base.mappings.filter(predicate);
    },
    [base.mappings],
  );

  return { ...base, getById, findMappings };
}
