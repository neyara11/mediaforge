import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { chatCompletion } from "../../api/endpoints/chat";
import { useDefaultModel } from "../../shared/useDefaultModel";
import { buildLyricsSystemPrompt } from "../../shared/lyricsPrompt";
import { planAceStepMusicFull, type AceStepPlan } from "../music-studio/aceStepPlanner";
import type { ChatMessage } from "../../api/types";

interface PromptBuilderProps {
  mode: "image" | "video" | "lyrics" | "acestep";
  onUsePrompt: (prompt: string) => void;
  onUsePlan?: (plan: AceStepPlan) => void;
}

const SYSTEM_PROMPTS: Record<string, string> = {
  image: `You are an expert at creating prompts for AI image generation.
The user describes what they want in simple words.
Your task is to turn this into a detailed, structured prompt.
Write the prompt in the SAME LANGUAGE the user used in their input.

Include: main subject, environment, lighting, style, composition, camera angle, color palette, technical parameters (8K, detailed, etc).
Return ONLY the prompt, no explanations.`,

  video: `You are an expert at creating prompts for AI video generation.
Turn the user's description into a detailed video prompt.
Write the prompt in the SAME LANGUAGE the user used in their input.

Include: scene and action, camera movement, lighting and time of day, style, duration.
Return ONLY the prompt, no explanations.`,
};

const getSystemPrompt = (mode: string): string => {
  if (mode === "lyrics") {
    // Shared builder keeps this in sync with the Music Studio page and
    // avoids a hardcoded structure — the user's explicit request wins.
    return buildLyricsSystemPrompt({
      lang: "the user's language",
      genre: "",
      tempo: "",
      verses: 2,
      chorus: true,
      bridge: false,
      introOutro: false,
    });
  }
  return SYSTEM_PROMPTS[mode];
};

export default function PromptBuilder({ mode, onUsePrompt, onUsePlan }: PromptBuilderProps) {
  const { defaultModel } = useDefaultModel("text");
  const [input, setInput] = useState("");
  const [generated, setGenerated] = useState("");
  const [plan, setPlan] = useState<AceStepPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "acestep") {
        const result = await planAceStepMusicFull(input, defaultModel);
        setPlan(result);
        setGenerated("");
      } else {
        const messages: ChatMessage[] = [
          { role: "system", content: getSystemPrompt(mode) },
          { role: "user", content: input },
        ];
        const result = await chatCompletion({
          messages,
          model: defaultModel,
          modalities: ["text"],
        });
        const parsed = JSON.parse(result);
        const text =
          parsed?.choices?.[0]?.message?.content || parsed?.content || result;
        setGenerated(text);
        setPlan(null);
      }
      setExpanded(true);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generated);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-l border-zinc-800 bg-zinc-900/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          AI Prompt Assistant
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-3 px-4 pb-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === "acestep"
                ? "Опишите идею песни или вставьте свои стихи..."
                : mode === "lyrics"
                  ? "Опишите тему песни..."
                  : "Опишите, что вы хотите создать..."
            }
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-violet-500"
          />
          <button
            onClick={handleGenerate}
            disabled={!input.trim() || loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Wand2 className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Prompt"}
          </button>

          {error && (
            <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {plan && mode === "acestep" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Generated Plan</span>
              </div>
              <div className="mb-2 text-xs text-zinc-500">Caption</div>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300">{plan.caption}</pre>
              {plan.lyrics && (
                <>
                  <div className="mb-2 mt-3 text-xs text-zinc-500">Lyrics</div>
                  <pre className="whitespace-pre-wrap text-sm text-zinc-400">{plan.lyrics}</pre>
                </>
              )}
              <button
                onClick={() => {
                  if (onUsePlan) {
                    onUsePlan(plan);
                  } else {
                    onUsePrompt(plan.caption);
                  }
                }}
                className="mt-3 w-full rounded-lg bg-emerald-600/20 px-3 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-600/30"
              >
                Use this prompt
              </button>
            </div>
          )}

          {generated && mode !== "acestep" && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Generated Prompt</span>
                <div className="flex gap-1">
                  <button
                    onClick={handleCopy}
                    title="Copy prompt"
                    aria-label="Copy prompt"
                    className="rounded p-1 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300">{generated}</pre>
              <button
                onClick={() => onUsePrompt(generated)}
                className="mt-3 w-full rounded-lg bg-emerald-600/20 px-3 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-600/30"
              >
                Use this prompt
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
