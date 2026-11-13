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

const HEADERS = {
  "User-Agent": "NorthstarOps-GeoIntelligence/1.0 (Codegeist2026)",
  Accept: "application/json",
};

const SKIP_ADMIN_REGEX =
  /powiat|gmina|województwo|diecezj|metropoli|obszar|konurbacj|rzeczpospolita|gubernator|dzielnica|hrabstwo|county|state|diocese|region|district|parish|aglomeracj|urban area|greater |statistical area|landkreis|okres|republic|voivodeship|kingdom|empire|general government|borough|suburb/i;

async function geocodeCity(
  city: string,
): Promise<{ name: string; point: GeoPoint } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`;
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(6000),
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
  const q = `[out:json][timeout:7];(node["place"="town"](around:38000,${center.lat},${center.lon});node["place"="city"](around:95000,${center.lat},${center.lon}););out body 45;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(q)}`,
    signal: AbortSignal.timeout(6500),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);

  const data = (await res.json()) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      tags?: { name?: string; place?: string };
    }>;
  };
  const places: RawPlace[] = [];
  for (const el of data.elements ?? []) {
    const name = el.tags?.name?.trim();
    if (!name || typeof el.lat !== "number" || typeof el.lon !== "number")
      continue;
    const isCity = el.tags?.place === "city";
    places.push({
      name,
      lat: el.lat,
      lon: el.lon,
      pop: isCity ? 120000 : 18000,
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
  limit: number,
): Promise<RawPlace[]> {
  const sparql = `SELECT ?placeLabel ?lat ?lon ?pop WHERE { SERVICE wikibase:around { ?place wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${center.lon} ${center.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radKm}" . } ?place wdt:P1082 ?pop . FILTER(?pop > ${minPop}) ?place p:P625/psv:P625 [ wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon ] . SERVICE wikibase:label { bd:serviceParam wikibase:language "en,pl" . } } LIMIT ${limit}`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);

  const json = (await res.json()) as {
    results?: {
      bindings?: Array<{
        placeLabel?: { value: string };
        lat?: { value: string };
        lon?: { value: string };
        pop?: { value: string };
      }>;
    };
  };
  const out: RawPlace[] = [];
  for (const b of json.results?.bindings ?? []) {
    const name = b.placeLabel?.value?.trim();
    const lat = Number(b.lat?.value);
    const lon = Number(b.lon?.value);
    const pop = Number(b.pop?.value);
    if (
      !name ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      pop > 2500000
    )
      continue;
    out.push({ name, lat, lon, pop, isCity: pop >= 50000 });
  }
  return out;
}

async function fetchViaWikidata(center: GeoPoint): Promise<RawPlace[]> {
  const [near, hubs] = await Promise.all([
    queryWikidataRadius(center, 38, 2500, 60),
    queryWikidataRadius(center, 95, 22000, 60),
  ]);
  const merged = [...near, ...hubs];
  if (merged.length < 3) throw new Error("Wikidata returned too few places");
  return merged;
}

function buildDynamicTowns(
  centerName: string,
  center: GeoPoint,
  raw: RawPlace[],
): TownGeo[] {
  const seen = new Set<string>([centerName.toLowerCase()]);
  const candidates: Array<TownGeo & { pop: number; isCity: boolean }> = [];

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

  const localTowns = candidates
    .filter((t) => !t.isRegionalHub)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 8);

  const regionalHubs = candidates
    .filter((t) => t.isRegionalHub)
    .sort((a, b) => b.pop - a.pop || a.distKm - b.distKm)
    .slice(0, 5);

  return [...localTowns, ...regionalHubs].map(
    ({ pop: _p, isCity: _c, ...town }) => town,
  );
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
      towns.filter((t) => t.dyKm > 10).sort((a, b) => b.dyKm - a.dyKm)[0] ??
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
    const message =
      error instanceof Error ? error.message : "Geo lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
