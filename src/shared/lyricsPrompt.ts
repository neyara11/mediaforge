export interface LyricsStructureOptions {
  lang: string;
  genre: string;
  tempo: string;
  verses: number;
  chorus: boolean;
  bridge: boolean;
  introOutro: boolean;
}

/**
 * Builds the system prompt for lyrics generation.
 * Structure is composed from explicit UI controls instead of a hardcoded
 * template, and the user's explicit request always wins over the defaults.
 */
export function buildLyricsSystemPrompt(opts: LyricsStructureOptions): string {
  const parts: string[] = [];

  if (opts.introOutro) parts.push("[Intro]");
  for (let i = 1; i <= opts.verses; i++) {
    parts.push(`[Verse ${i}]`);
    if (opts.chorus) parts.push("[Chorus]");
  }
  if (opts.bridge) {
    parts.push("[Bridge]");
    if (opts.chorus) parts.push("[Chorus]");
  }
  if (opts.introOutro) parts.push("[Outro]");

  const structure = parts.length > 0 ? parts.join(", ") : "[Verse 1]";

  const styleLine =
    opts.genre.trim() || opts.tempo.trim()
      ? `\nGenre: ${opts.genre}, Tempo: ${opts.tempo}`
      : "";

  return `You are a songwriter. Create song lyrics in ${opts.lang} based on the user's theme.
Write the lyrics in the user's language.
Default structure: ${structure}.
If the user's request explicitly specifies a structure or section count (e.g. "one verse"), the user's request takes priority over the default structure.
Return ONLY the lyrics with structure tags, no explanations, no markdown.${styleLine}`;
}

/**
 * Strips performance-transcript markup that audio models return alongside
 * the generated audio: section ids like [[A0]], timestamps like [0.0:] or
 * [12.34:], and continuation markers [:]. Collapses extra blank lines.
 */
export function cleanLyricsTranscript(raw: string): string {
  return raw
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\[\d+(?:\.\d+)?:\]/g, "")
    .replace(/\[:\]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when the text contains transcript markup (old DB records). */
export function looksLikeTranscript(text: string): boolean {
  return /\[\[[^\]]*\]\]/.test(text) || /\[:\]/.test(text) || /\[\d+(?:\.\d+)?:\]/.test(text);
}

// Matches guitar/piano chord tokens: Am, E, C, G7, Dm, F#m, Bb, Cadd9,
// Dsus4, G/B, A7, Hm (Russian notation), etc.
const CHORD_TOKEN = /^[A-GH][#b]?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:\/[A-GH][#b]?)?$/;

function isChordOnlyLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (!tokens.every((t) => CHORD_TOKEN.test(t))) return false;
  // Require at least 2 tokens, or a single token that is unambiguously a
  // chord (contains a minor/quality marker, digit, #/b or slash) — this
  // keeps single-letter lyric lines like "A" or "E" intact.
  return tokens.length >= 2 || tokens[0].length >= 2;
}

/**
 * Removes lines that consist solely of chord symbols. Audio models sing
 * chord letters aloud, so chords must not be sent as lyrics. The user's
 * lyrics field itself is never modified — apply this only to the payload.
 */
export function stripChordLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isChordOnlyLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
