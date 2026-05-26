// Hook for subscribing to Tauri events with automatic cleanup

import { useEffect, useRef, useCallback } from "react";
import { listen, type UnlistenFn, type Event } from "@tauri-apps/api/event";
import { logger } from "@/lib/logger";

export interface UseEventListenerOptions {
  enabled?: boolean;
}

// Subscribe to a Tauri event with automatic cleanup
export function useEventListener<T>(
  eventName: string,
  handler: (payload: T) => void,
  options: UseEventListenerOptions = {},
): void {
  const { enabled = true } = options;

  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    let unlisten: UnlistenFn | undefined;
    let isMounted = true;

    const setupListener = async () => {
      try {
        unlisten = await listen<T>(eventName, (event: Event<T>) => {
          if (isMounted) {
            handlerRef.current(event.payload);
          }
        });
      } catch (e) {
        logger.error(
          "useEventListener",
          `Failed to listen to ${eventName}:`,
          e,
        );
      }
    };

    void setupListener();

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [eventName, enabled]);
}

// Subscribe to multiple Tauri events with automatic cleanup
export function useEventListeners<T extends Record<string, unknown>>(
  events: Array<[keyof T & string, (payload: T[keyof T]) => void]>,
  options: UseEventListenerOptions = {},
): void {
  const { enabled = true } = options;

  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!enabled) return;

    const unlisteners: UnlistenFn[] = [];
    let isMounted = true;

    const setupListeners = async () => {
      for (const [eventName, handler] of handlersRef.current) {
        try {
          const unlisten = await listen(eventName, (event) => {
            if (isMounted) {
              handler(event.payload as T[keyof T]);
            }
          });
          unlisteners.push(unlisten);
        } catch (e) {
          logger.error(
            "useEventListeners",
            `Failed to listen to ${eventName}:`,
            e,
          );
        }
      }
    };

    void setupListeners();

    return () => {
      isMounted = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [enabled, events.length]);
}

// Create a stable callback ref for event handling
export function useEventCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(((...args) => callbackRef.current(...args)) as T, []);
}
