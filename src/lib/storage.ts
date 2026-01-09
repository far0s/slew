/**
 * Centralized versioned localStorage module with migration support.
 *
 * Usage:
 *   const storage = createVersionedStorage<MySchema>({
 *     key: "slew-my-data",
 *     version: 2,
 *     defaultValue: { ... },
 *     migrations: {
 *       1: (old) => ({ ...old, newField: "default" }),
 *       2: (old) => ({ ...old, renamedField: old.oldField }),
 *     },
 *   });
 *
 *   const data = storage.load();
 *   storage.save(newData);
 *   storage.clear();
 */

import { logger } from "./logger";

const LOG_TAG = "Storage";

// Versioned wrapper stored in localStorage
interface VersionedData<T> {
  version: number;
  data: T;
}

// Migration function: transforms data from previous version to next
// Uses unknown return type to allow intermediate schemas during multi-step migrations
type MigrationFn = (data: unknown) => unknown;

export interface StorageOptions<T> {
  /** localStorage key */
  key: string;
  /** Current schema version (must be >= 1) */
  version: number;
  /** Default value if nothing stored or migration fails */
  defaultValue: T;
  /** Migration functions keyed by target version */
  migrations?: Record<number, MigrationFn>;
}

export interface VersionedStorage<T> {
  /** Load data from localStorage, applying migrations if needed */
  load(): T;
  /** Save data to localStorage with current version */
  save(data: T): void;
  /** Remove data from localStorage */
  clear(): void;
  /** Get the storage key */
  readonly key: string;
  /** Get the current version */
  readonly version: number;
}

/**
 * Create a versioned storage instance.
 */
export function createVersionedStorage<T>(
  options: StorageOptions<T>,
): VersionedStorage<T> {
  const { key, version, defaultValue, migrations = {} } = options;

  function load(): T {
    if (typeof window === "undefined") return defaultValue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaultValue;

      const parsed = JSON.parse(raw);

      // Handle legacy unversioned data (no version field)
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !("version" in parsed)
      ) {
        // Treat as version 0, run all migrations
        return migrateData(parsed, 0);
      }

      const versioned = parsed as VersionedData<T>;
      if (versioned.version === version) {
        return versioned.data;
      }

      // Need migration
      return migrateData(versioned.data, versioned.version);
    } catch (e) {
      logger.warn(LOG_TAG, `Failed to load ${key}, using defaults:`, e);
      return defaultValue;
    }
  }

  function migrateData(data: unknown, fromVersion: number): T {
    let current = data;
    let currentVersion = fromVersion;

    try {
      // Apply migrations in order
      while (currentVersion < version) {
        const nextVersion = currentVersion + 1;
        const migrate = migrations[nextVersion];

        if (!migrate) {
          // No migration for this version, can't continue
          logger.warn(
            LOG_TAG,
            `No migration for ${key} v${currentVersion} → v${nextVersion}, using defaults`,
          );
          return defaultValue;
        }

        current = migrate(current);
        currentVersion = nextVersion;
      }

      // Save migrated data
      save(current as T);
      logger.info(
        LOG_TAG,
        `Migrated ${key} from v${fromVersion} to v${version}`,
      );

      return current as T;
    } catch (e) {
      logger.warn(LOG_TAG, `Migration failed for ${key}, using defaults:`, e);
      return defaultValue;
    }
  }

  function save(data: T): void {
    if (typeof window === "undefined") return;

    try {
      const versioned: VersionedData<T> = { version, data };
      localStorage.setItem(key, JSON.stringify(versioned));
    } catch (e) {
      logger.warn(LOG_TAG, `Failed to save ${key}:`, e);
    }
  }

  function clear(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(key);
    } catch (e) {
      logger.warn(LOG_TAG, `Failed to clear ${key}:`, e);
    }
  }

  return {
    load,
    save,
    clear,
    key,
    version,
  };
}

/**
 * Simple key-value storage for primitive values (no versioning needed).
 * Useful for simple string/number preferences.
 */
export function createSimpleStorage<T extends string | number>(
  key: string,
  defaultValue: T,
  validate?: (value: unknown) => value is T,
): {
  load(): T;
  save(value: T): void;
  clear(): void;
} {
  function load(): T {
    if (typeof window === "undefined") return defaultValue;

    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return defaultValue;

      // For numbers, parse; for strings, use as-is
      const value = typeof defaultValue === "number" ? parseFloat(raw) : raw;

      if (validate) {
        return validate(value) ? value : defaultValue;
      }

      return value as T;
    } catch {
      return defaultValue;
    }
  }

  function save(value: T): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore */
    }
  }

  function clear(): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  return { load, save, clear };
}
