import type { IndustryId } from "../../../config/industries";

export const GEMINI_ROUND_TIMEOUT_MS = 14_000;
export const EXTERNAL_MODEL_TIMEOUT_MS = 12_000;
export const EXTERNAL_ROUND_BUDGET_MS = 20_000;

export interface CouncilServiceInput {
  serviceKey: string;
  label: string;
  unitType: string;
  ourPricePln: number;
  localPricePln: number;
}

export interface CouncilCompetitorInput {
  name: string;
  rating?: number;
  reviewCount?: number;
  priceSummary: string;
  travelFeeNote?: string;
}

export interface CouncilPainPointInput {
  label: string;
  score: number;
  evidence?: string;
}

export interface CouncilRequestInput {
  city: string;
  industryId: IndustryId;
  industryLabel?: string;
  radiusKm: number;
  locale: "pl" | "en";
  avgGapPct: number;
  townsInRadius: string[];
  services: CouncilServiceInput[];
  competitors: CouncilCompetitorInput[];
  painPoints: CouncilPainPointInput[];
  humanNote?: string;
  lessonsLearned?: string[];
}

export interface CouncilPriceMove {
  serviceKey: string;
  label: string;
  currentPricePln: number;
  proposedPricePln: number;
  rationale: string;
}

export interface CouncilPriceAdjustment {
  serviceKey: string;
  label: string;
  currentPricePln: number;
  finalPricePln: number;
}

export interface CouncilDecisionOption {
  id: "safe" | "margin";
  title: string;
  summary: string;
  priceAdjustments: CouncilPriceAdjustment[];
  actionItems: string[];
}

export interface CouncilDebateResult {
  aiEnhanced: boolean;
  crossProviderUsed: boolean;
  fallbackNotice?: string;
  generatedAt: string;
  models: {
    strategist: string;
    critic: string;
    criticProvider: "groq" | "openai" | "gemini-isolated" | "deterministic";
  };
  round1Strategist: {
    thesis: string;
    campaignAngle: string;
    priceMoves: CouncilPriceMove[];
  };
  round2Critic: {
    verdict: "challenge" | "revise" | "caution";
    riskScore: number;
    objections: string[];
    counterProposals: string[];
  };
  round3Synthesis: {
    summaryForHuman: string;
    options: [CouncilDecisionOption, CouncilDecisionOption];
  };
}

export interface ExternalProviderConfig {
  provider: "groq" | "openai";
  endpoint: string;
  apiKey: string;
  models: string[];
}

export interface RawStrategistPayload {
  thesis?: string;
  campaignAngle?: string;
  priceMoves?: Array<{
    serviceKey?: string;
    label?: string;
    currentPricePln?: number;
    proposedPricePln?: number;
    rationale?: string;
  }>;
}

export interface RawCriticPayload {
  verdict?: string;
  riskScore?: number;
  objections?: string[];
  counterProposals?: string[];
}

export interface RawSynthesisOption {
  id?: string;
  title?: string;
  summary?: string;
  priceAdjustments?: Array<{
    serviceKey?: string;
    label?: string;
    currentPricePln?: number;
    finalPricePln?: number;
  }>;
  actionItems?: string[];
}

export interface RawSynthesisPayload {
  summaryForHuman?: string;
  options?: RawSynthesisOption[];
}
