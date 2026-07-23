import { apiInvoke } from "../client";
import type { ChatCompletionParams } from "../types";

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  return apiInvoke("chat_completion", {
    messages: JSON.stringify(params.messages),
    model: params.model,
    modalities: params.modalities ?? null,
  });
}

export async function chatAudioGenerate(prompt: string, model: string): Promise<string> {
  return apiInvoke("chat_audio_generate", { prompt, model });
}
