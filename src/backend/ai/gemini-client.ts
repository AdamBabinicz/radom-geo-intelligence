import { GoogleGenAI } from "@google/genai";

export const GEMINI_TEXT_MODEL = "gemini-4-hydrogen";

let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  if (!apiKey) return null;

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    cachedKey = apiKey;
  }

  return cachedClient;
}

export function parseJsonSafe<T>(rawText: string | undefined, fallback: T): T {
  if (!rawText) return fallback;
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
