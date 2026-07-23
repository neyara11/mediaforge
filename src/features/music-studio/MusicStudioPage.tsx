import { useState } from "react";
import { Music, Play, Pause } from "lucide-react";
import { chatCompletion } from "../../api/endpoints/chat";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, setSetting } from "../../db";
import type { ChatMessage } from "../../api/types";

interface Track {
  id: string;
  name: string;
}

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("pop");
  const [tempo, setTempo] = useState("120");
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [showPromptBuilder, setShowPromptBuilder] = useState(false);

  const { defaultModel, setDefaultModel, availableModels } = useDefaultModel("audio");

  const handleModelChange = (newModel: string) => {
    setDefaultModel(newModel);
    setSetting("default_audio_model", newModel).catch(() => {});
  };

  const handleGenerateLyrics = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `You are a songwriter. Create song lyrics based on the user's theme.
Structure: [Intro], [Verse 1], [Chorus], [Verse 2], [Chorus], [Bridge], [Chorus], [Outro].
Return ONLY the lyrics with structure tags, no markdown. Genre: ${genre}, Tempo: ${tempo}`,
        },
        { role: "user", content: prompt },
      ];
      const result = await chatCompletion({
        messages,
        model: "openai/gpt-4o",
        modalities: ["text"],
      });
      const parsed = JSON.parse(result);
      const text = parsed?.choices?.[0]?.message?.content || result;
      setLyrics(text);
    } catch (e) {
      console.error("Generate lyrics failed:", e);
    }
    setLoading(false);
  };

  const handleGenerateMusic = async () => {
    if (!lyrics.trim()) return;
    setLoading(true);
    try {
      const trackId = generateId();
      const newTrack: Track = {
        id: trackId,
        name: `Track ${tracks.length + 1} — ${genre}`,
      };
      setTracks((prev) => [...prev, newTrack]);
      await saveGeneration({
        id: trackId,
        projectId: null,
        model: defaultModel,
        endpoint: "/v1/chat/completions",
        requestJson: JSON.stringify({ prompt, genre, tempo, model: defaultModel }),
        status: "completed",
        mediaPath: null,
        mediaType: "audio/mp3",
        parentId: null,
        costRub: null,
        generationId: null,
      });
    } catch (e) {
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
                placeholder="Опишите желаемую песню..."
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
              AI
            </button>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
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
              className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none focus:border-violet-500"
            />
            <select
              value={defaultModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-white outline-none"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button
              onClick={handleGenerateLyrics}
              disabled={!prompt.trim() || loading}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
            >
              Lyrics
            </button>
            <button
              onClick={handleGenerateMusic}
              disabled={!lyrics.trim() || loading}
              className="ml-auto rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Генерация..." : "Generate Music"}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {lyrics && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="mb-3 text-sm font-medium text-zinc-400">Lyrics</h3>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                  {lyrics}
                </pre>
              </div>
            )}
            {!lyrics && (
              <div className="flex h-full items-center justify-center text-zinc-600">
                <div className="text-center">
                  <Music className="mx-auto mb-3 h-8 w-8 opacity-50" />
                  <p className="text-sm">Опишите песню и нажмите Lyrics</p>
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
