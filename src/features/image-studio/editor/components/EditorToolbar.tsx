import {
  Undo2,
  Redo2,
  Save,
  FolderOpen,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  PanelRight,
  MousePointer2,
  Brush,
  Eraser,
  Square,
  Circle,
  Minus,
  Type,
  Droplets,
  Lasso,
  Crop,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../../shared/utils";
import type { EditorTool } from "../hooks/useEditorTools";

interface ToolSettings {
  brushSize: number;
  brushColor: string;
  fontSize: number;
  fontFamily: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

interface EditorToolbarProps {
  tool: EditorTool;
  setTool: (tool: EditorTool) => void;
  tools: { value: EditorTool; labelKey: string; shortcut: string }[];
  settings: ToolSettings;
  updateSetting: (key: string, value: string | number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitScreen: () => void;
  onToggleSidebar: () => void;
  zoom: number;
  showSidebar: boolean;
}

const toolIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  select: MousePointer2,
  brush: Brush,
  eraser: Eraser,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  text: Type,
  lasso: Lasso,
  mask: Droplets,
  crop: Crop,
};

export default function EditorToolbar({
  tool,
  setTool,
  tools,
  settings,
  updateSetting,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onOpen,
  onExport,
  onZoomIn,
  onZoomOut,
  onFitScreen,
  onToggleSidebar,
  zoom,
  showSidebar,
}: EditorToolbarProps) {
  const { t: tr } = useTranslation("editor");
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900 p-2">
      {tools.map((t) => {
        const Icon = toolIcons[t.value] ?? MousePointer2;
        return (
          <button
            key={t.value}
            onClick={() => setTool(t.value)}
            title={`${tr(t.labelKey)} (${t.shortcut})`}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm transition-colors",
              tool === t.value
                ? "bg-violet-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}

      <div className="mx-1 h-6 w-px shrink-0 bg-zinc-700" />

      {(tool === "brush" || tool === "eraser") && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="range"
            min={1}
            max={100}
            value={settings.brushSize}
            onChange={(e) => updateSetting("brushSize", Number(e.target.value))}
            className="h-4 w-20 accent-violet-500"
            title={tr("toolbar.brushSize")}
          />
          {tool === "brush" && (
            <input
              type="color"
              value={settings.brushColor}
              onChange={(e) => updateSetting("brushColor", e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
              title={tr("toolbar.brushColor")}
            />
          )}
          <span className="text-xs text-zinc-500">
            {settings.brushSize}px
          </span>
        </div>
      )}

      {tool === "mask" && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-zinc-500">{tr("toolbar.maskHint")}</span>
        </div>
      )}

      {tool === "text" && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            min={8}
            max={200}
            value={settings.fontSize}
            onChange={(e) => updateSetting("fontSize", Number(e.target.value))}
            className="w-14 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
          />
          <select
            value={settings.fontFamily}
            onChange={(e) => updateSetting("fontFamily", e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
        </div>
      )}

      {(tool === "rect" || tool === "ellipse" || tool === "line") && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="color"
            value={settings.fillColor}
            onChange={(e) => updateSetting("fillColor", e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            title={tr("toolbar.fillColor")}
          />
          <input
            type="color"
            value={settings.strokeColor}
            onChange={(e) => updateSetting("strokeColor", e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-zinc-800 p-0"
            title={tr("toolbar.strokeColor")}
          />
          <input
            type="range"
            min={1}
            max={20}
            value={settings.strokeWidth}
            onChange={(e) => updateSetting("strokeWidth", Number(e.target.value))}
            className="h-4 w-16 accent-violet-500"
            title={tr("toolbar.strokeWidth")}
          />
          <span className="text-xs text-zinc-500">
            {settings.strokeWidth}px
          </span>
        </div>
      )}

      <div className="mx-1 h-6 w-px shrink-0 bg-zinc-700" />

      <button
        onClick={onUndo}
        disabled={!canUndo}
        title={tr("toolbar.undo")}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          canUndo
            ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            : "cursor-not-allowed text-zinc-700",
        )}
      >
        <Undo2 className="h-4 w-4" />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        title={tr("toolbar.redo")}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          canRedo
            ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            : "cursor-not-allowed text-zinc-700",
        )}
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <div className="mx-1 h-6 w-px shrink-0 bg-zinc-700" />

      <button
        onClick={onZoomOut}
        title={tr("toolbar.zoomOut")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <ZoomOut className="h-4 w-4" />
      </button>

      <span className="shrink-0 text-xs text-zinc-500 tabular-nums w-12 text-center">
        {Math.round(zoom * 100)}%
      </span>

      <button
        onClick={onZoomIn}
        title={tr("toolbar.zoomIn")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      <button
        onClick={onFitScreen}
        title={tr("toolbar.fitScreen")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Maximize className="h-4 w-4" />
      </button>

      <div className="ml-auto flex items-center gap-1" />

      <button
        onClick={onOpen}
        title={tr("toolbar.openImage")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <FolderOpen className="h-4 w-4" />
      </button>

      <button
        onClick={onSave}
        title={tr("toolbar.save")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Save className="h-4 w-4" />
      </button>

      <button
        onClick={onExport}
        title={tr("toolbar.exportPng")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <Download className="h-4 w-4" />
      </button>

      <div className="mx-1 h-6 w-px shrink-0 bg-zinc-700" />

      <button
        onClick={onToggleSidebar}
        title={showSidebar ? tr("toolbar.hideSidebar") : tr("toolbar.showSidebar")}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
          showSidebar
            ? "bg-zinc-800 text-violet-400"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
        )}
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </div>
  );
}
