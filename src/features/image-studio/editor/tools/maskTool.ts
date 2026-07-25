import {
  Canvas as FabricCanvas,
  PencilBrush,
  FabricObject,
} from "fabric";

export const MASK_COLOR = "rgba(255, 0, 0, 0.4)";
const MASK_BRUSH_SIZE = 50;

export function enableMaskMode(canvas: FabricCanvas, _brushSize: number): void {
  canvas.isDrawingMode = true;

  const brush = new PencilBrush(canvas);
  brush.width = MASK_BRUSH_SIZE;
  brush.color = MASK_COLOR;
  canvas.freeDrawingBrush = brush;
  canvas.freeDrawingCursor = "crosshair";

  const onObjectAdded = (opt: { target: FabricObject }) => {
    if (opt.target) {
      (opt.target as any).isMask = true;
    }
  };

  canvas.on("object:added", onObjectAdded);
  (canvas as any).__maskObjectHandler = onObjectAdded;
}

export function disableMaskMode(canvas: FabricCanvas): void {
  canvas.isDrawingMode = false;
  canvas.freeDrawingCursor = "default";

  const handler = (canvas as any).__maskObjectHandler;
  if (handler) {
    canvas.off("object:added", handler);
    delete (canvas as any).__maskObjectHandler;
  }
}

export function getMaskObjects(canvas: FabricCanvas): FabricObject[] {
  // isMask is serialized via toJSON(["isMask"]) so it survives undo/redo;
  // fall back to the mask stroke color for objects restored from older states.
  return canvas.getObjects().filter(
    (obj) =>
      (obj as any).isMask === true ||
      (obj.type === "path" && (obj as any).stroke === MASK_COLOR),
  );
}

export function clearMask(canvas: FabricCanvas): void {
  const maskObjects = getMaskObjects(canvas);
  for (const obj of maskObjects) {
    canvas.remove(obj);
  }
  canvas.requestRenderAll();
}
