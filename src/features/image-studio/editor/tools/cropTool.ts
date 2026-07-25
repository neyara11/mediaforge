import {
  Canvas as FabricCanvas,
  Rect,
  FabricImage,
} from "fabric";

export interface CropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getCropRect(canvas: FabricCanvas): CropRect | null {
  const state = (canvas as any).__cropState;
  if (!state?.cropRect) return null;
  const rect = state.cropRect;
  return {
    left: rect.left!,
    top: rect.top!,
    width: rect.width! * Math.abs(rect.scaleX!),
    height: rect.height! * Math.abs(rect.scaleY!),
  };
}

interface CropState {
  cropRect: Rect | null;
  isDrawing: boolean;
  startX: number;
  startY: number;
}

function getState(canvas: FabricCanvas): CropState {
  if (!(canvas as any).__cropState) {
    (canvas as any).__cropState = {
      cropRect: null,
      isDrawing: false,
      startX: 0,
      startY: 0,
    };
  }
  return (canvas as any).__cropState;
}

function confirmCrop(canvas: FabricCanvas): void {
  const state = getState(canvas);
  if (!state.cropRect) return;

  const rect = state.cropRect;
  const left = rect.left!;
  const top = rect.top!;
  const width = rect.width! * Math.abs(rect.scaleX!);
  const height = rect.height! * Math.abs(rect.scaleY!);

  if (width < 2 || height < 2) return;

  const el = canvas.toCanvasElement();
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext("2d")!;
  offCtx.drawImage(el, left, top, width, height, 0, 0, width, height);

  const dataUrl = offscreen.toDataURL("image/png");

  FabricImage.fromURL(dataUrl).then((img) => {
    canvas.clear();
    canvas.setDimensions({ width, height });
    canvas.add(img);
    img.set({ left: 0, top: 0 });
    canvas.renderAll();
    disableCropMode(canvas);
  });
}

function makeKeyHandler(canvas: FabricCanvas): (e: KeyboardEvent) => void {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      confirmCrop(canvas);
    }
    if (e.key === "Escape") {
      disableCropMode(canvas);
    }
  };
}

export function enableCropMode(canvas: FabricCanvas): void {
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = "crosshair";

  const state = getState(canvas);

  const onMouseDown = (opt: any) => {
    if (state.isDrawing) return;
    const p = opt.scenePoint;
    state.isDrawing = true;
    state.startX = p.x;
    state.startY = p.y;

    state.cropRect = new Rect({
      left: p.x,
      top: p.y,
      width: 0,
      height: 0,
      fill: "rgba(139, 92, 246, 0.1)",
      stroke: "#8b5cf6",
      strokeWidth: 1,
      strokeDashArray: [6, 3],
      selectable: false,
      evented: false,
    });
    canvas.add(state.cropRect);
    canvas.renderAll();
  };

  const onMouseMove = (opt: any) => {
    if (!state.isDrawing || !state.cropRect) return;
    const p = opt.scenePoint;
    const dx = Math.abs(p.x - state.startX);
    const dy = Math.abs(p.y - state.startY);
    const size = Math.max(dx, dy);
    const left = p.x > state.startX ? state.startX : state.startX - size;
    const top = p.y > state.startY ? state.startY : state.startY - size;

    state.cropRect.set({ left, top, width: size, height: size });
    canvas.renderAll();
  };

  const onMouseUp = () => {
    if (state.isDrawing && state.cropRect) {
      const w = state.cropRect.width! * Math.abs(state.cropRect.scaleX!);
      const h = state.cropRect.height! * Math.abs(state.cropRect.scaleY!);
      if (w < 2 || h < 2) {
        canvas.remove(state.cropRect);
        state.cropRect = null;
      }
    }
    state.isDrawing = false;
    canvas.renderAll();
  };

  const onDblClick = () => {
    if (state.cropRect) {
      confirmCrop(canvas);
    }
  };

  const keyHandler = makeKeyHandler(canvas);

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("mouse:dblclick", onDblClick);
  window.addEventListener("keydown", keyHandler);

  (canvas as any).__cropHandlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDblClick,
    keyHandler,
  };
}

export function disableCropMode(canvas: FabricCanvas): void {
  const state = getState(canvas);
  if (state.cropRect) {
    canvas.remove(state.cropRect);
    state.cropRect = null;
  }
  state.isDrawing = false;

  const handlers = (canvas as any).__cropHandlers;
  if (handlers) {
    canvas.off("mouse:down", handlers.onMouseDown);
    canvas.off("mouse:move", handlers.onMouseMove);
    canvas.off("mouse:up", handlers.onMouseUp);
    canvas.off("mouse:dblclick", handlers.onDblClick);
    if (handlers.keyHandler) {
      window.removeEventListener("keydown", handlers.keyHandler);
    }
    delete (canvas as any).__cropHandlers;
  }

  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.defaultCursor = "default";
  canvas.renderAll();
}
