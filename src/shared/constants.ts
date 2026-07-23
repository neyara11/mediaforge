export const API_BASE_URL = "https://routerai.ru/api/v1";

export const APP_NAME = "MediaForge";

export const DEFAULT_SETTINGS = {
  defaultImageModel: "",
  defaultTtsModel: "",
  defaultSttModel: "",
  defaultVideoModel: "",
  defaultTextModel: "",
  language: "ru" as const,
  monthlySpendingLimit: 5000,
};

export const MODALITY_LABELS: Record<string, string> = {
  image: "Изображения",
  tts: "Озвучка текста",
  stt: "Распознавание речи",
  video: "Видео",
  text: "Текст",
};

export const NAV_ITEMS = [
  { path: "/image-studio", label: "imageStudio", icon: "Image" },
  { path: "/speech-lab", label: "speechLab", icon: "Mic" },
  { path: "/video-studio", label: "videoStudio", icon: "Video" },
  { path: "/music-studio", label: "musicStudio", icon: "Music" },
  { path: "/settings", label: "settings", icon: "Settings" },
] as const;
