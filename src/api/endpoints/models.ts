import { apiInvoke } from "../client";

export async function fetchModels(): Promise<string> {
  return apiInvoke("fetch_models");
}

export async function getModelInfo(modelId: string): Promise<string> {
  return apiInvoke("get_model_info", { modelId });
}
