import { useRef, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import styles from "./ImageInput.module.css";

export interface ImageInputProps {
  sketchId: string;
  templateId: string;
  label: string;
}

export function makeImageStorageKey(
  sketchId: string,
  templateId: string,
): string {
  return `slew:sketch-image:${sketchId}:${templateId}`;
}

type LoadState = "idle" | "loading" | "loaded";

export function ImageInput({ sketchId, templateId }: ImageInputProps) {
  const storageKey = makeImageStorageKey(sketchId, templateId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dataUrl, setDataUrl] = useState<string | null>(() =>
    localStorage.getItem(storageKey),
  );
  const [loadState, setLoadState] = useState<LoadState>(() =>
    localStorage.getItem(storageKey) ? "loaded" : "idle",
  );

  const applyImage = useCallback(
    (url: string | null) => {
      if (url) {
        localStorage.setItem(storageKey, url);
      } else {
        localStorage.removeItem(storageKey);
      }
      setDataUrl(url);
      setLoadState(url ? "loaded" : "idle");
      window.dispatchEvent(
        new CustomEvent(storageKey, { detail: { dataUrl: url } }),
      );
      // Forward to renderer window via Tauri backend
      invoke("forward_controls_event", {
        event: storageKey,
        payload: JSON.stringify({ dataUrl: url }),
      }).catch(() => {});
    },
    [storageKey],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLoadState("loading");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        applyImage(url);
      };
      reader.onerror = () => setLoadState(dataUrl ? "loaded" : "idle");
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [applyImage, dataUrl],
  );

  // Sync if another component writes to the same key
  useEffect(() => {
    const handler = (e: Event) => {
      const { dataUrl: url } = (e as CustomEvent<{ dataUrl: string | null }>)
        .detail;
      setDataUrl(url);
      setLoadState(url ? "loaded" : "idle");
    };
    window.addEventListener(storageKey, handler);
    return () => window.removeEventListener(storageKey, handler);
  }, [storageKey]);

  return (
    <div className={styles.container}>
      {loadState === "idle" && (
        <button
          className={styles.uploadArea}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className={styles.uploadIcon}>⬆</span>
          <span>Upload image</span>
        </button>
      )}

      {loadState === "loading" && (
        <div className={styles.loadingArea}>
          <span className={styles.spinner} />
          <span>Loading…</span>
        </div>
      )}

      {loadState === "loaded" && dataUrl && (
        <>
          <img className={styles.preview} src={dataUrl} alt="Logo preview" />
          <div className={styles.previewActions}>
            <button
              className={styles.actionBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Replace
            </button>
            <button
              className={`${styles.actionBtn} ${styles.removeBtn}`}
              onClick={() => applyImage(null)}
            >
              Remove
            </button>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}
