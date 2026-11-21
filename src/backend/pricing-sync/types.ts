import type { ServiceUnitType } from "@/src/config/industries";

export const MAX_AI_CONTEXT_CHARS = 11_000;
export const MAX_EXTRACTED_ITEMS = 35;
export const SYNC_CACHE_TTL_MS = 15 * 60 * 1000;
export const MAX_SYNC_CACHE_ENTRIES = 80;
export const FETCH_HTML_TIMEOUT_MS = 8_000;
export const FETCH_ASSET_TIMEOUT_MS = 6_000;
export const GEMINI_TIMEOUT_MS = 15_000;
export const GROQ_MODEL_TIMEOUT_MS = 10_000;
export const GROQ_TOTAL_BUDGET_MS = 20_000;

export const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;

export type DetectedIndustryMatch =
  | "upholstery"
  | "hvac"
  | "plumbing"
  | "custom";

export type PricingSyncCode =
  | "MISSING_URL"
  | "INVALID_URL"
  | "INVALID_PROTOCOL"
  | "PRIVATE_HOST_BLOCKED"
  | "SITE_UNREACHABLE"
  | "NO_PUBLIC_PRICES"
  | "AI_FALLBACK_USED";

export type SupportedCurrency = "PLN" | "USD" | "EUR";

export interface SiteProfile {
  businessName?: string;
  nichePl: string;
  nicheEn: string;
  matchedIndustryId: DetectedIndustryMatch;
  searchQueriesPl: string[];
  searchQueriesEn: string[];
}

export interface ExtractedPrice {
  serviceKey: string;
  labelPl: string;
  labelEn: string;
  unitType: ServiceUnitType;
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: SupportedCurrency;
  method:
    | "gemini-ai"
    | "groq-ai"
    | "json-ld"
    | "html-text"
    | "subpage"
    | "spa-bundle";
  snippet: string;
}

export interface AiExtractResult {
  aiSucceeded: boolean;
  prices: ExtractedPrice[] | null;
  siteProfile?: SiteProfile;
  aiProvider?: "gemini" | "groq";
  warning?: string;
}

export interface CachedSyncPayload {
  expiresAt: number;
  url: string;
  fetchedAt: string;
  aiProvider?: "gemini" | "groq";
  siteProfile?: SiteProfile;
  prices: ExtractedPrice[];
}

export interface HtmlMetadata {
  title: string;
  description: string;
  headings: string[];
}

export interface JsStringDictionary {
  flat: Map<string, string>;
  scoped: Map<string, string>;
}

export interface FallbackKeywordRule {
  serviceKey: string;
  labelPl: string;
  labelEn: string;
  unitType: ServiceUnitType;
  patterns: RegExp[];
}

export interface RawOffer {
  name: string;
  amount: number;
  currency: SupportedCurrency;
}

export interface RawAiPriceRow {
  serviceKey?: unknown;
  labelPl?: unknown;
  labelEn?: unknown;
  unitType?: unknown;
  detectedAmount?: unknown;
  detectedCurrency?: unknown;
  snippet?: unknown;
}

export interface RawAiSiteProfile {
  businessName?: unknown;
  nichePl?: unknown;
  nicheEn?: unknown;
  matchedIndustryId?: unknown;
  searchQueriesPl?: unknown;
  searchQueriesEn?: unknown;
}

export interface RawAiResponsePayload {
  siteProfile?: RawAiSiteProfile;
  prices?: RawAiPriceRow[];
}
