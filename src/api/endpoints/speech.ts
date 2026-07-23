import { apiInvoke } from "../client";
import type { SpeechParams, TranscriptionParams } from "../types";

export async function textToSpeech(params: SpeechParams): Promise<number[]> {
  return apiInvoke("text_to_speech", {
    text: params.text,
    model: params.model,
    voice: params.voice,
    format: params.format ?? "mp3",
    speed: params.speed ?? 1.0,
  });
}

export async function speechToText(params: TranscriptionParams): Promise<string> {
  return apiInvoke("speech_to_text", {
    filePath: params.filePath,
    model: params.model,
    language: params.language ?? null,
  });
}
