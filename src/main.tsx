import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import RendererRoot from "./renderer/RendererRoot";
import "./reset.css";
import "./globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  // Hard fail early; Tauri's HTML template should always include #root.
  throw new Error("Root element #root not found");
}

const root = ReactDOM.createRoot(rootElement);

// Get the window label from Tauri to determine which component to render.
// This is more reliable than window.location.pathname in production builds
// where Tauri's asset resolution can change the URL path during fallback.
const windowLabel = getCurrentWindow().label;

if (windowLabel === "renderer") {
  root.render(
    <React.StrictMode>
      <RendererRoot />
    </React.StrictMode>,
  );
} else {
  // Default to the controls UI (label should be "controls")
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
