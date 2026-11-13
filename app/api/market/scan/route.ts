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

interface ScanRequestParams {
  city: string;
  country: string;
  industryId: IndustryId;
  radiusKm: number;
  locale: "pl" | "en";
  competitorUrls: string[];
  excludeHost?: string;
}

interface FetchedSiteContext {
  url: string;
  title: string;
  text: string;
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

function isAggregatorHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  return AGGREGATOR_HOSTS.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
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
  ).slice(0, 6);

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
  const seen = new Map<string, GroundingSource>();

  for (const chunk of chunks) {
    const uri = chunk.web?.uri?.trim();
    if (!uri) continue;
    if (!seen.has(uri)) {
      seen.set(uri, {
        uri,
        title: chunk.web?.title?.trim() || uri,
      });
    }
    if (seen.size >= 10) break;
  }

  return Array.from(seen.values());
}

function extractVisibleText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim();

  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, text: stripped.slice(0, 10000) };
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
                /.{0,70}(?:zł|pln|cennik|cena|od\s+\d+|price|dywan|tapicer|klima|hydraul).{0,90}/gi,
              )
              ?.slice(0, 35)
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

  if (!combined) return null;
  return {
    url: safeUrl.toString(),
    title: title || safeUrl.hostname,
    text: combined.slice(0, 12000),
  };
}

function buildSearchQueries(
  city: string,
  industryId: IndustryId,
  locale: "pl" | "en",
): [string, string] {
  if (locale === "pl") {
    const map: Record<IndustryId, [string, string]> = {
      upholstery: [
        `pranie dywanów ${city}`,
        `pranie tapicerki meblowej ${city}`,
      ],
      hvac: [
        `montaż klimatyzacji ${city}`,
        `serwis klimatyzacji pompy ciepła ${city}`,
      ],
      plumbing: [`hydraulik ${city}`, `usługi hydrauliczne ${city}`],
    };
    return map[industryId];
  }

  const mapEn: Record<IndustryId, [string, string]> = {
    upholstery: [`carpet cleaning ${city}`, `upholstery cleaning ${city}`],
    hvac: [`air conditioning installation ${city}`, `hvac service ${city}`],
    plumbing: [`plumber ${city}`, `plumbing repair ${city}`],
  };
  return mapEn[industryId];
}

function filterCandidateUrls(
  rawCandidates: string[],
  excludeHost?: string,
  limit = 6,
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

async function discoverViaSerper(
  queries: string[],
  country: string,
  locale: "pl" | "en",
  excludeHost?: string,
): Promise<string[]> {
  const serperKey = process.env.SERPER_API_KEY?.trim();
  if (!serperKey) return [];

  const collected: string[] = [];
  for (const q of queries) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q,
          gl: locale === "pl" ? "pl" : "us",
          hl: locale === "pl" ? "pl" : "en",
          location: `${country}`,
          num: 10,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        organic?: Array<{ link?: string }>;
        places?: Array<{ website?: string }>;
      };
      for (const place of data.places ?? []) {
        if (place.website) collected.push(place.website);
      }
      for (const item of data.organic ?? []) {
        if (item.link) collected.push(item.link);
      }
    } catch {
      continue;
    }
  }

  return filterCandidateUrls(collected, excludeHost, 6);
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
  queries: [string, string],
  locale: "pl" | "en",
  excludeHost?: string,
): Promise<string[]> {
  const [listA, listB] = await Promise.all([
    searchDuckDuckGoSingle(queries[0], locale),
    searchDuckDuckGoSingle(queries[1], locale),
  ]);

  // Interleave results so primary carpet-cleaning leaders stay at the top alongside upholstery
  const interleaved: string[] = [];
  const maxLen = Math.max(listA.length, listB.length);
  for (let i = 0; i < maxLen; i++) {
    if (listA[i]) interleaved.push(listA[i]);
    if (listB[i]) interleaved.push(listB[i]);
  }

  return filterCandidateUrls(interleaved, excludeHost, 6);
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
      upholstery: '["shop"~"carpet|furniture|laundry|dry_cleaning"]["website"]',
      hvac: '["craft"~"hvac|heating|electrician"]["website"]',
      plumbing: '["craft"~"plumber|heating"]["website"]',
    };

    const query = `[out:json][timeout:6];(node(around:18000,${lat},${lon})${tagFilterMap[industryId]};way(around:18000,${lat},${lon})${tagFilterMap[industryId]};);out tags 6;`;

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

    return filterCandidateUrls(rawSites, excludeHost, 4);
  } catch {
    return [];
  }
}

async function structureReportWithGemini(
  researchText: string,
  params: ScanRequestParams,
  validServiceKeys: Set<string>,
): Promise<StructuredScanPayload> {
  const ai = getGeminiClient();
  if (!ai) return {};

  const languageLabel = params.locale === "pl" ? "Polish" : "English";
  const extractionPrompt = [
    `Extract structured market intelligence strictly from the verified competitor websites below.`,
    `Do NOT invent companies, numbers, ratings, or prices that are not supported by the text.`,
    `Write "summary", "priceSummary", "travelFeeNote", "note", "label", and "evidence" in ${languageLabel}.`,
    `Valid serviceKey values for this industry: ${Array.from(validServiceKeys).join(", ")}.`,
    `Important pricing classification rules:`,
    `- "carpetArea": full carpet washing price per m² (if a company lists both lowball teaser promo like 4.99 PLN and standard/laundry carpet washing 20-38 PLN/m², represent the standard carpet washing price range fairly instead of using outliers as the whole market average).`,
    `- "carpetFlooring": fitted wall-to-wall / office carpet cleaning per m².`,
    `- "upholsteryChair": standard chair upholstery cleaning price.`,
    `- "cornerSofa": corner sofa / L-shaped couch cleaning starting or average price.`,
    `Compute avgPricePln, minPricePln, maxPricePln across the found local companies only for serviceKey entries where real price evidence exists.`,
    `\n=== VERIFIED LOCAL COMPETITOR DATA (${params.city}, ${params.country}) ===\n${researchText}`,
  ].join("\n");

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
) {
  const competitors = (parsed?.competitors ?? [])
    .filter(
      (c: CompetitorFinding) =>
        typeof c?.name === "string" && c.name.trim().length > 0,
    )
    .slice(0, 6);

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
  const validServiceKeys = new Set<string>(
    template.services.map((s: IndustryServiceItem) => s.serviceKey),
  );

  const ai = getGeminiClient();

  if (!ai) {
    return NextResponse.json({
      source: "template-fallback",
      aiEnhanced: false,
      warning: "GEMINI_API_KEY is not configured on the server.",
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
      searchQueries: [],
    });
  }

  const serviceHints = template.services
    .map(
      (s: IndustryServiceItem) =>
        `${s.serviceKey} (reference baseline ~${s.localPricePln} PLN)`,
    )
    .join(", ");

  const industryDescriptionMap: Record<IndustryId, string> = {
    upholstery:
      "pranie dywanów, pranie wykładzin i czyszczenie tapicerki meblowej (carpet & upholstery cleaning)",
    hvac: "montaż i serwis klimatyzacji oraz pomp ciepła (HVAC & air conditioning service)",
    plumbing:
      "usługi hydrauliczne, awarie wod-kan i serwis kotłów (plumbing & emergency repairs)",
  };

  const useSearchGrounding =
    process.env.ENABLE_GEMINI_SEARCH_GROUNDING === "true" &&
    params.competitorUrls.length === 0;

  if (useSearchGrounding) {
    try {
      const searchPrompt = [
        `Find real local service providers in ${params.city}, ${params.country} (radius ~${params.radiusKm} km) for: ${industryDescriptionMap[params.industryId]}.`,
        `Research top 4-6 real local competitors (name, website, rating, travel fee, published prices), local prices for ${serviceHints}, and real customer review complaints.`,
        `Only cite real facts and numbers found via Google Search.`,
      ].join("\n");

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
        ? metadata.webSearchQueries.slice(0, 6)
        : [];

      if (researchText) {
        const parsed = await structureReportWithGemini(
          researchText,
          params,
          validServiceKeys,
        );
        const clean = sanitizeStructuredPayload(parsed, validServiceKeys);

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
      if (!isQuotaError(err)) throw err;
    }
  }

  const queries = buildSearchQueries(
    params.city,
    params.industryId,
    params.locale,
  );
  let targetUrls = params.competitorUrls;

  if (targetUrls.length === 0) {
    targetUrls = await discoverViaSerper(
      queries,
      params.country,
      params.locale,
      params.excludeHost,
    );
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
      6,
    );
  }

  const fetchedSites = (
    await Promise.all(targetUrls.map((u) => fetchSiteContext(u)))
  ).filter((item): item is FetchedSiteContext => item !== null);

  if (fetchedSites.length > 0) {
    try {
      const combinedText = fetchedSites
        .map((s) => `=== SITE: ${s.title} (${s.url}) ===\n${s.text}`)
        .join("\n\n");

      const parsed = await structureReportWithGemini(
        combinedText,
        params,
        validServiceKeys,
      );
      const clean = sanitizeStructuredPayload(parsed, validServiceKeys);

      return NextResponse.json({
        source: "live-competitor-sites",
        aiEnhanced: true,
        city: params.city,
        country: params.country,
        industryId: params.industryId,
        radiusKm: params.radiusKm,
        scannedAt,
        ...clean,
        sources: fetchedSites.map((s) => ({ title: s.title, uri: s.url })),
        searchQueries: queries,
      });
    } catch (err) {
      if (!isQuotaError(err)) throw err;
    }
  }

  return NextResponse.json({
    source: "template-fallback",
    aiEnhanced: false,
    warning:
      "No competitor pages retrieved automatically right now. Add 1-3 competitor URLs to scan them directly for free.",
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
