import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../db";
import { fetchModels } from "../api/endpoints/models";

const MODALITY_KEYS = ["image", "video", "audio", "stt", "tts", "text"] as const;
export type ModalityKey = (typeof MODALITY_KEYS)[number];

const MODALITY_LABELS: Record<ModalityKey, string> = {
  image: "Изображения",
  video: "Видео",
  audio: "Аудио",
  stt: "Распознавание",
  tts: "Озвучка",
  text: "Текст",
};

const FALLBACKS: Record<ModalityKey, string> = {
  image: "openai/gpt-image-1",
  video: "bytedance/seedance-2.0",
  audio: "google/lyria-3-clip",
  stt: "openai/whisper-large-v3",
  tts: "x-ai/grok-voice-tts-1.0",
  text: "openai/gpt-4o",
};

export interface ModelOption {
  id: string;
  name: string;
}

export function getAvailableModels(modality: ModalityKey): Promise<string[]> {
  return getSetting(`available_${modality}_models`).then((v) => {
    if (!v) return [FALLBACKS[modality]];
    try {
      const arr = JSON.parse(v);
      return Array.isArray(arr) && arr.length > 0 ? arr : [FALLBACKS[modality]];
    } catch {
      return [FALLBACKS[modality]];
    }
  });
}

export function saveAvailableModels(modality: ModalityKey, ids: string[]): Promise<void> {
  return setSetting(`available_${modality}_models`, JSON.stringify(ids));
}

export function useDefaultModel(modality: ModalityKey) {
  const [defaultModel, setDefaultModel] = useState(FALLBACKS[modality]);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [modelIds, setModelIds] = useState<string[]>([FALLBACKS[modality]]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [idsJson, result] = await Promise.all([
          getSetting(`available_${modality}_models`),
          fetchModels(),
        ]);

        let ids: string[] = [];
        if (idsJson) {
          try { ids = JSON.parse(idsJson); } catch { ids = [FALLBACKS[modality]]; }
        }
        if (ids.length === 0) ids = [FALLBACKS[modality]];

        const parsed = JSON.parse(result);
        const allModels: Record<string, string> = {};
        for (const m of (parsed?.data ?? [])) {
          allModels[m.id] = m.name ?? m.id;
        }

        const options: ModelOption[] = ids.map((id: string) => ({
          id,
          name: allModels[id] ?? id,
        }));

        setModelIds(ids);
        setAvailableModels(options);

        const savedDefault = await getSetting(`default_${modality}_model`);
        setDefaultModel(savedDefault && ids.includes(savedDefault) ? savedDefault : ids[0]);
      } catch {
        setAvailableModels([{ id: FALLBACKS[modality], name: FALLBACKS[modality] }]);
        setDefaultModel(FALLBACKS[modality]);
      }
      setLoading(false);
    };
    load();
  }, [modality]);

  const updateAvailable = async (ids: string[]) => {
    await saveAvailableModels(modality, ids);
    setModelIds(ids);
  };

  return { defaultModel, setDefaultModel, availableModels, modelIds, updateAvailable, loading };
}

export { MODALITY_KEYS, MODALITY_LABELS, FALLBACKS };
