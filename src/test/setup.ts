// Vitest setup file
// This runs before each test file

import { vi } from "vitest";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
  once: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    label: "test-window",
  })),
  Window: vi.fn(),
}));

// Extend expect matchers if needed
// import "@testing-library/jest-dom";
