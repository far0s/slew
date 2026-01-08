import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  build: {
    // Three.js is inherently large (~1.5 MB), suppress warning for vendor-three chunk
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // Vendor chunks - large libraries that rarely change
          if (id.includes("node_modules")) {
            // Three.js and related 3D libraries (only used by renderer)
            if (
              id.includes("three") ||
              id.includes("@react-three") ||
              id.includes("postprocessing") ||
              id.includes("maath") ||
              id.includes("meshline")
            ) {
              return "vendor-three";
            }
            // React core (used by both windows)
            if (id.includes("react-dom") || id.includes("/react/")) {
              return "vendor-react";
            }
            // Tauri APIs
            if (id.includes("@tauri-apps")) {
              return "vendor-tauri";
            }
            // Other vendor dependencies
            return "vendor";
          }

          // App chunks - split by window
          if (id.includes("/src/")) {
            // Renderer-specific code (3D, sketches)
            if (id.includes("/renderer/") || id.includes("/sketches/")) {
              return "renderer";
            }
            // Controls-specific code
            if (id.includes("/components/") || id.includes("/controls/")) {
              return "controls";
            }
            // Shared code (inputs, hooks, lib, slots)
            if (
              id.includes("/inputs/") ||
              id.includes("/hooks/") ||
              id.includes("/lib/") ||
              id.includes("/slots/")
            ) {
              return "shared";
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
