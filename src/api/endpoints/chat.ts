import { apiInvoke } from "../client";
import type { ChatCompletionParams } from "../types";

export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  return apiInvoke("chat_completion", {
    messages: JSON.stringify(params.messages),
    model: params.model,
    modalities: params.modalities ?? null,
  });
}
