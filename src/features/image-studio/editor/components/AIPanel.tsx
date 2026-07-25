import { useState } from "react";
import { Wand2, Sparkles, Loader2 } from "lucide-react";
import { cn } from "../../../../shared/utils";

interface AIPanelProps {
  onApply: (type: string, params: Record<string, unknown>) => Promise<void>;
  loading: boolean;
  defaultModel: string;
  availableModels: { id: string; name: string }[];
  onModelChange: (model: string) => void;
}

const aiTools = [
  { type: "region_edit", label: "Region Edit", description: "Выделите область (Crop) и впишите промпт", icon: Wand2 },
  { type: "inpaint", label: "Inpaint", description: "Заполнить закрашенную область (Mask)", icon: Wand2 },
  { type: "outpaint", label: "Outpaint", description: "Расширить изображение", icon: Sparkles },
  { type: "remove_background", label: "Remove Background", description: "Удалить фон", icon: Wand2 },
  { type: "upscale", label: "Upscale", description: "Увеличить разрешение x4", icon: Sparkles },
  { type: "style_transfer", label: "Style Transfer", description: "Перенести стиль", icon: Wand2 },
];

export default function AIPanel({ onApply, loading, defaultModel, availableModels, onModelChange }: AIPanelProps) {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">AI инструменты</span>
        <div className="flex-1 border-t border-zinc-800" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-500">Модель</label>
        <select
          value={defaultModel}
          onChange={(e) => onModelChange(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white outline-none"
        >
          {availableModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-center text-xs text-zinc-500">
        Inpaint: выберите Mask (💧), закрасьте область, введите промпт, Apply
      </div>

      <div className="flex flex-col gap-2">
        {aiTools.map((aitool) => {
          const Icon = aitool.icon;
          const isInpaint = aitool.type === "inpaint";
          const hasPrompt = isInpaint || aitool.type === "region_edit";

          return (
            <div key={aitool.type} className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  <Icon className="h-4 w-4 text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-300">{aitool.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{aitool.description}</p>
                </div>
              </div>

              {hasPrompt && (
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Опишите, что сгенерировать в выделенной области..."
                  rows={2}
                  className="mt-2 w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
                />
              )}

              <button
                onClick={() => onApply(aitool.type, { prompt })}
                disabled={loading}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  loading
                    ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                    : "bg-violet-600 text-white hover:bg-violet-500",
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icon className="h-3.5 w-3.5" />
                    Apply {aitool.label}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
