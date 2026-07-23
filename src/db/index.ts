import { apiInvoke } from "../api/client";
import type { Generation } from "../shared/types";

export async function createProject(id: string, name: string, type_: string): Promise<void> {
  return apiInvoke("create_project", { id, name, projectType: type_ });
}

export async function saveGeneration(params: {
  id: string;
  projectId: string | null;
  model: string;
  endpoint: string;
  requestJson: string;
  responseJson?: string | null;
  status: string;
  mediaPath: string | null;
  mediaType: string | null;
  parentId: string | null;
  costRub: number | null;
  generationId: string | null;
}): Promise<void> {
  return apiInvoke("save_generation", {
    id: params.id,
    projectId: params.projectId,
    model: params.model,
    endpoint: params.endpoint,
    requestJson: params.requestJson,
    responseJson: params.responseJson ?? null,
    status: params.status,
    mediaPath: params.mediaPath,
    mediaType: params.mediaType,
    parentId: params.parentId,
    costRub: params.costRub,
    generationId: params.generationId,
  });
}

export async function getGenerations(projectId?: string): Promise<Generation[]> {
  return apiInvoke("get_generations", { projectId: projectId ?? null });
}

export async function getModelsCache(): Promise<unknown[]> {
  return apiInvoke("get_models_cache");
}

export async function saveModelsCache(modelsJson: string): Promise<void> {
  return apiInvoke("save_models_cache", { modelsJson });
}

export async function getSetting(key: string): Promise<string | null> {
  return apiInvoke("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return apiInvoke("set_setting", { key, value });
}
