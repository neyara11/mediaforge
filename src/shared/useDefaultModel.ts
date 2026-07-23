import { useState, useEffect } from "react";
import { getSetting } from "../db";
import { fetchModels } from "../api/endpoints/models";

interface ModelOption {
  id: string;
  name: string;
}

export function useDefaultModel(modality: "image" | "tts" | "stt" | "video" | "audio" | "text") {
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [saved, result] = await Promise.all([
          getSetting(`default_${modality}_model`).catch(() => null),
          fetchModels(),
        ]);
        const parsed = JSON.parse(result);
        const allModels: ModelOption[] = (parsed?.data ?? []).map((m: { id: string; name?: string }) => ({
          id: m.id,
          name: m.name ?? m.id,
        }));
        setModels(allModels);
        if (saved) {
          setDefaultModel(saved);
        } else {
          const fallbacks: Record<string, string> = {
            image: "openai/gpt-image-1",
            tts: "x-ai/grok-voice-tts-1.0",
            stt: "openai/whisper-large-v3",
            video: "bytedance/seedance-2.0",
            audio: "google/lyria-3-clip",
            text: "openai/gpt-4o",
          };
          setDefaultModel(fallbacks[modality] ?? "");
        }
      } catch {
        // use fallbacks
        const fallbacks: Record<string, string> = {
          image: "openai/gpt-image-1",
          tts: "x-ai/grok-voice-tts-1.0",
          stt: "openai/whisper-large-v3",
          video: "bytedance/seedance-2.0",
          audio: "google/lyria-3-clip",
          text: "openai/gpt-4o",
        };
        setDefaultModel(fallbacks[modality] ?? "");
      }
      setLoading(false);
    };
    load();
  }, [modality]);

  return { defaultModel, setDefaultModel, models, loading };
}
