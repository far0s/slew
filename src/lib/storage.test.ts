import { describe, it, expect, beforeEach, vi } from "vitest";
import { createVersionedStorage, createSimpleStorage } from "./storage";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("createVersionedStorage", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns default value when nothing stored", () => {
    const storage = createVersionedStorage({
      key: "test-key",
      version: 1,
      defaultValue: { name: "default" },
    });

    expect(storage.load()).toEqual({ name: "default" });
  });

  it("loads stored data with matching version", () => {
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ version: 1, data: { name: "stored" } }),
    );

    const storage = createVersionedStorage({
      key: "test-key",
      version: 1,
      defaultValue: { name: "default" },
    });

    expect(storage.load()).toEqual({ name: "stored" });
  });

  it("saves data with version wrapper", () => {
    const storage = createVersionedStorage({
      key: "test-key",
      version: 2,
      defaultValue: { name: "default" },
    });

    storage.save({ name: "new-value" });

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "test-key",
      JSON.stringify({ version: 2, data: { name: "new-value" } }),
    );
  });

  it("clears data from localStorage", () => {
    const storage = createVersionedStorage({
      key: "test-key",
      version: 1,
      defaultValue: { name: "default" },
    });

    storage.clear();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("test-key");
  });

  it("migrates data from older version", () => {
    // Store old version data
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ version: 1, data: { oldField: "value" } }),
    );

    interface V2Schema {
      newField: string;
    }

    const storage = createVersionedStorage<V2Schema>({
      key: "test-key",
      version: 2,
      defaultValue: { newField: "default" },
      migrations: {
        2: (old: unknown) => {
          const prev = old as { oldField: string };
          return { newField: prev.oldField };
        },
      },
    });

    expect(storage.load()).toEqual({ newField: "value" });
  });

  it("applies multiple migrations in sequence", () => {
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ version: 1, data: { a: 1 } }),
    );

    interface V3Schema {
      a: number;
      b: number;
      c: number;
    }

    const storage = createVersionedStorage<V3Schema>({
      key: "test-key",
      version: 3,
      defaultValue: { a: 0, b: 0, c: 0 },
      migrations: {
        2: (old: unknown) => {
          const prev = old as { a: number };
          return { a: prev.a, b: 2 };
        },
        3: (old: unknown) => {
          const prev = old as { a: number; b: number };
          return { a: prev.a, b: prev.b, c: 3 };
        },
      },
    });

    expect(storage.load()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("handles legacy unversioned data as version 0", () => {
    // Store data without version wrapper (legacy format)
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ legacyField: "old" }),
    );

    interface V1Schema {
      newField: string;
    }

    const storage = createVersionedStorage<V1Schema>({
      key: "test-key",
      version: 1,
      defaultValue: { newField: "default" },
      migrations: {
        1: (old: unknown) => {
          const prev = old as { legacyField: string };
          return { newField: prev.legacyField };
        },
      },
    });

    expect(storage.load()).toEqual({ newField: "old" });
  });

  it("returns default when migration is missing", () => {
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ version: 1, data: { field: "value" } }),
    );

    const storage = createVersionedStorage({
      key: "test-key",
      version: 3, // Jump from 1 to 3, missing migration for 2
      defaultValue: { field: "default" },
      migrations: {
        3: (old: unknown) => old as { field: string },
        // Missing migration for version 2
      },
    });

    expect(storage.load()).toEqual({ field: "default" });
  });

  it("returns default on invalid JSON", () => {
    localStorageMock.setItem("test-key", "not valid json{{{");

    const storage = createVersionedStorage({
      key: "test-key",
      version: 1,
      defaultValue: { name: "default" },
    });

    expect(storage.load()).toEqual({ name: "default" });
  });

  it("saves migrated data after successful migration", () => {
    localStorageMock.setItem(
      "test-key",
      JSON.stringify({ version: 1, data: { old: "value" } }),
    );

    const storage = createVersionedStorage({
      key: "test-key",
      version: 2,
      defaultValue: { new: "default" },
      migrations: {
        2: (old: unknown) => {
          const prev = old as { old: string };
          return { new: prev.old };
        },
      },
    });

    storage.load();

    // Should have saved the migrated data
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "test-key",
      JSON.stringify({ version: 2, data: { new: "value" } }),
    );
  });

  it("exposes key and version properties", () => {
    const storage = createVersionedStorage({
      key: "my-key",
      version: 5,
      defaultValue: {},
    });

    expect(storage.key).toBe("my-key");
    expect(storage.version).toBe(5);
  });
});

describe("createSimpleStorage", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("returns default value when nothing stored", () => {
    const storage = createSimpleStorage("test-string", "default");
    expect(storage.load()).toBe("default");
  });

  it("loads stored string value", () => {
    localStorageMock.setItem("test-string", "stored");
    const storage = createSimpleStorage("test-string", "default");
    expect(storage.load()).toBe("stored");
  });

  it("loads stored number value", () => {
    localStorageMock.setItem("test-number", "42");
    const storage = createSimpleStorage("test-number", 0);
    expect(storage.load()).toBe(42);
  });

  it("saves string value", () => {
    const storage = createSimpleStorage<string>("test-string", "default");
    storage.save("new-value");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "test-string",
      "new-value",
    );
  });

  it("saves number value", () => {
    const storage = createSimpleStorage<number>("test-number", 0);
    storage.save(123);
    expect(localStorageMock.setItem).toHaveBeenCalledWith("test-number", "123");
  });

  it("clears value", () => {
    const storage = createSimpleStorage("test-key", "default");
    storage.clear();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("test-key");
  });

  it("uses validator function when provided", () => {
    localStorageMock.setItem("test-key", "invalid");

    const isValidMode = (v: unknown): v is "dark" | "light" =>
      v === "dark" || v === "light";

    const storage = createSimpleStorage(
      "test-key",
      "dark" as const,
      isValidMode,
    );
    expect(storage.load()).toBe("dark"); // Returns default because "invalid" fails validation
  });

  it("returns value when validator passes", () => {
    localStorageMock.setItem("test-key", "light");

    const isValidMode = (v: unknown): v is "dark" | "light" =>
      v === "dark" || v === "light";

    const storage = createSimpleStorage(
      "test-key",
      "dark" as const,
      isValidMode,
    );
    expect(storage.load()).toBe("light");
  });
});
