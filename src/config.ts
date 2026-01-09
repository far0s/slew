/**
 * Centralized configuration constants for the Slew frontend.
 */

// Window Management
export const HEARTBEAT_INTERVAL_MS = 5000;
export const STATUS_POLL_INTERVAL_MS = 10000;

// Renderer Stats Reporting
export const FPS_SAMPLE_COUNT = 60; // Ring buffer size for FPS averaging
export const STATS_REPORT_INTERVAL_MS = 1000;

// Audio / Beat Detection
export const BPM_HISTORY_SIZE = 8;
export const MIN_BPM = 60;
export const MAX_BPM = 200;

// Preview Streaming
export const DEFAULT_PREVIEW_RESOLUTION_SCALE = 0.5;
export const DEFAULT_PREVIEW_FPS = 30; // Valid: 15, 30, 45, 60

// Renderer Settings
export const DEFAULT_DPR = 1;
export const MIN_DPR = 0.25;
export const MAX_DPR = 3;

// Streaming Fallback
export const STREAMING_FALLBACK_TIMEOUT_MS = 3000;
