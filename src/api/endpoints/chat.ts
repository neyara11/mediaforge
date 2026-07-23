import { apiInvoke } from "../client";
import type { ChatCompletionParams, AudioGenerationResult } from "../types";

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  return apiInvoke("chat_completion", {
    messages: JSON.stringify(params.messages),
    model: params.model,
    modalities: params.modalities ?? null,
  });
}

export async function chatAudioGenerate(
  prompt: string,
  model: string
): Promise<AudioGenerationResult> {
  const raw = await apiInvoke<string>("chat_audio_generate", { prompt, model });
  const parsed = JSON.parse(raw);
  return {
    lyrics: parsed.lyrics || "",
    audio_base64: parsed.audio_base64 || "",
    audio_format: parsed.audio_format || "mp3",
  };
}
