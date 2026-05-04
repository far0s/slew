import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface UpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
}

export type UpdateState =
  | { type: "idle" }
  | { type: "available"; info: UpdateInfo }
  | { type: "installing" }
  | { type: "error"; message: string };

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ type: "idle" });

  // Listen for background update check result emitted by Rust on startup
  useEffect(() => {
    const unlisten = listen<UpdateInfo>("update_available", (event) => {
      setState({ type: "available", info: event.payload });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    try {
      const info = await invoke<UpdateInfo | null>("check_for_update");
      if (info) {
        setState({ type: "available", info });
      } else {
        setState({ type: "idle" });
      }
    } catch (err) {
      setState({ type: "error", message: String(err) });
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setState({ type: "installing" });
    try {
      await invoke("install_update");
      // App will restart — this line is never reached
    } catch (err) {
      setState({ type: "error", message: String(err) });
    }
  }, []);

  const dismiss = useCallback(() => {
    setState({ type: "idle" });
  }, []);

  return { state, checkForUpdate, installUpdate, dismiss };
}
