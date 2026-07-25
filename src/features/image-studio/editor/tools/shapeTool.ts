import {
  Canvas as FabricCanvas,
  Rect,
  Ellipse,
  Line,
  Triangle,
  Group,
} from "fabric";

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

interface ShapeState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentShape: Rect | Ellipse | Line | Group | null;
  strokeWidth: number;
}

function getState(canvas: FabricCanvas): ShapeState {
  if (!(canvas as any).__shapeState) {
    (canvas as any).__shapeState = {
      isDrawing: false,
      startX: 0,
      startY: 0,
      currentShape: null,
      strokeWidth: 2,
    };
  }
  return (canvas as any).__shapeState;
}

function createShape(
  shape: ShapeType,
  fill: string,
  stroke: string,
  strokeWidth: number,
  left: number,
  top: number,
): Rect | Ellipse | Line | Group {
  switch (shape) {
    case "rect":
      return new Rect({
        left,
        top,
        width: 0,
        height: 0,
        fill,
        stroke,
        strokeWidth,
      });
    case "ellipse":
      return new Ellipse({
        left,
        top,
        rx: 0,
        ry: 0,
        fill,
        stroke,
        strokeWidth,
      });
    case "line":
      return new Line([left, top, left, top], {
        stroke: stroke || fill,
        strokeWidth,
      });
    case "arrow": {
      const line = new Line([left, top, left, top], {
        stroke: stroke || fill,
        strokeWidth,
      });
      const triangle = new Triangle({
        left,
        top,
        width: 0,
        height: 0,
        fill: stroke || fill,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
      });
      return new Group([line, triangle], { selectable: true });
    }
  }
}

function updateShape(
  canvas: FabricCanvas,
  state: ShapeState,
  shapeType: ShapeType,
  pointerX: number,
  pointerY: number,
): void {
  if (!state.currentShape) return;

  const left = Math.min(state.startX, pointerX);
  const top = Math.min(state.startY, pointerY);
  const width = Math.abs(pointerX - state.startX);
  const height = Math.abs(pointerY - state.startY);

  switch (shapeType) {
    case "rect":
      (state.currentShape as Rect).set({ left, top, width, height });
      break;
    case "ellipse":
      (state.currentShape as Ellipse).set({
        left: state.startX,
        top: state.startY,
        rx: width / 2,
        ry: height / 2,
      });
      break;
    case "line":
      (state.currentShape as Line).set({
        x1: state.startX,
        y1: state.startY,
        x2: pointerX,
        y2: pointerY,
      });
      break;
    case "arrow": {
      const group = state.currentShape as Group;
      const line = group.getObjects()[0] as Line;
      const triangle = group.getObjects()[1] as Triangle;

      line.set({ x1: state.startX, y1: state.startY, x2: pointerX, y2: pointerY });

      const angle =
        Math.atan2(pointerY - state.startY, pointerX - state.startX) *
        (180 / Math.PI);
      const headSize = Math.max(state.strokeWidth * 4, 12);
      triangle.set({
        left: pointerX,
        top: pointerY,
        width: headSize,
        height: headSize,
        angle: angle + 90,
      });
      break;
    }
  }
  canvas.requestRenderAll();
}

let pointerLastX = 0;
let pointerLastY = 0;

export function enableShapeTool(
  canvas: FabricCanvas,
  shape: ShapeType,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = "crosshair";

  const state = getState(canvas);
  state.strokeWidth = strokeWidth;

  const onMouseDown = (opt: any) => {
    if (state.isDrawing) return;
    const p = opt.scenePoint;
    state.isDrawing = true;
    state.startX = p.x;
    state.startY = p.y;
    pointerLastX = p.x;
    pointerLastY = p.y;

    state.currentShape = createShape(shape, fill, stroke, strokeWidth, p.x, p.y);
    canvas.add(state.currentShape);
    canvas.requestRenderAll();
  };

  const onMouseMove = (opt: any) => {
    if (!state.isDrawing || !state.currentShape) return;
    const p = opt.scenePoint;
    pointerLastX = p.x;
    pointerLastY = p.y;
    updateShape(canvas, state, shape, p.x, p.y);
  };

  const onMouseUp = () => {
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (state.currentShape) {
      const shouldRemove = checkTinyShape(shape, state);
      if (shouldRemove) {
        canvas.remove(state.currentShape);
      }
    }

    state.currentShape = null;
    canvas.requestRenderAll();
  };

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);

  (canvas as any).__shapeHandlers = { onMouseDown, onMouseMove, onMouseUp };
  (canvas as any).__shapeType = shape;
}

function checkTinyShape(shape: ShapeType, state: ShapeState): boolean {
  if (!state.currentShape) return true;

  switch (shape) {
    case "rect": {
      const r = state.currentShape as Rect;
      const w = r.width! * Math.abs(r.scaleX!);
      const h = r.height! * Math.abs(r.scaleY!);
      return w < 2 || h < 2;
    }
    case "ellipse": {
      const e = state.currentShape as Ellipse;
      return (e.rx ?? 0) < 1 || (e.ry ?? 0) < 1;
    }
    case "line":
    case "arrow": {
      const dx = pointerLastX - state.startX;
      const dy = pointerLastY - state.startY;
      return Math.hypot(dx, dy) < 5;
    }
    default:
      return false;
  }
}

export function disableShapeTool(canvas: FabricCanvas): void {
  const handlers = (canvas as any).__shapeHandlers;
  if (handlers) {
    canvas.off("mouse:down", handlers.onMouseDown);
    canvas.off("mouse:move", handlers.onMouseMove);
    canvas.off("mouse:up", handlers.onMouseUp);
    delete (canvas as any).__shapeHandlers;
  }
  delete (canvas as any).__shapeType;

  const state = (canvas as any).__shapeState;
  if (state?.currentShape) {
    state.currentShape = null;
    state.isDrawing = false;
  }

  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.defaultCursor = "default";
  canvas.requestRenderAll();
}
