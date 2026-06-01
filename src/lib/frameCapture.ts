import { listen } from "@tauri-apps/api/event";

const THUMB_SIZE = 200;

export async function captureCompositeFrameAsDataUrl(
  size = THUMB_SIZE,
  timeoutMs = 3000,
): Promise<string> {
  let unlisten: (() => void) | null = null;

  const frame = await new Promise<{ data: string; width: number; height: number }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        unlisten?.();
        unlisten = null;
        reject(new Error("No composited frame received"));
      }, timeoutMs);

      listen<{ data: string; width: number; height: number }>(
        "preview-frame-composited",
        (event) => {
          clearTimeout(timer);
          unlisten?.();
          unlisten = null;
          const { data, width, height } = event.payload;
          resolve({ data, width, height });
        },
      ).then((fn) => {
        unlisten = fn;
      });
    },
  );

  const { data, width, height } = frame;
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const src = document.createElement("canvas");
  src.width = width;
  src.height = height;
  src.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(bytes), width, height), 0, 0);

  const cropSize = Math.min(width, height);
  const offsetX = (width - cropSize) / 2;
  const offsetY = (height - cropSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, offsetX, offsetY, cropSize, cropSize, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.8);
}
