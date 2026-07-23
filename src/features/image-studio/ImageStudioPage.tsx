import { useState } from "react";
import { Image, Download, SlidersHorizontal } from "lucide-react";
import { generateImage } from "../../api/endpoints/images";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { saveGeneration } from "../../db";

interface ImageResult {
  id: string;
  b64: string;
  model: string;
}

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("openai/gpt-image-1");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("standard");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selected, setSelected] = useState<ImageResult | null>(null);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const result = await generateImage({
        prompt: prompt.trim(),
        model,
        n: 4,
        size,
        quality,
      });
      const parsed = JSON.parse(result);
      const images: ImageResult[] = (parsed?.data ?? []).map(
        (d: { b64_json?: string }, _i: number) => ({
          id: generateId(),
          b64: d.b64_json ?? "",
          model,
        }),
      );
      setResults(images);
      setSelected(images[0] ?? null);

      const genId = generateId();
      await saveGeneration({
        id: genId,
        projectId: null,
        model,
        endpoint: "/v1/images",
        requestJson: JSON.stringify({ prompt, model, size, quality }),
        status: "completed",
        mediaPath: null,
        mediaType: "image/png",
        parentId: null,
        costRub: parsed?.usage?.cost ?? null,
        generationId: parsed?.generation_id ?? null,
      });
    } catch (e) {
      console.error("Generation failed:", e);
    }
    setLoading(false);
  };

  const handleDownload = (img: ImageResult) => {
    const link = document.createElement("a");
    link.download = `mediaforge-${img.id}.png`;
    link.href = `data:image/png;base64,${img.b64}`;
    link.click();
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <div className="border-b border-zinc-800 p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Опишите изображение..."
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            </div>
            <button
              onClick={() => setShowPromptBuilder(!showPromptBuilder)}
              className={cn(
                "rounded-lg border p-2 text-zinc-400 transition-colors hover:border-violet-500",
                showPromptBuilder && "border-violet-500 text-violet-400",
              )}
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="openai/gpt-image-1">GPT Image 1</option>
              <option value="black-forest-labs/flux.2-pro">Flux 2 Pro</option>
              <option value="bytedance/seedream-4.5">Seedream 4.5</option>
            </select>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="1024x1024">1:1 (1024)</option>
              <option value="1792x1024">16:9 (1792)</option>
              <option value="1024x1792">9:16 (1024)</option>
            </select>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              <option value="standard">Standard</option>
              <option value="hd">HD</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Генерация..." : "Generate"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {selected && (
            <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <span className="text-xs text-zinc-500">{selected.model}</span>
                <button
                  onClick={() => handleDownload(selected)}
                  className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-center p-4">
                <img
                  src={`data:image/png;base64,${selected.b64}`}
                  alt="Generated"
                  className="max-h-[50vh] rounded object-contain"
                />
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {results.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelected(img)}
                  className={cn(
                    "overflow-hidden rounded-lg border transition-colors",
                    selected?.id === img.id
                      ? "border-violet-500"
                      : "border-zinc-800 hover:border-zinc-600",
                  )}
                >
                  <img
                    src={`data:image/png;base64,${img.b64}`}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="flex h-64 items-center justify-center text-zinc-600">
              <div className="text-center">
                <Image className="mx-auto mb-3 h-8 w-8 opacity-50" />
                <p className="text-sm">Введите промпт и нажмите Generate</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPromptBuilder && (
        <div className="w-80 shrink-0">
          <PromptBuilder
            mode="image"
            onUsePrompt={(p) => {
              setPrompt(p);
              setShowPromptBuilder(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
