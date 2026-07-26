import { apiInvoke } from "../client";
import type { ChatCompletionParams, AudioGenerationResult } from "../types";

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  return apiInvoke("chat_completion", {
    messages: JSON.stringify(params.messages),
    model: params.model,
    modalities: params.modalities ?? null,
  });
}

export interface AudioGenerateOptions {
  genre?: string;
  tempo?: string;
  style?: string;
  hasLyrics?: boolean;
}

export async function chatAudioGenerate(
  prompt: string,
  model: string,
  opts?: AudioGenerateOptions
): Promise<AudioGenerationResult> {
  const raw = await apiInvoke<string>("chat_audio_generate", {
    prompt,
    model,
    genre: opts?.genre ?? null,
    tempo: opts?.tempo ?? null,
    style: opts?.style ?? null,
    // Tauri v2 binds snake_case Rust params from camelCase JS keys.
    hasLyrics: opts?.hasLyrics ?? null,
  });
  const parsed = JSON.parse(raw);
  return {
    lyrics: parsed.lyrics || "",
    audio_base64: parsed.audio_base64 || "",
    audio_format: parsed.audio_format || "mp3",
    cost: parsed.cost ?? null,
  };
}
