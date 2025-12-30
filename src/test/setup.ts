// Vitest setup file
// This runs before each test file

import { vi } from "vitest";

// Mock Three.js WebGPU modules (not available in jsdom/happy-dom)
vi.mock("three/webgpu", () => ({
  MeshBasicNodeMaterial: vi.fn(),
  WebGPURenderer: vi.fn(),
}));

// Mock TSL (Three.js Shading Language) functions
vi.mock("three/tsl", () => ({
  Fn: vi.fn(() => vi.fn()),
  uniform: vi.fn(),
  positionLocal: {},
  normalLocal: {},
  normalWorld: {},
  cameraPosition: {},
  positionWorld: {},
  mx_noise_float: vi.fn(),
  vec3: vi.fn(),
  vec4: vi.fn(),
  float: vi.fn(),
  mix: vi.fn(),
  dot: vi.fn(),
  max: vi.fn(),
  normalize: vi.fn(),
  sub: vi.fn(),
  pow: vi.fn(),
  sin: vi.fn(),
  cos: vi.fn(),
  time: {},
  uv: vi.fn(),
  add: vi.fn(),
  mul: vi.fn(),
  length: vi.fn(),
  atan2: vi.fn(),
  fract: vi.fn(),
  abs: vi.fn(),
  step: vi.fn(),
  smoothstep: vi.fn(),
}));

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
