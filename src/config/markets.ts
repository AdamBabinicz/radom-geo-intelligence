import type { Town } from "@/src/types/market";
import {
  INDUSTRY_TEMPLATES,
  type IndustryId,
  type IndustryServiceItem,
} from "./industries";

export interface TownGeo {
  name: Town | string;
  distKm: number;
  dxKm: number;
  dyKm: number;
  driveMin?: number;
  travelFeePln?: number;
  competitorsCount?: number;
  isRegionalHub?: boolean;
}

export type CompetitorBenchmarkRow = IndustryServiceItem;

export type MarketDataSource = "case-study" | "live-geo";

export interface MarketProfile {
  id: string;
  centerName: string;
  northDirectionLabel: string;
  baseCompetitorsCount: number;
  towns: TownGeo[];
  benchmarks: CompetitorBenchmarkRow[];
  source?: MarketDataSource;
  centerGps?: { lat: number; lon: number };
}

export const RADOM_UPHOLSTERY_MARKET: MarketProfile = {
  id: "radom-upholstery",
  centerName: "Radom",
  northDirectionLabel: "Warszawa",
  baseCompetitorsCount: 11,
  source: "case-study",
  centerGps: { lat: 51.4027, lon: 21.1471 },
  towns: [
    {
      name: "Jedlińsk",
      distKm: 14.0,
      dxKm: -2.1,
      dyKm: 12.8,
      driveMin: 16,
      travelFeePln: 25,
      competitorsCount: 2,
    },
    {
      name: "Przytyk",
      distKm: 18.2,
      dxKm: -16.4,
      dyKm: 7.5,
      driveMin: 22,
      travelFeePln: 25,
      competitorsCount: 1,
    },
    {
      name: "Wierzbica",
      distKm: 18.3,
      dxKm: -5.6,
      dyKm: -17.4,
      driveMin: 21,
      travelFeePln: 30,
      competitorsCount: 1,
    },
    {
      name: "Skaryszew",
      distKm: 12.6,
      dxKm: 7.2,
      dyKm: -10.4,
      driveMin: 15,
      travelFeePln: 20,
      competitorsCount: 2,
    },
    {
      name: "Pionki",
      distKm: 22.7,
      dxKm: 21.0,
      dyKm: 8.5,
      driveMin: 25,
      travelFeePln: 20,
      competitorsCount: 3,
    },
    {
      name: "Iłża",
      distKm: 27.4,
      dxKm: 6.6,
      dyKm: -26.6,
      driveMin: 28,
      travelFeePln: 35,
      competitorsCount: 2,
    },
    {
      name: "Szydłowiec",
      distKm: 27.8,
      dxKm: -20.1,
      dyKm: -19.2,
      driveMin: 29,
      travelFeePln: 35,
      competitorsCount: 2,
    },
    {
      name: "Kozienice",
      distKm: 34.1,
      dxKm: 28.0,
      dyKm: 20.0,
      driveMin: 35,
      travelFeePln: 35,
      competitorsCount: 4,
    },
    {
      name: "Skarżysko-Kam.",
      distKm: 38.0,
      dxKm: -11.0,
      dyKm: -36.4,
      competitorsCount: 6,
      isRegionalHub: true,
    },
    {
      name: "Grójec",
      distKm: 55.0,
      dxKm: -12.0,
      dyKm: 53.6,
      competitorsCount: 5,
      isRegionalHub: true,
    },
    {
      name: "Puławy",
      distKm: 65.0,
      dxKm: 63.8,
      dyKm: 12.5,
      competitorsCount: 7,
      isRegionalHub: true,
    },
    {
      name: "KIELCE",
      distKm: 74.0,
      dxKm: -17.5,
      dyKm: -71.9,
      competitorsCount: 18,
      isRegionalHub: true,
    },
    {
      name: "WARSZAWA",
      distKm: 99.0,
      dxKm: -7.5,
      dyKm: 98.7,
      competitorsCount: 64,
      isRegionalHub: true,
    },
  ],
  benchmarks: INDUSTRY_TEMPLATES.upholstery.services,
};

export function applyIndustryToMarket(
  market: MarketProfile,
  industryId: IndustryId,
): MarketProfile {
  const template = INDUSTRY_TEMPLATES[industryId];
  return {
    ...market,
    benchmarks: template.services,
  };
}

export function getTownTravelFeePln(
  market: MarketProfile,
  townName: string,
): number {
  if (townName === market.centerName) return 0;
  const town = market.towns.find((item) => item.name === townName);
  if (!town) return 0;
  if (typeof town.travelFeePln === "number") return town.travelFeePln;
  if (town.distKm <= 15) return 20;
  if (town.distKm <= 25) return 25;
  if (town.distKm <= 35) return 35;
  if (town.distKm <= 50) return 45;
  if (town.distKm <= 75) return 65;
  return 85;
}

export function getMarketMetrics(market: MarketProfile, radiusKm: number) {
  const localTowns = market.towns.filter((town) => !town.isRegionalHub);
  const localInRange = localTowns.filter((town) => town.distKm <= radiusKm);
  const hubsInRange = market.towns.filter(
    (town) => town.isRegionalHub && town.distKm <= radiusKm,
  );

  const serviceableTownsCount = 1 + localInRange.length;

  const townsCompetitors = [...localInRange, ...hubsInRange].reduce(
    (sum, town) => sum + (town.competitorsCount ?? 0),
    0,
  );
  const competitorsTracked = market.baseCompetitorsCount + townsCompetitors;

  const avgGapPct = market.benchmarks.length
    ? Math.round(
        market.benchmarks.reduce(
          (acc, row) =>
            acc +
            ((row.ourPricePln - row.localPricePln) / row.localPricePln) * 100,
          0,
        ) / market.benchmarks.length,
      )
    : 0;

  const farthestHubInRange = hubsInRange.length
    ? hubsInRange.reduce((prev, curr) =>
        curr.distKm > prev.distKm ? curr : prev,
      )
    : null;

  return {
    localTowns,
    localInRangeCount: localInRange.length,
    serviceableTownsCount,
    competitorsTracked,
    avgGapPct,
    farthestHubInRange,
  };
}
