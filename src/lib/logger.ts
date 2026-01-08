/**
 * Logger utility with environment-aware log levels.
 *
 * In development mode: all log levels are enabled.
 * In production mode: only warn and error are enabled by default.
 *
 * Debug logging can be enabled in production by setting:
 *   localStorage.setItem('debug', 'true')
 *
 * Log levels (in order of verbosity):
 *   - debug: Detailed debugging information (dev only by default)
 *   - info: General informational messages (dev only by default)
 *   - warn: Warning conditions (always shown)
 *   - error: Error conditions (always shown)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if we're in development mode.
 * Uses Vite's import.meta.env.DEV which is true during `npm run dev`.
 */
const isDev = (): boolean => {
  try {
    return import.meta.env?.DEV ?? false;
  } catch {
    return false;
  }
};

/**
 * Check if debug mode is enabled via localStorage.
 * Allows enabling verbose logs in production builds.
 */
const isDebugEnabled = (): boolean => {
  try {
    return localStorage.getItem("debug") === "true";
  } catch {
    return false;
  }
};

/**
 * Get the current minimum log level based on environment.
 */
const getMinLevel = (): LogLevel => {
  if (isDev() || isDebugEnabled()) {
    return "debug";
  }
  return "warn";
};

/**
 * Check if a log level should be output.
 */
const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
};

/**
 * Format a log message with context prefix.
 */
const formatMessage = (context: string, message: string): string => {
  return `[${context}] ${message}`;
};

/**
 * Logger instance with context-aware logging methods.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *
 *   logger.debug("Renderer", "Subscribed to events");
 *   logger.info("Controls", "Initialized with", { slots: 8 });
 *   logger.warn("MIDI", "Device disconnected unexpectedly");
 *   logger.error("Audio", "Failed to initialize", error);
 */
export const logger = {
  /**
   * Log debug-level message. Only shown in dev mode or when debug is enabled.
   */
  debug(context: string, message: string, ...args: unknown[]): void {
    if (shouldLog("debug")) {
      console.log(formatMessage(context, message), ...args);
    }
  },

  /**
   * Log info-level message. Only shown in dev mode or when debug is enabled.
   */
  info(context: string, message: string, ...args: unknown[]): void {
    if (shouldLog("info")) {
      console.log(formatMessage(context, message), ...args);
    }
  },

  /**
   * Log warning-level message. Always shown.
   */
  warn(context: string, message: string, ...args: unknown[]): void {
    if (shouldLog("warn")) {
      console.warn(formatMessage(context, message), ...args);
    }
  },

  /**
   * Log error-level message. Always shown.
   */
  error(context: string, message: string, ...args: unknown[]): void {
    if (shouldLog("error")) {
      console.error(formatMessage(context, message), ...args);
    }
  },

  /**
   * Check if debug logging is currently enabled.
   */
  isDebugEnabled(): boolean {
    return shouldLog("debug");
  },

  /**
   * Enable debug logging (persists in localStorage).
   */
  enableDebug(): void {
    try {
      localStorage.setItem("debug", "true");
      console.log("[Logger] Debug logging enabled");
    } catch {
      console.warn("[Logger] Failed to persist debug setting");
    }
  },

  /**
   * Disable debug logging (removes from localStorage).
   */
  disableDebug(): void {
    try {
      localStorage.removeItem("debug");
      console.log("[Logger] Debug logging disabled");
    } catch {
      console.warn("[Logger] Failed to persist debug setting");
    }
  },
};

// Export type for consumers who need it
export type { LogLevel };
