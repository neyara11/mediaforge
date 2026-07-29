import { chatCompletion } from "../../api/endpoints/chat";
import type { ChatMessage } from "../../api/types";

export interface AceStepPlan {
  caption: string;
  bpm?: number;
  key_scale?: string;
  time_signature?: string;
  duration?: number;
  vocal_language?: string;
}

const SYSTEM_PROMPT =
  "You are a music producer. Return ONLY a JSON object with these optional fields: caption, bpm, key_scale, time_signature, duration, vocal_language. " +
  "caption MUST ALWAYS be in English — translate the user's description, expand genre, mood, instruments, and vocal style. Target under 450 characters. " +
  "time_signature must be one of: 2, 3, 4, 6. vocal_language must be an ISO 639-1 code inferred from the lyrics language. " +
  "bpm and duration must be numbers. Omit fields you cannot determine. Do NOT wrap JSON in markdown fences.";

function capCaption(text: string): string {
  return [...text].slice(0, 512).join("");
}

function extractJson(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("No JSON object found in planner response");
  }
}

export async function planAceStepMusic(
  prompt: string,
  lyrics: string,
  textModel: string
): Promise<AceStepPlan> {
  const userContent = lyrics ? `${prompt}\n\nLyrics:\n${lyrics}` : prompt;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let text: string;
  try {
    const result = await chatCompletion({
      messages,
      model: textModel,
      modalities: ["text"],
    });
    const parsed = JSON.parse(result);
    text = parsed?.choices?.[0]?.message?.content ?? parsed?.content ?? result;
  } catch (e) {
    console.warn("ACE-Step planner failed:", e);
    return { caption: capCaption(prompt) };
  }

  try {
    const plan = extractJson(text) as {
      caption?: unknown;
      bpm?: unknown;
      key_scale?: unknown;
      time_signature?: unknown;
      duration?: unknown;
      vocal_language?: unknown;
    };

    const caption = capCaption(String(plan.caption ?? "")) || capCaption(prompt);

    const result: AceStepPlan = { caption };

    if (typeof plan.bpm === "number" && plan.bpm > 0 && plan.bpm <= 999) {
      result.bpm = Math.round(plan.bpm);
    }
    if (typeof plan.key_scale === "string" && plan.key_scale.trim()) {
      result.key_scale = plan.key_scale.trim();
    }
    if (
      typeof plan.time_signature === "string" &&
      ["2", "3", "4", "6"].includes(plan.time_signature)
    ) {
      result.time_signature = plan.time_signature;
    }
    if (typeof plan.duration === "number" && plan.duration > 0) {
      result.duration = Math.round(plan.duration);
    }
    if (
      typeof plan.vocal_language === "string" &&
      /^[a-z]{2}$/i.test(plan.vocal_language.trim())
    ) {
      result.vocal_language = plan.vocal_language.trim().toLowerCase();
    }

    return result;
  } catch {
    console.warn("ACE-Step planner: invalid JSON response, using raw prompt");
    return { caption: capCaption(prompt) };
  }
}
