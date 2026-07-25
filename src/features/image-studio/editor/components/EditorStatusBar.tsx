interface EditorStatusBarProps {
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  cursorX: number;
  cursorY: number;
  tool: string;
}

const toolLabels: Record<string, string> = {
  select: "Select",
  brush: "Brush",
  eraser: "Eraser",
  rectangle: "Rectangle",
  circle: "Circle",
  line: "Line",
  text: "Text",
  rectangle_select: "Rect Select",
  lasso_select: "Lasso",
  hand: "Hand",
  crop: "Crop",
};

export default function EditorStatusBar({
  zoom,
  canvasWidth,
  canvasHeight,
  cursorX,
  cursorY,
  tool,
}: EditorStatusBarProps) {
  const toolLabel = toolLabels[tool] ?? tool;

  return (
    <div className="flex items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-500">
      <div className="flex items-center gap-2">
        <span className="text-zinc-600">Pos:</span>
        <span className="tabular-nums text-zinc-400">
          {cursorX},{cursorY}
        </span>
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <div className="flex items-center gap-2">
        <span className="text-zinc-600">Canvas:</span>
        <span className="tabular-nums text-zinc-400">
          {canvasWidth} x {canvasHeight}
        </span>
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <div className="flex items-center gap-2">
        <span className="text-zinc-600">Zoom:</span>
        <span className="tabular-nums text-zinc-400">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-zinc-600">Tool:</span>
        <span className="text-zinc-400">{toolLabel}</span>
      </div>
    </div>
  );
}
