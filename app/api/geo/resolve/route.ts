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
import { SUPPORTED_LOCALES, resolveLocale, type Locale } from "@/src/locales";

export const maxDuration = 30;

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  importance?: number;
  addresstype?: string;
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

const MAX_HUB_POPULATION = 4_500_000;

const SKIP_SUPER_ADMIN_REGEX =
  /powiat|gmina|województwo|diecezj|metropoli|obszar|konurbacj|rzeczpospolita|gubernator|dzielnica|hrabstwo|county|state|diocese|archdiocese|eparchy|exarchate|ordinariate|vicariate|region|parish|aglomeracj|agglomerat|agglomération|communauté|intercommunal|métropole|metropole|urban area|urban unit|built-up|greater |statistical area|landkreis|okres|republic|voivodeship|kingdom|empire|commonwealth|principality|duchy|archduchy|electorate|margraviate|palatinate|federation|confederation|protectorate|dominion|viceroyalty|governorate|macroregion|subregion|nuts|historical|\bformer\b|oblast|krai|autonomous|bundesland|stadtkreis|regierungsbezirk|borough|suburb|arrondissement|canton|département|departement|préfecture|prefecture|commune|comarca|provincia|comunidad|regione|città metropolitana|bezirk|unterbezirk|circoscrizione|municipality|constituency|unitary authority|\bpark$|\//i;

const SKIP_DISTRICT_REGEX = /\bdistrict\b/i;

function buildLanguagePriorityList(preferredLocale: Locale): string {
  const ordered = [
    preferredLocale,
    ...SUPPORTED_LOCALES.filter((loc) => loc !== preferredLocale),
  ];
  return ordered.join(",");
}

function resolveRequestLocale(
  explicitLocale: string | null,
  acceptLanguageHeader: string | null,
): Locale {
  if (explicitLocale) {
    return resolveLocale(explicitLocale);
  }
  if (acceptLanguageHeader) {
    const primary = acceptLanguageHeader.split(",")[0]?.split("-")[0]?.trim();
    if (primary) {
      return resolveLocale(primary);
    }
  }
  return resolveLocale();
}

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    const raw = await res.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      error.name === "TimeoutError" ||
      error.name === "AbortError" ||
      msg.includes("timed out") ||
      msg.includes("timeout")
    );
  }
  return false;
}

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
  languageList: string,
): Promise<{ name: string; point: GeoPoint } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=5&accept-language=${encodeURIComponent(languageList)}`;
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(7000),
  });
  if (res.status === 429 || res.status >= 500) {
    throw new Error(`Geocoding provider HTTP ${res.status}`);
  }
  if (!res.ok) return null;
  const items = await readJsonSafe<NominatimItem[]>(res);
  if (!items || !items.length) return null;

  const settlementTypes = new Set([
    "city",
    "town",
    "municipality",
    "village",
    "administrative",
  ]);
  const sorted = [...items].sort((a, b) => {
    const aTypeBonus = settlementTypes.has(a.addresstype ?? "") ? 0.25 : 0;
    const bTypeBonus = settlementTypes.has(b.addresstype ?? "") ? 0.25 : 0;
    return (
      (Number(b.importance) || 0) +
      bTypeBonus -
      ((Number(a.importance) || 0) + aTypeBonus)
    );
  });

  const best = sorted[0];
  const lat = Number(best.lat);
  const lon = Number(best.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const cleanName =
    best.name?.trim() ||
    best.display_name?.split(",")[0]?.trim() ||
    city.trim();
  return { name: cleanName, point: { lat, lon } };
}

async function fetchViaOverpass(center: GeoPoint): Promise<RawPlace[]> {
  const q = `[out:json][timeout:8];node["place"="town"](around:40000,${center.lat},${center.lon});out body;node["place"="city"](around:95000,${center.lat},${center.lon});out body;node["place"="village"]["population"](around:34000,${center.lat},${center.lon});out body 120;`;
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
  const data = await readJsonSafe<{
    elements?: Array<{
      lat?: number;
      lon?: number;
      tags?: { name?: string; place?: string; population?: string };
    }>;
  }>(res);
  if (!data) throw new Error("Overpass returned non-JSON payload");
  const places: RawPlace[] = [];
  for (const el of data.elements ?? []) {
    const name = el.tags?.name?.trim();
    if (!name || typeof el.lat !== "number" || typeof el.lon !== "number")
      continue;
    const placeType = el.tags?.place;
    const isCity = placeType === "city";
    const parsedPop = Number((el.tags?.population ?? "").replace(/[^\d]/g, ""));
    const pop =
      Number.isFinite(parsedPop) && parsedPop > 0
        ? parsedPop
        : isCity
          ? 120000
          : placeType === "town"
            ? 18000
            : 2500;
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
  languageList: string,
): Promise<RawPlace[]> {
  // Exclude dissolved historical entities (wdt:P576) globally without hardcoding place names
  const sparql = `SELECT ?placeLabel ?loc ?pop WHERE { SERVICE wikibase:around { ?place wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${center.lon.toFixed(4)} ${center.lat.toFixed(4)})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radKm}" . } ?place wdt:P1082 ?pop . FILTER(?pop > ${minPop} && ?pop < ${maxPop}) FILTER NOT EXISTS { ?place wdt:P576 ?dissolved . } SERVICE wikibase:label { bd:serviceParam wikibase:language "${languageList}" . } } LIMIT ${limit}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = await readJsonSafe<{
    results?: {
      bindings?: Array<{
        placeLabel?: { value: string };
        loc?: { value: string };
        pop?: { value: string };
      }>;
    };
  }>(res);
  if (!json) throw new Error("Wikidata returned non-JSON payload");
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

async function fetchViaWikidata(
  center: GeoPoint,
  languageList: string,
): Promise<RawPlace[]> {
  const [localRes, hubsRes] = await Promise.allSettled([
    queryWikidataRadius(
      center,
      38,
      1200,
      MAX_HUB_POPULATION,
      200,
      9000,
      languageList,
    ),
    queryWikidataRadius(
      center,
      95,
      35000,
      MAX_HUB_POPULATION,
      120,
      9000,
      languageList,
    ),
  ]);

  const local = localRes.status === "fulfilled" ? localRes.value : [];
  const hubs = hubsRes.status === "fulfilled" ? hubsRes.value : [];

  const nonDistrictNearCount = local.filter(
    (p) =>
      !SKIP_SUPER_ADMIN_REGEX.test(p.name) && !SKIP_DISTRICT_REGEX.test(p.name),
  ).length;

  let extraNear: RawPlace[] = [];
  if (nonDistrictNearCount < 6) {
    try {
      extraNear = await queryWikidataRadius(
        center,
        45,
        500,
        MAX_HUB_POPULATION,
        120,
        7500,
        languageList,
      );
    } catch {
      extraNear = [];
    }
  }

  const merged = [...local, ...extraNear, ...hubs];
  if (merged.length >= 3) return merged;

  const fallback = await queryWikidataRadius(
    center,
    60,
    300,
    MAX_HUB_POPULATION,
    100,
    8000,
    languageList,
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

function getRootToken(name: string): string {
  return name.toLowerCase().split(/[\s/-]+/)[0] ?? "";
}

function isTooCloseOrDuplicateRoot(
  candidate: CandidateTown,
  chosen: CandidateTown[],
  minGapKm: number,
): boolean {
  const candRoot = getRootToken(candidate.name);
  return chosen.some((c) => {
    const gap = Math.hypot(c.dxKm - candidate.dxKm, c.dyKm - candidate.dyKm);
    if (gap < minGapKm) return true;
    const chosenRoot = getRootToken(c.name);
    if (
      candRoot.length >= 4 &&
      candRoot === chosenRoot &&
      gap < Math.max(15, minGapKm * 2)
    ) {
      return true;
    }
    return false;
  });
}

function selectBalancedAcrossSectors(
  pool: CandidateTown[],
  maxCount: number,
  sectorCount: number,
  minGapKm: number,
  initialSelected: CandidateTown[] = [],
): CandidateTown[] {
  const selected: CandidateTown[] = [...initialSelected];
  const usedNames = new Set<string>(initialSelected.map((item) => item.name));
  const sectorCounts = new Map<number, number>();
  for (const item of initialSelected) {
    const s = getSectorIndex(item.dxKm, item.dyKm, sectorCount);
    sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1);
  }

  for (
    let sector = 0;
    sector < sectorCount && selected.length < maxCount;
    sector++
  ) {
    if ((sectorCounts.get(sector) ?? 0) > 0) continue;
    const match = pool.find(
      (item) =>
        !usedNames.has(item.name) &&
        getSectorIndex(item.dxKm, item.dyKm, sectorCount) === sector &&
        !isTooCloseOrDuplicateRoot(item, selected, minGapKm),
    );
    if (match) {
      selected.push(match);
      usedNames.add(match.name);
      sectorCounts.set(sector, 1);
    }
  }

  for (const item of pool) {
    if (selected.length >= maxCount) break;
    if (usedNames.has(item.name)) continue;
    const sector = getSectorIndex(item.dxKm, item.dyKm, sectorCount);
    if ((sectorCounts.get(sector) ?? 0) >= 2) continue;
    if (!isTooCloseOrDuplicateRoot(item, selected, Math.max(5.5, minGapKm))) {
      selected.push(item);
      usedNames.add(item.name);
      sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
    }
  }

  for (const item of pool) {
    if (selected.length >= maxCount) break;
    if (usedNames.has(item.name)) continue;
    const sector = getSectorIndex(item.dxKm, item.dyKm, sectorCount);
    if ((sectorCounts.get(sector) ?? 0) >= 3) continue;
    if (
      !isTooCloseOrDuplicateRoot(item, selected, Math.max(4, minGapKm * 0.75))
    ) {
      selected.push(item);
      usedNames.add(item.name);
      sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
    }
  }

  return selected;
}

function buildDynamicTowns(
  centerName: string,
  center: GeoPoint,
  raw: RawPlace[],
): TownGeo[] {
  const byName = new Map<string, RawPlace>();
  const centerKey = centerName.toLowerCase();
  for (const item of raw) {
    if (SKIP_SUPER_ADMIN_REGEX.test(item.name)) continue;
    const key = item.name.toLowerCase();
    if (key === centerKey) continue;
    const existing = byName.get(key);
    if (!existing || item.pop > existing.pop) {
      byName.set(key, item);
    }
  }

  const strictCandidates: CandidateTown[] = [];
  const districtCandidates: CandidateTown[] = [];

  for (const item of byName.values()) {
    const { dxKm, dyKm, distKm } = projectToLocalKm(center, {
      lat: item.lat,
      lon: item.lon,
    });
    if (distKm < 5 || distKm > 100) continue;

    const isHub = distKm > 40;
    const candidate: CandidateTown = {
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
    };

    if (SKIP_DISTRICT_REGEX.test(item.name)) {
      districtCandidates.push(candidate);
    } else {
      strictCandidates.push(candidate);
    }
  }

  const sortLocal = (arr: CandidateTown[]) =>
    arr
      .filter((t) => !t.isRegionalHub)
      .sort((a, b) => {
        const aSweetSpot = a.distKm >= 8 && a.distKm <= 34 ? 0 : 1;
        const bSweetSpot = b.distKm >= 8 && b.distKm <= 34 ? 0 : 1;
        if (aSweetSpot !== bSweetSpot) return aSweetSpot - bSweetSpot;
        if (b.pop !== a.pop) return b.pop - a.pop;
        return a.distKm - b.distKm;
      });

  const strictLocal = selectBalancedAcrossSectors(
    sortLocal(strictCandidates),
    8,
    8,
    6,
  );

  const localTowns = (
    strictLocal.length >= 4
      ? strictLocal
      : selectBalancedAcrossSectors(
          sortLocal(districtCandidates),
          8,
          8,
          6,
          strictLocal,
        )
  ).sort((a, b) => a.distKm - b.distKm);

  const hubPool = strictCandidates
    .filter((t) => t.isRegionalHub)
    .sort((a, b) => b.pop - a.pop || a.distKm - b.distKm);

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
  const requestLocale = resolveRequestLocale(
    searchParams.get("locale"),
    request.headers.get("accept-language"),
  );
  const languageList = buildLanguagePriorityList(requestLocale);

  if (!city) {
    return NextResponse.json(
      { code: "CITY_EMPTY", error: "Missing ?city= parameter" },
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
    const geocoded = await geocodeCity(city, languageList);
    if (!geocoded) {
      return NextResponse.json(
        { code: "CITY_NOT_FOUND", error: `City not found: ${city}` },
        { status: 404 },
      );
    }

    const rawPlaces = await Promise.any([
      fetchViaOverpass(geocoded.point),
      fetchViaWikidata(geocoded.point, languageList),
    ]);

    const towns = buildDynamicTowns(geocoded.name, geocoded.point, rawPlaces);
    const northernPool = towns.filter((t) => t.dyKm > 8);
    // Preserve hubPool's highest-population sort order before falling back to northernmost point
    const northernHub =
      northernPool.filter((t) => t.isRegionalHub)[0] ??
      northernPool.sort((a, b) => b.dyKm - a.dyKm)[0] ??
      towns.filter((t) => t.dyKm > 0).sort((a, b) => b.dyKm - a.dyKm)[0] ??
      towns[0];

    const market: MarketProfile = {
      id: `geo-${geocoded.name.toLowerCase().replace(/\s+/g, "-")}`,
      centerName: geocoded.name,
      northDirectionLabel: northernHub ? northernHub.name : geocoded.name,
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
          code: "GEO_TIMEOUT",
          error:
            "OpenStreetMap and Wikidata timed out for this area. Please try again in a moment.",
        },
        { status: 503 },
      );
    }
    if (isTimeoutError(error)) {
      return NextResponse.json(
        {
          code: "GEO_TIMEOUT",
          error: "Geocoding request timed out. Please try again in a moment.",
        },
        { status: 504 },
      );
    }
    const message =
      error instanceof Error ? error.message : "Geo lookup failed";
    return NextResponse.json(
      { code: "GEO_FAILED", error: message },
      { status: 502 },
    );
  }
}
