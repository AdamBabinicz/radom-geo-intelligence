import type { IndustryId } from "@/src/config/industries";
import {
  CURRENCY_LINE_RE,
  deduplicateSources,
  getNormalizedHostFromUrl,
  isAggregatorHost,
  isExcludedCompetitorWebsite,
  isSafePublicUrl,
  normalizeHost,
} from "./request-and-safety";
import type {
  ActiveServiceDescriptor,
  GroundingSource,
  SerperCompetitorEntry,
  SerperDiscoveryResult,
  SerperMapPlace,
  SerperOrganicResult,
  SiteProfileParam,
} from "./types";

export function cleanServicePhrase(rawLabel: string): string {
  return rawLabel
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:od|from)\s+\d+(?:[.,]\d+)?\s*(?:zł|pln|eur|usd)?/gi, " ")
    .replace(/[-–—/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDynamicQueriesFromServices(
  city: string,
  services: ActiveServiceDescriptor[],
  siteProfile: SiteProfileParam | undefined,
  locale: "pl" | "en",
): string[] {
  const stems: string[] = [];
  const profileStems =
    locale === "pl"
      ? (siteProfile?.searchQueriesPl ?? [])
      : (siteProfile?.searchQueriesEn ?? []);

  for (const stem of profileStems) {
    const cleaned = stem.trim();
    if (cleaned && !stems.includes(cleaned)) stems.push(cleaned);
  }

  if (stems.length < 3) {
    const niche = locale === "pl" ? siteProfile?.nichePl : siteProfile?.nicheEn;
    if (niche) {
      const cleanedNiche = cleanServicePhrase(niche);
      if (cleanedNiche && !stems.includes(cleanedNiche)) {
        stems.push(cleanedNiche);
      }
    }
  }

  if (stems.length < 3) {
    for (const svc of services) {
      if (!svc.label) continue;
      const phrase = cleanServicePhrase(svc.label);
      if (phrase.length >= 4 && !stems.includes(phrase)) {
        stems.push(phrase);
      }
      if (stems.length >= 4) break;
    }
  }

  const cityLower = city.toLowerCase();
  const localized = stems.slice(0, 4).map((stem, idx) => {
    const hasCity = stem.toLowerCase().includes(cityLower);
    const base = hasCity ? stem : `${stem} ${city}`;
    return idx === 0
      ? `${base} ${locale === "pl" ? "cennik" : "prices"}`
      : base;
  });
  return localized;
}

export function buildSearchQueries(
  city: string,
  industryId: IndustryId,
  locale: "pl" | "en",
  isCustomSiteNiche: boolean,
  services: ActiveServiceDescriptor[],
  siteProfile?: SiteProfileParam,
  countryCode?: string,
): string[] {
  const queryLocale: "pl" | "en" =
    countryCode === "pl" || (!countryCode && locale === "pl") ? "pl" : "en";

  if (isCustomSiteNiche) {
    const dynamic = buildDynamicQueriesFromServices(
      city,
      services,
      siteProfile,
      queryLocale,
    );
    if (dynamic.length > 0) return dynamic;
  }

  if (queryLocale === "pl") {
    const map: Record<IndustryId, string[]> = {
      upholstery: [
        `pranie dywanów ${city}`,
        `pranie tapicerki meblowej ${city}`,
        `pranie kanap narożników ${city} cennik`,
        `czyszczenie wykładzin materacy ${city}`,
      ],
      hvac: [
        `montaż klimatyzacji ${city}`,
        `serwis klimatyzacji pompy ciepła ${city}`,
        `przegląd klimatyzacji ${city} cennik`,
      ],
      plumbing: [
        `hydraulik ${city}`,
        `usługi hydrauliczne ${city}`,
        `pogotowie hydrauliczne ${city} cennik`,
      ],
    };
    return map[industryId];
  }

  const mapEn: Record<IndustryId, string[]> = {
    upholstery: [
      `carpet cleaning ${city}`,
      `upholstery cleaning ${city}`,
      `sofa couch cleaning ${city} prices`,
      `rug mattress cleaning ${city}`,
    ],
    hvac: [
      `ac tune up inspection ${city} prices`,
      `hvac service repair ${city}`,
      `heat pump service ${city} cost`,
      `air duct cleaning ${city} prices`,
    ],
    plumbing: [
      `plumber ${city}`,
      `plumbing repair ${city}`,
      `emergency plumber ${city} rates`,
    ],
  };
  return mapEn[industryId];
}

export function filterCandidateUrls(
  rawCandidates: string[],
  excludeHost?: string,
  limit = 10,
): string[] {
  const result: string[] = [];
  const seenHosts = new Set<string>();

  for (const raw of rawCandidates) {
    const safe = isSafePublicUrl(raw);
    if (!safe) continue;
    const host = normalizeHost(safe.hostname);
    if (isAggregatorHost(host)) continue;
    if (excludeHost && host === excludeHost) continue;
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);
    result.push(safe.toString());
    if (result.length >= limit) break;
  }
  return result;
}

export async function discoverViaSerper(
  queries: string[],
  city: string,
  country: string,
  countryCode: string | undefined,
  locale: "pl" | "en",
  excludeHost?: string,
): Promise<SerperDiscoveryResult> {
  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (!serperKey) {
    return { urls: [], gbpContext: "", mapsSources: [], places: [] };
  }

  const gl = countryCode || (locale === "pl" ? "pl" : "us");
  const hl = countryCode === "pl" ? "pl" : countryCode ? "en" : locale;
  const searchLocation = city && country ? `${city}, ${country}` : country;

  const collectedUrls: string[] = [];
  const gbpLines: string[] = [];
  const organicSnippets: string[] = [];
  const seenKeys = new Set<string>();
  const seenMapUris = new Set<string>();
  const seenSnippetLinks = new Set<string>();
  const mapsSources: GroundingSource[] = [];
  const places: SerperCompetitorEntry[] = [];

  const mapsTasks = queries.slice(0, 2).map(async (q) => {
    try {
      const res = await fetch("https://google.serper.dev/maps", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q, gl, hl }),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return [] as SerperMapPlace[];
      const data = (await res.json()) as { places?: SerperMapPlace[] };
      return data.places ?? [];
    } catch {
      return [] as SerperMapPlace[];
    }
  });

  const searchTasks = queries.map(async (q) => {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q,
          gl,
          hl,
          location: searchLocation,
          num: 10,
        }),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        organic?: SerperOrganicResult[];
        places?: SerperMapPlace[];
      };
    } catch {
      return null;
    }
  });

  const [mapsResults, searchResults] = await Promise.all([
    Promise.all(mapsTasks),
    Promise.all(searchTasks),
  ]);

  const registerPlace = (place: SerperMapPlace) => {
    const title = place.title?.trim();
    if (!title) return;
    if (isExcludedCompetitorWebsite(place.website, excludeHost)) return;

    const cidStr = place.cid != null ? String(place.cid).trim() : "";
    const hostKey = getNormalizedHostFromUrl(place.website);
    const dedupeKeys = [
      cidStr ? `cid:${cidStr}` : "",
      hostKey ? `host:${hostKey}` : "",
      `name:${title.toLowerCase()}`,
    ].filter(Boolean);

    const alreadyRegistered = dedupeKeys.some((k) => seenKeys.has(k));
    dedupeKeys.forEach((k) => seenKeys.add(k));

    const mapUri = cidStr
      ? `https://www.google.com/maps?cid=${encodeURIComponent(cidStr)}`
      : undefined;

    if (!alreadyRegistered) {
      const ratingNum = Number(place.rating);
      const countNum = Number(place.ratingCount);
      const validRating =
        Number.isFinite(ratingNum) && ratingNum > 0 && ratingNum <= 5
          ? Math.round(ratingNum * 10) / 10
          : undefined;
      const validCount =
        Number.isFinite(countNum) && countNum > 0
          ? Math.round(countNum)
          : undefined;

      places.push({
        name: title,
        website: place.website?.trim() || mapUri,
        rating: validRating,
        reviewCount: validCount,
        address: place.address?.trim() || undefined,
        category: place.category?.trim() || undefined,
        mapUri,
      });

      const parts = [
        `Name: ${title}`,
        validRating ? `Rating: ${validRating}` : "",
        validCount ? `Reviews: ${validCount}` : "",
        place.address ? `Address: ${place.address}` : "",
        place.category ? `Category: ${place.category}` : "",
        place.website ? `Website: ${place.website}` : "",
      ].filter(Boolean);
      gbpLines.push(`- ${parts.join(" | ")}`);
    }

    if (place.website) {
      collectedUrls.push(place.website);
    } else if (mapUri && !seenMapUris.has(mapUri)) {
      seenMapUris.add(mapUri);
      mapsSources.push({
        title: `${title} (Google Maps)`,
        uri: mapUri,
      });
    }
  };

  for (const list of mapsResults) {
    for (const place of list) registerPlace(place);
  }

  for (const sr of searchResults) {
    if (!sr) continue;
    for (const place of sr.places ?? []) registerPlace(place);

    for (const item of sr.organic ?? []) {
      const link = item.link?.trim();
      if (!link) continue;
      if (isExcludedCompetitorWebsite(link, excludeHost)) continue;
      collectedUrls.push(link);

      const safeLink = isSafePublicUrl(link);
      if (!safeLink || isAggregatorHost(safeLink.hostname)) continue;

      const snippet = item.snippet?.replace(/\s+/g, " ").trim() ?? "";
      const title = item.title?.replace(/\s+/g, " ").trim() ?? "";
      if (
        snippet &&
        CURRENCY_LINE_RE.test(`${title} ${snippet}`) &&
        !seenSnippetLinks.has(link)
      ) {
        seenSnippetLinks.add(link);
        organicSnippets.push(
          `- ${title.slice(0, 65)} (${link}): ${snippet.slice(0, 180)}`,
        );
      }
    }
  }

  const contextSections: string[] = [];
  if (gbpLines.length > 0) {
    contextSections.push(
      `=== GOOGLE BUSINESS PROFILES (MAPS) ===\n${gbpLines.slice(0, 15).join("\n")}`,
    );
  }
  if (organicSnippets.length > 0) {
    contextSections.push(
      `=== SEARCH PRICE SNIPPETS ===\n${organicSnippets.slice(0, 8).join("\n")}`,
    );
  }

  return {
    urls: filterCandidateUrls(collectedUrls, excludeHost, 10),
    gbpContext: contextSections.join("\n\n"),
    mapsSources: deduplicateSources(mapsSources, 10),
    places: places.slice(0, 12),
  };
}

function unwrapDuckDuckGoHref(rawHref: string): string | null {
  try {
    const decodedHtml = rawHref.replace(/&amp;/g, "&").trim();
    const full = decodedHtml.startsWith("//")
      ? `https:${decodedHtml}`
      : decodedHtml.startsWith("/")
        ? `https://duckduckgo.com${decodedHtml}`
        : decodedHtml;
    const parsed = new URL(full);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return uddg;
    if (parsed.hostname.includes("duckduckgo.com")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function searchDuckDuckGoSingle(
  query: string,
  locale: "pl" | "en",
): Promise<string[]> {
  try {
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=${
      locale === "pl" ? "pl-pl" : "wt-wt"
    }`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language":
          locale === "pl" ? "pl-PL,pl;q=0.9,en;q=0.8" : "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hrefMatches = Array.from(
      html.matchAll(
        /<a[^>]+class=['"][^'"]*result-link[^'"]*['"][^>]+href=['"]([^'"]+)['"]/gi,
      ),
    );
    const fallbackMatches =
      hrefMatches.length > 0
        ? hrefMatches
        : Array.from(
            html.matchAll(/href=['"]([^'"]*(?:uddg=|https?:\/\/)[^'"]+)['"]/gi),
          );

    const urls: string[] = [];
    for (const match of fallbackMatches) {
      const candidate = unwrapDuckDuckGoHref(match[1] ?? "");
      if (candidate) urls.push(candidate);
    }
    return urls;
  } catch {
    return [];
  }
}

export async function discoverCompetitorUrlsViaDuckDuckGo(
  queries: string[],
  locale: "pl" | "en",
  excludeHost?: string,
): Promise<string[]> {
  const lists = await Promise.all(
    queries.slice(0, 3).map((q) => searchDuckDuckGoSingle(q, locale)),
  );
  const interleaved: string[] = [];
  const maxLen = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      if (list[i]) interleaved.push(list[i]);
    }
  }
  return filterCandidateUrls(interleaved, excludeHost, 10);
}

export async function discoverCompetitorUrlsViaOsm(
  city: string,
  country: string,
  industryId: IndustryId,
  excludeHost?: string,
): Promise<string[]> {
  try {
    const geoUrl = new URL("https://nominatim.openstreetmap.org/search");
    geoUrl.searchParams.set("q", `${city}, ${country}`);
    geoUrl.searchParams.set("format", "json");
    geoUrl.searchParams.set("limit", "1");
    const geoRes = await fetch(geoUrl.toString(), {
      headers: { "User-Agent": "NorthstarOps-MarketScan/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!geoRes.ok) return [];
    const geoData = (await geoRes.json()) as Array<{
      lat?: string;
      lon?: string;
    }>;
    const lat = Number(geoData?.[0]?.lat);
    const lon = Number(geoData?.[0]?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

    const tagFilterMap: Record<IndustryId, string> = {
      upholstery: `(node(around:25000,${lat},${lon})["shop"~"carpet|furniture|laundry|dry_cleaning"]["website"];way(around:25000,${lat},${lon})["shop"~"carpet|furniture|laundry|dry_cleaning"]["website"];node(around:25000,${lat},${lon})["craft"~"cleaning|upholsterer"]["website"];)`,
      hvac: `(node(around:25000,${lat},${lon})["craft"~"hvac|heating|electrician"]["website"];way(around:25000,${lat},${lon})["craft"~"hvac|heating|electrician"]["website"];)`,
      plumbing: `(node(around:25000,${lat},${lon})["craft"~"plumber|heating"]["website"];way(around:25000,${lat},${lon})["craft"~"plumber|heating"]["website"];)`,
    };

    const query = `[out:json][timeout:6];${tagFilterMap[industryId]};out tags 10;`;
    const osmRes = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "NorthstarOps-MarketScan/1.0",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(6500),
    });
    if (!osmRes.ok) return [];
    const osmJson = (await osmRes.json()) as {
      elements?: Array<{ tags?: Record<string, string> }>;
    };
    const rawSites: string[] = [];
    for (const el of osmJson.elements ?? []) {
      const rawSite = el.tags?.website || el.tags?.["contact:website"];
      if (rawSite) rawSites.push(rawSite);
    }
    return filterCandidateUrls(rawSites, excludeHost, 6);
  } catch {
    return [];
  }
}
