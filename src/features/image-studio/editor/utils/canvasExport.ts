import { Canvas as FabricCanvas, FabricImage } from "fabric";

/**
 * Render the canvas to an element with the viewport transform (zoom/pan)
 * temporarily reset, so scene coordinates map 1:1 to output pixels.
 * Uses the plain no-arg toCanvasElement() call — fabric v6 misbehaves when
 * passed a partial options object here.
 */
export function canvasToElementUntransformed(
  canvas: FabricCanvas,
): HTMLCanvasElement {
  const originalVt = [...canvas.viewportTransform] as typeof canvas.viewportTransform;
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  try {
    return canvas.toCanvasElement();
  } finally {
    canvas.viewportTransform = originalVt;
  }
}

export function canvasToBase64(
  canvas: FabricCanvas,
  format?: string,
  quality?: number,
  multiplier = 1,
): string {
  const originalVt = [...canvas.viewportTransform] as typeof canvas.viewportTransform;
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  try {
    const dataUrl = canvas.toDataURL({
      format: (format ?? "png") as "png" | "jpeg",
      quality: quality ?? 1,
      multiplier,
      enableRetinaScaling: false,
    });
    return dataUrl.replace(/^data:image\/\w+;base64,/, "");
  } finally {
    canvas.viewportTransform = originalVt;
  }
}

/**
 * Multiplier that makes the exported bitmap match the background image's
 * native resolution (the image is downscaled to fit the canvas widget).
 * Capped to avoid pathologically large exports.
 */
export function getNativeResolutionMultiplier(canvas: FabricCanvas): number {
  const bg = canvas
    .getObjects()
    .find(
      (obj: any) =>
        obj.type === "image" && obj.selectable === false && obj.evented === false,
    ) as FabricImage | undefined;
  const scaleX = bg?.scaleX ?? 1;
  if (!scaleX || scaleX >= 1) return 1;
  return Math.min(1 / scaleX, 4);
}

export async function canvasToBlob(
  canvas: FabricCanvas,
  format?: string,
  quality?: number,
): Promise<Blob> {
  const dataUrl = canvas.toDataURL({
    format: (format ?? "png") as "png" | "jpeg",
    quality: quality ?? 1,
    multiplier: 1,
    enableRetinaScaling: false,
  });
  const response = await fetch(dataUrl);
  return response.blob();
}

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load image (src length: ${src.length})`));
    img.src = src;
  });
}

export function createFullMask(canvas: FabricCanvas, multiplier = 1): string {
  const width = Math.round(canvas.getWidth() * multiplier);
  const height = Math.round(canvas.getHeight() * multiplier);
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return el.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");
}

/**
 * Cut a rectangular region out of a source image and feather its edges:
 * the patch alpha fades to transparent over ~featherPx at the borders, so
 * placing it over the original image produces no visible rectangular seam.
 * Returns base64 PNG (no data-URL prefix).
 */
export function extractFeatheredRegion(
  img: HTMLImageElement,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  featherPx: number,
): string {
  const patch = document.createElement("canvas");
  patch.width = srcW;
  patch.height = srcH;
  const ctx = patch.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

  if (featherPx > 0) {
    const mask = document.createElement("canvas");
    mask.width = srcW;
    mask.height = srcH;
    const mCtx = mask.getContext("2d");
    if (mCtx) {
      // Blurring a full-size white rect fades its edges inward (the outer
      // spill is clipped by the mask canvas bounds)
      mCtx.fillStyle = "#000000";
      mCtx.fillRect(0, 0, srcW, srcH);
      mCtx.filter = `blur(${featherPx}px)`;
      mCtx.fillStyle = "#ffffff";
      mCtx.fillRect(0, 0, srcW, srcH);
      mCtx.filter = "none";
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  return patch.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");
}

export async function compositeResult(
  canvas: FabricCanvas,
  resultBase64: string,
  selectionRect?: { left: number; top: number; width: number; height: number },
): Promise<void> {
  const dataUrl = resultBase64.startsWith("data:")
    ? resultBase64
    : `data:image/png;base64,${resultBase64}`;

  const img = await FabricImage.fromURL(dataUrl);
  if (!img) return;

  if (selectionRect) {
    img.set({
      left: selectionRect.left,
      top: selectionRect.top,
      scaleX: selectionRect.width / (img.width || 1),
      scaleY: selectionRect.height / (img.height || 1),
    });
  } else {
    canvas.clear();
    canvas.remove(...canvas.getObjects());
    const canvasW = canvas.getWidth();
    const canvasH = canvas.getHeight();
    const imgW = img.width || canvasW;
    const imgH = img.height || canvasH;
    const scale = Math.min(canvasW / imgW, canvasH / imgH, 1);
    img.scale(scale);
    img.set({
      left: (canvasW - imgW * scale) / 2,
      top: (canvasH - imgH * scale) / 2,
    });
  }

  canvas.add(img as any);
  canvas.renderAll();
}
