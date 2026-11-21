import type { IndustryId } from "@/src/config/industries";

export const GEMINI_SCAN_TIMEOUT_MS = 20_000;
export const GROQ_MODEL_TIMEOUT_MS = 12_000;
export const GROQ_TOTAL_BUDGET_MS = 24_000;
export const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;
export const MAX_GROQ_RESEARCH_CHARS = 11_500;

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface CompetitorFinding {
  name: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  travelFeeNote?: string;
  priceSummary: string;
}

export interface BenchmarkFinding {
  serviceKey: string;
  avgPricePln: number;
  minPricePln?: number;
  maxPricePln?: number;
  sampleCount: number;
  note?: string;
}

export interface PainPointFinding {
  key: string;
  label: string;
  evidence: string;
  severityScore: number;
}

export interface StructuredScanPayload {
  summary?: string;
  competitors?: CompetitorFinding[];
  marketBenchmarks?: BenchmarkFinding[];
  painPoints?: PainPointFinding[];
}

export interface ActiveServiceDescriptor {
  serviceKey: string;
  label?: string;
  unitType?: string;
  ourPricePln?: number;
}

export interface SiteProfileParam {
  businessName?: string;
  nichePl?: string;
  nicheEn?: string;
  matchedIndustryId?: string;
  searchQueriesPl?: string[];
  searchQueriesEn?: string[];
}

export interface ScanRequestParams {
  city: string;
  country: string;
  countryCode?: string;
  industryId: IndustryId;
  radiusKm: number;
  locale: "pl" | "en";
  competitorUrls: string[];
  excludeHost?: string;
  services: ActiveServiceDescriptor[];
  siteProfile?: SiteProfileParam;
}

export interface FetchedSiteContext {
  url: string;
  title: string;
  text: string;
  hasPriceSignals: boolean;
}

export interface SerperCompetitorEntry {
  name: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  category?: string;
  mapUri?: string;
}

export interface SerperDiscoveryResult {
  urls: string[];
  gbpContext: string;
  mapsSources: GroundingSource[];
  places: SerperCompetitorEntry[];
}

export interface SerperMapPlace {
  title?: string;
  address?: string;
  rating?: number | string;
  ratingCount?: number | string;
  category?: string;
  website?: string;
  cid?: string | number;
}

export interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}
