import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import RendererRoot from "./renderer/RendererRoot";
import "./reset.css";
import "./tailwind.css";

const pathname = window.location.pathname;

const rootElement = document.getElementById("root");

if (!rootElement) {
  // Hard fail early; Tauri's HTML template should always include #root.
  throw new Error("Root element #root not found");
}

const root = ReactDOM.createRoot(rootElement);

// Route based on pathname. Later we can refine this (e.g. hash, search params)
// or read the window label from Tauri if needed.
if (pathname === "/renderer") {
  root.render(
    <React.StrictMode>
      <RendererRoot />
    </React.StrictMode>,
  );
} else {
  // Default to the controls UI
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
