import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, Star } from "lucide-react";
import { fetchModels } from "../../api/endpoints/models";
import { getModelsCache, saveModelsCache } from "../../db";
import { setSetting } from "../../db";
import { cn } from "../../shared/utils";

interface RouterAIModel {
  id: string;
  name?: string;
  provider?: string;
  output_modalities?: string[];
  pricing?: {
    per_image?: number;
    per_character?: number;
    per_second?: number;
    per_video?: number;
    prompt?: number;
    completion?: number;
  };
  supported_params?: string[];
}

type SortField = "price" | "name";
type SortDir = "asc" | "desc";
type ModalityFilter = "all" | "image" | "tts" | "stt" | "video" | "audio" | "text";

function safeJsonParse<T>(v: unknown, fallback: T): T {
  if (typeof v !== "string") return (v as T) ?? fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

function getModality(model: RouterAIModel): ModalityFilter {
  const outputs = model.output_modalities ?? [];
  if (outputs.includes("image")) return "image";
  if (outputs.includes("audio") && model.id.includes("tts")) return "tts";
  if (model.id.includes("whisper") || outputs.includes("text") && model.id.includes("stt")) return "stt";
  if (outputs.includes("video")) return "video";
  if (outputs.includes("audio")) return "audio";
  return "text";
}

function getModelPrice(model: RouterAIModel): number {
  const p = model.pricing;
  if (!p) return 0;
  return p.per_image ?? p.per_character ?? p.per_second ?? p.per_video ?? p.prompt ?? 0;
}

export default function ModelCatalog() {
  const { t } = useTranslation("models");
  const [models, setModels] = useState<RouterAIModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState<ModalityFilter>("all");
  const [sortField, setSortField] = useState<SortField>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [defaults, setDefaults] = useState<Record<string, string>>({});

  const loadModels = async () => {
    setLoading(true);
    try {
      const result = await fetchModels();
      const parsed = JSON.parse(result);
      const data = (parsed?.data ?? []).slice(0, 200);
      setModels(data);
      saveModelsCache(JSON.stringify(data)).catch(() => {});
    } catch {
      try {
        const cached = await getModelsCache();
        if (cached && cached.length > 0) {
          const parsed = (cached as unknown[]).map((m: unknown) => {
            const r = m as Record<string, unknown>;
            return {
              id: String(r.id ?? ""),
              name: r.name,
              provider: r.provider,
              output_modalities: safeJsonParse(r.output_modalities, []),
              supported_params: safeJsonParse(r.supported_params, []),
              pricing: safeJsonParse(r.pricing_json, null),
            };
          });
          setModels(parsed as unknown as RouterAIModel[]);
        }
      } catch {
        // No cached models available
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadModels();
  }, []);

  const filteredModels = useMemo(() => {
    let result = models;
    if (modalityFilter !== "all") {
      result = result.filter((m) => getModality(m) === modalityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name ?? "").toLowerCase().includes(q) ||
          (m.provider ?? "").toLowerCase().includes(q),
      );
    }
    result = [...result].sort((a, b) => {
      const multiplier = sortDir === "asc" ? 1 : -1;
      if (sortField === "price") {
        return (getModelPrice(a) - getModelPrice(b)) * multiplier;
      }
      return a.id.localeCompare(b.id) * multiplier;
    });
    return result;
  }, [models, modalityFilter, search, sortField, sortDir]);

  const handleSetDefault = async (modality: string, modelId: string) => {
    setDefaults((prev) => ({ ...prev, [modality]: modelId }));
    await setSetting(`default_${modality}_model`, modelId);
  };

  const modalities: { key: ModalityFilter; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "image", label: t("defaultImage") },
    { key: "tts", label: t("defaultTts") },
    { key: "stt", label: t("defaultStt") },
    { key: "video", label: t("defaultVideo") },
    { key: "text", label: t("defaultText") },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <button
          onClick={loadModels}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-700"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {t("refresh")}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {modalities.map((m) => (
          <button
            key={m.key}
            onClick={() => setModalityFilter(m.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs transition-colors",
              modalityFilter === m.key
                ? "bg-violet-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
        </div>
        <select
          value={`${sortField}-${sortDir}`}
          onChange={(e) => {
            const [field, dir] = e.target.value.split("-") as [SortField, SortDir];
            setSortField(field);
            setSortDir(dir);
          }}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
        >
          <option value="price-asc">{t("sortPriceLow")}</option>
          <option value="price-desc">{t("sortPriceHigh")}</option>
          <option value="name-asc">{t("sortName")}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-zinc-900 text-left text-xs text-zinc-500">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">{t("model")}</th>
                <th className="px-3 py-2">{t("price")}</th>
                <th className="px-3 py-2">{t("params")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredModels.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-zinc-600">
                    {loading ? t("loading") : t("noModels")}
                  </td>
                </tr>
              )}
              {filteredModels.map((model) => (
                <tr key={model.id} className="transition-colors hover:bg-zinc-800/50">
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleSetDefault(getModality(model), model.id)}
                      className={cn(
                        "transition-colors",
                        defaults[getModality(model)] === model.id
                          ? "text-amber-400"
                          : "text-zinc-700 hover:text-zinc-400",
                      )}
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-200">{model.name ?? model.id}</div>
                    <div className="text-xs text-zinc-500">{model.provider}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-emerald-400">
                    {getModelPrice(model) > 0 ? `${getModelPrice(model).toFixed(2)} ₽` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(model.supported_params ?? []).slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
