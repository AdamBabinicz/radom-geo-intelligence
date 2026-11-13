import { ThinkingLevel, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import type { IndustryServiceItem } from "@/src/config/industries";

type ServiceKey = IndustryServiceItem["serviceKey"];

interface ExtractedPrice {
  serviceKey: ServiceKey;
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: "PLN" | "USD" | "EUR";
  method: "gemini-ai" | "json-ld" | "html-text" | "subpage" | "spa-bundle";
  snippet: string;
}

const VALID_SERVICE_KEYS = new Set<ServiceKey>([
  "carpetArea",
  "carpetFlooring",
  "upholsteryChair",
  "cornerSofa",
  "twoSeatCouch",
  "acService",
  "heatPumpCheck",
  "ductCleaning",
  "leakRepair",
  "boilerService",
  "drainUnclog",
]);

const SERVICE_KEYWORDS: Array<{
  serviceKey: ServiceKey;
  patterns: RegExp[];
}> = [
  {
    serviceKey: "carpetArea",
    patterns: [/prani[ea]\s+dywan[óo]w/gi, /carpet\s+washing/gi],
  },
  {
    serviceKey: "carpetFlooring",
    patterns: [/prani[ea]\s+wyk[łl]adzin/gi, /fitted\s+carpet/gi],
  },
  {
    serviceKey: "upholsteryChair",
    patterns: [/krzes[łl][oa]/gi, /upholstery\s+chair/gi],
  },
  {
    serviceKey: "cornerSofa",
    patterns: [/naro[żz]nik/gi, /corner\s+sofa/gi],
  },
  {
    serviceKey: "twoSeatCouch",
    patterns: [/kanap[ayę]/gi, /2-seater/gi, /two-seat/gi],
  },
  {
    serviceKey: "acService",
    patterns: [/przegl[ąa]d\s+klimatyzacj/gi, /ac\s+unit\s+inspection/gi],
  },
  {
    serviceKey: "heatPumpCheck",
    patterns: [/pomp[ayę]\s+ciep[łl]a/gi, /heat\s+pump\s+service/gi],
  },
  {
    serviceKey: "ductCleaning",
    patterns: [/czyszczenie\s+wentylacj/gi, /duct\s+cleaning/gi],
  },
  {
    serviceKey: "leakRepair",
    patterns: [/usuwanie\s+wyciek/gi, /leak\s+repair/gi],
  },
  {
    serviceKey: "boilerService",
    patterns: [/przegl[ąa]d\s+kot[łl]a/gi, /boiler\s+inspection/gi],
  },
  {
    serviceKey: "drainUnclog",
    patterns: [/udra[żz]nianie/gi, /drain\s+unclog/gi],
  },
];

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  if (/^169\.254\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function normalizeCurrency(raw: unknown): "PLN" | "USD" | "EUR" {
  const val = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (val === "USD" || val === "$") return "USD";
  if (val === "EUR" || val === "€") return "EUR";
  return "PLN";
}

function toPln(amount: number, currency: "PLN" | "USD" | "EUR"): number {
  if (currency === "USD") return Math.round(amount * 4);
  if (currency === "EUR") return Math.round(amount * 4.3);
  return Math.round(amount);
}

interface RawOffer {
  name: string;
  amount: number;
  currency: "PLN" | "USD" | "EUR";
}

function collectJsonLdOffers(node: unknown, out: RawOffer[], parentName = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdOffers(item, out, parentName);
    return;
  }

  const record = node as Record<string, unknown>;
  const itemOffered =
    record.itemOffered && typeof record.itemOffered === "object"
      ? (record.itemOffered as Record<string, unknown>)
      : null;

  const ownName =
    typeof record.name === "string"
      ? record.name
      : typeof itemOffered?.name === "string"
        ? itemOffered.name
        : parentName;

  const priceSpec =
    record.priceSpecification && typeof record.priceSpecification === "object"
      ? (record.priceSpecification as Record<string, unknown>)
      : null;

  const rawPrice =
    record.price ?? record.lowPrice ?? priceSpec?.price ?? undefined;

  if (
    ownName &&
    (typeof rawPrice === "number" || typeof rawPrice === "string")
  ) {
    const amount = Number(String(rawPrice).replace(",", ".").trim());
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(
        record.priceCurrency ?? priceSpec?.priceCurrency ?? "PLN",
      );
      out.push({ name: ownName, amount, currency });
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      collectJsonLdOffers(value, out, ownName);
    }
  }
}

function extractFromJsonLd(html: string): Map<ServiceKey, ExtractedPrice> {
  const results = new Map<ServiceKey, ExtractedPrice>();
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const offers: RawOffer[] = [];
  for (const match of html.matchAll(scriptRe)) {
    try {
      const parsed = JSON.parse(match[1]) as unknown;
      collectJsonLdOffers(parsed, offers);
    } catch {
      continue;
    }
  }

  for (const offer of offers) {
    for (const entry of SERVICE_KEYWORDS) {
      if (results.has(entry.serviceKey)) continue;
      const matched = entry.patterns.some((re) => {
        const testRe = new RegExp(re.source, re.flags.replace("g", ""));
        return testRe.test(offer.name);
      });
      if (matched) {
        results.set(entry.serviceKey, {
          serviceKey: entry.serviceKey,
          pricePln: toPln(offer.amount, offer.currency),
          detectedAmount: offer.amount,
          detectedCurrency: offer.currency,
          method: "json-ld",
          snippet: offer.name.slice(0, 95).trim(),
        });
      }
    }
  }

  return results;
}

function htmlToCleanText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6]|section|article)>/gi, " \n ")
    .replace(/<br\s*\/?>/gi, " \n ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function decodeJsBundleLines(js: string): string[] {
  const decoded = js.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  const lines: string[] = [];
  const tokenRe =
    /(?:([a-zA-Z0-9_]{2,35}):\s*)?(?:"((?:[^"\\]|\\.){2,220})"|'((?:[^'\\]|\\.){2,220})')/g;

  for (const match of decoded.matchAll(tokenRe)) {
    const key = match[1] ? `${match[1]}: ` : "";
    const val = (match[2] ?? match[3] ?? "").trim();
    if (!val || val.startsWith("M") || val.includes("{var(")) continue;
    lines.push(`${key}${val}`);
  }
  return lines;
}

function buildHighSignalContext(lines: string[], maxChars = 16000): string {
  const signalRe =
    /(z[łl]|pln|usd|eur|\$|€|cennik|price|pricing|dywan|wyk[łl]adzin|tapicerk|krzes|naro[żz]nik|sofa|kanap|fotel|wersalk|carpet|floor|chair|sofa|couch|klimatyzac|pomp|wentylac|kocio|wyciek|kanaliz|hvac|plumb|boiler|drain)/i;

  const pickedIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (signalRe.test(line)) {
      for (
        let k = Math.max(0, idx - 1);
        k <= Math.min(lines.length - 1, idx + 1);
        k++
      ) {
        pickedIndices.add(k);
      }
    }
  });

  const sorted = Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .map((idx) => lines[idx]);

  const fallbackLines = sorted.length > 0 ? sorted : lines;
  return fallbackLines.join("\n").slice(0, maxChars);
}

function matchPriceInWindow(windowText: string): {
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: "PLN" | "USD" | "EUR";
} | null {
  const priceSuffixRe =
    /(?:od|from)?\s*(\d{1,4}(?:[.,]\d{1,2})?)\s*(z[łl]|pln|usd|eur|\$|€)/i;
  const pricePrefixRe = /(\$|€|usd|eur)\s*(\d{1,4}(?:[.,]\d{1,2})?)/i;

  const suffixMatch = windowText.match(priceSuffixRe);
  if (suffixMatch) {
    const amount = Number(suffixMatch[1].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(suffixMatch[2]);
      return {
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
      };
    }
  }

  const prefixMatch = windowText.match(pricePrefixRe);
  if (prefixMatch) {
    const amount = Number(prefixMatch[2].replace(",", "."));
    if (Number.isFinite(amount) && amount > 0) {
      const currency = normalizeCurrency(prefixMatch[1]);
      return {
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
      };
    }
  }

  return null;
}

function scanTextIntoMap(
  text: string,
  method: ExtractedPrice["method"],
  byService: Map<ServiceKey, ExtractedPrice>,
  windowSize = 420,
) {
  for (const entry of SERVICE_KEYWORDS) {
    if (byService.has(entry.serviceKey)) continue;

    for (const pattern of entry.patterns) {
      if (byService.has(entry.serviceKey)) break;
      const flags = pattern.flags.includes("g")
        ? pattern.flags
        : `${pattern.flags}g`;
      const globalRe = new RegExp(pattern.source, flags);

      for (const match of text.matchAll(globalRe)) {
        const start = match.index ?? 0;
        const forwardWindow = text.slice(start, start + windowSize);
        const backwardWindow = text.slice(
          Math.max(0, start - 45),
          start + match[0].length,
        );

        const forwardFound = matchPriceInWindow(forwardWindow);
        const found = forwardFound ?? matchPriceInWindow(backwardWindow);

        if (found) {
          const snippetSource = forwardFound ? forwardWindow : backwardWindow;
          byService.set(entry.serviceKey, {
            serviceKey: entry.serviceKey,
            ...found,
            method,
            snippet: snippetSource.replace(/\n/g, " · ").slice(0, 110).trim(),
          });
          break;
        }
      }
    }
  }
}

async function extractWithGemini(
  websiteUrl: string,
  contextText: string,
): Promise<ExtractedPrice[] | null> {
  const ai = getGeminiClient();
  if (!ai || !contextText.trim()) return null;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Target website: ${websiteUrl}\n\nExtracted pricing & service text:\n${contextText}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          "You extract verified service prices from website text or SPA translation bundles. " +
          "Map each explicitly priced service to the matching serviceKey from: " +
          "[carpetArea, carpetFlooring, upholsteryChair, cornerSofa, twoSeatCouch, acService, heatPumpCheck, ductCleaning, leakRepair, boilerService, drainUnclog]. " +
          "Never guess or invent missing prices. Do not confuse group lists or neighboring items (e.g., do not assign a pouf price to cornerSofa, or an armchair price to upholsteryChair). " +
          "Return only entries that have an explicit numeric price.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            prices: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  serviceKey: { type: Type.STRING },
                  detectedAmount: { type: Type.NUMBER },
                  detectedCurrency: { type: Type.STRING },
                  snippet: { type: Type.STRING },
                },
                required: [
                  "serviceKey",
                  "detectedAmount",
                  "detectedCurrency",
                  "snippet",
                ],
              },
            },
          },
          required: ["prices"],
        },
      },
    });

    const parsed = parseJsonSafe<{
      prices?: Array<{
        serviceKey?: string;
        detectedAmount?: number;
        detectedCurrency?: string;
        snippet?: string;
      }>;
    }>(response.text, {});

    if (!Array.isArray(parsed.prices)) return null;

    const deduped = new Map<ServiceKey, ExtractedPrice>();
    for (const item of parsed.prices) {
      const key = item.serviceKey as ServiceKey;
      if (!VALID_SERVICE_KEYS.has(key) || deduped.has(key)) continue;
      const amount = Number(item.detectedAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currency = normalizeCurrency(item.detectedCurrency);

      deduped.set(key, {
        serviceKey: key,
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
        method: "gemini-ai",
        snippet: String(item.snippet ?? "")
          .slice(0, 110)
          .trim(),
      });
    }

    return Array.from(deduped.values());
  } catch {
    return null;
  }
}

function findPricingSubpages(html: string, baseUrl: URL): string[] {
  const candidates = new Set<string>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hintRe = /(cennik|pricing|oferta|ceny|us[łl]ug|services|rates)/i;

  for (const match of html.matchAll(linkRe)) {
    const href = match[1].trim();
    const label = match[2].replace(/<[^>]+>/g, " ").trim();
    if (!hintRe.test(href) && !hintRe.test(label)) continue;
    if (/\.(pdf|jpg|jpeg|png|webp|svg)$/i.test(href)) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin !== baseUrl.origin) continue;
      if (resolved.pathname === baseUrl.pathname) continue;
      candidates.add(resolved.toString());
    } catch {
      continue;
    }
  }

  return Array.from(candidates).slice(0, 2);
}

function findSameOriginScripts(html: string, baseUrl: URL): string[] {
  const scripts = new Set<string>();
  const scriptRe = /<script[^>]+src=["']([^"']+)["']/gi;

  for (const match of html.matchAll(scriptRe)) {
    try {
      const resolved = new URL(match[1].trim(), baseUrl);
      if (resolved.origin !== baseUrl.origin) continue;
      if (!resolved.pathname.endsWith(".js")) continue;
      scripts.add(resolved.toString());
    } catch {
      continue;
    }
  }

  return Array.from(scripts).slice(0, 2);
}

async function fetchTextSafe(targetUrl: string): Promise<string | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NorthstarOps-PriceSync/1.0 (+https://northstar-ops.app)",
        Accept: "text/html,application/xhtml+xml,application/javascript,*/*",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function handleSync(rawUrl: string) {
  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return NextResponse.json(
      { error: "Only HTTP/HTTPS URLs are allowed" },
      { status: 400 },
    );
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    return NextResponse.json(
      { error: "Private or local network hosts are blocked" },
      { status: 400 },
    );
  }

  const html = await fetchTextSafe(parsedUrl.toString());
  if (!html) {
    return NextResponse.json(
      { error: "Failed to fetch target website" },
      { status: 502 },
    );
  }

  const contextLines: string[] = [];
  const mainCleanText = htmlToCleanText(html);
  if (mainCleanText) contextLines.push(...mainCleanText.split("\n"));

  const subpages = findPricingSubpages(html, parsedUrl);
  for (const subUrl of subpages) {
    const subHtml = await fetchTextSafe(subUrl);
    if (!subHtml) continue;
    contextLines.push(...htmlToCleanText(subHtml).split("\n"));
  }

  if (mainCleanText.length < 800 || contextLines.length < 15) {
    const scripts = findSameOriginScripts(html, parsedUrl);
    for (const scriptUrl of scripts) {
      const jsText = await fetchTextSafe(scriptUrl);
      if (!jsText) continue;
      contextLines.push(...decodeJsBundleLines(jsText));
    }
  }

  const highSignalContext = buildHighSignalContext(contextLines);
  const aiPrices = await extractWithGemini(
    parsedUrl.toString(),
    highSignalContext,
  );

  if (aiPrices && aiPrices.length > 0) {
    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      url: parsedUrl.toString(),
      fetchedAt: new Date().toISOString(),
      extractedCount: aiPrices.length,
      prices: aiPrices,
    });
  }

  const byService = extractFromJsonLd(html);
  const fullContext = contextLines.join("\n");
  scanTextIntoMap(
    fullContext,
    subpages.length > 0 ? "subpage" : "html-text",
    byService,
  );
  const extracted = Array.from(byService.values());

  return NextResponse.json({
    source: "live-website",
    aiEnhanced: false,
    url: parsedUrl.toString(),
    fetchedAt: new Date().toISOString(),
    extractedCount: extracted.length,
    prices: extracted,
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (!url) {
    return NextResponse.json(
      { error: "Missing ?url= parameter" },
      { status: 400 },
    );
  }
  return handleSync(url);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { url?: string };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json(
      { error: "Missing url in request body" },
      { status: 400 },
    );
  }
  return handleSync(url);
}
