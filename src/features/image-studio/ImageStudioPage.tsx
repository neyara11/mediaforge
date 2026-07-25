import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Image, Download, SlidersHorizontal, Upload, X, History, Trash2, Pencil } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "react-router-dom";
import { generateImage } from "../../api/endpoints/images";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, setSetting, getGenerations, deleteGeneration } from "../../db";

interface ImageResult {
  id: string;
  b64: string;
  model: string;
  genId?: string;
}

interface ReferenceImage {
  data: string;
  previewUrl: string;
  fileName: string;
}

function fileToBase64(file: File): Promise<ReferenceImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve({
        data: result.split(",")[1] ?? "",
        previewUrl: result,
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function ImageStudioPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImageResult[]>([]);
  const [selected, setSelected] = useState<ImageResult | null>(null);
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
  const [historyImages, setHistoryImages] = useState<ImageResult[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { defaultModel, setDefaultModel, availableModels } = useDefaultModel("image");

  const modelCaps = useMemo(() => {
    const m = defaultModel.toLowerCase();
    const isDalle = m.includes("dall-e") || m.includes("gpt-image");
    const isSeed = m.includes("seed") || m.includes("seedream");
    return {
      supportsQuality: isDalle,
      maxN: isDalle ? 4 : 1,
      sizeOptions: isSeed
        ? ["1920x1920", "2048x2048", "2304x1728", "1728x2304"]
        : ["1024x1024", "1792x1024", "1024x1792"],
      defaultSize: isSeed ? "1920x1920" : "1024x1024",
    };
  }, [defaultModel]);

  const imageN = modelCaps.maxN >= 4 ? 4 : 1;

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const gens = await getGenerations(undefined, "/v1/images");
        console.log(`Loaded ${gens.length} generations from DB`);
        const imageGens = gens.filter(
          (g) => g.endpoint === "/v1/images",
        );
        console.log(`Image generations (any status): ${imageGens.length}`, imageGens.map(g => ({ id: g.id, status: g.status, hasResponse: !!g.responseJson })));
        const completed = imageGens.filter(g => g.status === "completed");
        console.log(`Completed image generations: ${completed.length}`);
        // Only show completed in history
        const historyFromDb = completed;
        const images: ImageResult[] = [];
        for (const g of historyFromDb) {
          if (!g.responseJson) {
            console.log("Skipping gen (no responseJson):", g.id);
            continue;
          }
          try {
            const parsed = JSON.parse(g.responseJson);
            const data: { b64_json?: string }[] = parsed?.data ?? [];
            console.log(`Gen ${g.id}: ${data.length} images in responseJson`);
            for (const d of data) {
              if (d.b64_json) {
                images.push({
                  id: `${g.id}_${images.length}`,
                  b64: d.b64_json,
                  model: g.model,
                });
              }
            }
          } catch {
            /* skip malformed JSON */
          }
        }
        setHistoryImages(images);
        console.log(`Loaded ${images.length} image generations from DB`);
      } catch (e) {
        console.error("Failed to load image history:", e);
      }
    };
    loadHistory();
  }, []);

  const handleModelChange = (newModel: string) => {
    setDefaultModel(newModel);
    setSetting("default_image_model", newModel).catch(() => {});
  };

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ref = await fileToBase64(file);
      setReferenceImage(ref);
    } catch {
      setError("Failed to read reference image");
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleRemoveReference = useCallback(() => {
    setReferenceImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const inputRefs = referenceImage
        ? [{
            type: "image_url" as const,
            image_url: { url: `data:image/png;base64,${referenceImage.data}` },
          }]
        : undefined;

      const result = await generateImage({
        prompt: prompt.trim(),
        model: defaultModel,
        n: imageN,
        size,
        quality,
        input_references: inputRefs,
      });
      const parsed = JSON.parse(result);
      const genId = generateId();
      const images: ImageResult[] = (parsed?.data ?? []).map(
        (d: { b64_json?: string }, _i: number) => ({
          id: generateId(),
          b64: d.b64_json ?? "",
          model: defaultModel,
          genId,
        }),
      );
      setResults(images);
      setSelected(images[0] ?? null);
      setHistoryImages((prev) => [...images, ...prev]);

      try {
        await saveGeneration({
          id: genId,
          projectId: null,
          model: defaultModel,
          endpoint: "/v1/images",
          requestJson: JSON.stringify({ prompt, model: defaultModel, size, quality }),
          responseJson: result,
          status: "completed",
          mediaPath: null,
          mediaType: "image/png",
          parentId: null,
          costRub: parsed?.usage?.cost ?? null,
          generationId: parsed?.generation_id ?? null,
        });
        console.log("Image saved to DB:", genId);
      } catch (e) {
        console.error("saveGeneration failed:", e);
        setError(`Ошибка сохранения: ${e}`);
      }
    } catch (e) {
      setError(String(e));
      console.error("Generation failed:", e);
    }
    setLoading(false);
  };

  const handleDownload = async (img: ImageResult) => {
    try {
      const defaultName = `mediaforge-${img.id.slice(0, 8)}.png`;
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (filePath) {
        await invoke("save_base64_file", { base64Data: img.b64, filePath });
      }
    } catch (e) {
      console.error("Download failed:", e);
    }
  };

  const handleDeleteResult = async (img: ImageResult) => {
    const baseId = img.id.includes("_") ? img.id.split("_")[0] : img.id;
    try {
      await deleteGeneration(baseId);
      setResults((prev) => prev.filter((r) => r.id !== img.id));
      setHistoryImages((prev) => prev.filter((r) => r.id !== img.id));
      if (selected?.id === img.id) {
        setSelected(null);
      }
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const handleSelectFromHistory = (img: ImageResult) => {
    setSelected(img);
    if (!results.some((r) => r.id === img.id)) {
      setResults([img]);
    }
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

          {referenceImage && (
            <div className="mt-3 flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-700">
                <img
                  src={referenceImage.previewUrl}
                  alt="Reference"
                  className="h-full w-full object-cover"
                />
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                {referenceImage.fileName}
              </span>
              <button
                onClick={handleRemoveReference}
                className="rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                title="Remove reference image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={defaultModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              {modelCaps.sizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {modelCaps.supportsQuality && (
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
              >
                <option value="auto">Auto</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            )}
            <span className="text-xs text-zinc-600">
              {imageN > 1 ? `×${imageN}` : ""}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-violet-500 hover:text-zinc-300"
              title="Upload reference image"
            >
              <Upload className="mr-1 inline-block h-3.5 w-3.5" />
              Reference
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || loading}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Генерация..." : "Generate"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {selected && (
            <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <span className="text-xs text-zinc-500">{selected.model}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/image-studio/editor/${selected.genId || selected.id.split("_")[0]}`)}
                    className="rounded p-1 text-zinc-500 hover:text-violet-400"
                    title="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(selected)}
                    className="rounded p-1 text-zinc-500 hover:text-zinc-300"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteResult(selected)}
                    className="rounded p-1 text-zinc-500 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
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
                <div key={img.id} className="group relative">
                  <button
                    onClick={() => setSelected(img)}
                    className={cn(
                      "w-full overflow-hidden rounded-lg border transition-colors",
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
                  <button
                    onClick={() => handleDeleteResult(img)}
                    className="absolute right-1 top-1 rounded bg-zinc-900/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/image-studio/editor/${img.genId || img.id.split("_")[0]}`); }}
                    className="absolute right-7 top-1 rounded bg-zinc-900/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-violet-400 group-hover:opacity-100"
                    title="Редактировать"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && historyImages.length === 0 && !error && (
            <div className="flex h-64 items-center justify-center text-zinc-600">
              <div className="text-center">
                <Image className="mx-auto mb-3 h-8 w-8 opacity-50" />
                <p className="text-sm">Введите промпт и нажмите Generate</p>
              </div>
            </div>
          )}

          {historyImages.length > 0 && (
            <>
              <div className="mb-3 mt-6 flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-500">История</span>
                <div className="flex-1 border-t border-zinc-800" />
                <span className="text-xs text-zinc-600">{historyImages.length} изобр.</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {historyImages.map((img) => (
                  <div key={img.id} className="group relative">
                    <button
                      onClick={() => handleSelectFromHistory(img)}
                      className={cn(
                        "w-full overflow-hidden rounded-lg border transition-colors",
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
                    <button
                      onClick={() => handleDeleteResult(img)}
                      className="absolute right-1 top-1 rounded bg-zinc-900/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/image-studio/editor/${img.genId || img.id.split("_")[0]}`); }}
                      className="absolute right-7 top-1 rounded bg-zinc-900/80 p-1 text-zinc-500 opacity-0 transition-opacity hover:text-violet-400 group-hover:opacity-100"
                      title="Редактировать"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {historyImages.length === 0 && !loading && (
            <div className="mt-6 border-t border-zinc-800 pt-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-600" />
                <span className="text-xs text-zinc-600">
                  История пуста — сгенерируйте изображение
                </span>
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
