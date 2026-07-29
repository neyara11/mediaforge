import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Music, Play, Pause, Sparkles, Volume2, Download, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { chatCompletion, chatAudioGenerate } from "../../api/endpoints/chat";
import {
  aceStepGenerate,
  aceStepPoll,
  aceStepDownloadAudio,
  aceStepStageAudio,
  aceStepModels,
} from "../../api/endpoints/acestep";
import { saveAudioFile, exportMediaFile, migrateAudioToDisk } from "../../api/endpoints/storage";
import type {
  AceStepTaskType,
  AceStepGenerateParams,
  AceStepModel,
  AceStepPollItem,
} from "../../api/endpoints/acestep";
import { planAceStepMusic } from "./aceStepPlanner";
import type { AceStepPlan } from "./aceStepPlanner";
import PromptBuilder from "../prompt-builder/PromptBuilderPanel";
import { cn, generateId } from "../../shared/utils";
import {
  buildLyricsSystemPrompt,
  cleanLyricsTranscript,
  looksLikeTranscript,
  stripChordLines,
} from "../../shared/lyricsPrompt";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { saveGeneration, getGenerations, setSetting, getSetting, deleteGeneration } from "../../db";
import type { ChatMessage } from "../../api/types";

interface Track {
  id: string;
  name: string;
  genre: string;
  lyrics: string;
  transcript?: string;
  mediaPath?: string | null;
  audioUrl: string | null;
  audioBase64: string;
  audioFormat: string;
}

interface SavedTrackData {
  lyrics: string;
  transcript?: string;
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

function getTrackAudioSrc(track: Track): string | null {
  return track.mediaPath ? convertFileSrc(track.mediaPath) : track.audioUrl;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getFileName(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

const STEM_LIST = [
  "vocals",
  "backing_vocals",
  "drums",
  "bass",
  "guitar",
  "keyboard",
  "percussion",
  "strings",
  "synth",
  "fx",
  "brass",
  "woodwinds",
];

const TASK_TYPE_OPTIONS: AceStepTaskType[] = ["text2music", "cover", "repaint", "extract", "complete"];

const KEY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "", labelKey: "keys.auto" },
  { value: "C Major", labelKey: "keys.C_Major" },
  { value: "Am", labelKey: "keys.Am" },
  { value: "G Major", labelKey: "keys.G_Major" },
  { value: "Em", labelKey: "keys.Em" },
  { value: "D Major", labelKey: "keys.D_Major" },
  { value: "Bm", labelKey: "keys.Bm" },
  { value: "F Major", labelKey: "keys.F_Major" },
  { value: "Dm", labelKey: "keys.Dm" },
  { value: "A Major", labelKey: "keys.A_Major" },
  { value: "F#m", labelKey: "keys.Fsharp_m" },
];

const TIME_SIG_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "", labelKey: "keys.auto" },
  { value: "2", labelKey: "timeSignatures.2/4" },
  { value: "3", labelKey: "timeSignatures.3/4" },
  { value: "4", labelKey: "timeSignatures.4/4" },
  { value: "6", labelKey: "timeSignatures.6/8" },
];

const VOCAL_LANG_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "", labelKey: "vocalLanguages.auto" },
  { value: "ru", labelKey: "vocalLanguages.ru" },
  { value: "en", labelKey: "vocalLanguages.en" },
  { value: "es", labelKey: "vocalLanguages.es" },
  { value: "de", labelKey: "vocalLanguages.de" },
  { value: "fr", labelKey: "vocalLanguages.fr" },
  { value: "ja", labelKey: "vocalLanguages.ja" },
  { value: "zh", labelKey: "vocalLanguages.zh" },
  { value: "ko", labelKey: "vocalLanguages.ko" },
];

const HARDCODED_ACE_MODELS: AceStepModel[] = [
  { name: "acestep-v15-turbo", is_default: true },
  { name: "acestep-v15-sft", is_default: false },
  { name: "acestep-v15-base", is_default: false },
  { name: "acestep-v15-xl-turbo", is_default: false },
  { name: "acestep-v15-xl-sft", is_default: false },
  { name: "acestep-v15-xl-base", is_default: false },
];

class GenerationAbortedError extends Error {}

export default function MusicStudioPage() {
  const { i18n } = useTranslation();
  const { t } = useTranslation("music");
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("pop");
  const [tempo, setTempo] = useState("120");
  const [styleText, setStyleText] = useState("");
  const [verses, setVerses] = useState("2");
  const [chorus, setChorus] = useState(true);
  const [bridge, setBridge] = useState(false);
  const [introOutro, setIntroOutro] = useState(false);
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
  const generationRunRef = useRef(0);
  const audioModel = useDefaultModel("audio");
  const textModel = useDefaultModel("text");

  const isRu = i18n.language?.startsWith("ru") ?? false;

  const [provider, setProvider] = useState<"routerai" | "acestep">("routerai");
  const [aceModels, setAceModels] = useState<AceStepModel[]>([]);
  const [selectedAceModel, setSelectedAceModel] = useState("");
  const [taskType, setTaskType] = useState<AceStepTaskType>("text2music");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [aceDuration, setAceDuration] = useState(180);
  const [aceBpm, setAceBpm] = useState("");
  const [aceKeyScale, setAceKeyScale] = useState("");
  const [aceTimeSignature, setAceTimeSignature] = useState("");
  const [aceVocalLanguage, setAceVocalLanguage] = useState(isRu ? "ru" : "en");
  const [aceBatchSize, setAceBatchSize] = useState(2);
  const [useRandomSeed, setUseRandomSeed] = useState(true);
  const [aceSeed, setAceSeed] = useState("");
  const [aceAudioFormat, setAceAudioFormat] = useState<"mp3" | "wav">("mp3");
  const [referenceAudioPath, setReferenceAudioPath] = useState<string | null>(null);
  const [srcAudioPath, setSrcAudioPath] = useState<string | null>(null);
  const [coverStrength, setCoverStrength] = useState(0.8);
  const [repaintStart, setRepaintStart] = useState(0);
  const [repaintEnd, setRepaintEnd] = useState<number | string>("");
  const [selectedStems, setSelectedStems] = useState<string[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [aceModelsLive, setAceModelsLive] = useState(false);
  const [autoEnhancePrompt, setAutoEnhancePrompt] = useState(true);

  const hasBaseModel = aceModelsLive && aceModels.some((m) => m.name.includes("-base"));

  useEffect(() => {
    const runRef = generationRunRef;
    return () => {
      runRef.current++;
    };
  }, []);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    getSetting("default_music_provider").then((v) => {
      if (v === "acestep" || v === "routerai") setProvider(v as "routerai" | "acestep");
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (provider !== "acestep") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await aceStepModels();
        if (cancelled) return;
        setAceModels(result.models);
        setAceModelsLive(true);
        const saved = await getSetting("default_ace_step_model");
        if (saved && result.models.some((m) => m.name === saved)) {
          setSelectedAceModel(saved);
        } else {
          setSelectedAceModel(result.default_model || result.models[0]?.name || "");
        }
      } catch {
        if (cancelled) return;
        setAceModels(HARDCODED_ACE_MODELS);
        setAceModelsLive(false);
        const saved = await getSetting("default_ace_step_model");
        if (saved && HARDCODED_ACE_MODELS.some((m) => m.name === saved)) {
          setSelectedAceModel(saved);
        } else {
          setSelectedAceModel(HARDCODED_ACE_MODELS[0].name);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [provider]);

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

    const urls = audioUrlsRef.current;
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.src = "";
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stats = await migrateAudioToDisk().catch(() => null);
        if (stats) {
          console.log(`Audio migration: ${stats.migrated} migrated, ${stats.skipped} skipped, ${stats.failed} failed`);
        }
      } catch {
        // migration is best-effort
      }

      try {
        const generations = await getGenerations(undefined);
        if (cancelled) return;

        const musicGenerations = generations
          .filter(
            (g) =>
              (g.endpoint === "/v1/chat/completions" || g.endpoint === "acestep") &&
              (g.mediaType?.startsWith("audio/") || g.mediaType === "text/lyrics") &&
              g.status === "completed"
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        console.log(`Loaded ${musicGenerations.length} music generations from DB`);

        const routeraiTracks: Track[] = [];
        const acestepTracks: Track[] = [];

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

          const usableMediaPath =
            gen.mediaPath && !gen.mediaPath.startsWith("blob:") ? gen.mediaPath : null;

          if (usableMediaPath) {
            audioFormat = trackData?.audio_format || "mp3";
          } else if (trackData?.audio_base64) {
            audioBase64 = trackData.audio_base64;
            audioFormat = trackData.audio_format || "mp3";
            const mimeType = audioFormat === "wav" ? "audio/wav" : "audio/mpeg";
            const blob = base64ToBlob(audioBase64, mimeType);
            audioUrl = URL.createObjectURL(blob);
            audioUrlsRef.current.add(audioUrl);
          }

          let reqData: { prompt?: string; genre?: string; tempo?: string; base?: string; stem?: string } = {};
          if (gen.requestJson) {
            try {
              reqData = JSON.parse(gen.requestJson);
            } catch {
              // ignore
            }
          }

          if (gen.endpoint === "acestep") {
            const name = reqData.stem
              ? `${reqData.base ?? "Track"} — ${reqData.stem}`
              : `${reqData.base ?? "Track"} — ACE-Step`;
            const rawLyrics = trackData?.lyrics || "";
            acestepTracks.push({
              id: gen.id,
              name,
              genre: "acestep",
              lyrics: looksLikeTranscript(rawLyrics) ? cleanLyricsTranscript(rawLyrics) : rawLyrics,
              transcript: trackData?.transcript,
              mediaPath: usableMediaPath,
              audioUrl,
              audioBase64,
              audioFormat,
            });
          } else {
            const trackGenre = reqData.genre || "pop";
            const rawLyrics = trackData?.lyrics || "";
            routeraiTracks.push({
              id: gen.id,
              name: `Track ${routeraiTracks.length + 1}`,
              genre: trackGenre,
              lyrics: looksLikeTranscript(rawLyrics) ? cleanLyricsTranscript(rawLyrics) : rawLyrics,
              transcript: trackData?.transcript,
              mediaPath: usableMediaPath,
              audioUrl,
              audioBase64,
              audioFormat,
            });
          }
        }

        if (!cancelled) {
          const numbered = routeraiTracks.map((t, i) => ({
            ...t,
            name: `Track ${i + 1} — ${t.genre}`,
          }));
          setTracks([...acestepTracks.reverse(), ...numbered.reverse()]);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("Failed to load tracks from DB:", e);
        }
      }
    })();

    return () => { cancelled = true; };
    }, []);

  const handleProviderChange = (newProvider: "routerai" | "acestep") => {
    setProvider(newProvider);
    setSetting("default_music_provider", newProvider).catch(() => {});
  };

  const handleAceModelChange = (model: string) => {
    setSelectedAceModel(model);
    setSetting("default_ace_step_model", model).catch(() => {});
  };

  const toggleStem = (stem: string) => {
    setSelectedStems((prev) =>
      prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]
    );
  };

  const toggleAllStems = () => {
    setSelectedStems((prev) =>
      prev.length === STEM_LIST.length ? [] : [...STEM_LIST]
    );
  };

  const handleUseCurrentTrack = async () => {
    if (currentTrack?.mediaPath) {
      setSrcAudioPath(currentTrack.mediaPath);
      return;
    }
    if (!currentTrack?.audioBase64) return;
    try {
      const path = await aceStepStageAudio(currentTrack.audioBase64, currentTrack.audioFormat || "mp3");
      setSrcAudioPath(path);
    } catch (e) {
      console.error("Failed to stage current track:", e);
    }
  };

  const handlePickAudio = async (setter: (p: string) => void) => {
    try {
      const selected = await open({
        filters: [{ name: "Audio", extensions: ["mp3", "wav", "flac", "ogg"] }],
        multiple: false,
      });
      if (selected) {
        setter(Array.isArray(selected) ? selected[0] : selected);
      }
    } catch (e) {
      console.error("File pick failed:", e);
    }
  };

  const playTrack = useCallback((track: Track) => {
    const audio = audioRef.current;
    const src = getTrackAudioSrc(track);
    if (!audio || !src) return;

    const isSameTrack = currentTrackRef.current?.id === track.id;
    if (isSameTrack && isPlayingRef.current) {
      audio.pause();
      return;
    }
    if (!isSameTrack || !audio.src) {
      audio.src = src;
    }
    audio.play().catch(console.error);
  }, []);

  const selectTrack = useCallback((track: Track) => {
    const audio = audioRef.current;
    const isSame = currentTrackRef.current?.id === track.id;

    if (isSame) {
      playTrack(track);
      return;
    }

    currentTrackRef.current = track;
    setCurrentTrack(track);
    setLyrics(track.lyrics);
    setCurrentTime(0);
    const src = getTrackAudioSrc(track);
    if (src && audio) {
      audio.src = src;
      audio.play().catch(console.error);
    } else if (audio) {
      audio.pause();
      audio.src = "";
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
    if (!track) return;
    if (!track.mediaPath && !track.audioBase64) {
      setError(t("errors.downloadUnavailable"));
      return;
    }

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
      if (!filePath) return;

      if (track.mediaPath) {
        try {
          await exportMediaFile(track.mediaPath, filePath);
        } catch (copyError) {
          if (track.audioBase64) {
            await invoke("save_base64_file", {
              base64Data: track.audioBase64,
              filePath,
            });
          } else {
            throw copyError;
          }
        }
      } else {
        await invoke("save_base64_file", {
          base64Data: track.audioBase64,
          filePath,
        });
      }
    } catch (e) {
      console.error("Download failed:", e);
      setError(`${t("errors.downloadFailed")}: ${e}`);
    }
  }, [t]);

  const handleDeleteTrack = useCallback(async (trackId: string) => {
    try {
      await deleteGeneration(trackId);
    } catch (e) {
      console.error("Delete failed:", e);
      return;
    }
    setTracks((prev) => {
      const doomed = prev.find((t) => t.id === trackId);
      if (doomed?.audioUrl) {
        URL.revokeObjectURL(doomed.audioUrl);
        audioUrlsRef.current.delete(doomed.audioUrl);
      }
      return prev.filter((t) => t.id !== trackId);
    });
    if (currentTrackRef.current?.id === trackId) {
      currentTrackRef.current = null;
      setCurrentTrack(null);
      setLyrics("");
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
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
          content: buildLyricsSystemPrompt({
            lang,
            genre,
            tempo,
            verses: parseInt(verses) || 2,
            chorus,
            bridge,
            introOutro,
          }),
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
    if (provider === "acestep") {
      const runId = ++generationRunRef.current;
      setLoading(true);
      setError(null);
      setStatusText(null);
      try {
        if (
          (taskType === "cover" || taskType === "repaint" || taskType === "extract" || taskType === "complete") &&
          !srcAudioPath
        ) {
          setError(t("errors.needSrcAudio"));
          setLoading(false);
          return;
        }
        if (taskType === "extract" && selectedStems.length === 0) {
          setError(t("errors.needStems"));
          setLoading(false);
          return;
        }
        if (taskType === "complete" && selectedStems.length === 0) {
          setError(t("errors.needCompleteTracks"));
          setLoading(false);
          return;
        }

        setStatusText(t("statuses.submitting"));

        let planCaption: string | undefined;
        let planBpm: number | undefined;
        let planKeyScale: string | undefined;
        let planTimeSignature: string | undefined;
        let planDuration: number | undefined;
        let planVocalLanguage: string | undefined;

        if (taskType !== "extract" && autoEnhancePrompt) {
          try {
            const plan = await planAceStepMusic(prompt, lyrics, textModel.defaultModel);
            planCaption = plan.caption;
            planBpm = plan.bpm;
            planKeyScale = plan.key_scale;
            planTimeSignature = plan.time_signature;
            planDuration = plan.duration;
            planVocalLanguage = plan.vocal_language;
          } catch (e) {
            console.warn("ACE-Step planner failed:", e);
          }
        }

        const mergedCaption = taskType !== "extract" ? (planCaption ?? prompt) : prompt;
        const mergedBpm = aceBpm ? Number(aceBpm) : planBpm;
        const mergedKeyScale = aceKeyScale || planKeyScale;
        const mergedTimeSignature = aceTimeSignature || planTimeSignature;
        const mergedDuration = aceDuration || planDuration;
        const mergedVocalLanguage = aceVocalLanguage || planVocalLanguage;
        const inferenceSteps = selectedAceModel.includes("-base") ? 50 : undefined;
        const userLyrics = lyrics.trim();

        const taskIds: string[] = [];
        const taskStemMap: Record<string, string> = {};

        if (taskType === "extract") {
          for (const stem of selectedStems) {
            const { taskId } = await aceStepGenerate({
              prompt: mergedCaption || "Extract stems",
              lyrics: userLyrics,
              taskType: "extract",
              model: selectedAceModel,
              audioFormat: aceAudioFormat,
              batchSize: 1,
              inferenceSteps,
              srcAudioPath: srcAudioPath ?? undefined,
              instruction: `Extract the ${stem} track from the audio:`,
            });
            taskIds.push(taskId);
            taskStemMap[taskId] = stem;
          }
        } else if (taskType === "complete") {
          const { taskId } = await aceStepGenerate({
            prompt: mergedCaption || "Complete arrangement",
            lyrics: userLyrics,
            taskType: "complete",
            model: selectedAceModel,
            audioFormat: aceAudioFormat,
            batchSize: 1,
            inferenceSteps,
            srcAudioPath: srcAudioPath ?? undefined,
            instruction: `Complete the input track with ${selectedStems.join(", ")}:`,
          });
          taskIds.push(taskId);
        } else {
          const params: AceStepGenerateParams = {
            prompt: mergedCaption || prompt,
            lyrics: userLyrics,
            taskType,
            model: selectedAceModel,
            audioFormat: aceAudioFormat,
          };

          if (taskType === "text2music") {
            if (mergedBpm && mergedBpm > 0) params.bpm = mergedBpm;
            if (mergedKeyScale) params.keyScale = mergedKeyScale;
            if (mergedTimeSignature) params.timeSignature = mergedTimeSignature;
            if (mergedDuration) params.audioDuration = mergedDuration;
            if (mergedVocalLanguage) params.vocalLanguage = mergedVocalLanguage;
            params.batchSize = aceBatchSize;
            params.useRandomSeed = useRandomSeed;
            if (!useRandomSeed && aceSeed) params.seed = Number(aceSeed);
            if (referenceAudioPath) params.referenceAudioPath = referenceAudioPath;
          }
          if (taskType === "cover") {
            params.audioCoverStrength = coverStrength;
            if (srcAudioPath) params.srcAudioPath = srcAudioPath;
          }
          if (taskType === "repaint") {
            params.repaintingStart = repaintStart;
            params.repaintingEnd = repaintEnd === "" ? -1 : Number(repaintEnd);
            if (srcAudioPath) params.srcAudioPath = srcAudioPath;
          }
          if (inferenceSteps) params.inferenceSteps = inferenceSteps;

          const { taskId } = await aceStepGenerate(params);
          taskIds.push(taskId);
        }

        let attempts = 0;
        const maxAttempts = taskType === "extract" ? Math.max(300, 120 * selectedStems.length) : 300;

        let pollResult: AceStepPollItem[] = [];
        while (true) {
          await new Promise((r) => setTimeout(r, 2000));
          if (generationRunRef.current !== runId) throw new GenerationAbortedError();
          attempts++;
          pollResult = await aceStepPoll(taskIds);
          if (pollResult.length === 0) {
            throw new Error(t("errors.generationFailed", { error: "No task results returned" }));
          }
          const doneCount = pollResult.filter((item) => item.status !== 0).length;
          setStatusText(
            t("statuses.generating", {
              attempt: attempts,
              done: doneCount,
              total: taskIds.length,
            })
          );

          const failedItems = pollResult.filter((item) => item.status === 2);
          const fatalFailure =
            failedItems.length > 0 &&
            (taskType !== "extract" || failedItems.length === pollResult.length);
          if (fatalFailure) {
            throw new Error(failedItems[0].error || t("errors.generationFailed", { error: "Unknown error" }));
          }

          if (pollResult.every((item) => item.status !== 0)) {
            break;
          }

          if (attempts >= maxAttempts) {
            throw new Error("Generation timeout");
          }
        }

        setStatusText(t("statuses.downloading"));

        const base =
          taskType === "text2music"
            ? (prompt.trim() ? prompt.trim().slice(0, 24) : "Track")
            : currentTrack?.name
              ? currentTrack.name.replace(/\.[^.]+$/, "")
              : srcAudioPath
                ? getFileName(srcAudioPath).replace(/\.[^.]+$/, "")
                : "Track";

        const newTracks: Track[] = [];

        for (const item of pollResult) {
          if (generationRunRef.current !== runId) throw new GenerationAbortedError();
          if (item.status !== 1) continue;
          for (const file of item.files) {
            const audio = await aceStepDownloadAudio(file.file);

            const stemForName =
              taskType === "extract" ? taskStemMap[item.task_id] : undefined;
            const trackName = stemForName
              ? `${base} — ${stemForName}`
              : `${base} — ACE-Step`;

            const trackLyrics = file.lyrics ?? userLyrics;
            const trackId = generateId();

            const newTrack: Track = {
              id: trackId,
              name: trackName,
              genre: "acestep",
              lyrics: looksLikeTranscript(trackLyrics) ? cleanLyricsTranscript(trackLyrics) : trackLyrics,
              transcript: file.lyrics || undefined,
              mediaPath: audio.media_path,
              audioUrl: null,
              audioBase64: "",
              audioFormat: audio.audio_format,
            };

            newTracks.push(newTrack);

            const fmt = audio.audio_format || "mp3";
            try {
              await saveGeneration({
                id: trackId,
                projectId: null,
                model: selectedAceModel,
                endpoint: "acestep",
                requestJson: JSON.stringify({
                  prompt,
                  taskType,
                  model: selectedAceModel,
                  base,
                  ...(stemForName ? { stem: stemForName } : {}),
                }),
                responseJson: JSON.stringify({
                  lyrics: trackLyrics,
                  audio_format: audio.audio_format,
                  ...(file.metas ? { metas: file.metas } : {}),
                  ...(file.seed_value ? { seed: file.seed_value } : {}),
                }),
                status: "completed",
                mediaPath: audio.media_path,
                mediaType: `audio/${fmt}`,
                parentId: null,
                costRub: null,
                generationId: null,
              });
            } catch (e) {
              console.error("saveGeneration failed for ACE-Step track:", e);
            }
          }
        }

        setTracks((prev) => [...newTracks, ...prev]);

        if (newTracks.length === 0) {
          throw new Error(t("errors.generationFailed", { error: "No audio files returned" }));
        }

        if (taskType === "extract") {
          const failedStems = pollResult
            .filter((item) => item.status === 2)
            .map((item) => taskStemMap[item.task_id] ?? item.task_id);
          if (failedStems.length > 0) {
            setError(t("errors.generationFailed", { error: `stems: ${failedStems.join(", ")}` }));
          }
        }

        if (newTracks.length > 0) {
          const firstTrack = newTracks[0];
          currentTrackRef.current = firstTrack;
          setCurrentTrack(firstTrack);
          setLyrics(firstTrack.lyrics);
          setCurrentTime(0);
          setDuration(0);
          const src = getTrackAudioSrc(firstTrack);
          if (src && audioRef.current) {
            audioRef.current.src = src;
            audioRef.current.play().catch(console.error);
          }
        }
      } catch (e) {
        if (e instanceof GenerationAbortedError) {
          setLoading(false);
          setStatusText(null);
          return;
        }
        const errStr = String(e);
        if (errStr.includes("not reachable") || errStr.toLowerCase().includes("connection refused")) {
          setError(t("errors.notReachable"));
        } else if (errStr.includes("Server busy") || errStr.includes("queue full") || errStr.includes("429")) {
          setError(t("errors.serverBusy"));
        } else {
          setError(errStr);
        }
        console.error("ACE-Step generation failed:", e);
      }
      setLoading(false);
      setStatusText(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const userLyrics = lyrics.trim();
      const trackPrompt = (userLyrics ? stripChordLines(userLyrics) : "") || prompt;
      const result = await chatAudioGenerate(trackPrompt, audioModel.defaultModel, {
        genre,
        tempo,
        style: styleText,
        hasLyrics: !!userLyrics,
      });

      let mediaPath: string | null = null;
      let audioUrl: string | null = null;

      if (result.audio_base64) {
        try {
          mediaPath = await saveAudioFile(result.audio_base64, result.audio_format);
        } catch {
          const mimeType = result.audio_format === "wav" ? "audio/wav" : "audio/mpeg";
          const blob = base64ToBlob(result.audio_base64, mimeType);
          audioUrl = URL.createObjectURL(blob);
          audioUrlsRef.current.add(audioUrl);
        }
      }

      const finalLyrics = userLyrics || cleanLyricsTranscript(result.lyrics);

      const trackId = generateId();
      const maxNum = tracks.reduce((max, t) => {
        const m = t.name.match(/^Track (\d+)/);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      const newTrack: Track = {
        id: trackId,
        name: `Track ${maxNum + 1} — ${genre}`,
        genre,
        lyrics: finalLyrics,
        transcript: result.lyrics || undefined,
        mediaPath: mediaPath || null,
        audioUrl,
        audioBase64: mediaPath ? "" : result.audio_base64,
        audioFormat: result.audio_format,
      };
      setTracks((prev) => [newTrack, ...prev]);
      currentTrackRef.current = newTrack;
      setCurrentTrack(newTrack);
      if (!userLyrics) {
        setLyrics(finalLyrics);
      }
      setCurrentTime(0);
      setDuration(0);

      const src = getTrackAudioSrc(newTrack);
      if (src && audioRef.current) {
        audioRef.current.src = src;
        audioRef.current.play().catch(console.error);
      }

      const responseJson = JSON.stringify({
        lyrics: finalLyrics,
        transcript: result.lyrics,
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
          mediaPath: mediaPath,
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

  const hasAudio = currentTrack ? getTrackAudioSrc(currentTrack) != null : false;

  const acestepCantGenerate =
    taskType === "extract"
      ? !srcAudioPath || selectedStems.length === 0
      : taskType === "complete"
        ? !srcAudioPath || selectedStems.length === 0
        : taskType === "cover" || taskType === "repaint"
          ? !srcAudioPath
          : !prompt.trim();
  const generateDisabled =
    loading ||
    (provider === "routerai"
      ? !lyrics.trim() && !prompt.trim()
      : acestepCantGenerate);

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
              title={isRu ? "AI-ассистент промптов" : "AI prompt assistant"}
              aria-label={isRu ? "AI-ассистент промптов" : "AI prompt assistant"}
              className={cn(
                "rounded-lg border p-2 text-zinc-400 transition-colors hover:border-violet-500",
                showPromptBuilder && "border-violet-500 text-violet-400",
              )}
            >
              <Sparkles className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span>{t("provider.label")}:</span>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as "routerai" | "acestep")}
              disabled={loading}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
            >
              <option value="routerai">{t("provider.routerai")}</option>
              <option value="acestep">{t("provider.acestep")}</option>
            </select>

            <span>{isRu ? "Текст:" : "Text:"}</span>
            <select
              value={textModel.defaultModel}
              onChange={(e) => handleTextModelChange(e.target.value)}
              disabled={loading}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
            >
              {textModel.availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            {provider === "routerai" ? (
              <>
                <span className="ml-3">{isRu ? "Аудио:" : "Audio:"}</span>
                <select
                  value={audioModel.defaultModel}
                  onChange={(e) => handleAudioModelChange(e.target.value)}
                  disabled={loading}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                >
                  {audioModel.availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <span className="ml-3">{t("form.model")}:</span>
                <select
                  value={selectedAceModel}
                  onChange={(e) => handleAceModelChange(e.target.value)}
                  disabled={loading}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                >
                  {aceModels.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as AceStepTaskType)}
                  disabled={loading}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                >
                  {TASK_TYPE_OPTIONS.map((tt) => {
                    const needsBase = tt === "extract" || tt === "complete";
                    return (
                      <option key={tt} value={tt} disabled={needsBase && !hasBaseModel}>
                        {t(`taskTypes.${tt}`)}
                      </option>
                    );
                  })}
                </select>
                {taskType === "extract" || taskType === "complete" ? (
                  <span className="ml-3">{t("form.sourceAudio")}:</span>
                ) : taskType === "text2music" ? null : (
                  <span className="ml-3">{t("form.sourceAudio")}:</span>
                )}
                {(taskType !== "text2music") && (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePickAudio(setSrcAudioPath)}
                      disabled={loading}
                      className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {t("form.chooseFile")}
                    </button>
                    {currentTrack && (currentTrack.mediaPath || currentTrack.audioBase64) && (
                      <button
                        type="button"
                        onClick={handleUseCurrentTrack}
                        disabled={loading}
                        className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                      >
                        {t("form.useCurrentTrack")}
                      </button>
                    )}
                    <span className="truncate text-zinc-500">
                      {srcAudioPath ? getFileName(srcAudioPath) : t("form.noFileChosen")}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {provider === "acestep" && (
            <>
              {!hasBaseModel && (
                <div className="mt-2 text-xs text-amber-400/80">
                  {t("errors.needBaseModel")}
                </div>
              )}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-300"
                >
                  {showAdvanced ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {t("form.advancedToggle")}
                </button>
              </div>
              {showAdvanced && (
                <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
                  <label className="col-span-3 flex items-center gap-1.5 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={autoEnhancePrompt}
                      onChange={(e) => setAutoEnhancePrompt(e.target.checked)}
                      disabled={loading}
                      className="accent-violet-500"
                    />
                    {t("form.autoEnhancePrompt")}
                  </label>
                  {taskType === "text2music" && (
                    <>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.duration")}
                        <input
                          type="number"
                          min={10}
                          max={600}
                          value={aceDuration}
                          onChange={(e) => setAceDuration(Math.max(10, Math.min(600, Number(e.target.value) || 10)))}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.bpm")}
                        <input
                          type="number"
                          min={30}
                          max={300}
                          value={aceBpm}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "") { setAceBpm(""); return; }
                            const n = Number(v);
                            setAceBpm(String(Math.max(30, Math.min(300, Number.isNaN(n) ? 30 : n))));
                          }}
                          placeholder="Auto"
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500 placeholder:text-zinc-600"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.key")}
                        <select
                          value={aceKeyScale}
                          onChange={(e) => setAceKeyScale(e.target.value)}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                        >
                          {KEY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.timeSignature")}
                        <select
                          value={aceTimeSignature}
                          onChange={(e) => setAceTimeSignature(e.target.value)}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                        >
                          {TIME_SIG_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.vocalLanguage")}
                        <select
                          value={aceVocalLanguage}
                          onChange={(e) => setAceVocalLanguage(e.target.value)}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                        >
                          {VOCAL_LANG_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.batchSize")}
                        <input
                          type="number"
                          min={1}
                          max={8}
                          value={aceBatchSize}
                          onChange={(e) => setAceBatchSize(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.audioFormat")}
                        <select
                          value={aceAudioFormat}
                          onChange={(e) => setAceAudioFormat(e.target.value as "mp3" | "wav")}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none"
                        >
                          <option value="mp3">mp3</option>
                          <option value="wav">wav</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <input
                          type="checkbox"
                          checked={useRandomSeed}
                          onChange={(e) => setUseRandomSeed(e.target.checked)}
                          disabled={loading}
                          className="accent-violet-500"
                        />
                        {t("form.randomSeed")}
                      </label>
                      {!useRandomSeed && (
                        <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                          {t("form.fixedSeed")}
                          <input
                            type="number"
                            value={aceSeed}
                            onChange={(e) => setAceSeed(e.target.value)}
                            disabled={loading}
                            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
                          />
                        </label>
                      )}
                      <label className="col-span-3 flex items-center gap-1.5 text-xs text-zinc-500">
                        <span>{t("form.referenceAudio")}:</span>
                        <button
                          type="button"
                          onClick={() => handlePickAudio(setReferenceAudioPath)}
                          disabled={loading}
                          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {t("form.chooseFile")}
                        </button>
                        <span className="truncate text-zinc-500">
                          {referenceAudioPath ? getFileName(referenceAudioPath) : t("form.noFileChosen")}
                        </span>
                      </label>
                    </>
                  )}

                  {taskType === "cover" && (
                    <label className="col-span-3 flex flex-col gap-0.5 text-xs text-zinc-500">
                      <span>{t("form.coverStrength")}: {coverStrength.toFixed(2)}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={coverStrength}
                        onChange={(e) => setCoverStrength(Number(e.target.value))}
                        disabled={loading}
                        className="h-1 cursor-pointer appearance-none rounded bg-zinc-700 accent-violet-500"
                      />
                    </label>
                  )}

                  {taskType === "repaint" && (
                    <>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.repaintStart")}
                        <input
                          type="number"
                          min={0}
                          value={repaintStart}
                          onChange={(e) => setRepaintStart(Math.max(0, Number(e.target.value) || 0))}
                          disabled={loading}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
                        />
                      </label>
                      <label className="flex flex-col gap-0.5 text-xs text-zinc-500">
                        {t("form.repaintEnd")}
                        <input
                          type="text"
                          value={repaintEnd}
                          onChange={(e) => setRepaintEnd(e.target.value)}
                          disabled={loading}
                          placeholder="-1 = tail"
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500 placeholder:text-zinc-600"
                        />
                      </label>
                    </>
                  )}

                  {(taskType === "extract" || taskType === "complete") && (
                    <div className="col-span-3">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                        <input
                          type="checkbox"
                          checked={selectedStems.length === STEM_LIST.length}
                          onChange={toggleAllStems}
                          disabled={loading}
                          className="accent-violet-500"
                        />
                        {t("stems.selectAll")}
                      </label>
                      <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                        {STEM_LIST.map((stem) => (
                          <label key={stem} className="flex items-center gap-1 text-xs text-zinc-400">
                            <input
                              type="checkbox"
                              checked={selectedStems.includes(stem)}
                              onChange={() => toggleStem(stem)}
                              disabled={loading}
                              className="accent-violet-500"
                            />
                            {t(`stems.${stem}`)}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {provider === "routerai" && (
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
              <input
                value={styleText}
                onChange={(e) => setStyleText(e.target.value)}
                placeholder={isRu ? "Стиль: акустика, мужской вокал..." : "Style: acoustic, male vocal..."}
                title={isRu
                  ? "Свободное описание стиля для музыкальной модели. Имена исполнителей могут отфильтровываться."
                  : "Free-form style description for the music model. Artist names may be filtered."}
                className="w-56 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-violet-500"
              />
              <label className="flex items-center gap-1 text-zinc-500">
                {isRu ? "Куплетов:" : "Verses:"}
                <select
                  value={verses}
                  onChange={(e) => setVerses(e.target.value)}
                  className="rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-white outline-none"
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label className="flex items-center gap-1 text-zinc-500">
                <input
                  type="checkbox"
                  checked={chorus}
                  onChange={(e) => setChorus(e.target.checked)}
                  className="accent-violet-500"
                />
                {isRu ? "Припев" : "Chorus"}
              </label>
              <label className="flex items-center gap-1 text-zinc-500">
                <input
                  type="checkbox"
                  checked={bridge}
                  onChange={(e) => setBridge(e.target.checked)}
                  className="accent-violet-500"
                />
                {isRu ? "Бридж" : "Bridge"}
              </label>
              <label className="flex items-center gap-1 text-zinc-500">
                <input
                  type="checkbox"
                  checked={introOutro}
                  onChange={(e) => setIntroOutro(e.target.checked)}
                  className="accent-violet-500"
                />
                {isRu ? "Интро/Аутро" : "Intro/Outro"}
              </label>
              <button
                onClick={handleGenerateLyrics}
                disabled={!prompt.trim() || loading}
                className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
              >
                {isRu ? "Текст песни" : "Lyrics"}
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            {loading && provider === "acestep" && statusText && (
              <span className="text-xs text-violet-400">{statusText}</span>
            )}
            <button
              onClick={handleGenerateMusic}
              disabled={generateDisabled}
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
                    title={isPlaying ? (isRu ? "Пауза" : "Pause") : (isRu ? "Играть" : "Play")}
                    aria-label={isPlaying ? (isRu ? "Пауза" : "Pause") : (isRu ? "Играть" : "Play")}
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
                    <div
                      key={track.id}
                      className="flex w-full items-center gap-1"
                    >
                      <button
                        onClick={() => selectTrack(track)}
                        className={cn(
                          "flex flex-1 items-center gap-3 rounded-lg p-2 text-left text-sm transition-colors",
                          isCurrent
                            ? "bg-zinc-800 text-white"
                            : "text-zinc-400 hover:bg-zinc-800/50",
                        )}
                      >
                        {isCurrent && isPlaying ? (
                          <Volume2 className="h-4 w-4 shrink-0 text-violet-400" />
                        ) : isCurrent ? (
                          <Music className="h-4 w-4 shrink-0 text-violet-400" />
                        ) : getTrackAudioSrc(track) ? (
                          <Play className="h-4 w-4 shrink-0" />
                        ) : (
                          <Music className="h-4 w-4 shrink-0 opacity-40" />
                        )}
                        <div className="flex min-w-0 flex-col items-start">
                          <span className="truncate">{track.name}</span>
                          {!getTrackAudioSrc(track) && (
                            <span className="text-[10px] text-zinc-600">
                              {isRu ? "только текст" : "text only"}
                            </span>
                          )}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDeleteTrack(track.id)}
                        className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
                        title={isRu ? "Удалить" : "Delete"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
            mode={provider === "acestep" ? "acestep" : "lyrics"}
            onUsePrompt={(p) => {
              setPrompt(p);
              setShowPromptBuilder(false);
            }}
            onUsePlan={provider === "acestep" ? (plan: AceStepPlan) => {
              setPrompt(plan.caption);
              if (plan.lyrics) setLyrics(plan.lyrics);
              if (plan.bpm) setAceBpm(String(plan.bpm));
              if (plan.key_scale) setAceKeyScale(plan.key_scale);
              if (plan.time_signature) setAceTimeSignature(plan.time_signature);
              if (plan.vocal_language) setAceVocalLanguage(plan.vocal_language);
              setShowPromptBuilder(false);
            } : undefined}
          />
        </div>
      )}
    </div>
  );
}
