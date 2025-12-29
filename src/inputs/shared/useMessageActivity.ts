// Hook for tracking message activity from Tauri events

import { useState, useCallback } from "react";
import { useEventListener } from "./useEventListener";

export interface UseMessageActivityOptions {
  enabled?: boolean;
}

export interface UseMessageActivityResult<T> {
  lastMessage: T | null;
  messageCount: number;
  resetCount: () => void;
}

export interface UseMessageHistoryOptions {
  maxHistory?: number;
  enabled?: boolean;
}

export interface UseMessageHistoryResult<T> {
  messages: T[];
  clear: () => void;
}

// Track message activity from a Tauri event
export function useMessageActivity<T>(
  eventName: string,
  options: UseMessageActivityOptions = {},
): UseMessageActivityResult<T> {
  const { enabled = true } = options;

  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const [messageCount, setMessageCount] = useState(0);

  useEventListener<T>(
    eventName,
    (payload) => {
      setLastMessage(payload);
      setMessageCount((prev) => prev + 1);
    },
    { enabled },
  );

  const resetCount = useCallback(() => setMessageCount(0), []);

  return { lastMessage, messageCount, resetCount };
}

// Track a history of recent messages from a Tauri event
export function useMessageHistory<T>(
  eventName: string,
  options: UseMessageHistoryOptions = {},
): UseMessageHistoryResult<T> {
  const { maxHistory = 20, enabled = true } = options;

  const [messages, setMessages] = useState<T[]>([]);

  useEventListener<T>(
    eventName,
    (payload) => {
      setMessages((prev) => [payload, ...prev].slice(0, maxHistory));
    },
    { enabled },
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, clear };
}

// Combined hook for tracking both activity counts and message history
export function useMessageActivityWithHistory<T>(
  eventName: string,
  options: UseMessageHistoryOptions = {},
): UseMessageActivityResult<T> & UseMessageHistoryResult<T> {
  const { maxHistory = 20, enabled = true } = options;

  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [messages, setMessages] = useState<T[]>([]);

  useEventListener<T>(
    eventName,
    (payload) => {
      setLastMessage(payload);
      setMessageCount((prev) => prev + 1);
      setMessages((prev) => [payload, ...prev].slice(0, maxHistory));
    },
    { enabled },
  );

  const resetCount = useCallback(() => setMessageCount(0), []);
  const clear = useCallback(() => setMessages([]), []);

  return { lastMessage, messageCount, messages, resetCount, clear };
}
