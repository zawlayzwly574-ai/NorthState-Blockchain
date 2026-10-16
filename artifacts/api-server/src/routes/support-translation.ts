const ENVELOPE_PREFIX = "__NORTHSTATE_SUPPORT_TRANSLATION_V1__:";

export type SupportTranslationEnvelope = {
  version: 1;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
};

export function parseSupportTranslation(content: string): SupportTranslationEnvelope | null {
  if (!content.startsWith(ENVELOPE_PREFIX)) return null;
  try {
    const value = JSON.parse(content.slice(ENVELOPE_PREFIX.length)) as SupportTranslationEnvelope;
    if (value?.version === 1 && typeof value.originalText === "string" && typeof value.translatedText === "string") return value;
  } catch { /* Malformed legacy data remains visible as ordinary text. */ }
  return null;
}

export function encodeSupportTranslation(value: SupportTranslationEnvelope): string {
  return ENVELOPE_PREFIX + JSON.stringify(value);
}

export function supportContentForViewer(content: string, senderRole: string, viewerRole: "admin" | "user"): string {
  const translated = parseSupportTranslation(content);
  if (!translated) return content;
  if (viewerRole === "admin") return senderRole === "user" ? translated.translatedText : translated.originalText;
  return senderRole === "admin" ? translated.translatedText : translated.originalText;
}

const DEFAULT_TRANSLATE_URL = "https://translate.argosopentech.com";
const TRANSLATION_TIMEOUT_MS = 5_000;
const SUPPORTED_LANGUAGES = new Set([
  "af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de",
  "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha",
  "haw", "he", "hi", "hmn", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "ja", "jv", "ka",
  "kk", "km", "kn", "ko", "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml",
  "mn", "mr", "ms", "mt", "my", "ne", "nl", "no", "ny", "pa", "pl", "ps", "pt", "ro", "ru",
  "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te",
  "th", "tl", "tr", "uk", "ur", "uz", "vi", "xh", "yi", "yo", "zh", "zu",
]);

function detectLikelyLanguage(text: string): string {
  if (/[\u1000-\u109F\uAA60-\uAA7F\uA9E0-\uA9FF]/u.test(text)) return "my";
  if (/[\u3040-\u30FF]/u.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/u.test(text)) return "ko";
  if (/[\u4E00-\u9FFF]/u.test(text)) return "zh";
  if (/[\u0E00-\u0E7F]/u.test(text)) return "th";
  if (/[\u0900-\u097F]/u.test(text)) return "hi";
  if (/[\u0600-\u06FF]/u.test(text)) return "ar";
  if (/[\u0400-\u04FF]/u.test(text)) return "ru";
  // Conservative English heuristic avoids sending common English replies for translation.
  if (/^[\x00-\x7F\s\p{P}]*$/u.test(text) && /\b(the|and|you|your|hello|please|support|thank|for|with|can|how|what|is|are|we|will)\b/i.test(text)) return "en";
  return "und";
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TRANSLATION_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Translation provider HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

async function tryGoogleAppsScript(text: string, targetLanguage: string): Promise<string | null> {
  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  if (!endpoint) return null;
  const url = new URL(endpoint);
  url.searchParams.set("text", text.slice(0, 4000));
  url.searchParams.set("target", targetLanguage);
  const data = await fetchJsonWithTimeout(url.toString()) as { status?: string; translatedText?: string };
  const translated = data?.translatedText?.trim();
  return data?.status === "success" && translated ? translated : null;
}

async function tryGoogleTranslate(text: string, targetLanguage: string): Promise<string | null> {
  const params = new URLSearchParams({ client: "gtx", sl: "auto", tl: targetLanguage, dt: "t", q: text.slice(0, 4000) });
  const data = await fetchJsonWithTimeout("https://translate.googleapis.com/translate_a/single?" + params.toString()) as [Array<Array<string>> | null, unknown, string?];
  const translated = (data?.[0] ?? []).map(chunk => chunk?.[0] ?? "").join("").trim();
  return translated && translated !== text ? translated : null;
}

async function tryMyMemory(text: string, targetLanguage: string): Promise<string | null> {
  // MyMemory has no reliable auto-source detection; use English as its source fallback.
  const params = new URLSearchParams({ q: text.slice(0, 450), langpair: `en|${targetLanguage}` });
  const data = await fetchJsonWithTimeout("https://api.mymemory.translated.net/get?" + params.toString()) as {
    responseStatus?: number;
    responseData?: { translatedText?: string };
  };
  const translated = data?.responseData?.translatedText?.trim();
  if (data?.responseStatus !== 200 || !translated || translated.toLowerCase().includes("mymemory warning") || translated.toLowerCase() === "null") return null;
  return translated;
}

/**
 * Best-effort free translation. Never throws: provider failures return the exact
 * original text so a third-party outage cannot prevent a support reply being saved.
 */
export async function translateSupportMessage(text: string, targetLang: string): Promise<string> {
  const target = targetLang?.trim().toLowerCase();
  if (!text.trim() || !target || target === "auto" || !SUPPORTED_LANGUAGES.has(target)) return text;
  if (detectLikelyLanguage(text) === target) return text;

  const providers: Array<() => Promise<string | null>> = [
    () => tryGoogleAppsScript(text, target),
    () => tryGoogleTranslate(text, target),
    () => tryMyMemory(text, target),
  ];
  for (const provider of providers) {
    try {
      const translated = await provider();
      if (translated && translated.trim()) return translated.trim();
    } catch (error) {
      // Deliberately keep the failure silent to callers; never log message text or secrets.
      console.warn("[support-translation] provider unavailable; using next fallback", error instanceof Error ? error.name : "unknown");
    }
  }
  return text;
}

/** Backward-compatible alias used by existing support routes. */
export async function translateSupportText(text: string, targetLanguage: string, _sourceLanguage = "auto"): Promise<string> {
  return translateSupportMessage(text, targetLanguage);
}

/** Non-throwing language detection for support input; defaults to 'und' offline. */
export async function detectSupportLanguage(text: string): Promise<string> {
  return detectLikelyLanguage(text);
}

export function normalizeSupportLanguage(language: unknown, fallback = "my"): string {
  return typeof language === "string" && SUPPORTED_LANGUAGES.has(language.trim().toLowerCase())
    ? language.trim().toLowerCase()
    : fallback;
}
