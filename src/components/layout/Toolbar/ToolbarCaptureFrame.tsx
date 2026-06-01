import { memo, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import styles from "./Toolbar.module.css";

type SaveStatus = "idle" | "saving" | "saved";

async function encodeAndSave(
  data: string,
  width: number,
  height: number,
): Promise<void> {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  src
    .getContext("2d")!
    .putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0);

  const THUMB_SIZE = 256;
  const cropSize = Math.min(width, height);
  const offsetX = (width - cropSize) / 2;
  const offsetY = (height - cropSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext("2d")!;
  // VideoOutputCapture flips Y but Metal readback still arrives rotated -90°
  ctx.translate(0, THUMB_SIZE);
  ctx.rotate(-Math.PI / 2);
  ctx.drawImage(src, offsetX, offsetY, cropSize, cropSize, 0, 0, THUMB_SIZE, THUMB_SIZE);

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode PNG");
  const buf = await blob.arrayBuffer();
  const filename = `slew-frame-${Date.now()}.png`;
  await invoke("write_file_to_downloads", {
    filename,
    data: Array.from(new Uint8Array(buf)),
  });
}

const IS_DEV = import.meta.env.DEV;

export const ToolbarCaptureFrame = memo(function ToolbarCaptureFrame() {
  if (!IS_DEV) return null;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const unlistenRef = useRef<(() => void) | null>(null);

  const handleCapture = useCallback(async () => {
    if (status === "saving") return;
    setStatus("saving");

    try {
      const frame = await new Promise<{
        data: string;
        width: number;
        height: number;
      }>((resolve, reject) => {
        const timer = setTimeout(() => {
          unlistenRef.current?.();
          unlistenRef.current = null;
          reject(new Error("No composited frame received"));
        }, 3000);

        listen<{ data: string; width: number; height: number; source: unknown }>(
          "preview-frame-composited",
          (event) => {
            clearTimeout(timer);
            unlistenRef.current?.();
            unlistenRef.current = null;
            const { data, width, height } = event.payload;
            resolve({ data, width, height });
          },
        ).then((fn) => {
          unlistenRef.current = fn;
        });
      });

      await encodeAndSave(frame.data, frame.width, frame.height);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("idle");
    }
  }, [status]);

  return (
    <button
      className={`${styles.toolbarButton} ${styles.toolbarButtonDebug}`}
      onClick={handleCapture}
      disabled={status === "saving"}
      title="Save rendered frame to Downloads"
      aria-label="Save rendered frame"
    >
      {status === "saved" ? "✓ Saved" : status === "saving" ? "…" : "⬇ Frame"}
    </button>
  );
});
