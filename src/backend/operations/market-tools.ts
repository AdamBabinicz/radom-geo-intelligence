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
import {
  estimateZoneTravelFeePln,
  haversineDistanceKm,
  type GeoPoint,
} from "../../lib/geo-math";
import {
  formatTemplate,
  resolveLocale,
  SUPPORTED_LOCALES,
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

const GEO_LOOKUP_TIMEOUT_MS = 3500;
const OSM_USER_AGENT = "NorthstarOps-GeoIntelligence/1.1 (Codegeist2026)";

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

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function normalizePlaceKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickLocalizedOsmName(
  tags: Record<string, string> | undefined,
  locale: Locale,
): string | null {
  if (!tags) return null;
  const localized = tags[`name:${locale}`]?.trim();
  if (localized) return localized;
  const english = tags["name:en"]?.trim();
  if (english) return english;
  const fallback = tags.name?.trim();
  return fallback || null;
}

async function resolveRemoteTownsInRadius(
  city: string,
  radiusKm: number,
  locale: Locale,
): Promise<{ centerName: string; towns: string[]; liveResolved: boolean }> {
  const acceptLang = [
    locale,
    ...SUPPORTED_LOCALES.filter((loc) => loc !== locale),
  ].join(",");

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(city)}&limit=1`;
    const nomRes = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": OSM_USER_AGENT,
        Accept: "application/json",
        "Accept-Language": acceptLang,
      },
      signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS),
    });
    if (!nomRes.ok) {
      return { centerName: city, towns: [city], liveResolved: false };
    }

    const places = (await nomRes.json()) as NominatimPlace[];
    const first = Array.isArray(places) ? places[0] : undefined;
    const lat = first ? Number(first.lat) : Number.NaN;
    const lon = first ? Number(first.lon) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { centerName: city, towns: [city], liveResolved: false };
    }

    const centerPoint: GeoPoint = { lat, lon };
    const resolvedCenterName =
      first?.name?.trim() || first?.display_name?.split(",")[0]?.trim() || city;

    const radiusMeters = Math.round(radiusKm * 1000);
    const overpassQuery = `[out:json][timeout:3];(node["place"~"^(city|town|village)$"](around:${radiusMeters},${lat},${lon});way["place"~"^(city|town)$"](around:${radiusMeters},${lat},${lon}););out center 40;`;

    const overRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "User-Agent": OSM_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
      signal: AbortSignal.timeout(GEO_LOOKUP_TIMEOUT_MS),
    });

    if (!overRes.ok) {
      return {
        centerName: resolvedCenterName,
        towns: [resolvedCenterName],
        liveResolved: true,
      };
    }

    const overData = (await overRes.json()) as {
      elements?: OverpassElement[];
    };
    const elements = Array.isArray(overData?.elements) ? overData.elements : [];

    const seen = new Set<string>([normalizePlaceKey(resolvedCenterName)]);
    const candidates: Array<{ name: string; distKm: number }> = [];

    for (const el of elements) {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (
        typeof elLat !== "number" ||
        typeof elLon !== "number" ||
        !Number.isFinite(elLat) ||
        !Number.isFinite(elLon)
      ) {
        continue;
      }
      const name = pickLocalizedOsmName(el.tags, locale);
      if (!name) continue;

      const key = normalizePlaceKey(name);
      if (!key || seen.has(key)) continue;

      const distKm = haversineDistanceKm(centerPoint, {
        lat: elLat,
        lon: elLon,
      });
      if (distKm < 1.5 || distKm > radiusKm) continue;

      seen.add(key);
      candidates.push({ name, distKm });
    }

    candidates.sort((a, b) => a.distKm - b.distKm);
    const towns = [
      resolvedCenterName,
      ...candidates.slice(0, 8).map((c) => c.name),
    ];

    return {
      centerName: resolvedCenterName,
      towns,
      liveResolved: true,
    };
  } catch {
    return { centerName: city, towns: [city], liveResolved: false };
  }
}

export async function analyzeCompetitors(
  input: ExtendedAnalysisInput,
): Promise<{
  center: string;
  radiusKm: number;
  serviceableTownsCount: number;
  competitorsTracked: number;
  townsInRadius: string[];
  insights: CompetitorInsight[];
  sourceStatus: "demo" | "connected";
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
  const industryId: IndustryId =
    input.industryId && input.industryId in INDUSTRY_TEMPLATES
      ? input.industryId
      : "upholstery";
  const industry = INDUSTRY_TEMPLATES[industryId];
  const centerTrimmed = input.center.trim();
  const isRadomReference =
    centerTrimmed.toLowerCase() ===
    RADOM_UPHOLSTERY_MARKET.centerName.toLowerCase();
  const metrics = getMarketMetrics(RADOM_UPHOLSTERY_MARKET, input.radiusKm);

  const hasExplicitTowns =
    Array.isArray(input.townsInRadius) && input.townsInRadius.length > 0;

  let resolvedCenter = centerTrimmed;
  let townsInRadius: string[];
  let sourceStatus: "demo" | "connected" = "connected";

  if (hasExplicitTowns) {
    townsInRadius = input.townsInRadius!;
  } else if (isRadomReference) {
    townsInRadius = [
      centerTrimmed,
      ...metrics.localTowns
        .filter((town) => town.distKm <= input.radiusKm)
        .map((town) => town.name),
    ];
  } else {
    const remote = await resolveRemoteTownsInRadius(
      centerTrimmed,
      input.radiusKm,
      locale,
    );
    resolvedCenter = remote.centerName;
    townsInRadius = remote.towns;
    sourceStatus = remote.liveResolved ? "connected" : "demo";
  }

  const serviceableTownsCount = townsInRadius.length;
  const hasExplicitCompetitors =
    typeof input.competitorsTracked === "number" &&
    Number.isFinite(input.competitorsTracked) &&
    input.competitorsTracked >= 0;

  const competitorsTracked = hasExplicitCompetitors
    ? input.competitorsTracked!
    : isRadomReference
      ? metrics.competitorsTracked
      : Math.max(4, Math.round(serviceableTownsCount * 2.5));

  const painPoints = industry.painPoints.map((p) => ({
    topic: t[p.topicKey],
    mentions: p.percent,
  }));

  const insights: CompetitorInsight[] = industry.services.map((svc, idx) => ({
    service: resolveServiceLabel(svc, t, locale),
    averagePricePln: svc.localPricePln,
    ourPricePln: svc.ourPricePln,
    sourceStatus,
    reviewPainPoints: painPoints.slice(idx % 2, (idx % 2) + 2),
  }));

  return {
    center: resolvedCenter,
    radiusKm: input.radiusKm,
    serviceableTownsCount,
    competitorsTracked,
    townsInRadius,
    sourceStatus,
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
  const industryId: IndustryId =
    input.industryId && input.industryId in CAMPAIGN_KEYS
      ? input.industryId
      : "upholstery";
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
