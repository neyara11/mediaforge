import { apiInvoke } from "../client";

export async function saveAudioFile(base64Data: string, format: string): Promise<string> {
  return apiInvoke<string>("save_audio_file", { base64Data, format });
}

export async function exportMediaFile(srcPath: string, destPath: string): Promise<void> {
  return apiInvoke<void>("export_media_file", { srcPath, destPath });
}

export async function migrateAudioToDisk(): Promise<{ migrated: number; skipped: number; failed: number }> {
  const raw = await apiInvoke<string>("migrate_audio_to_disk");
  return JSON.parse(raw);
}
