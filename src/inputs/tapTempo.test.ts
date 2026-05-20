import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  getTapShortcut,
  setTapShortcut,
  resetTapShortcut,
  subscribeTapShortcut,
  formatTapShortcut,
  isTapShortcutDefault,
  type TapShortcut,
} from "./tapTempo";

const DEFAULT_SHORTCUT: TapShortcut = {
  key: " ",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

beforeEach(() => {
  localStorage.clear();
  resetTapShortcut();
});

// ============================================================================
// setTapShortcut / subscribeTapShortcut
// ============================================================================

describe("subscribeTapShortcut", () => {
  it("calls callback immediately with current shortcut", () => {
    const cb = vi.fn();
    const unsub = subscribeTapShortcut(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(DEFAULT_SHORTCUT);
    unsub();
  });

  it("notifies all subscribers after setTapShortcut", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const unsub1 = subscribeTapShortcut(cb1);
    const unsub2 = subscribeTapShortcut(cb2);
    // reset call counts from immediate call
    cb1.mockClear();
    cb2.mockClear();

    const newShortcut: TapShortcut = { key: "b", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false };
    setTapShortcut(newShortcut);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb1).toHaveBeenCalledWith(newShortcut);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith(newShortcut);

    unsub1();
    unsub2();
  });

  it("stops notifying after unsubscribe", () => {
    const cb = vi.fn();
    const unsub = subscribeTapShortcut(cb);
    cb.mockClear();

    unsub();
    setTapShortcut({ key: "x", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });

    expect(cb).not.toHaveBeenCalled();
  });
});

describe("setTapShortcut", () => {
  it("persists shortcut to localStorage", () => {
    const newShortcut: TapShortcut = { key: "a", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false };
    setTapShortcut(newShortcut);
    const stored = JSON.parse(localStorage.getItem("slew:tapShortcut")!);
    expect(stored).toEqual(newShortcut);
  });

  it("getTapShortcut returns the new shortcut after set", () => {
    const newShortcut: TapShortcut = { key: "g", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false };
    setTapShortcut(newShortcut);
    expect(getTapShortcut()).toEqual(newShortcut);
  });
});

// ============================================================================
// formatTapShortcut
// ============================================================================

describe("formatTapShortcut", () => {
  it("Space key with no modifiers → 'Space'", () => {
    expect(formatTapShortcut(DEFAULT_SHORTCUT)).toBe("Space");
  });

  it("Ctrl+B → 'Ctrl+B'", () => {
    expect(formatTapShortcut({ key: "b", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("Ctrl+B");
  });

  it("Meta+Shift+A → '⌘+Shift+A'", () => {
    expect(formatTapShortcut({ key: "a", ctrlKey: false, metaKey: true, altKey: false, shiftKey: true })).toBe("⌘+Shift+A");
  });

  it("single letter key with no modifiers → upper-cased", () => {
    expect(formatTapShortcut({ key: "z", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("Z");
  });

  it("non-printable key like ArrowUp → 'ArrowUp' as-is", () => {
    expect(formatTapShortcut({ key: "ArrowUp", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("ArrowUp");
  });

  it("Alt modifier included → 'Alt+...' prefix", () => {
    expect(formatTapShortcut({ key: "x", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false })).toBe("Alt+X");
  });
});

// ============================================================================
// isTapShortcutDefault
// ============================================================================

describe("isTapShortcutDefault", () => {
  it("returns true for the default Space shortcut", () => {
    expect(isTapShortcutDefault()).toBe(true);
  });

  it("returns false when key is non-default", () => {
    setTapShortcut({ ...DEFAULT_SHORTCUT, key: "t" });
    expect(isTapShortcutDefault()).toBe(false);
  });

  it("returns false when modifiers differ", () => {
    setTapShortcut({ ...DEFAULT_SHORTCUT, ctrlKey: true });
    expect(isTapShortcutDefault()).toBe(false);
  });
});
