export type Modality = "text" | "image" | "audio" | "video";

export type GenerationType = "image" | "music" | "video" | "speech";

export type GenerationStatus = "pending" | "processing" | "completed" | "failed";

export interface Generation {
  id: string;
  projectId: string;
  model: string;
  endpoint: string;
  requestJson: string;
  responseJson: string | null;
  status: GenerationStatus;
  mediaPath: string | null;
  mediaType: string | null;
  thumbnailPath: string | null;
  parentId: string | null;
  costRub: number | null;
  generationId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  type: GenerationType;
  createdAt: string;
  updatedAt: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  inputModalities: Modality[];
  outputModalities: Modality[];
  pricing: ModelPricing | null;
  supportedParams: string[];
}

export interface ModelPricing {
  perImage?: number;
  perCharacter?: number;
  perSecond?: number;
  perVideo?: number;
  prompt?: number;
  completion?: number;
}

export interface UserSettings {
  defaultImageModel: string;
  defaultTtsModel: string;
  defaultSttModel: string;
  defaultVideoModel: string;
  defaultTextModel: string;
  language: "ru" | "en";
  monthlySpendingLimit: number;
}
