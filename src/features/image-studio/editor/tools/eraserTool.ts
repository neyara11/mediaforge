import { Canvas as FabricCanvas, PencilBrush, FabricObject } from "fabric";

interface EraserState {
  eraserPaths: FabricObject[];
  onPathCreated: (e: any) => void;
}

function getState(canvas: FabricCanvas): EraserState | null {
  return (canvas as any).__eraserState ?? null;
}

export function enableEraser(canvas: FabricCanvas, size: number): void {
  canvas.isDrawingMode = true;

  const brush = new PencilBrush(canvas);
  brush.width = size;
  brush.color = "rgba(0,0,0,1)";
  canvas.freeDrawingBrush = brush;
  canvas.freeDrawingCursor = "crosshair";

  const eraserPaths: FabricObject[] = [];

  const onPathCreated = (e: any) => {
    if (e.path) {
      e.path.set("globalCompositeOperation", "destination-out");
      eraserPaths.push(e.path);
      canvas.requestRenderAll();
    }
  };

  canvas.on("path:created", onPathCreated);

  (canvas as any).__eraserState = { eraserPaths, onPathCreated };
}

export function disableEraser(canvas: FabricCanvas): void {
  canvas.isDrawingMode = false;
  canvas.freeDrawingCursor = "default";

  const state = getState(canvas);
  if (state) {
    canvas.off("path:created", state.onPathCreated);
    delete (canvas as any).__eraserState;
  }
}
