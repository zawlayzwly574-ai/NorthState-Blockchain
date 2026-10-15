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
  } catch { /* Treat malformed legacy data as ordinary text rather than hiding it. */ }
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

export async function detectSupportLanguage(text: string): Promise<string> {
  const base = (process.env.FREE_TRANSLATE_URL || DEFAULT_TRANSLATE_URL).replace(/\\/+$/, "");
  const response = await fetch(base + "/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text.slice(0, 4000) }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Free translation service could not detect the message language.");
  const data = await response.json() as Array<{ language?: string; confidence?: number }>;
  const language = data?.[0]?.language;
  if (!language) throw new Error("The message language could not be detected.");
  return language.toLowerCase();
}

export async function translateSupportText(text: string, targetLanguage: string, sourceLanguage = "auto"): Promise<string> {
  const base = (process.env.FREE_TRANSLATE_URL || DEFAULT_TRANSLATE_URL).replace(/\\/+$/, "");
  const response = await fetch(base + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text.slice(0, 4000), source: sourceLanguage, target: targetLanguage, format: "text" }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Free translation service is temporarily unavailable. Please retry; the message was not sent.");
  const data = await response.json() as { translatedText?: string };
  const result = data?.translatedText?.trim();
  if (!result) throw new Error("Free translation service returned an empty translation.");
  return result;
}

export function normalizeSupportLanguage(language: unknown, fallback = "my"): string {
  const allowed = new Set(["my", "en", "es", "pt", "fr", "th", "vi", "ms", "id", "zh", "ja", "ko", "hi", "ar", "de"]);
  return typeof language === "string" && allowed.has(language.toLowerCase()) ? language.toLowerCase() : fallback;
}
