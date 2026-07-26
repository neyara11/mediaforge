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
  | "lasso";

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
  tools: { value: EditorTool; labelKey: string; shortcut: string }[];
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

const TOOLS: { value: EditorTool; labelKey: string; shortcut: string }[] = [
  { value: "select", labelKey: "tools.select", shortcut: "V" },
  { value: "crop", labelKey: "tools.crop", shortcut: "C" },
  { value: "brush", labelKey: "tools.brush", shortcut: "B" },
  { value: "eraser", labelKey: "tools.eraser", shortcut: "E" },
  { value: "text", labelKey: "tools.text", shortcut: "T" },
  { value: "rect", labelKey: "tools.rect", shortcut: "R" },
  { value: "ellipse", labelKey: "tools.ellipse", shortcut: "O" },
  { value: "line", labelKey: "tools.line", shortcut: "I" },
  { value: "lasso", labelKey: "tools.lasso", shortcut: "L" },
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
