import { apiInvoke } from "../client";
import type { ImageGenerationParams } from "../types";

export async function generateImage(params: ImageGenerationParams): Promise<string> {
  return apiInvoke("generate_image", {
    prompt: params.prompt,
    model: params.model,
    n: params.n ?? 1,
    size: params.size ?? "1024x1024",
    quality: params.quality ?? "standard",
  });
}

export async function editImage(imageId: string, prompt: string, model: string): Promise<string> {
  return apiInvoke("edit_image", { imageId, prompt, model });
}
