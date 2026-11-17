import { NextResponse } from "next/server";
import {
  RADOM_UPHOLSTERY_MARKET,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import {
  estimateDriveMinutes,
  estimateZoneTravelFeePln,
  projectToLocalKm,
  type GeoPoint,
} from "@/src/lib/geo-math";

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
}

interface RawPlace {
  name: string;
  lat: number;
  lon: number;
  pop: number;
  isCity: boolean;
}

type CandidateTown = TownGeo & {
  pop: number;
  isCity: boolean;
};

const HEADERS = {
  "User-Agent": "NorthstarOps-GeoIntelligence/1.1 (Codegeist2026)",
  Accept: "application/json",
};

const SKIP_ADMIN_REGEX =
  /powiat|gmina|województwo|diecezj|metropoli|obszar|konurbacj|rzeczpospolita|gubernator|dzielnica|hrabstwo|county|state|diocese|archdiocese|eparchy|exarchate|ordinariate|vicariate|region|district|parish|aglomeracj|agglomerat|agglomération|communauté|intercommunal|métropole|metropole|urban area|urban unit|greater |statistical area|landkreis|okres|republic|voivodeship|kingdom|empire|general government|borough|suburb|arrondissement|canton|département|departement|préfecture|prefecture|commune|comarca|bezirk|unterbezirk|circoscrizione|municipality|constituency|unitary authority|\bpark$/i;

function parseWktPoint(locValue: string | undefined): GeoPoint | null {
  if (!locValue) return null;
  const match = locValue.match(
    /^Point\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)$/i,
  );
  if (!match) return null;
  const lon = Number(match[1]);
  const lat = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function geocodeCity(
  city: string,
): Promise<{ name: string; point: GeoPoint } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`;
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) return null;
  const items = (await res.json()) as NominatimItem[];
  const first = items[0];
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cleanName =
    first.name?.trim() ||
    first.display_name?.split(",")[0]?.trim() ||
    city.trim();
  return { name: cleanName, point: { lat, lon } };
}

async function fetchViaOverpass(center: GeoPoint): Promise<RawPlace[]> {
  const q = `[out:json][timeout:8];(node["place"="town"](around:38000,${center.lat},${center.lon});node["place"="city"](around:90000,${center.lat},${center.lon}););out body 220;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(q)}`,
    signal: AbortSignal.timeout(8500),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      tags?: { name?: string; place?: string; population?: string };
    }>;
  };
  const places: RawPlace[] = [];
  for (const el of data.elements ?? []) {
    const name = el.tags?.name?.trim();
    if (!name || typeof el.lat !== "number" || typeof el.lon !== "number")
      continue;
    const isCity = el.tags?.place === "city";
    const parsedPop = Number((el.tags?.population ?? "").replace(/[^\d]/g, ""));
    const pop =
      Number.isFinite(parsedPop) && parsedPop > 0
        ? parsedPop
        : isCity
          ? 120000
          : 18000;
    places.push({
      name,
      lat: el.lat,
      lon: el.lon,
      pop,
      isCity,
    });
  }
  if (places.length < 3) throw new Error("Overpass returned too few places");
  return places;
}

async function queryWikidataRadius(
  center: GeoPoint,
  radKm: number,
  minPop: number,
  maxPop: number,
  limit: number,
  timeoutMs: number,
): Promise<RawPlace[]> {
  const sparql = `SELECT ?placeLabel ?loc ?pop WHERE { SERVICE wikibase:around { ?place wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${center.lon.toFixed(4)} ${center.lat.toFixed(4)})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radKm}" . } ?place wdt:P1082 ?pop . FILTER(?pop > ${minPop} && ?pop < ${maxPop}) SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pl" . } } LIMIT ${limit}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as {
    results?: {
      bindings?: Array<{
        placeLabel?: { value: string };
        loc?: { value: string };
        pop?: { value: string };
      }>;
    };
  };
  const out: RawPlace[] = [];
  for (const b of json.results?.bindings ?? []) {
    const name = b.placeLabel?.value?.trim();
    const point = parseWktPoint(b.loc?.value);
    const pop = Number(b.pop?.value);
    if (!name || /^Q\d+$/.test(name) || !point || !Number.isFinite(pop))
      continue;
    out.push({
      name,
      lat: point.lat,
      lon: point.lon,
      pop,
      isCity: pop >= 50000,
    });
  }
  return out;
}

async function fetchViaWikidata(center: GeoPoint): Promise<RawPlace[]> {
  const lonOffsetDeg =
    0.2 / Math.max(0.25, Math.cos((center.lat * Math.PI) / 180));
  const westCenter: GeoPoint = {
    lat: center.lat,
    lon: center.lon - lonOffsetDeg,
  };
  const eastCenter: GeoPoint = {
    lat: center.lat,
    lon: center.lon + lonOffsetDeg,
  };

  const [westRes, eastRes, hubsRes] = await Promise.allSettled([
    queryWikidataRadius(westCenter, 26, 3000, 380000, 80, 9000),
    queryWikidataRadius(eastCenter, 26, 3000, 380000, 80, 9000),
    queryWikidataRadius(center, 95, 40000, 600000, 100, 9000),
  ]);

  const west = westRes.status === "fulfilled" ? westRes.value : [];
  const east = eastRes.status === "fulfilled" ? eastRes.value : [];
  const hubs = hubsRes.status === "fulfilled" ? hubsRes.value : [];
  const merged = [...west, ...east, ...hubs];
  if (merged.length >= 3) return merged;

  const fallback = await queryWikidataRadius(
    center,
    55,
    500,
    1200000,
    80,
    8000,
  );
  if (fallback.length < 3) throw new Error("Wikidata returned too few places");
  return fallback;
}

function getSectorIndex(
  dxKm: number,
  dyKm: number,
  sectorCount: number,
): number {
  const angle = Math.atan2(dyKm, dxKm);
  const normalized = (angle + Math.PI) / (2 * Math.PI);
  return Math.min(sectorCount - 1, Math.floor(normalized * sectorCount));
}

function isTooClose(
  candidate: CandidateTown,
  chosen: CandidateTown[],
  minGapKm: number,
): boolean {
  return chosen.some(
    (c) =>
      Math.hypot(c.dxKm - candidate.dxKm, c.dyKm - candidate.dyKm) < minGapKm,
  );
}

function selectBalancedAcrossSectors(
  pool: CandidateTown[],
  maxCount: number,
  sectorCount: number,
  minGapKm: number,
): CandidateTown[] {
  const selected: CandidateTown[] = [];
  const usedNames = new Set<string>();
  const usedSectors = new Set<number>();

  for (
    let sector = 0;
    sector < sectorCount && selected.length < maxCount;
    sector++
  ) {
    const match = pool.find(
      (item) =>
        !usedNames.has(item.name) &&
        getSectorIndex(item.dxKm, item.dyKm, sectorCount) === sector &&
        !isTooClose(item, selected, minGapKm),
    );
    if (match) {
      selected.push(match);
      usedNames.add(match.name);
      usedSectors.add(sector);
    }
  }

  for (const item of pool) {
    if (selected.length >= maxCount) break;
    if (usedNames.has(item.name)) continue;
    const sector = getSectorIndex(item.dxKm, item.dyKm, sectorCount);
    if (usedSectors.size < sectorCount && usedSectors.has(sector)) continue;
    if (!isTooClose(item, selected, minGapKm)) {
      selected.push(item);
      usedNames.add(item.name);
    }
  }

  for (const item of pool) {
    if (selected.length >= maxCount) break;
    if (usedNames.has(item.name)) continue;
    if (!isTooClose(item, selected, Math.max(2, minGapKm * 0.45))) {
      selected.push(item);
      usedNames.add(item.name);
    }
  }

  return selected;
}

function buildDynamicTowns(
  centerName: string,
  center: GeoPoint,
  raw: RawPlace[],
): TownGeo[] {
  const seen = new Set<string>([centerName.toLowerCase()]);
  const candidates: CandidateTown[] = [];

  for (const item of raw) {
    if (SKIP_ADMIN_REGEX.test(item.name)) continue;
    const key = item.name.toLowerCase();
    if (seen.has(key)) continue;

    const { dxKm, dyKm, distKm } = projectToLocalKm(center, {
      lat: item.lat,
      lon: item.lon,
    });
    if (distKm < 8 || distKm > 100) continue;

    seen.add(key);
    const isHub = distKm > 40;
    candidates.push({
      name: item.isCity && isHub ? item.name.toUpperCase() : item.name,
      distKm,
      dxKm,
      dyKm,
      driveMin: estimateDriveMinutes(distKm),
      travelFeePln: estimateZoneTravelFeePln(distKm),
      competitorsCount: item.isCity ? 18 : distKm <= 25 ? 3 : 2,
      isRegionalHub: isHub,
      pop: item.pop,
      isCity: item.isCity,
    });
  }

  const localPool = candidates
    .filter((t) => !t.isRegionalHub)
    .sort((a, b) => {
      const aSweetSpot = a.distKm >= 10 && a.distKm <= 34 ? 0 : 1;
      const bSweetSpot = b.distKm >= 10 && b.distKm <= 34 ? 0 : 1;
      if (aSweetSpot !== bSweetSpot) return aSweetSpot - bSweetSpot;
      if (b.pop !== a.pop) return b.pop - a.pop;
      return a.distKm - b.distKm;
    });

  const hubPool = candidates
    .filter((t) => t.isRegionalHub)
    .sort((a, b) => b.pop - a.pop || a.distKm - b.distKm);

  const localTowns = selectBalancedAcrossSectors(localPool, 8, 8, 5).sort(
    (a, b) => a.distKm - b.distKm,
  );
  const regionalHubs = selectBalancedAcrossSectors(hubPool, 5, 5, 16);

  return [...localTowns, ...regionalHubs].map((town) => ({
    name: town.name,
    distKm: town.distKm,
    dxKm: town.dxKm,
    dyKm: town.dyKm,
    driveMin: town.driveMin,
    travelFeePln: town.travelFeePln,
    competitorsCount: town.competitorsCount,
    isRegionalHub: town.isRegionalHub,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city")?.trim() ?? "";

  if (!city) {
    return NextResponse.json(
      { error: "Missing ?city= parameter" },
      { status: 400 },
    );
  }

  if (city.toLowerCase() === "radom") {
    return NextResponse.json({
      source: "case-study",
      market: RADOM_UPHOLSTERY_MARKET,
      centerGps: { lat: 51.4027, lon: 21.1471 },
    });
  }

  try {
    const geocoded = await geocodeCity(city);
    if (!geocoded) {
      return NextResponse.json(
        { error: `City not found: ${city}` },
        { status: 404 },
      );
    }

    const rawPlaces = await Promise.any([
      fetchViaOverpass(geocoded.point),
      fetchViaWikidata(geocoded.point),
    ]);

    const towns = buildDynamicTowns(geocoded.name, geocoded.point, rawPlaces);
    const northernHub =
      towns.filter((t) => t.dyKm > 8).sort((a, b) => b.dyKm - a.dyKm)[0] ??
      towns.filter((t) => t.dyKm > 0).sort((a, b) => b.dyKm - a.dyKm)[0] ??
      towns[0];

    const market: MarketProfile = {
      id: `geo-${geocoded.name.toLowerCase().replace(/\s+/g, "-")}`,
      centerName: geocoded.name,
      northDirectionLabel: northernHub ? northernHub.name : "North",
      baseCompetitorsCount: 12,
      towns,
      benchmarks: RADOM_UPHOLSTERY_MARKET.benchmarks,
    };

    return NextResponse.json(
      { source: "live-geo", market, centerGps: geocoded.point },
      { headers: { "Cache-Control": "public, s-maxage=3600" } },
    );
  } catch (error) {
    if (error instanceof AggregateError) {
      return NextResponse.json(
        {
          error:
            "OpenStreetMap and Wikidata timed out for this area. Please try again in a moment.",
        },
        { status: 503 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Geo lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
