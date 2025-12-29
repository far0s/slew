// Hook for fetching initial data on mount with proper cleanup

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseFetchOnMountOptions<T> {
  initialValue: T;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UseFetchOnMountResult<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

// Fetch data on mount with automatic cleanup and mount guard
export function useFetchOnMount<T>(
  fetcher: () => Promise<T>,
  options: UseFetchOnMountOptions<T>,
): UseFetchOnMountResult<T> {
  const { initialValue, enabled = true, onSuccess, onError } = options;

  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const doFetch = useCallback(async (isMountedRef: { current: boolean }) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      if (isMountedRef.current) {
        setData(result);
        onSuccessRef.current?.(result);
      }
    } catch (e) {
      if (isMountedRef.current) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        setError(errorMessage);
        onErrorRef.current?.(e instanceof Error ? e : new Error(errorMessage));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    const isMountedRef = { current: true };
    void doFetch(isMountedRef);

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, doFetch]);

  const refetch = useCallback(async () => {
    const isMountedRef = { current: true };
    await doFetch(isMountedRef);
  }, [doFetch]);

  return {
    data,
    isLoading,
    error,
    refetch,
    setData,
  };
}

// Fetch multiple pieces of data on mount in parallel
export function useFetchMultipleOnMount<T extends Record<string, unknown>>(
  fetchers: { [K in keyof T]: () => Promise<T[K]> },
  options: { [K in keyof T]: { initialValue: T[K] } },
): {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const keys = Object.keys(fetchers) as Array<keyof T>;

  const initialData = {} as T;
  for (const key of keys) {
    initialData[key] = options[key].initialValue;
  }

  const [data, setData] = useState<T>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchersRef = useRef(fetchers);
  fetchersRef.current = fetchers;

  const doFetch = useCallback(
    async (isMountedRef: { current: boolean }) => {
      setIsLoading(true);
      setError(null);

      try {
        const promises = keys.map((key) => fetchersRef.current[key]());
        const results = await Promise.all(promises);

        if (isMountedRef.current) {
          const newData = {} as T;
          keys.forEach((key, index) => {
            newData[key] = results[index] as T[typeof key];
          });
          setData(newData);
        }
      } catch (e) {
        if (isMountedRef.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [keys],
  );

  useEffect(() => {
    const isMountedRef = { current: true };
    void doFetch(isMountedRef);

    return () => {
      isMountedRef.current = false;
    };
  }, [doFetch]);

  const refetch = useCallback(async () => {
    const isMountedRef = { current: true };
    await doFetch(isMountedRef);
  }, [doFetch]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
