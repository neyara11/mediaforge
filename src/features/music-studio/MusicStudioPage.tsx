import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Music, Play, Pause, Sparkles, Volume2, Download } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { chatCompletion, chatAudioGenerate } from "../../api/endpoints/chat";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, getGenerations, setSetting } from "../../db";
import type { ChatMessage } from "../../api/types";

interface Track {
  id: string;
  name: string;
  genre: string;
  lyrics: string;
  audioUrl: string | null;
  audioBase64: string;
  audioFormat: string;
}

interface SavedTrackData {
  lyrics: string;
  audio_base64: string;
  audio_format: string;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<Track | null>(null);
  const isPlayingRef = useRef(false);
  const audioUrlsRef = useRef<Set<string>>(new Set());
  const audioModel = useDefaultModel("audio");
  const textModel = useDefaultModel("text");

  const isRu = i18n.language === "ru";

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => { setIsPlaying(false); };
    const onPlay = () => { setIsPlaying(true); };
    const onPause = () => { setIsPlaying(false); };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      for (const url of audioUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      audioUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const generations = await getGenerations();
        if (cancelled) return;

        const musicGenerations = generations.filter(
          (g) =>
            g.endpoint === "/v1/chat/completions" &&
            (g.mediaType?.startsWith("audio/") || g.mediaType === "text/lyrics") &&
            g.status === "completed"
        );
        console.log(`Loaded ${musicGenerations.length} music generations from DB`);

        const loadedTracks: Track[] = [];

        for (const gen of musicGenerations) {
          let trackData: SavedTrackData | null = null;
          if (gen.responseJson) {
            try {
              trackData = JSON.parse(gen.responseJson);
            } catch {
              // fall through
            }
          }

          let audioUrl: string | null = null;
          let audioBase64 = "";
          let audioFormat = "mp3";

          if (trackData?.audio_base64) {
            audioBase64 = trackData.audio_base64;
            audioFormat = trackData.audio_format || "mp3";
            const mimeType = audioFormat === "wav" ? "audio/wav" : "audio/mpeg";
            const blob = base64ToBlob(audioBase64, mimeType);
            audioUrl = URL.createObjectURL(blob);
            audioUrlsRef.current.add(audioUrl);
          }

          let reqData: { prompt?: string; genre?: string; tempo?: string } = {};
          if (gen.requestJson) {
            try {
              reqData = JSON.parse(gen.requestJson);
            } catch {
              // ignore
            }
          }

          const trackGenre = reqData.genre || "pop";
          const loadedTrack: Track = {
            id: gen.id,
            name: `Track ${loadedTracks.length + 1}`,
            genre: trackGenre,
            lyrics: trackData?.lyrics || "",
            audioUrl,
            audioBase64,
            audioFormat,
          };

          loadedTracks.push(loadedTrack);
        }

        if (!cancelled) {
          // Renumber tracks with genre info
          const renamed = loadedTracks.map((t, i) => ({
            ...t,
            name: `Track ${i + 1} — ${t.genre}`,
          }));
          setTracks(renamed);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load tracks from DB:", e);
        }
      }
    })();

    return () => { cancelled = true; };
    }, []);

  const playTrack = useCallback((track: Track) => {
    const audio = audioRef.current;
    if (!audio || !track.audioUrl) return;

    if (currentTrackRef.current?.id === track.id && isPlayingRef.current) {
      audio.pause();
    } else {
      audio.src = track.audioUrl;
      audio.play().catch(console.error);
    }
  }, []);

  const selectTrack = useCallback((track: Track) => {
    currentTrackRef.current = track;
    setCurrentTrack(track);
    setLyrics(track.lyrics);
    setCurrentTime(0);
    if (track.audioUrl) {
      playTrack(track);
    }
  }, [playTrack]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  }, []);

  const handleDownload = useCallback(async () => {
    const track = currentTrackRef.current;
    if (!track?.audioBase64) return;

    const ext = track.audioFormat === "wav" ? "wav" : "mp3";
    const defaultName = `${track.name.replace(/[^a-zA-Zа-яА-Я0-9 _-]/g, "")}.${ext}`;

    try {
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{
          name: ext === "wav" ? "WAV Audio" : "MP3 Audio",
          extensions: [ext],
        }],
      });
      if (filePath) {
        await invoke("save_base64_file", {
          base64Data: track.audioBase64,
          filePath,
        });
      }
    } catch (e) {
      console.error("Download failed:", e);
    }
  }, []);

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
      const result = await chatAudioGenerate(trackPrompt, audioModel.defaultModel);

      let audioUrl: string | null = null;
      if (result.audio_base64) {
        const mimeType = result.audio_format === "wav" ? "audio/wav" : "audio/mpeg";
        const blob = base64ToBlob(result.audio_base64, mimeType);
        audioUrl = URL.createObjectURL(blob);
        audioUrlsRef.current.add(audioUrl);
      }

      const trackId = generateId();
      const newTrack: Track = {
        id: trackId,
        name: `Track ${tracks.length + 1} — ${genre}`,
        genre,
        lyrics: result.lyrics,
        audioUrl,
        audioBase64: result.audio_base64,
        audioFormat: result.audio_format,
      };
      setTracks((prev) => [...prev, newTrack]);
      currentTrackRef.current = newTrack;
      setCurrentTrack(newTrack);
      setLyrics(result.lyrics);
      setCurrentTime(0);
      setDuration(0);

      if (audioUrl && audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(console.error);
      }

      const responseJson = JSON.stringify({
        lyrics: result.lyrics,
        audio_base64: result.audio_base64,
        audio_format: result.audio_format,
      });

      try {
        await saveGeneration({
          id: trackId,
          projectId: null,
          model: audioModel.defaultModel,
          endpoint: "/v1/chat/completions",
          requestJson: JSON.stringify({ prompt: trackPrompt, genre, tempo, model: audioModel.defaultModel }),
          responseJson,
          status: "completed",
          mediaPath: audioUrl,
          mediaType: result.audio_base64 ? `audio/${result.audio_format}` : "text/lyrics",
          parentId: null,
          costRub: result.cost,
          generationId: null,
        });
        console.log("Track saved to DB:", trackId);
      } catch (e) {
        console.error("saveGeneration failed:", e);
        setError(`Ошибка сохранения: ${e}`);
      }
    } catch (e) {
      setError(String(e));
      console.error("Music generation failed:", e);
    }
    setLoading(false);
  };

  const hasAudio = currentTrack?.audioUrl != null;

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
          <div className="flex flex-1 flex-col overflow-hidden">
            {hasAudio && (
              <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => currentTrack && playTrack(currentTrack)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white transition-colors hover:bg-violet-500"
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </button>

                  <span className="text-xs tabular-nums text-zinc-400 w-10 text-right">
                    {formatTime(currentTime)}
                  </span>

                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="h-1 flex-1 cursor-pointer appearance-none rounded bg-zinc-700 accent-violet-500 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
                  />

                  <span className="text-xs tabular-nums text-zinc-500 w-10">
                    {formatTime(duration)}
                  </span>

                  <button
                    onClick={handleDownload}
                    className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    title={isRu ? "Скачать MP3" : "Download MP3"}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto p-4">
              <div className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="mb-3 text-sm font-medium text-zinc-400">
                  {isRu ? "Текст песни" : "Lyrics"}
                  <span className="ml-2 text-xs font-normal text-zinc-600">
                    {isRu ? "— можно редактировать" : "— editable"}
                  </span>
                </h3>
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder={
                    isRu
                      ? "Вставьте или напишите текст песни здесь...\n\n[Verse 1]\n...\n[Chorus]\n..."
                      : "Paste or type lyrics here...\n\n[Verse 1]\n...\n[Chorus]\n..."
                  }
                  rows={16}
                  className="flex-1 w-full resize-none rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-300 placeholder-zinc-600 outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </div>

          <div className="w-64 border-l border-zinc-800 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-400">
              {isRu ? "Плейлист" : "Playlist"}
            </h3>
            {tracks.length > 0 ? (
              <div className="space-y-2">
                {tracks.map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  return (
                    <button
                      key={track.id}
                      onClick={() => selectTrack(track)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg p-2 text-left text-sm transition-colors",
                        isCurrent
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-800/50",
                      )}
                    >
                      {isCurrent && isPlaying ? (
                        <Volume2 className="h-4 w-4 shrink-0 text-violet-400" />
                      ) : isCurrent ? (
                        <Music className="h-4 w-4 shrink-0 text-violet-400" />
                      ) : track.audioUrl ? (
                        <Play className="h-4 w-4 shrink-0" />
                      ) : (
                        <Music className="h-4 w-4 shrink-0 opacity-40" />
                      )}
                      <div className="flex min-w-0 flex-col items-start">
                        <span className="truncate">{track.name}</span>
                        {!track.audioUrl && (
                          <span className="text-[10px] text-zinc-600">
                            {isRu ? "только текст" : "text only"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">{isRu ? "Пусто" : "Empty"}</p>
            )}
          </div>
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
