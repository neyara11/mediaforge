import { apiInvoke } from "../client";
import type { VideoGenerationParams } from "../types";

export async function createVideo(params: VideoGenerationParams): Promise<string> {
  return apiInvoke("create_video", {
    prompt: params.prompt,
    model: params.model,
    duration: params.duration ?? null,
    resolution: params.resolution ?? null,
  });
}

export async function pollVideo(videoId: string): Promise<string> {
  return apiInvoke("poll_video", { videoId });
}

export async function downloadVideo(videoId: string): Promise<string> {
  return apiInvoke("download_video", { videoId });
}
