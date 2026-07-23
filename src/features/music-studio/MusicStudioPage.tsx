import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Music, Play, Pause, Sparkles } from "lucide-react";
import { chatCompletion, chatAudioGenerate } from "../../api/endpoints/chat";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, setSetting } from "../../db";
import type { ChatMessage } from "../../api/types";

interface Track {
  id: string;
  name: string;
  genre: string;
  lyrics: string;
}

export default function MusicStudioPage() {
  const { i18n } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("pop");
  const [tempo, setTempo] = useState("120");
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioModel = useDefaultModel("audio");
  const textModel = useDefaultModel("text");

  const isRu = i18n.language === "ru";

  const handleTextModelChange = (newModel: string) => {
    textModel.setDefaultModel(newModel);
    setSetting("default_text_model", newModel).catch(() => {});
  };

  const handleAudioModelChange = (newModel: string) => {
    audioModel.setDefaultModel(newModel);
    setSetting("default_audio_model", newModel).catch(() => {});
  };

  const handleGenerateLyrics = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const lang = isRu ? "Russian" : "English";
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `You are a songwriter. Create song lyrics in ${lang} based on the user's theme.
Write the lyrics in the user's language.
Structure: [Intro], [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus], [Outro].
Return ONLY the lyrics with structure tags, no explanations, no markdown.
Genre: ${genre}, Tempo: ${tempo}`,
        },
        { role: "user", content: prompt },
      ];
      const result = await chatCompletion({
        messages,
        model: textModel.defaultModel,
        modalities: ["text"],
      });
      const parsed = JSON.parse(result);
      const text = parsed?.choices?.[0]?.message?.content || parsed?.content || result;
      setLyrics(text);
    } catch (e) {
      setError(String(e));
      console.error("Generate lyrics failed:", e);
    }
    setLoading(false);
  };

  const handleGenerateMusic = async () => {
    setLoading(true);
    setError(null);
    try {
      const trackPrompt = lyrics || prompt;
      const songLyrics = await chatAudioGenerate(trackPrompt, audioModel.defaultModel);

      const trackId = generateId();
      const newTrack: Track = {
        id: trackId,
        name: `Track ${tracks.length + 1} — ${genre}`,
        genre,
        lyrics: songLyrics,
      };
      setTracks((prev) => [...prev, newTrack]);
      setCurrentTrack(newTrack);
      setLyrics(songLyrics);

      await saveGeneration({
        id: trackId,
        projectId: null,
        model: audioModel.defaultModel,
        endpoint: "/v1/chat/completions",
        requestJson: JSON.stringify({ prompt: trackPrompt, genre, tempo, model: audioModel.defaultModel }),
        status: "completed",
        mediaPath: null,
        mediaType: "text/lyrics",
        parentId: null,
        costRub: null,
        generationId: null,
      });
    } catch (e) {
      setError(String(e));
      console.error("Music generation failed:", e);
    }
    setLoading(false);
  };

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        <div className="border-b border-zinc-800 p-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={isRu ? "Опишите желаемую песню..." : "Describe the song you want..."}
                rows={2}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
              />
            </div>
            <button
              onClick={() => setShowPromptBuilder(!showPromptBuilder)}
              className={cn(
                "rounded-lg border p-2 text-zinc-400 transition-colors hover:border-violet-500",
                showPromptBuilder && "border-violet-500 text-violet-400",
              )}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{isRu ? "Текст:" : "Text:"}</span>
            <select
              value={textModel.defaultModel}
              onChange={(e) => handleTextModelChange(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
            >
              {textModel.availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className="ml-3">{isRu ? "Аудио:" : "Audio:"}</span>
            <select
              value={audioModel.defaultModel}
              onChange={(e) => handleAudioModelChange(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
            >
              {audioModel.availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
            >
              <option value="pop">Pop</option>
              <option value="rock">Rock</option>
              <option value="hiphop">Hip Hop</option>
              <option value="electronic">Electronic</option>
              <option value="jazz">Jazz</option>
              <option value="classical">Classical</option>
            </select>
            <input
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              placeholder="BPM"
              className="w-16 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
            />
            <button
              onClick={handleGenerateLyrics}
              disabled={!prompt.trim() || loading}
              className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              {isRu ? "Текст песни" : "Lyrics"}
            </button>
            <button
              onClick={handleGenerateMusic}
              disabled={(!lyrics.trim() && !prompt.trim()) || loading}
              className="ml-auto rounded bg-violet-600 px-4 py-1 text-xs font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (isRu ? "Генерация..." : "Generating...") : (isRu ? "Создать музыку" : "Generate Music")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {lyrics && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="mb-3 text-sm font-medium text-zinc-400">
                  {isRu ? "Текст песни" : "Lyrics"}
                </h3>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {lyrics}
                </pre>
              </div>
            )}
            {!lyrics && (
              <div className="flex h-full items-center justify-center text-zinc-600">
                <div className="text-center">
                  <Music className="mx-auto mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm">
                    {isRu
                      ? "Опишите песню и нажмите «Текст песни» или «Создать музыку»"
                      : "Describe a song and click Lyrics or Generate Music"}
                  </p>
                </div>
              </div>
            )}
          </div>

          {tracks.length > 0 && (
            <div className="w-64 border-l border-zinc-800 p-4">
              <h3 className="mb-3 text-sm font-medium text-zinc-400">Playlist</h3>
              <div className="space-y-2">
                {tracks.map((track) => (
                  <button
                    key={track.id}
                    onClick={() => setCurrentTrack(track)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition-colors",
                      currentTrack?.id === track.id
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-400 hover:bg-zinc-800/50",
                    )}
                  >
                    {currentTrack?.id === track.id ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    {track.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showPromptBuilder && (
        <div className="w-80 shrink-0">
          <PromptBuilder
            mode="lyrics"
            onUsePrompt={(p) => {
              setPrompt(p);
              setShowPromptBuilder(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
