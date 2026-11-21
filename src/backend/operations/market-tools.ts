import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  type IndustryId,
} from "../../config/industries";
import {
  getMarketMetrics,
  getTownTravelFeePln,
  RADOM_UPHOLSTERY_MARKET,
} from "../../config/markets";
import { estimateZoneTravelFeePln } from "../../lib/geo-math";
import {
  formatTemplate,
  resolveLocale,
  translations,
  type AppDictionary,
  type Locale,
} from "../../locales";
import type {
  CampaignSpec,
  CompetitorInsight,
  ServiceFeeInput,
  ServiceFeeQuote,
} from "../../types/market";
import type { ExtendedAnalysisInput } from "./atlassian-client";

const CAMPAIGN_KEYS: Record<
  IndustryId,
  {
    headlineKey: keyof AppDictionary;
    audienceKey: keyof AppDictionary;
    offerKey: keyof AppDictionary;
  }
> = {
  upholstery: {
    headlineKey: "campaignUpholsteryHeadline",
    audienceKey: "campaignUpholsteryAudience",
    offerKey: "campaignUpholsteryOffer",
  },
  hvac: {
    headlineKey: "campaignHvacHeadline",
    audienceKey: "campaignHvacAudience",
    offerKey: "campaignHvacOffer",
  },
  plumbing: {
    headlineKey: "campaignPlumbingHeadline",
    audienceKey: "campaignPlumbingAudience",
    offerKey: "campaignPlumbingOffer",
  },
};

export async function analyzeCompetitors(
  input: ExtendedAnalysisInput,
): Promise<{
  center: string;
  radiusKm: number;
  serviceableTownsCount: number;
  competitorsTracked: number;
  townsInRadius: string[];
  insights: CompetitorInsight[];
  sourceStatus: "demo";
}> {
  if (
    !input.center.trim() ||
    !Number.isFinite(input.radiusKm) ||
    input.radiusKm < 10 ||
    input.radiusKm > 100
  ) {
    throw new Error("Invalid center or radiusKm (expected 10-100)");
  }

  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const industry = INDUSTRY_TEMPLATES[input.industryId ?? "upholstery"];
  const centerTrimmed = input.center.trim();
  const isRadomReference =
    centerTrimmed.toLowerCase() ===
    RADOM_UPHOLSTERY_MARKET.centerName.toLowerCase();
  const metrics = getMarketMetrics(RADOM_UPHOLSTERY_MARKET, input.radiusKm);

  const townsInRadius =
    input.townsInRadius && input.townsInRadius.length > 0
      ? input.townsInRadius
      : isRadomReference
        ? [
            centerTrimmed,
            ...metrics.localTowns
              .filter((town) => town.distKm <= input.radiusKm)
              .map((town) => town.name),
          ]
        : [centerTrimmed];

  const serviceableTownsCount = townsInRadius.length;
  const competitorsTracked =
    typeof input.competitorsTracked === "number"
      ? input.competitorsTracked
      : metrics.competitorsTracked;

  const painPoints = industry.painPoints.map((p) => ({
    topic: t[p.topicKey],
    mentions: p.percent,
  }));

  const insights: CompetitorInsight[] = industry.services.map((svc, idx) => ({
    service: resolveServiceLabel(svc, t, locale),
    averagePricePln: svc.localPricePln,
    ourPricePln: svc.ourPricePln,
    sourceStatus: "demo",
    reviewPainPoints: painPoints.slice(idx % 2, (idx % 2) + 2),
  }));

  return {
    center: centerTrimmed,
    radiusKm: input.radiusKm,
    serviceableTownsCount,
    competitorsTracked,
    townsInRadius,
    sourceStatus: "demo",
    insights,
  };
}

export function calculateServiceFee(input: ServiceFeeInput): ServiceFeeQuote {
  const cleanTown = input.town.trim();
  if (
    !cleanTown ||
    !Number.isFinite(input.orderValue) ||
    input.orderValue < 0
  ) {
    throw new Error("Invalid service fee input");
  }

  const lowerTown = cleanTown.toLowerCase();
  const matchedRadomTown = RADOM_UPHOLSTERY_MARKET.towns.find(
    (t) => !t.isRegionalHub && t.name.toLowerCase() === lowerTown,
  );
  const hasExplicitDistance =
    typeof input.distanceKm === "number" &&
    Number.isFinite(input.distanceKm) &&
    input.distanceKm >= 0;

  let distanceKm = 0;
  let travelFeePln = 0;

  if (hasExplicitDistance) {
    distanceKm = Math.min(500, Math.round(input.distanceKm! * 10) / 10);
    travelFeePln = estimateZoneTravelFeePln(distanceKm);
  } else if (matchedRadomTown) {
    distanceKm = matchedRadomTown.distKm;
    travelFeePln = getTownTravelFeePln(
      RADOM_UPHOLSTERY_MARKET,
      matchedRadomTown.name,
    );
  }

  return {
    town: matchedRadomTown ? matchedRadomTown.name : cleanTown,
    orderValue: input.orderValue,
    distanceKm,
    travelFeePln,
    totalPln: Math.round((input.orderValue + travelFeePln) * 100) / 100,
    sourceStatus: "computed",
  };
}

export function generateLocalizedCampaign(input: {
  season: string;
  targetTowns: string[];
  industryId?: IndustryId;
  locale?: Locale;
}): CampaignSpec {
  if (!input.season.trim() || !input.targetTowns.length) {
    throw new Error("Invalid campaign request");
  }
  const locale = resolveLocale(input.locale);
  const t = translations[locale];
  const industryId = input.industryId ?? "upholstery";
  const keys = CAMPAIGN_KEYS[industryId];

  return {
    season: input.season,
    targetTowns: input.targetTowns,
    headline: formatTemplate(t[keys.headlineKey], { season: input.season }),
    audience: t[keys.audienceKey],
    offer: t[keys.offerKey],
    confluencePageTitle: formatTemplate(t.campaignConfluenceTitleTemplate, {
      season: input.season,
      towns: input.targetTowns.slice(0, 4).join(", "),
    }),
    sourceStatus: "draft",
  };
}
