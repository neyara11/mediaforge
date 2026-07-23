import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, Plus, X, Star } from "lucide-react";
import { fetchModels } from "../../api/endpoints/models";
import { cn } from "../../shared/utils";
import {
  MODALITY_KEYS,
  MODALITY_LABELS,
  FALLBACKS,
  getAvailableModels,
  saveAvailableModels,
  type ModalityKey,
} from "../../shared/useDefaultModel";

interface RouterAIModel {
  id: string;
  name?: string;
  provider?: string;
  output_modalities?: string[];
  pricing?: { per_image?: number; per_character?: number; per_second?: number; per_video?: number; prompt?: number; completion?: number };
  supported_params?: string[];
}

type SortField = "price" | "name";
type SortDir = "asc" | "desc";
type ModalityFilter = "all" | ModalityKey;

function getModality(model: RouterAIModel): ModalityKey {
  const outputs = (model.output_modalities ?? []).map((s) => String(s).toLowerCase());
  const id = (model.id ?? "").toLowerCase();
  const name = (model.name ?? "").toLowerCase();

  if (outputs.includes("image") || id.includes("image") || id.includes("flux") || id.includes("seedream") || id.includes("dall-e")) return "image";
  if (outputs.includes("video") || id.includes("video") || id.includes("seedance") || id.includes("sora") || id.includes("veo")) return "video";
  if (id.includes("lyria") || id.includes("music") || name.includes("music") || name.includes("lyria")) return "audio";
  if (id.includes("whisper") || id.includes("stt") || name.includes("whisper") || name.includes("transcrib")) return "stt";
  if (id.includes("tts") || name.includes("tts") || (outputs.includes("audio") && (id.includes("voice") || name.includes("voice") || name.includes("speech")))) return "tts";
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
  const [availableModels, setAvailableModels] = useState<Record<ModalityKey, string[]>>(
    {} as Record<ModalityKey, string[]>,
  );
  const [newModelInputs, setNewModelInputs] = useState<Record<ModalityKey, string>>(
    {} as Record<ModalityKey, string>,
  );

  const loadModels = async () => {
    setLoading(true);
    try {
      const result = await fetchModels();
      const parsed = JSON.parse(result);
      const data = parsed?.data ?? [];
      console.debug("[ModelCatalog] loaded", data.length, "models, sample ids:", data.slice(0, 5).map((m: RouterAIModel) => m.id));
      setModels(data);
    } catch {
      // no-op
    }
    setLoading(false);
  };

  const loadAvailable = async () => {
    const rec: Record<string, string[]> = {};
    for (const key of MODALITY_KEYS) {
      rec[key] = await getAvailableModels(key);
    }
    setAvailableModels(rec as Record<ModalityKey, string[]>);
  };

  useEffect(() => { loadModels(); loadAvailable(); }, []);

  const toggleModelAvailability = async (modality: ModalityKey, modelId: string) => {
    const current = availableModels[modality] ?? [];
    let next: string[];
    if (current.includes(modelId)) {
      next = current.filter((id) => id !== modelId);
    } else {
      next = [...current, modelId];
    }
    if (next.length === 0) next = [FALLBACKS[modality]];
    await saveAvailableModels(modality, next);
    setAvailableModels((prev) => ({ ...prev, [modality]: next }));
  };

  const addManualModel = async (modality: ModalityKey) => {
    const input = (newModelInputs[modality] ?? "").trim();
    if (!input) return;
    const current = availableModels[modality] ?? [];
    if (!current.includes(input)) {
      const next = [...current, input];
      await saveAvailableModels(modality, next);
      setAvailableModels((prev) => ({ ...prev, [modality]: next }));
    }
    setNewModelInputs((prev) => ({ ...prev, [modality]: "" }));
  };

  const allModelNames: Record<string, string> = {};
  for (const m of models) allModelNames[m.id] = m.name ?? m.id;

  const filteredModels = useMemo(() => {
    let result = models;
    if (modalityFilter !== "all") {
      result = result.filter((m) => getModality(m) === modalityFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) => m.id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q) || (m.provider ?? "").toLowerCase().includes(q),
      );
    }
    result = [...result].sort((a, b) => {
      const multiplier = sortDir === "asc" ? 1 : -1;
      if (sortField === "price") return (getModelPrice(a) - getModelPrice(b)) * multiplier;
      return a.id.localeCompare(b.id) * multiplier;
    });
    return result;
  }, [models, modalityFilter, search, sortField, sortDir]);

  const modalities: { key: ModalityFilter; label: string }[] = [
    { key: "all", label: t("all") },
    ...MODALITY_KEYS.map((k) => ({ key: k, label: MODALITY_LABELS[k] })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-200">Доступные модели</h3>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {MODALITY_KEYS.map((mod) => {
            const ids = availableModels[mod] ?? [];
            return (
              <div key={mod} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="mb-2 text-xs font-medium text-zinc-400">{MODALITY_LABELS[mod]}</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {ids.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                    >
                      {allModelNames[id] ?? id}
                      <button
                        onClick={() => toggleModelAvailability(mod, id)}
                        className="ml-0.5 text-zinc-500 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={newModelInputs[mod] ?? ""}
                    onChange={(e) => setNewModelInputs((prev) => ({ ...prev, [mod]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addManualModel(mod); }}
                    placeholder="model-id или нажмите + в таблице"
                    className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white placeholder-zinc-600 outline-none focus:border-violet-500"
                  />
                  <button
                    onClick={() => addManualModel(mod)}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-700"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-200">{t("title")}</h3>
          <button
            onClick={loadModels}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-700"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("refresh")}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {modalities.map((m) => (
            <button
              key={m.key}
              onClick={() => setModalityFilter(m.key)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs transition-colors",
                modalityFilter === m.key ? "bg-violet-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-3">
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
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="price-asc">{t("sortPriceLow")}</option>
            <option value="price-desc">{t("sortPriceHigh")}</option>
            <option value="name-asc">{t("sortName")}</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-900 text-left text-xs text-zinc-500">
                <tr>
                  <th className="w-8 px-3 py-2"></th>
                  <th className="px-3 py-2">{t("model")}</th>
                  <th className="px-3 py-2">{t("price")}</th>
                  <th className="px-3 py-2">{t("params")}</th>
                  <th className="w-8 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredModels.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-zinc-600">
                      {loading ? t("loading") : t("noModels")}
                    </td>
                  </tr>
                )}
                {filteredModels.map((model) => {
                  const mod = getModality(model);
                  const isAvailable = (availableModels[mod] ?? []).includes(model.id);
                  return (
                    <tr key={model.id} className="group transition-colors hover:bg-zinc-800/50">
                      <td className="px-3 py-2">
                        {isAvailable && <Star className="h-3.5 w-3.5 text-amber-400" />}
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
                            <span key={p} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{p}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleModelAvailability(mod, model.id)}
                          className={cn(
                            "rounded p-1 text-xs transition-colors",
                            isAvailable
                              ? "text-amber-400 hover:text-red-400"
                              : "text-zinc-700 hover:text-violet-400",
                          )}
                          title={isAvailable ? "Убрать" : "Добавить"}
                        >
                          {isAvailable ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
