import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Use relative paths for assets - required for Tauri which serves
  // assets from a custom protocol (tauri://localhost/).
  // This works in both dev mode (localhost) and production builds.
  base: "./",

  build: {
    // Three.js is inherently large (~1.5 MB), suppress warning for vendor-three chunk
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Chunking strategy optimized for Tauri builds.
        // IMPORTANT: React and all React-dependent libraries must be in the same chunk
        // to avoid "createContext is undefined" errors from chunk load order issues.
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            // Three.js and related 3D libraries - large and only used by renderer window
            if (
              id.includes("three") ||
              id.includes("@react-three") ||
              id.includes("postprocessing") ||
              id.includes("maath") ||
              id.includes("meshline")
            ) {
              return "vendor-three";
            }
            // All other vendor code (React, Tauri, Radix, react-aria, etc.) stays together
            // to ensure proper initialization order - DO NOT split React into its own chunk
            return "vendor";
          }

          // App chunks - split by window for better caching
          if (id.includes("/src/")) {
            // Renderer-specific code (3D, sketches)
            if (id.includes("/renderer/") || id.includes("/sketches/")) {
              return "app-renderer";
            }
            // Controls-specific code
            if (id.includes("/components/") || id.includes("/controls/")) {
              return "app-controls";
            }
            // Shared code (inputs, hooks, lib, slots)
            if (
              id.includes("/inputs/") ||
              id.includes("/hooks/") ||
              id.includes("/lib/") ||
              id.includes("/slots/")
            ) {
              return "app-shared";
            }
          }

          return undefined;
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
