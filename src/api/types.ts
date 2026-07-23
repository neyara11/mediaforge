export interface ImageGenerationParams {
  prompt: string;
  model: string;
  n?: number;
  size?: string;
  quality?: string;
}

export interface SpeechParams {
  text: string;
  model: string;
  voice: string;
  format?: "mp3" | "pcm";
  speed?: number;
}

export interface TranscriptionParams {
  filePath: string;
  model: string;
  language?: string;
}

export interface VideoGenerationParams {
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
}

export interface ChatCompletionParams {
  messages: ChatMessage[];
  model: string;
  modalities?: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

export interface ChatContentPart {
  type: "text" | "image_url" | "input_audio";
  text?: string;
  image_url?: { url: string };
  input_audio?: { data: string; format: string };
}
