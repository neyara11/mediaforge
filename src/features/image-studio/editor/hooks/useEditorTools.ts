import { useState, useCallback, useMemo } from "react";

export type EditorTool =
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "text"
  | "rect"
  | "ellipse"
  | "line"
  | "lasso"
  | "mask";

export interface ToolSettings {
  brushSize: number;
  brushColor: string;
  brushOpacity: number;
  fontSize: number;
  fontFamily: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

interface UseEditorToolsReturn {
  tool: EditorTool;
  setTool: (tool: EditorTool) => void;
  settings: ToolSettings;
  updateSetting: <K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) => void;
  tools: { value: EditorTool; label: string; shortcut: string }[];
}

const DEFAULT_SETTINGS: ToolSettings = {
  brushSize: 4,
  brushColor: "#ffffff",
  brushOpacity: 1,
  fontSize: 24,
  fontFamily: "Arial",
  fillColor: "transparent",
  strokeColor: "#ffffff",
  strokeWidth: 2,
};

const TOOLS: { value: EditorTool; label: string; shortcut: string }[] = [
  { value: "select", label: "Выделение", shortcut: "V" },
  { value: "crop", label: "Кадрировать", shortcut: "C" },
  { value: "brush", label: "Кисть", shortcut: "B" },
  { value: "eraser", label: "Ластик", shortcut: "E" },
  { value: "text", label: "Текст", shortcut: "T" },
  { value: "rect", label: "Прямоугольник", shortcut: "R" },
  { value: "ellipse", label: "Эллипс", shortcut: "O" },
  { value: "line", label: "Линия", shortcut: "I" },
  { value: "lasso", label: "Лассо", shortcut: "L" },
  { value: "mask", label: "Маска", shortcut: "M" },
];

export function useEditorTools(): UseEditorToolsReturn {
  const [tool, setTool] = useState<EditorTool>("select");
  const [settings, setSettings] = useState<ToolSettings>(DEFAULT_SETTINGS);

  const handleSetTool = useCallback((newTool: EditorTool) => {
    setTool(newTool);
  }, []);

  const updateSetting = useCallback(
    <K extends keyof ToolSettings>(key: K, value: ToolSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const tools = useMemo(() => TOOLS, []);

  return { tool, setTool: handleSetTool, settings, updateSetting, tools };
}
