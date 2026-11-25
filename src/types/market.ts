import type { DisplayCurrency } from "../lib/currency";
import type { Locale } from "../locales";

export type Town =
  | "Radom"
  | "Pionki"
  | "Szydłowiec"
  | "Skaryszew"
  | "Jedlińsk"
  | "Wierzbica"
  | "Iłża"
  | "Kozienice";

export interface CompetitorAnalysisInput {
  center: string;
  radiusKm: number;
}

export interface CompetitorInsight {
  service: string;
  averagePricePln: number;
  ourPricePln: number;
  currency?: DisplayCurrency;
  averagePrice?: number;
  ourPrice?: number;
  formattedAveragePrice?: string;
  formattedOurPrice?: string;
  reviewPainPoints: Array<{ topic: string; mentions: number }>;
  sourceStatus: "demo" | "connected";
}

export interface ServiceFeeInput {
  town: string;
  orderValue: number;
  distanceKm?: number;
  locale?: Locale;
  currency?: DisplayCurrency;
}

export interface ServiceFeeQuote {
  town: string;
  orderValue: number;
  currency?: DisplayCurrency;
  distanceKm?: number;
  travelFeePln: number;
  totalPln: number;
  travelFee?: number;
  total?: number;
  formattedTravelFee?: string;
  formattedTotal?: string;
  sourceStatus: "computed" | "demo" | "connected";
}

export interface CampaignSpec {
  season: string;
  targetTowns: string[];
  headline: string;
  audience: string;
  offer: string;
  confluencePageTitle: string;
  sourceStatus: "draft" | "published";
}

export interface ConfluenceExportResult {
  pageTitle: string;
  spaceKey: string;
  summary: string;
  targetTowns: string[];
  radiusKm: number;
  status: "draft" | "published";
  pageUrl?: string;
}

export interface JiraEpicResult {
  epicKey: string;
  projectKey: string;
  epicTitle: string;
  subtasks: Array<{ key: string; summary: string; url?: string }>;
  radiusKm: number;
  status: "draft" | "created";
  epicUrl?: string;
}
