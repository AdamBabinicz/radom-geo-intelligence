import {
  INDUSTRY_TEMPLATES,
  type IndustryId,
  type IndustryServiceItem,
} from "@/src/config/industries";
import {
  applyIndustryToMarket,
  getMarketMetrics,
  type MarketProfile,
} from "@/src/config/markets";
import type { AppDictionary, Locale } from "@/src/locales";
import type { IndustryControlMode } from "../features/market-controls/market-switcher";
import type { LiveScanWithNiche, SiteProfile } from "./types-and-helpers";

export interface IndustryPresentation {
  trimmedCustomNiche: string;
  hasManualCustomNiche: boolean;
  isWebsiteAutoNiche: boolean;
  industryMode: IndustryControlMode;
  activeIndustryLabel: string;
  detectedIndustryLabel?: string;
}

export function deriveIndustryPresentation(params: {
  locale: Locale;
  t: AppDictionary;
  industryId: IndustryId;
  customNiche: string | null;
  siteProfile: SiteProfile | null;
  liveScan: LiveScanWithNiche | null;
}): IndustryPresentation {
  const { locale, t, industryId, customNiche, siteProfile, liveScan } = params;
  const trimmedCustomNiche = (customNiche ?? "").trim();
  const hasManualCustomNiche = trimmedCustomNiche.length > 0;

  const isWebsiteAutoNiche =
    Boolean(liveScan?.detectedIndustryLabel) ||
    Boolean(
      siteProfile &&
      (siteProfile.matchedIndustryId === "custom" ||
        (siteProfile.matchedIndustryId &&
          siteProfile.matchedIndustryId !== industryId)),
    );

  const industryMode: IndustryControlMode = hasManualCustomNiche
    ? "custom"
    : isWebsiteAutoNiche
      ? "auto"
      : "preset";

  const detectedSiteNicheLabel =
    liveScan?.detectedIndustryLabel ||
    (siteProfile
      ? locale === "pl"
        ? siteProfile.nichePl
        : siteProfile.nicheEn
      : "");

  const activeIndustryLabel = hasManualCustomNiche
    ? trimmedCustomNiche
    : isWebsiteAutoNiche && detectedSiteNicheLabel
      ? detectedSiteNicheLabel
      : t[INDUSTRY_TEMPLATES[industryId].labelKey];

  const detectedIndustryLabel =
    isWebsiteAutoNiche || hasManualCustomNiche
      ? activeIndustryLabel
      : undefined;

  return {
    trimmedCustomNiche,
    hasManualCustomNiche,
    isWebsiteAutoNiche,
    industryMode,
    activeIndustryLabel,
    detectedIndustryLabel,
  };
}

export function buildActiveMarketProfile(params: {
  baseMarket: MarketProfile;
  industryId: IndustryId;
  hasManualCustomNiche: boolean;
  isWebsiteAutoNiche: boolean;
  syncedCatalog: IndustryServiceItem[] | null;
  liveScan: LiveScanWithNiche | null;
  scannedBenchmarks: Record<string, number>;
  approvedPriceOverrides: Record<string, number>;
}): { isCaseStudy: boolean; market: MarketProfile } {
  const {
    baseMarket,
    industryId,
    hasManualCustomNiche,
    isWebsiteAutoNiche,
    syncedCatalog,
    liveScan,
    scannedBenchmarks,
    approvedPriceOverrides,
  } = params;

  const baseIndustryMarket = applyIndustryToMarket(baseMarket, industryId);
  const isCaseStudy =
    (baseIndustryMarket.source ?? "case-study") === "case-study";

  const activeBenchmarksSource = hasManualCustomNiche
    ? []
    : syncedCatalog !== null
      ? syncedCatalog
      : isWebsiteAutoNiche
        ? []
        : baseIndustryMarket.benchmarks;

  const hasLiveAiScan = Boolean(liveScan?.aiEnhanced);
  const market: MarketProfile = {
    ...baseIndustryMarket,
    benchmarks: activeBenchmarksSource.map((row) => {
      const scanned = scannedBenchmarks[row.serviceKey];
      const resolvedLocalPrice =
        typeof scanned === "number" && scanned > 0
          ? scanned
          : hasLiveAiScan && (row.isLiveDiscovered || !isCaseStudy)
            ? 0
            : row.localPricePln;
      const approvedOurPrice = approvedPriceOverrides[row.serviceKey];
      return {
        ...row,
        ourPricePln:
          typeof approvedOurPrice === "number" && approvedOurPrice > 0
            ? approvedOurPrice
            : row.ourPricePln,
        localPricePln: resolvedLocalPrice,
      };
    }),
  };

  return { isCaseStudy, market };
}

export function computeGapSummary(
  market: MarketProfile,
  avgGapPct: number,
): { hasComparableBenchmarks: boolean; gapMetricLabel: string } {
  const hasComparableBenchmarks = market.benchmarks.some(
    (row) => row.localPricePln > 0,
  );
  const gapMetricLabel = !hasComparableBenchmarks
    ? "—"
    : avgGapPct < 0
      ? `−${Math.abs(avgGapPct)}%`
      : avgGapPct === 0
        ? "0%"
        : `+${avgGapPct}%`;

  return { hasComparableBenchmarks, gapMetricLabel };
}

export function collectTownsInRadius(
  market: MarketProfile,
  radiusKm: number,
): string[] {
  const metrics = getMarketMetrics(market, radiusKm);
  return [
    market.centerName,
    ...metrics.localTowns
      .filter((town) => town.distKm <= radiusKm)
      .map((town) => town.name),
  ];
}
