import {
  Canvas as FabricCanvas,
  Polyline,
  Polygon,
  Point,
} from "fabric";
import { canvasToElementUntransformed } from "../utils/canvasExport";
import { suspendHistory, resumeHistory } from "../utils/historySuspend";

export interface LassoSelection {
  polygon: Polygon;
  maskBase64: string | null;
}

interface LassoState {
  points: Point[];
  polyline: Polyline | null;
  polygon: Polygon | null;
}

function getState(canvas: FabricCanvas): LassoState {
  if (!(canvas as any).__lassoState) {
    (canvas as any).__lassoState = {
      points: [],
      polyline: null,
      polygon: null,
    };
  }
  return (canvas as any).__lassoState;
}

function generateMask(
  polygon: Polygon,
  canvas: FabricCanvas,
): string | null {
  const points = polygon.points;
  if (!points || points.length < 3) return null;

  const el = canvasToElementUntransformed(canvas);
  const width = el.width;
  const height = el.height;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const ctx = maskCanvas.getContext("2d")!;

  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  const matrix = polygon.calcTransformMatrix();
  ctx.save();
  ctx.transform(
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[3],
    matrix[4],
    matrix[5],
  );

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  return maskCanvas.toDataURL("image/png");
}

export function enableLasso(
  canvas: FabricCanvas,
  onComplete: (selection: LassoSelection) => void,
): void {
  canvas.isDrawingMode = false;
  canvas.selection = false;
  canvas.skipTargetFind = true;
  canvas.defaultCursor = "crosshair";

  const state = getState(canvas);

  const onMouseDown = (opt: any) => {
    const p = opt.scenePoint;
    state.points.push(new Point(p.x, p.y));

    canvas.requestRenderAll();
  };

  const onMouseMove = (opt: any) => {
    if (state.points.length === 0) return;
    const p = opt.scenePoint;

    const allPoints = [...state.points, new Point(p.x, p.y)];
    if (state.polyline) {
      // Update in place — removing/adding per mousemove would flood the
      // undo history and thrash the object list.
      state.polyline.set({ points: allPoints });
      state.polyline.setCoords();
    } else {
      state.polyline = new Polyline(allPoints, {
        stroke: "#8b5cf6",
        strokeWidth: 2,
        strokeDashArray: [5, 5],
        fill: "",
        selectable: false,
        evented: false,
      });
      suspendHistory(canvas);
      try {
        canvas.add(state.polyline);
      } finally {
        resumeHistory(canvas);
      }
    }
    canvas.requestRenderAll();
  };

  const onMouseUp = (opt: any) => {
    if (state.points.length < 2) return;

    const firstPoint = state.points[0];
    const p = opt.scenePoint;
    const dist = Math.hypot(p.x - firstPoint.x, p.y - firstPoint.y);

    if (dist < 12 && state.points.length >= 3) {
      closePolygon(canvas, state, onComplete);
    }
  };

  const onDblClick = () => {
    if (state.points.length >= 3) {
      closePolygon(canvas, state, onComplete);
    }
  };

  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);
  canvas.on("mouse:dblclick", onDblClick);

  (canvas as any).__lassoHandlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onDblClick,
  };
  (canvas as any).__lassoCallback = onComplete;
}

function closePolygon(
  canvas: FabricCanvas,
  state: LassoState,
  onComplete: (selection: LassoSelection) => void,
): void {
  suspendHistory(canvas);
  try {
    if (state.polyline) {
      canvas.remove(state.polyline);
      state.polyline = null;
    }
  } finally {
    resumeHistory(canvas);
  }

  if (state.points.length < 3) return;

  // Build the polygon off-canvas: it only exists to compute the mask.
  // Leaving it on the canvas would bake a stray overlay into exports.
  const polygon = new Polygon(state.points, {
    fill: "rgba(139, 92, 246, 0.15)",
    stroke: "#8b5cf6",
    strokeWidth: 2,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
  });

  state.polygon = null;
  state.points = [];

  const maskBase64 = generateMask(polygon, canvas);

  canvas.requestRenderAll();
  onComplete({ polygon, maskBase64 });
}

export function disableLasso(canvas: FabricCanvas): void {
  const handlers = (canvas as any).__lassoHandlers;
  if (handlers) {
    canvas.off("mouse:down", handlers.onMouseDown);
    canvas.off("mouse:move", handlers.onMouseMove);
    canvas.off("mouse:up", handlers.onMouseUp);
    canvas.off("mouse:dblclick", handlers.onDblClick);
    delete (canvas as any).__lassoHandlers;
  }
  delete (canvas as any).__lassoCallback;

  const state = (canvas as any).__lassoState;
  if (state) {
    suspendHistory(canvas);
    try {
      if (state.polyline) {
        canvas.remove(state.polyline);
        state.polyline = null;
      }
      if (state.polygon) {
        canvas.remove(state.polygon);
        state.polygon = null;
      }
    } finally {
      resumeHistory(canvas);
    }
    state.points = [];
  }

  canvas.selection = true;
  canvas.skipTargetFind = false;
  canvas.defaultCursor = "default";
  canvas.requestRenderAll();
}

export function clearSelection(canvas: FabricCanvas): void {
  const objects = canvas.getObjects();
  for (const obj of objects) {
    if (
      obj instanceof Polygon ||
      obj instanceof Polyline
    ) {
      canvas.remove(obj);
    }
  }

  const state = (canvas as any).__lassoState;
  if (state) {
    state.polygon = null;
    state.polyline = null;
    state.points = [];
  }

  canvas.requestRenderAll();
}
