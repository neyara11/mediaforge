import { useState, useRef } from "react";
import { Volume2, Upload } from "lucide-react";
import { textToSpeech } from "../../api/endpoints/speech";
import { cn, generateId } from "../../shared/utils";
import { saveGeneration } from "../../db";

type Tab = "tts" | "stt";

export default function SpeechLabPage() {
  const [tab, setTab] = useState<Tab>("tts");
  const [ttsText, setTtsText] = useState("");
  const [ttsModel, setTtsModel] = useState("x-ai/grok-voice-tts-1.0");
  const [ttsVoice, setTtsVoice] = useState("eve");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTts = async () => {
    if (!ttsText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const audioData = await textToSpeech({
        text: ttsText.trim(),
        model: ttsModel,
        voice: ttsVoice,
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
        model: ttsModel,
        endpoint: "/v1/audio/speech",
        requestJson: JSON.stringify({ text: ttsText, model: ttsModel, voice: ttsVoice }),
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
              value={ttsModel}
              onChange={(e) => setTtsModel(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="x-ai/grok-voice-tts-1.0">Grok Voice TTS</option>
              <option value="openai/gpt-4o-audio">GPT-4o Audio</option>
            </select>
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="eve">Eve</option>
              <option value="alloy">Alloy</option>
              <option value="nova">Nova</option>
              <option value="shimmer">Shimmer</option>
            </select>
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-8 text-center">
          <Upload className="mx-auto mb-4 h-10 w-10 text-zinc-600" />
          <p className="text-sm text-zinc-500">
            Перетащите аудиофайл сюда или нажмите для выбора
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Поддерживаются WAV, MP3, FLAC, OGG
          </p>
        </div>
      )}
    </div>
  );
}
