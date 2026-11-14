import { NextRequest, NextResponse } from "next/server";
import { ThinkingLevel, Type } from "@google/genai";
import {
  INDUSTRY_TEMPLATES,
  type IndustryId,
  type IndustryServiceItem,
} from "../../../../src/config/industries";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "../../../../src/backend/ai/gemini-client";

export const runtime = "nodejs";

interface GroundingSource {
  title: string;
  uri: string;
}

interface CompetitorFinding {
  name: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  travelFeeNote?: string;
  priceSummary: string;
}

interface BenchmarkFinding {
  serviceKey: string;
  avgPricePln: number;
  minPricePln?: number;
  maxPricePln?: number;
  sampleCount: number;
  note?: string;
}

interface PainPointFinding {
  key: string;
  label: string;
  evidence: string;
  severityScore: number;
}

interface StructuredScanPayload {
  summary?: string;
  competitors?: CompetitorFinding[];
  marketBenchmarks?: BenchmarkFinding[];
  painPoints?: PainPointFinding[];
}

interface ActiveServiceDescriptor {
  serviceKey: string;
  label?: string;
  unitType?: string;
  ourPricePln?: number;
}

interface ScanRequestParams {
  city: string;
  country: string;
  industryId: IndustryId;
  radiusKm: number;
  locale: "pl" | "en";
  competitorUrls: string[];
  excludeHost?: string;
  services: ActiveServiceDescriptor[];
}

interface FetchedSiteContext {
  url: string;
  title: string;
  text: string;
}

interface SerperCompetitorEntry {
  name: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  category?: string;
  mapUri?: string;
}

interface SerperDiscoveryResult {
  urls: string[];
  gbpContext: string;
  mapsSources: GroundingSource[];
  places: SerperCompetitorEntry[];
}

const AGGREGATOR_HOSTS = [
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "linkedin.com",
  "olx.pl",
  "allegro.pl",
  "allegrolokalnie.pl",
  "fixly.pl",
  "oferteo.pl",
  "panoramafirm.pl",
  "pkt.pl",
  "aleo.com",
  "gowork.pl",
  "cylex-polska.pl",
  "favore.pl",
  "dobryfachowiec.pl",
  "znanyfachowiec.pl",
  "kb.pl",
  "cennik-uslug.pl",
  "extradom.pl",
  "muratordom.pl",
  "firmy.net",
  "baza-firm.com.pl",
  "targeo.pl",
  "zumi.pl",
  "pf.pl",
  "pomocedomowe.pl",
  "sprzatanko.pl",
  "booksy.com",
  "fresha.com",
  "yelp.com",
  "tripadvisor.com",
  "wikipedia.org",
  "duckduckgo.com",
  "google.com",
  "bing.com",
];

function resolveIndustryId(raw: unknown): IndustryId {
  if (typeof raw === "string" && raw in INDUSTRY_TEMPLATES) {
    return raw as IndustryId;
  }
  return "upholstery";
}

function isSafePublicUrl(rawUrl: string): URL | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return null;
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
      return null;
    }
    if (/^169\.254\./.test(host)) {
      return null;
    }
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172) {
      const secondOctet = Number(match172[1]);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getNormalizedHostFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const parsed = isSafePublicUrl(rawUrl);
  return parsed ? normalizeHost(parsed.hostname) : null;
}

function isAggregatorHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return AGGREGATOR_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

function isExcludedCompetitorWebsite(
  rawUrl: string | undefined,
  excludeHost?: string,
): boolean {
  if (!rawUrl || !excludeHost) return false;
  const host = getNormalizedHostFromUrl(rawUrl);
  return host === excludeHost;
}

function deduplicateSources(
  sources: GroundingSource[],
  limit = 15,
): GroundingSource[] {
  const seen = new Map<string, GroundingSource>();
  for (const src of sources) {
    const uri = src.uri?.trim();
    if (!uri) continue;
    if (!seen.has(uri)) {
      seen.set(uri, { title: src.title?.trim() || uri, uri });
    }
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

function parseServicesParam(raw: unknown): ActiveServiceDescriptor[] {
  if (!Array.isArray(raw)) return [];
  const parsed: ActiveServiceDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const serviceKey =
      typeof obj.serviceKey === "string" ? obj.serviceKey.trim() : "";
    if (!serviceKey || seen.has(serviceKey)) continue;
    seen.add(serviceKey);
    parsed.push({
      serviceKey,
      label:
        typeof obj.label === "string"
          ? obj.label.trim().slice(0, 90)
          : undefined,
      unitType:
        typeof obj.unitType === "string"
          ? obj.unitType.trim().slice(0, 16)
          : undefined,
      ourPricePln:
        typeof obj.ourPricePln === "number" &&
        Number.isFinite(obj.ourPricePln) &&
        obj.ourPricePln > 0
          ? Math.round(obj.ourPricePln)
          : undefined,
    });
    if (parsed.length >= 25) break;
  }
  return parsed;
}

function parseScanParams(input: Record<string, unknown>): ScanRequestParams {
  const rawCity = typeof input.city === "string" ? input.city.trim() : "";
  const city = rawCity.slice(0, 100) || "Radom";
  const rawCountry =
    typeof input.country === "string" ? input.country.trim() : "";
  const country = rawCountry.slice(0, 80) || "Poland";
  const industryId = resolveIndustryId(input.industry ?? input.industryId);
  const parsedRadius = Number(input.radiusKm);
  const radiusKm = Number.isFinite(parsedRadius)
    ? Math.min(100, Math.max(5, Math.round(parsedRadius)))
    : 30;
  const locale = input.locale === "en" ? "en" : "pl";

  const rawUrls: string[] = [];
  if (Array.isArray(input.competitorUrls)) {
    for (const item of input.competitorUrls) {
      if (typeof item === "string") rawUrls.push(item);
    }
  } else if (typeof input.urls === "string") {
    for (const part of input.urls.split(",")) {
      rawUrls.push(part);
    }
  }
  const competitorUrls = Array.from(
    new Set(
      rawUrls
        .map((u) => isSafePublicUrl(u)?.toString() ?? "")
        .filter((u) => u.length > 0),
    ),
  ).slice(0, 10);

  const excludeRaw =
    typeof input.excludeUrl === "string" ? input.excludeUrl.trim() : "";
  const excludeParsed = isSafePublicUrl(excludeRaw);
  const excludeHost = excludeParsed
    ? normalizeHost(excludeParsed.hostname)
    : undefined;

  return {
    city,
    country,
    industryId,
    radiusKm,
    locale,
    competitorUrls,
    excludeHost,
    services: parseServicesParam(input.services),
  };
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("quota")
  );
}

function extractGroundingSources(
  chunks: Array<{ web?: { uri?: string; title?: string } }> | undefined,
): GroundingSource[] {
  if (!Array.isArray(chunks)) return [];
  const raw: GroundingSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    if (!uri) continue;
    raw.push({
      uri,
      title: chunk.web?.title?.trim() || uri,
    });
  }
  return deduplicateSources(raw, 15);
}

function extractVisibleText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text: stripped.slice(0, 12000) };
}

function compactSiteText(rawText: string, maxChars = 2800): string {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 1);
  const signalRe =
    /(z[łl]|pln|eur|usd|\$|€|cennik|cena|od\s+\d+|m²|m2|szt|dojazd|gratis|opinie|dywan|wyk[łl]adzin|tapicerk|krzes|naro[żz]nik|sofa|kanap|fotel|wersalk|materac|kostk|p[łl]yt|taras|dosusz|klimatyzac|pomp|wentylac|kocio|wyciek|kanaliz|price|carpet|upholster|sofa|chair|hvac|plumb)/i;
  const picked = new Set<number>();
  lines.forEach((line, idx) => {
    if (signalRe.test(line)) {
      if (idx > 0) picked.add(idx - 1);
      picked.add(idx);
      if (idx + 1 < lines.length) picked.add(idx + 1);
    }
  });
  const selected = Array.from(picked)
    .sort((a, b) => a - b)
    .map((idx) => lines[idx]);
  const joined = (selected.length > 0 ? selected : lines).join("\n");
  return joined.slice(0, maxChars);
}

function findPricingSubpageUrl(html: string, baseUrl: URL): string | null {
  const anchorMatches = Array.from(
    html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );
  for (const match of anchorMatches) {
    const href = (match[1] ?? "").trim();
    const label = (match[2] ?? "").replace(/<[^>]+>/g, " ").trim();
    const haystack = `${href} ${label}`.toLowerCase();
    if (
      /(cennik|cena|pricing|price-list|prices|stawki)/.test(haystack) &&
      !/\.(jpg|jpeg|png|webp|pdf|svg)$/i.test(href)
    ) {
      try {
        const resolved = new URL(href, baseUrl);
        if (
          resolved.origin === baseUrl.origin &&
          resolved.pathname !== baseUrl.pathname
        ) {
          return resolved.toString();
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function fetchHtmlPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(6500),
    });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 250_000);
  } catch {
    return null;
  }
}

async function fetchSiteContext(
  targetUrl: string,
): Promise<FetchedSiteContext | null> {
  const safeUrl = isSafePublicUrl(targetUrl);
  if (!safeUrl) return null;
  const html = await fetchHtmlPage(safeUrl.toString());
  if (!html) return null;
  const { title, text } = extractVisibleText(html);
  let combined = text;
  const subpageUrl = findPricingSubpageUrl(html, safeUrl);
  if (subpageUrl) {
    const subHtml = await fetchHtmlPage(subpageUrl);
    if (subHtml) {
      const subVisible = extractVisibleText(subHtml);
      if (subVisible.text) {
        combined = `${combined}\n[SUBPAGE ${subpageUrl}]\n${subVisible.text}`;
      }
    }
  }
  if (combined.length < 400) {
    const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js[^"]*)"/i);
    if (scriptMatch?.[1]) {
      try {
        const scriptUrl = new URL(scriptMatch[1], safeUrl);
        if (scriptUrl.origin === safeUrl.origin) {
          const jsRes = await fetch(scriptUrl.toString(), {
            signal: AbortSignal.timeout(5500),
          });
          if (jsRes.ok) {
            const jsRaw = (await jsRes.text()).slice(0, 250_000);
            const priceSnippets = jsRaw
              .match(
                /.{0,70}(?:zł|pln|cennik|cena|od\s+\d+|m²|m2|szt|price|dywan|tapicer|fotel|kanap|wersalk|materac|kostk|płyt|taras|dosusz|klima|hydraul).{0,90}/gi,
              )
              ?.slice(0, 40)
              .join("\n");
            if (priceSnippets) {
              combined = `${combined}\n${priceSnippets}`.trim();
            }
          }
        }
      } catch {
        // Ignore SPA bundle fetch failure
      }
    }
  }
  const compacted = compactSiteText(combined, 2800);
  if (!compacted) return null;
  return {
    url: safeUrl.toString(),
    title: title || safeUrl.hostname,
    text: compacted,
  };
}

function buildSearchQueries(
  city: string,
  industryId: IndustryId,
  locale: "pl" | "en",
): string[] {
  if (locale === "pl") {
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
      `air conditioning installation ${city}`,
      `hvac service ${city}`,
      `heat pump repair ${city} prices`,
    ],
    plumbing: [
      `plumber ${city}`,
      `plumbing repair ${city}`,
      `emergency plumber ${city} rates`,
    ],
  };
  return mapEn[industryId];
}

function filterCandidateUrls(
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

interface SerperMapPlace {
  title?: string;
  address?: string;
  rating?: number | string;
  ratingCount?: number | string;
  category?: string;
  website?: string;
  cid?: string | number;
}

async function discoverViaSerper(
  queries: string[],
  country: string,
  locale: "pl" | "en",
  excludeHost?: string,
): Promise<SerperDiscoveryResult> {
  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (!serperKey) {
    return { urls: [], gbpContext: "", mapsSources: [], places: [] };
  }

  const gl = locale === "pl" ? "pl" : "us";
  const hl = locale === "pl" ? "pl" : "en";
  const collectedUrls: string[] = [];
  const gbpLines: string[] = [];
  const seenKeys = new Set<string>();
  const seenMapUris = new Set<string>();
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
          location: country,
          num: 10,
        }),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        organic?: Array<{ link?: string }>;
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
      if (item.link) collectedUrls.push(item.link);
    }
  }

  return {
    urls: filterCandidateUrls(collectedUrls, excludeHost, 10),
    gbpContext:
      gbpLines.length > 0
        ? `=== GOOGLE BUSINESS PROFILES (MAPS) ===\n${gbpLines.slice(0, 15).join("\n")}`
        : "",
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

async function discoverCompetitorUrlsViaDuckDuckGo(
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

async function discoverCompetitorUrlsViaOsm(
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

function buildFallbackCompetitors(
  places: SerperCompetitorEntry[],
  fetchedSites: FetchedSiteContext[],
  locale: "pl" | "en",
  excludeHost?: string,
): CompetitorFinding[] {
  const siteByHost = new Map<string, FetchedSiteContext>();
  for (const site of fetchedSites) {
    const host = getNormalizedHostFromUrl(site.url);
    if (host) siteByHost.set(host, site);
  }

  const out: CompetitorFinding[] = [];
  const seenNames = new Set<string>();
  const seenHosts = new Set<string>();

  for (const place of places) {
    if (isExcludedCompetitorWebsite(place.website, excludeHost)) continue;
    const host = getNormalizedHostFromUrl(place.website);
    const nameKey = place.name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    if (host && seenHosts.has(host)) continue;

    seenNames.add(nameKey);
    if (host) seenHosts.add(host);

    const matchedSite = host ? siteByHost.get(host) : undefined;
    const priceMatch = matchedSite?.text.match(
      /([^\n]{0,45}\d{1,4}(?:[.,]\d{1,2})?\s*(?:zł|pln|eur|usd|\$|€)[^\n]{0,45})/i,
    );

    const summary = priceMatch
      ? priceMatch[1].replace(/\s+/g, " ").trim()
      : place.category
        ? locale === "pl"
          ? `Wizytówka Google (${place.category}) — brak pełnego cennika w trybie bez AI.`
          : `Google Business Profile (${place.category}) — full AI price extraction paused.`
        : locale === "pl"
          ? "Wizytówka lokalna z Google Maps."
          : "Local Google Maps listing.";

    out.push({
      name: place.name,
      website: place.website,
      rating: place.rating,
      reviewCount: place.reviewCount,
      travelFeeNote: place.address,
      priceSummary: summary,
    });
  }

  for (const site of fetchedSites) {
    if (out.length >= 12) break;
    if (isExcludedCompetitorWebsite(site.url, excludeHost)) continue;
    const host = getNormalizedHostFromUrl(site.url);
    if (host && seenHosts.has(host)) continue;
    if (host) seenHosts.add(host);

    const priceMatch = site.text.match(
      /([^\n]{0,45}\d{1,4}(?:[.,]\d{1,2})?\s*(?:zł|pln|eur|usd|\$|€)[^\n]{0,45})/i,
    );
    out.push({
      name: site.title.slice(0, 75),
      website: site.url,
      priceSummary: priceMatch
        ? priceMatch[1].replace(/\s+/g, " ").trim()
        : locale === "pl"
          ? "Strona lokalnej firmy pobrana bezpośrednio."
          : "Local business page retrieved directly.",
    });
  }

  return out.slice(0, 12);
}

async function structureReportWithGemini(
  researchText: string,
  params: ScanRequestParams,
  validServiceKeys: Set<string>,
  activeServices: ActiveServiceDescriptor[],
): Promise<StructuredScanPayload> {
  const ai = getGeminiClient();
  if (!ai) return {};
  const languageLabel = params.locale === "pl" ? "Polish" : "English";
  const trackedServicesList = activeServices
    .map((s) =>
      [
        `"${s.serviceKey}"`,
        s.label ? `(${s.label})` : "",
        s.unitType ? `[${s.unitType}]` : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(", ");

  const excludeInstruction = params.excludeHost
    ? `Do NOT include our own business (${params.excludeHost}) in the competitors list.`
    : "";

  const extractionPrompt = [
    `Extract structured market intelligence strictly from the verified competitor data below.`,
    `Return 8-12 distinct local competitors when supported by the source data (covering both Google Business Profiles / Maps listings and companies with published website price lists).`,
    excludeInstruction,
    `Populate "rating" and "reviewCount" whenever verified Google review numbers appear in the source text.`,
    `Do NOT invent companies, numbers, ratings, or prices that are not supported by the text.`,
    `Write "summary", "priceSummary", "travelFeeNote", "note", "label", and "evidence" in ${languageLabel}.`,
    `Active tracked services to benchmark (use these EXACT serviceKey values): ${trackedServicesList || Array.from(validServiceKeys).join(", ")}.`,
    `Important pricing classification rules:`,
    `- "carpetArea": full carpet washing price per m² (if a company lists both lowball teaser promo like 4.99 PLN and standard/laundry carpet washing 20-38 PLN/m², represent the standard carpet washing price range fairly instead of using outliers as the whole market average).`,
    `- "carpetFlooring": fitted wall-to-wall / office carpet cleaning per m².`,
    `- "upholsteryChair": standard chair upholstery cleaning price.`,
    `- "cornerSofa": corner sofa / L-shaped couch cleaning starting or average price.`,
    `- For any other serviceKey listed above (including "live:*" keys matched to a service name like armchair/fotel, couch/kanapa, mattress/materac, pavers/kostka, tiles/płytki, drying/dosuszanie), extract the matching local competitor average ONLY if real price evidence exists in the text.`,
    `Compute avgPricePln, minPricePln, maxPricePln across the found local companies only for serviceKey entries where real price evidence exists.`,
    `\n=== VERIFIED LOCAL COMPETITOR DATA (${params.city}, ${params.country}) ===\n${researchText.slice(0, 26000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const structuredResponse = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: extractionPrompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description:
              "Concise 2-sentence executive summary of local competition and pricing.",
          },
          competitors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                website: { type: Type.STRING },
                rating: { type: Type.NUMBER },
                reviewCount: { type: Type.INTEGER },
                travelFeeNote: { type: Type.STRING },
                priceSummary: { type: Type.STRING },
              },
              required: ["name", "priceSummary"],
            },
          },
          marketBenchmarks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                serviceKey: { type: Type.STRING },
                avgPricePln: { type: Type.NUMBER },
                minPricePln: { type: Type.NUMBER },
                maxPricePln: { type: Type.NUMBER },
                sampleCount: { type: Type.INTEGER },
                note: { type: Type.STRING },
              },
              required: ["serviceKey", "avgPricePln", "sampleCount"],
            },
          },
          painPoints: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                key: { type: Type.STRING },
                label: { type: Type.STRING },
                evidence: { type: Type.STRING },
                severityScore: {
                  type: Type.INTEGER,
                  description:
                    "Estimated customer friction impact score from 20 (low) to 95 (critical).",
                },
              },
              required: ["key", "label", "evidence", "severityScore"],
            },
          },
        },
        required: ["summary", "competitors", "marketBenchmarks", "painPoints"],
      },
    },
  });

  return parseJsonSafe<StructuredScanPayload>(structuredResponse.text, {});
}

function sanitizeStructuredPayload(
  parsed: StructuredScanPayload,
  validServiceKeys: Set<string>,
  excludeHost?: string,
) {
  const seenNames = new Set<string>();
  const seenHosts = new Set<string>();

  const competitors = (parsed?.competitors ?? [])
    .filter((c: CompetitorFinding) => {
      if (typeof c?.name !== "string" || !c.name.trim()) return false;
      if (isExcludedCompetitorWebsite(c.website, excludeHost)) return false;

      const nameKey = c.name.trim().toLowerCase();
      const hostKey = getNormalizedHostFromUrl(c.website);
      if (seenNames.has(nameKey)) return false;
      if (hostKey && seenHosts.has(hostKey)) return false;

      seenNames.add(nameKey);
      if (hostKey) seenHosts.add(hostKey);
      return true;
    })
    .slice(0, 12)
    .map((c: CompetitorFinding) => ({
      ...c,
      rating:
        typeof c.rating === "number" &&
        Number.isFinite(c.rating) &&
        c.rating > 0 &&
        c.rating <= 5
          ? Math.round(c.rating * 10) / 10
          : undefined,
      reviewCount:
        typeof c.reviewCount === "number" &&
        Number.isFinite(c.reviewCount) &&
        c.reviewCount > 0
          ? Math.round(c.reviewCount)
          : undefined,
    }));

  const marketBenchmarks = (parsed?.marketBenchmarks ?? [])
    .filter(
      (b: BenchmarkFinding) =>
        typeof b?.serviceKey === "string" &&
        validServiceKeys.has(b.serviceKey) &&
        typeof b.avgPricePln === "number" &&
        Number.isFinite(b.avgPricePln) &&
        b.avgPricePln > 0,
    )
    .map((b: BenchmarkFinding) => ({
      ...b,
      avgPricePln: Math.round(b.avgPricePln),
      minPricePln:
        typeof b.minPricePln === "number" && Number.isFinite(b.minPricePln)
          ? Math.round(b.minPricePln)
          : undefined,
      maxPricePln:
        typeof b.maxPricePln === "number" && Number.isFinite(b.maxPricePln)
          ? Math.round(b.maxPricePln)
          : undefined,
      sampleCount: Math.max(1, Math.round(b.sampleCount || 1)),
    }));

  const painPoints = (parsed?.painPoints ?? [])
    .filter(
      (p: PainPointFinding) =>
        typeof p?.label === "string" && p.label.trim().length > 0,
    )
    .slice(0, 4)
    .map((p: PainPointFinding) => ({
      ...p,
      severityScore: Math.min(
        95,
        Math.max(20, Math.round(p.severityScore || 50)),
      ),
    }));

  return {
    summary: parsed?.summary?.trim() || "",
    competitors,
    marketBenchmarks,
    painPoints,
  };
}

async function runMarketScan(params: ScanRequestParams) {
  const scannedAt = new Date().toISOString();
  const template = INDUSTRY_TEMPLATES[params.industryId];
  const activeServices: ActiveServiceDescriptor[] =
    params.services.length > 0
      ? params.services
      : template.services.map((s: IndustryServiceItem) => ({
          serviceKey: s.serviceKey,
          unitType: s.unitType,
          ourPricePln: s.ourPricePln,
        }));

  const validServiceKeys = new Set<string>([
    ...template.services.map((s: IndustryServiceItem) => s.serviceKey),
    ...activeServices.map((s) => s.serviceKey),
  ]);

  const serviceHints = activeServices
    .map((s) => `${s.label || s.serviceKey} [${s.serviceKey}]`)
    .join(", ");

  const industryDescriptionMap: Record<IndustryId, string> = {
    upholstery:
      "pranie dywanów, wykładzin, czyszczenie tapicerki meblowej, pranie kanap/narożników i mycie kostki brukowej (carpet, sofa, upholstery & exterior cleaning)",
    hvac: "montaż i serwis klimatyzacji oraz pomp ciepła (HVAC & air conditioning service)",
    plumbing:
      "usługi hydrauliczne, awarie wod-kan i serwis kotłów (plumbing & emergency repairs)",
  };

  const queries = buildSearchQueries(
    params.city,
    params.industryId,
    params.locale,
  );

  const ai = getGeminiClient();
  let quotaExceeded = false;

  const useSearchGrounding =
    Boolean(ai) &&
    process.env.ENABLE_GEMINI_SEARCH_GROUNDING === "true" &&
    params.competitorUrls.length === 0;

  if (useSearchGrounding && ai) {
    try {
      const searchPrompt = [
        `Find 8-12 real local service providers in ${params.city}, ${params.country} (radius ~${params.radiusKm} km) for: ${industryDescriptionMap[params.industryId]}.`,
        `Search BOTH Google Business Profiles / Google Maps listings (company name, star rating, review count, travel zone, customer complaints) AND company websites with published price lists.`,
        `Cover distinct local search intents such as: ${queries.join("; ")}.`,
        params.excludeHost
          ? `Exclude ${params.excludeHost} (that is our own website).`
          : "",
        `Research local prices for ${serviceHints} and real customer review complaints.`,
        `Only cite real companies, facts, ratings, and numbers found via Google Search.`,
      ]
        .filter(Boolean)
        .join("\n");

      const searchResponse = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: searchPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const researchText = (searchResponse.text ?? "").trim();
      const metadata = searchResponse.candidates?.[0]?.groundingMetadata;
      const sources = extractGroundingSources(metadata?.groundingChunks);
      const searchQueries = Array.isArray(metadata?.webSearchQueries)
        ? metadata.webSearchQueries.slice(0, 8)
        : [];

      if (researchText) {
        const parsed = await structureReportWithGemini(
          researchText,
          params,
          validServiceKeys,
          activeServices,
        );
        const clean = sanitizeStructuredPayload(
          parsed,
          validServiceKeys,
          params.excludeHost,
        );
        return NextResponse.json({
          source: "ai-web-grounding",
          aiEnhanced: true,
          city: params.city,
          country: params.country,
          industryId: params.industryId,
          radiusKm: params.radiusKm,
          scannedAt,
          ...clean,
          sources,
          searchQueries,
        });
      }
    } catch (err) {
      if (isQuotaError(err)) {
        quotaExceeded = true;
        console.warn(
          "[/api/market/scan] Search grounding hit Gemini 429 quota.",
        );
      } else {
        console.error("[/api/market/scan] Search grounding failed:", err);
      }
    }
  }

  let targetUrls = params.competitorUrls;
  let gbpContext = "";
  let mapsSources: GroundingSource[] = [];
  let serperPlaces: SerperCompetitorEntry[] = [];

  if (targetUrls.length === 0) {
    const serperResult = await discoverViaSerper(
      queries,
      params.country,
      params.locale,
      params.excludeHost,
    );
    targetUrls = serperResult.urls;
    gbpContext = serperResult.gbpContext;
    mapsSources = serperResult.mapsSources;
    serperPlaces = serperResult.places;
  }

  if (targetUrls.length === 0) {
    const [ddgUrls, osmUrls] = await Promise.all([
      discoverCompetitorUrlsViaDuckDuckGo(
        queries,
        params.locale,
        params.excludeHost,
      ),
      discoverCompetitorUrlsViaOsm(
        params.city,
        params.country,
        params.industryId,
        params.excludeHost,
      ),
    ]);
    targetUrls = filterCandidateUrls(
      [...ddgUrls, ...osmUrls],
      params.excludeHost,
      10,
    );
  }

  const fetchedSites = (
    await Promise.all(targetUrls.map((u) => fetchSiteContext(u)))
  ).filter((item): item is FetchedSiteContext => item !== null);

  const allSources = deduplicateSources(
    [
      ...fetchedSites.map((s) => ({ title: s.title, uri: s.url })),
      ...mapsSources,
    ],
    15,
  );

  if (fetchedSites.length > 0 || gbpContext || serperPlaces.length > 0) {
    if (ai) {
      try {
        const siteSections = fetchedSites.map(
          (s) => `=== SITE: ${s.title} (${s.url}) ===\n${s.text}`,
        );
        const combinedText = [gbpContext, ...siteSections]
          .filter(Boolean)
          .join("\n\n");
        const parsed = await structureReportWithGemini(
          combinedText,
          params,
          validServiceKeys,
          activeServices,
        );
        const clean = sanitizeStructuredPayload(
          parsed,
          validServiceKeys,
          params.excludeHost,
        );
        return NextResponse.json({
          source: gbpContext ? "live-maps-and-sites" : "live-competitor-sites",
          aiEnhanced: true,
          city: params.city,
          country: params.country,
          industryId: params.industryId,
          radiusKm: params.radiusKm,
          scannedAt,
          ...clean,
          sources: allSources,
          searchQueries: queries,
        });
      } catch (err) {
        if (isQuotaError(err)) {
          quotaExceeded = true;
          console.warn(
            "[/api/market/scan] structureReportWithGemini hit Gemini 429 quota; returning direct Maps/Serper data.",
          );
        } else {
          console.error(
            "[/api/market/scan] structureReportWithGemini failed:",
            err,
          );
        }
      }
    }

    const fallbackCompetitors = buildFallbackCompetitors(
      serperPlaces,
      fetchedSites,
      params.locale,
      params.excludeHost,
    );
    const warningMsg = !ai
      ? params.locale === "pl"
        ? "Brak GEMINI_API_KEY na serwerze — wyświetlono surowe wizytówki Google Maps i znalezione strony bez analizy AI."
        : "GEMINI_API_KEY is not configured — showing retrieved Google Maps listings & sites without AI synthesis."
      : quotaExceeded
        ? params.locale === "pl"
          ? "Przekroczono chwilowy limit zapytań Gemini API (429) — wyświetlono znalezione wizytówki Google Maps i strony konkurencji (odczekaj ~1 min lub sprawdź plan API dla pełnych średnich cenowych)."
          : "Gemini API quota exceeded (429) — showing retrieved Google Maps listings & competitor sites (wait ~1 min or check API quota for full AI price averaging)."
        : params.locale === "pl"
          ? "Analiza AI chwilowo niedostępna — wyświetlono znalezione wizytówki i strony konkurencji."
          : "AI synthesis temporarily unavailable — showing retrieved local listings & competitor sites.";

    return NextResponse.json({
      source: "live-maps-direct",
      aiEnhanced: false,
      warning: warningMsg,
      city: params.city,
      country: params.country,
      industryId: params.industryId,
      radiusKm: params.radiusKm,
      scannedAt,
      summary:
        params.locale === "pl"
          ? `Znaleziono ${fallbackCompetitors.length} lokalnych firm w ${params.city} (Google Maps + strony WWW). Pełne wyliczenie średnich cen AI wznowi się po odnowieniu limitu Gemini.`
          : `Retrieved ${fallbackCompetitors.length} local competitors in ${params.city} (Google Maps + websites). Full AI price averaging will resume once Gemini quota resets.`,
      competitors: fallbackCompetitors,
      marketBenchmarks: [],
      painPoints: [],
      sources: allSources,
      searchQueries: queries,
    });
  }

  return NextResponse.json({
    source: "template-fallback",
    aiEnhanced: false,
    warning: quotaExceeded
      ? params.locale === "pl"
        ? "Przekroczono limit Gemini API (429) i nie znaleziono stron konkurencji automatycznie. Wklej 1-3 adresy WWW ręcznie."
        : "Gemini API quota exceeded (429) and no competitor pages were retrieved automatically. Add 1-3 competitor URLs manually."
      : "No competitor pages retrieved automatically right now. Add 1-3 competitor URLs to scan them directly for free.",
    city: params.city,
    country: params.country,
    industryId: params.industryId,
    radiusKm: params.radiusKm,
    scannedAt,
    summary: "",
    competitors: [],
    marketBenchmarks: [],
    painPoints: [],
    sources: [],
    searchQueries: queries,
  });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const params = parseScanParams({
      city: sp.get("city") ?? undefined,
      country: sp.get("country") ?? undefined,
      industry: sp.get("industry") ?? sp.get("industryId") ?? undefined,
      radiusKm: sp.get("radiusKm") ?? undefined,
      locale: sp.get("locale") ?? undefined,
      urls: sp.get("urls") ?? undefined,
      excludeUrl: sp.get("excludeUrl") ?? undefined,
    });
    return await runMarketScan(params);
  } catch (err) {
    console.error("[/api/market/scan GET] error:", err);
    return NextResponse.json(
      {
        error: "Market scan failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const params = parseScanParams(body);
    return await runMarketScan(params);
  } catch (err) {
    console.error("[/api/market/scan POST] error:", err);
    return NextResponse.json(
      {
        error: "Market scan failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 },
    );
  }
}
