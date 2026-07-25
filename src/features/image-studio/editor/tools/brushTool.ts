import { Canvas as FabricCanvas, PencilBrush } from "fabric";

export function enableBrush(
  canvas: FabricCanvas,
  size: number,
  color: string,
): void {
  canvas.isDrawingMode = true;
  canvas.freeDrawingBrush = new PencilBrush(canvas);
  canvas.freeDrawingBrush.width = size;
  canvas.freeDrawingBrush.color = color;
  canvas.freeDrawingCursor = "crosshair";
}

export function disableBrush(canvas: FabricCanvas): void {
  canvas.isDrawingMode = false;
  canvas.freeDrawingCursor = "default";
}

export function updateBrushSettings(
  canvas: FabricCanvas,
  size: number,
  color: string,
): void {
  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.width = size;
    canvas.freeDrawingBrush.color = color;
  }
}
