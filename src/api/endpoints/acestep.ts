import { apiInvoke } from "../client";

export type AceStepTaskType = "text2music" | "cover" | "repaint" | "extract" | "complete";

export interface AceStepGenerateParams {
  prompt: string;
  lyrics: string;
  taskType: AceStepTaskType;
  model?: string;
  audioFormat?: "mp3" | "wav";
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  audioDuration?: number;
  vocalLanguage?: string;
  batchSize?: number;
  inferenceSteps?: number;
  seed?: number;
  useRandomSeed?: boolean;
  srcAudioPath?: string;
  referenceAudioPath?: string;
  repaintingStart?: number;
  repaintingEnd?: number;
  audioCoverStrength?: number;
  instruction?: string;
}

export interface AceStepMetas {
  bpm?: number;
  duration?: number;
  genres?: string;
  keyscale?: string;
  timesignature?: string;
}

export interface AceStepParsedFile {
  file: string;
  lyrics?: string;
  metas?: AceStepMetas;
  seed_value?: string;
  status?: number;
}

export interface AceStepPollItem {
  task_id: string;
  status: 0 | 1 | 2;
  files: AceStepParsedFile[];
  error?: string;
}

export interface AceStepModel {
  name: string;
  is_default: boolean;
}

export async function aceStepHealth(): Promise<boolean> {
  try {
    return await apiInvoke<boolean>("acestep_health");
  } catch {
    return false;
  }
}

export async function aceStepModels(): Promise<{
  models: AceStepModel[];
  default_model: string;
}> {
  const raw = await apiInvoke<string>("acestep_models");
  return JSON.parse(raw);
}

export async function aceStepGenerate(
  params: AceStepGenerateParams
): Promise<{ taskId: string; queuePosition?: number }> {
  const raw = await apiInvoke<string>("acestep_generate", {
    prompt: params.prompt,
    lyrics: params.lyrics,
    taskType: params.taskType,
    model: params.model ?? null,
    audioFormat: params.audioFormat ?? null,
    bpm: params.bpm ?? null,
    keyScale: params.keyScale ?? null,
    timeSignature: params.timeSignature ?? null,
    audioDuration: params.audioDuration ?? null,
    vocalLanguage: params.vocalLanguage ?? null,
    batchSize: params.batchSize ?? null,
    inferenceSteps: params.inferenceSteps ?? null,
    seed: params.seed ?? null,
    useRandomSeed: params.useRandomSeed ?? null,
    srcAudioPath: params.srcAudioPath ?? null,
    referenceAudioPath: params.referenceAudioPath ?? null,
    repaintingStart: params.repaintingStart ?? null,
    repaintingEnd: params.repaintingEnd ?? null,
    audioCoverStrength: params.audioCoverStrength ?? null,
    instruction: params.instruction ?? null,
  });
  const parsed = JSON.parse(raw);
  return {
    taskId: parsed.task_id,
    queuePosition: parsed.queue_position ?? undefined,
  };
}

export async function aceStepPoll(
  taskIds: string[]
): Promise<AceStepPollItem[]> {
  const raw = await apiInvoke<string>("acestep_poll", { taskIds });
  return JSON.parse(raw);
}

export async function aceStepDownloadAudio(
  file: string
): Promise<{ audio_base64: string; audio_format: string }> {
  const raw = await apiInvoke<string>("acestep_download_audio", { file });
  return JSON.parse(raw);
}

export async function aceStepStageAudio(
  base64: string,
  format: string
): Promise<string> {
  return apiInvoke<string>("acestep_stage_audio", {
    base64Data: base64,
    format,
  });
}
