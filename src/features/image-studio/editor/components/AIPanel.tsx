import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Sparkles, Loader2, X } from "lucide-react";
import { cn } from "../../../../shared/utils";

interface AIPanelProps {
  onApply: (type: string, params: Record<string, unknown>) => Promise<void>;
  loading: boolean;
  defaultModel: string;
  availableModels: { id: string; name: string }[];
  onModelChange: (model: string) => void;
}

const aiTools = [
  { type: "region_edit", labelKey: "ai.regionEdit", descKey: "ai.regionEditDesc", icon: Wand2 },
  { type: "inpaint", labelKey: "ai.inpaint", descKey: "ai.inpaintDesc", icon: Wand2 },
  { type: "outpaint", labelKey: "ai.outpaint", descKey: "ai.outpaintDesc", icon: Sparkles },
  { type: "remove_background", labelKey: "ai.removeBackground", descKey: "ai.removeBackgroundDesc", icon: Wand2 },
  { type: "upscale", labelKey: "ai.upscale", descKey: "ai.upscaleDesc", icon: Sparkles },
  { type: "style_transfer", labelKey: "ai.styleTransfer", descKey: "ai.styleTransferDesc", icon: Wand2 },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function AIPanel({ onApply, loading, defaultModel, availableModels, onModelChange }: AIPanelProps) {
  const { t } = useTranslation("editor");
  // Separate prompt per tool so both visible textareas keep their own text
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [styleRef, setStyleRef] = useState<{ b64: string; name: string } | null>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);

  const setToolPrompt = (type: string, value: string) =>
    setPrompts((prev) => ({ ...prev, [type]: value }));

  const handleStyleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await fileToBase64(file);
      setStyleRef({ b64, name: file.name });
    } catch {
      /* ignore unreadable file */
    }
    if (styleInputRef.current) styleInputRef.current.value = "";
  };

  const buildParams = (type: string): Record<string, unknown> => {
    const params: Record<string, unknown> = { prompt: prompts[type] ?? "" };
    if (type === "style_transfer") {
      params.styleRef = styleRef?.b64 ?? "";
    }
    return params;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">{t("ai.title")}</span>
        <div className="flex-1 border-t border-zinc-800" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-zinc-500">{t("ai.model")}</label>
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
        {t("ai.hint")}
      </div>

      <div className="flex flex-col gap-2">
        {aiTools.map((aitool) => {
          const Icon = aitool.icon;
          const hasPrompt = aitool.type === "inpaint" || aitool.type === "region_edit";
          const isStyleTransfer = aitool.type === "style_transfer";

          return (
            <div key={aitool.type} className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                  <Icon className="h-4 w-4 text-violet-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-300">{t(aitool.labelKey)}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{t(aitool.descKey)}</p>
                </div>
              </div>

              {hasPrompt && (
                <textarea
                  value={prompts[aitool.type] ?? ""}
                  onChange={(e) => setToolPrompt(aitool.type, e.target.value)}
                  placeholder={t("ai.promptPlaceholder")}
                  rows={2}
                  className="mt-2 w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder-zinc-500 outline-none focus:border-violet-500"
                />
              )}

              {isStyleTransfer && (
                <div className="mt-2">
                  <input
                    ref={styleInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStyleFile}
                    className="hidden"
                  />
                  {styleRef ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={`data:image/png;base64,${styleRef.b64}`}
                        alt="Style reference"
                        className="h-10 w-10 rounded border border-zinc-700 object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                        {styleRef.name}
                      </span>
                      <button
                        onClick={() => setStyleRef(null)}
                        title={t("ai.styleRefRemove")}
                        className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => styleInputRef.current?.click()}
                      className="w-full rounded border border-dashed border-zinc-700 px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:border-violet-500 hover:text-zinc-300"
                    >
                      {t("ai.styleRefPick")}
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => onApply(aitool.type, buildParams(aitool.type))}
                disabled={loading || (isStyleTransfer && !styleRef)}
                className={cn(
                  "mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  loading || (isStyleTransfer && !styleRef)
                    ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                    : "bg-violet-600 text-white hover:bg-violet-500",
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("ai.processing")}
                  </>
                ) : (
                  <>
                    <Icon className="h-3.5 w-3.5" />
                    {t("ai.apply", { label: t(aitool.labelKey) })}
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
