import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Volume2, Upload, Mic, FileAudio } from "lucide-react";
import { textToSpeech, speechToText } from "../../api/endpoints/speech";
import { cn, generateId } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, setSetting } from "../../db";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Tab = "tts" | "stt";

const STT_LANGUAGES = [
  { value: "", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
];

const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "m4a"];

// Known voices per TTS model family. Key is a substring matched against model ID.
const VOICE_MAP: Record<string, string[]> = {
  openai: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
  grok: ["eve", "ara", "rex", "sal", "leo"],
  "elevenlabs": ["rachel", "domi", "bella", "antoni", "elli", "josh", "arnold", "adam", "sam"],
  minimax: ["male-qn-qingse", "female-qn-qingse", "male-qn-jingying", "presenter_male", "presenter_female"],
  qwen: ["loongjohn", "longanhuan_v3.6"],
};

function getVoicesForModel(modelId: string): string[] {
  const id = modelId.toLowerCase();
  for (const [key, voices] of Object.entries(VOICE_MAP)) {
    if (id.includes(key)) return voices;
  }
  return ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
}

function isVoiceSupported(_modelId: string): boolean {
  return true;
}

function fileNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || path;
}

function extFromPath(path: string): string {
  const name = fileNameFromPath(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export default function SpeechLabPage() {
  const [tab, setTab] = useState<Tab>("tts");

  // TTS state
  const [ttsText, setTtsText] = useState("");
  const [ttsVoice, setTtsVoice] = useState("eve");
  const [customVoice, setCustomVoice] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // STT state
  const [sttFilePath, setSttFilePath] = useState<string | null>(null);
  const [sttFileName, setSttFileName] = useState<string | null>(null);
  const [sttLanguage, setSttLanguage] = useState("");
  const [sttResult, setSttResult] = useState<string | null>(null);
  const [sttDuration, setSttDuration] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ttsModel = useDefaultModel("tts");
  const sttModel = useDefaultModel("stt");

  const voices = useMemo(() => getVoicesForModel(ttsModel.defaultModel), [ttsModel.defaultModel]);
  const supportsVoice = useMemo(() => isVoiceSupported(ttsModel.defaultModel), [ttsModel.defaultModel]);

  // --- TTS handlers ---

  const handleTtsModelChange = (newModel: string) => {
    ttsModel.setDefaultModel(newModel);
    setSetting("default_tts_model", newModel).catch(() => {});
    const newVoices = getVoicesForModel(newModel);
    if (newVoices.length > 0) {
      setTtsVoice(newVoices[0]);
      setCustomVoice("");
    } else {
      setTtsVoice("");
      setCustomVoice("");
    }
  };

  const effectiveVoice = customVoice || ttsVoice;

  const handleTts = async () => {
    if (!ttsText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const audioData = await textToSpeech({
        text: ttsText.trim(),
        model: ttsModel.defaultModel,
        voice: effectiveVoice || null,
        format: "mp3",
      });
      const blob = new Blob([new Uint8Array(audioData)], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);

      const genId = generateId();
      await saveGeneration({
        id: genId,
        projectId: null,
        model: ttsModel.defaultModel,
        endpoint: "/v1/audio/speech",
        requestJson: JSON.stringify({ text: ttsText, model: ttsModel.defaultModel, voice: effectiveVoice }),
        status: "completed",
        mediaPath: null,
        mediaType: "audio/mp3",
        parentId: null,
        costRub: null,
        generationId: null,
      });
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  // --- STT handlers ---

  const pickSttFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
      });
      if (selected) {
        const path = typeof selected === "string" ? selected : selected[0];
        setSttFilePath(path);
        setSttFileName(fileNameFromPath(path));
        setSttResult(null);
        setSttDuration(null);
        setError(null);
      }
    } catch {
      // user cancelled
    }
  }, []);

  const handleStt = async () => {
    if (!sttFilePath) return;
    setLoading(true);
    setError(null);
    try {
      const rawResponse = await speechToText({
        filePath: sttFilePath,
        model: sttModel.defaultModel,
        language: sttLanguage || undefined,
      });

      let parsed: { text?: string; duration?: number };
      try {
        parsed = JSON.parse(rawResponse);
      } catch {
        parsed = { text: rawResponse };
      }

      setSttResult(parsed.text || rawResponse);
      setSttDuration(parsed.duration ?? null);

      const genId = generateId();
      await saveGeneration({
        id: genId,
        projectId: null,
        model: sttModel.defaultModel,
        endpoint: "/v1/audio/transcriptions",
        requestJson: JSON.stringify({
          filePath: sttFilePath,
          model: sttModel.defaultModel,
          language: sttLanguage || null,
        }),
        status: "completed",
        mediaPath: sttFilePath,
        mediaType: `audio/${extFromPath(sttFilePath)}`,
        parentId: null,
        costRub: parsed.duration ? Math.ceil(parsed.duration / 60) * 6 : null,
        generationId: null,
      });
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  // Drag-and-drop via Tauri window event (gives native file paths)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const w = getCurrentWindow();
    w.onDragDropEvent((event) => {
      const payload = event.payload as { type: string; paths?: string[] };
      if (payload.type === "over") {
        setDragOver(true);
      } else if (payload.type === "leave") {
        setDragOver(false);
      } else if (payload.type === "drop") {
        setDragOver(false);
        const path = payload.paths?.[0];
        if (path) {
          const ext = extFromPath(path);
          if (AUDIO_EXTENSIONS.includes(ext)) {
            setSttFilePath(path);
            setSttFileName(fileNameFromPath(path));
            setSttResult(null);
            setSttDuration(null);
            setError(null);
          }
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Speech Lab</h1>

      <div className="mb-6 flex gap-1 rounded-lg bg-zinc-900 p-1">
        {(["tts", "stt"] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 rounded-md px-4 py-2 text-sm transition-colors",
              tab === key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {key === "tts" ? "Text to Speech" : "Speech to Text"}
          </button>
        ))}
      </div>

      {tab === "tts" && (
        <div className="space-y-4">
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="Введите текст для озвучки..."
            rows={4}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
          <div className="flex gap-3">
            <select
              value={ttsModel.defaultModel}
              onChange={(e) => handleTtsModelChange(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
            >
              {ttsModel.availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select
              value={supportsVoice ? ttsVoice : "__custom__"}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setTtsVoice("");
                } else {
                  setTtsVoice(e.target.value);
                  setCustomVoice("");
                }
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
              disabled={!supportsVoice && voices.length === 0}
            >
              {voices.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
              <option value="__custom__">Другой...</option>
            </select>
            {(!supportsVoice || ttsVoice === "__custom__" || voices.length === 0) && (
              <input
                value={customVoice}
                onChange={(e) => setCustomVoice(e.target.value)}
                placeholder={supportsVoice ? "ID голоса" : "Без голоса"}
                className="w-24 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            )}
            <button
              onClick={handleTts}
              disabled={!ttsText.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Volume2 className="h-4 w-4" />
              {loading ? "Генерация..." : "Generate"}
            </button>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          )}

          {audioUrl && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            </div>
          )}
        </div>
      )}

      {tab === "stt" && (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={pickSttFile}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragOver
                ? "border-violet-500 bg-violet-500/10"
                : sttFilePath
                  ? "border-zinc-600 bg-zinc-800/50"
                  : "border-zinc-700 bg-zinc-900 hover:border-zinc-600",
            )}
          >
            {sttFilePath ? (
              <div className="space-y-1">
                <FileAudio className="mx-auto h-10 w-10 text-violet-400" />
                <p className="text-sm text-white">{sttFileName}</p>
                <p className="text-xs text-zinc-500">
                  {extFromPath(sttFilePath).toUpperCase()} &middot; Нажмите для замены
                </p>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-4 h-10 w-10 text-zinc-600" />
                <p className="text-sm text-zinc-500">
                  Перетащите аудиофайл сюда или нажмите для выбора
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Поддерживаются WAV, MP3, FLAC, OGG, M4A
                </p>
              </>
            )}
          </div>

          {/* Model + language + transcribe button */}
          {sttFilePath && (
            <>
              <div className="flex gap-3">
                <select
                  value={sttModel.defaultModel}
                  onChange={(e) => {
                    sttModel.setDefaultModel(e.target.value);
                    setSetting("default_stt_model", e.target.value).catch(() => {});
                  }}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
                >
                  {sttModel.availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <select
                  value={sttLanguage}
                  onChange={(e) => setSttLanguage(e.target.value)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
                >
                  {STT_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleStt}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" />
                  {loading ? "Распознавание..." : "Transcribe"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
          )}

          {sttResult != null && (
            <div className="space-y-3">
              {sttDuration != null && (
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>Duration: {sttDuration.toFixed(1)}s</span>
                  <span>Cost: ~{Math.ceil(sttDuration / 60) * 6} ₽</span>
                </div>
              )}
              <textarea
                value={sttResult}
                readOnly
                rows={8}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
