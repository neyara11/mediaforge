import { Canvas as FabricCanvas, StaticCanvas, FabricImage } from "fabric";

export function canvasToBase64(
  canvas: FabricCanvas,
  format?: string,
  quality?: number,
): string {
  const dataUrl = canvas.toDataURL({
    format: (format ?? "png") as "png" | "jpeg",
    quality: quality ?? 1,
    multiplier: 1,
    enableRetinaScaling: false,
  });
  return dataUrl.replace(/^data:image\/\w+;base64,/, "");
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
    img.onerror = reject;
    img.src = src;
  });
}

export function createFullMask(canvas: FabricCanvas): string {
  const width = canvas.getWidth();
  const height = canvas.getHeight();
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return el.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");
}

export async function compositeMaskOverlay(
  imageB64: string,
  maskElement: HTMLCanvasElement,
): Promise<string> {
  const img = await loadImageElement(`data:image/png;base64,${imageB64}`);
  const width = maskElement.width;
  const height = maskElement.height;

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return imageB64;

  ctx.drawImage(img, 0, 0, width, height);

  const maskCtx = maskElement.getContext("2d");
  if (!maskCtx) return imageB64;
  const maskData = maskCtx.getImageData(0, 0, width, height);
  const mPx = maskData.data;

  const overlay = ctx.getImageData(0, 0, width, height);
  const oPx = overlay.data;

  for (let i = 0; i < oPx.length; i += 4) {
    const isMasked = mPx[i] > 128 && mPx[i + 1] > 128 && mPx[i + 2] > 128;
    if (isMasked) {
      oPx[i] = Math.min(255, oPx[i] + 80);
      oPx[i + 1] = Math.min(255, oPx[i + 1] + 160);
      oPx[i + 2] = Math.min(255, oPx[i + 2] + 80);
    }
  }

  ctx.putImageData(overlay, 0, 0);
  return out.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");
}

export async function extractMaskFromCanvas(
  canvas: FabricCanvas,
  maskObjects: any[],
): Promise<{ alphaB64: string; compositeElement: HTMLCanvasElement } | null> {
  if (maskObjects.length === 0) return null;

  const width = canvas.getWidth();
  const height = canvas.getHeight();

  const tempCanvas = new StaticCanvas(document.createElement("canvas"), {
    width,
    height,
    enableRetinaScaling: false,
  });

  const whiteObjects = maskObjects.map((obj: any) => ({
    ...obj.toObject(),
    fill: "#ffffff",
    stroke: "#ffffff",
  }));
  await tempCanvas.loadFromJSON({ objects: whiteObjects });
  tempCanvas.renderAll();
  const maskDataUrl = tempCanvas.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: false });
  await tempCanvas.dispose();

  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) return null;

  const maskImg = await loadImageElement(maskDataUrl);
  ctx.drawImage(maskImg, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    if (brightness > 128) {
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
    } else {
      pixels[i] = 0;
      pixels[i + 1] = 0;
      pixels[i + 2] = 0;
    }
    pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  return {
    alphaB64: el.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, ""),
    compositeElement: el,
  };
}

export async function compositeWithMask(
  originalB64: string,
  resultB64: string,
  maskCanvas: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
): Promise<string> {
  const originalImg = await loadImageElement(`data:image/png;base64,${originalB64}`);
  const resultImg = await loadImageElement(`data:image/png;base64,${resultB64}`);

  const out = document.createElement("canvas");
  out.width = canvasWidth;
  out.height = canvasHeight;
  const outCtx = out.getContext("2d");
  if (!outCtx) return resultB64;

  outCtx.drawImage(resultImg, 0, 0);
  const resultData = outCtx.getImageData(0, 0, canvasWidth, canvasHeight);

  const tmp = document.createElement("canvas");
  tmp.width = canvasWidth;
  tmp.height = canvasHeight;
  const tmpCtx = tmp.getContext("2d");
  if (!tmpCtx) return resultB64;
  tmpCtx.drawImage(originalImg, 0, 0);
  const originalData = tmpCtx.getImageData(0, 0, canvasWidth, canvasHeight);

  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return resultB64;
  const maskData = maskCtx.getImageData(0, 0, canvasWidth, canvasHeight);

  const rPx = resultData.data;
  const oPx = originalData.data;
  const mPx = maskData.data;

  for (let i = 0; i < rPx.length; i += 4) {
    const alpha = mPx[i + 3];
    if (alpha > 128) {
      rPx[i] = rPx[i];
      rPx[i + 1] = rPx[i + 1];
      rPx[i + 2] = rPx[i + 2];
    } else {
      rPx[i] = oPx[i];
      rPx[i + 1] = oPx[i + 1];
      rPx[i + 2] = oPx[i + 2];
    }
  }

  outCtx.putImageData(resultData, 0, 0);
  return out.toDataURL("image/png").replace(/^data:image\/\w+;base64,/, "");
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
