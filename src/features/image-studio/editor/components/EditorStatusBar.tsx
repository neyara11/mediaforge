import { useTranslation } from "react-i18next";

interface EditorStatusBarProps {
  zoom: number;
  canvasWidth: number;
  canvasHeight: number;
  cursorX: number;
  cursorY: number;
  tool: string;
}

export default function EditorStatusBar({
  zoom,
  canvasWidth,
  canvasHeight,
  cursorX,
  cursorY,
  tool,
}: EditorStatusBarProps) {
  const { t } = useTranslation("editor");
  const toolLabel = t(`tools.${tool}`, { defaultValue: tool });

  return (
    <div className="flex items-center gap-4 border-t border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-500">
      <div className="flex items-center gap-2">
        <span className="text-zinc-600">{t("status.pos")}</span>
        <span className="tabular-nums text-zinc-400">
          {cursorX},{cursorY}
        </span>
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <div className="flex items-center gap-2">
        <span className="text-zinc-600">{t("status.canvas")}</span>
        <span className="tabular-nums text-zinc-400">
          {canvasWidth} x {canvasHeight}
        </span>
      </div>

      <div className="h-4 w-px bg-zinc-800" />

      <div className="flex items-center gap-2">
        <span className="text-zinc-600">{t("status.zoom")}</span>
        <span className="tabular-nums text-zinc-400">
          {Math.round(zoom * 100)}%
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-zinc-600">{t("status.tool")}</span>
        <span className="text-zinc-400">{toolLabel}</span>
      </div>
    </div>
  );
}
