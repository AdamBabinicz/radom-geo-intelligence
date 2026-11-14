import { ThinkingLevel, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import type { ServiceUnitType } from "@/src/config/industries";

export const runtime = "nodejs";

interface ExtractedPrice {
  serviceKey: string;
  labelPl: string;
  labelEn: string;
  unitType: ServiceUnitType;
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: "PLN" | "USD" | "EUR";
  method: "gemini-ai" | "json-ld" | "html-text" | "subpage" | "spa-bundle";
  snippet: string;
}

interface GeminiExtractResult {
  prices: ExtractedPrice[] | null;
  warning?: string;
}

interface CachedSyncPayload {
  expiresAt: number;
  url: string;
  fetchedAt: string;
  prices: ExtractedPrice[];
}

const SYNC_CACHE_TTL_MS = 15 * 60 * 1000;
const syncSuccessCache = new Map<string, CachedSyncPayload>();

const CANONICAL_SERVICE_KEYS = new Set<string>([
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

interface FallbackKeywordRule {
  serviceKey: string;
  labelPl: string;
  labelEn: string;
  unitType: ServiceUnitType;
  patterns: RegExp[];
}

const FALLBACK_SERVICE_RULES: FallbackKeywordRule[] = [
  {
    serviceKey: "carpetArea",
    labelPl: "Pranie dywanów (za m²)",
    labelEn: "Carpet washing (per m²)",
    unitType: "m2",
    patterns: [
      /prani[ea]\s+dywan[óo]w/gi,
      /czyszczenie\s+dywan/gi,
      /carpet\s+washing/gi,
    ],
  },
  {
    serviceKey: "carpetFlooring",
    labelPl: "Pranie wykładzin (za m²)",
    labelEn: "Fitted carpet cleaning (per m²)",
    unitType: "m2",
    patterns: [
      /prani[ea]\s+wyk[łl]adzin/gi,
      /czyszczenie\s+wyk[łl]adzin/gi,
      /fitted\s+carpet/gi,
    ],
  },
  {
    serviceKey: "upholsteryChair",
    labelPl: "Tapicerka — krzesło (za szt.)",
    labelEn: "Upholstery — chair (per pc)",
    unitType: "piece",
    patterns: [/krzes[łl][oa]/gi, /upholstery\s+chair/gi],
  },
  {
    serviceKey: "live:pouf-cleaning",
    labelPl: "Pranie pufy (za szt.)",
    labelEn: "Pouf / ottoman cleaning (per pc)",
    unitType: "piece",
    patterns: [/puf[ayę]?/gi, /ottoman/gi],
  },
  {
    serviceKey: "live:armchair-cleaning",
    labelPl: "Pranie fotela",
    labelEn: "Armchair cleaning",
    unitType: "fixed",
    patterns: [/fotel[aui]?/gi, /armchair/gi],
  },
  {
    serviceKey: "twoSeatCouch",
    labelPl: "Pranie kanapy / wersalki",
    labelEn: "Sofa / couch cleaning",
    unitType: "fixed",
    patterns: [
      /kanap[ayę]/gi,
      /wersalk[aię]/gi,
      /tapczan/gi,
      /2-seater/gi,
      /two-seat/gi,
    ],
  },
  {
    serviceKey: "cornerSofa",
    labelPl: "Czyszczenie narożnika / sofy",
    labelEn: "Corner sofa cleaning",
    unitType: "fixed",
    patterns: [/naro[żz]nik/gi, /corner\s+sofa/gi],
  },
  {
    serviceKey: "live:mattress-cleaning",
    labelPl: "Pranie materaca",
    labelEn: "Mattress cleaning",
    unitType: "fixed",
    patterns: [/materac/gi, /mattress/gi],
  },
  {
    serviceKey: "live:car-upholstery",
    labelPl: "Pranie tapicerki samochodowej",
    labelEn: "Car interior upholstery cleaning",
    unitType: "fixed",
    patterns: [
      /tapicerk[aię]\s+samochodow/gi,
      /auta|samochod/gi,
      /car\s+upholstery/gi,
    ],
  },
  {
    serviceKey: "live:impregnation",
    labelPl: "Impregnacja tapicerki",
    labelEn: "Fabric protection / impregnation",
    unitType: "fixed",
    patterns: [/impregnacj/gi, /protector|scotchgard/gi],
  },
  {
    serviceKey: "live:ozonation",
    labelPl: "Ozonowanie pomieszczeń / mebli",
    labelEn: "Ozone odor neutralization",
    unitType: "fixed",
    patterns: [/ozonowani/gi, /ozone/gi],
  },
  {
    serviceKey: "live:paver-cleaning",
    labelPl: "Mycie kostki brukowej (za m²)",
    labelEn: "Paver pressure washing (per m²)",
    unitType: "m2",
    patterns: [/kostk[aię]\s+brukow/gi, /paver/gi],
  },
  {
    serviceKey: "live:tile-cleaning",
    labelPl: "Mycie płytek / tarasu (za m²)",
    labelEn: "Tile & patio washing (per m²)",
    unitType: "m2",
    patterns: [/p[łl]yt(?:ki|ek|y)|taras/gi, /tile\s+clean/gi],
  },
  {
    serviceKey: "live:drying-service",
    labelPl: "Dosuszanie / wynajem wentylatora (za szt.)",
    labelEn: "Air mover drying service (per pc)",
    unitType: "piece",
    patterns: [/dosusz/gi, /drying/gi],
  },
  {
    serviceKey: "acService",
    labelPl: "Przegląd klimatyzacji (split)",
    labelEn: "AC unit inspection (split)",
    unitType: "fixed",
    patterns: [/przegl[ąa]d\s+klimatyzacj/gi, /ac\s+unit\s+inspection/gi],
  },
  {
    serviceKey: "heatPumpCheck",
    labelPl: "Serwis pompy ciepła",
    labelEn: "Heat pump service",
    unitType: "fixed",
    patterns: [/pomp[ayę]\s+ciep[łl]a/gi, /heat\s+pump\s+service/gi],
  },
  {
    serviceKey: "ductCleaning",
    labelPl: "Czyszczenie wentylacji (za m²)",
    labelEn: "Air duct cleaning (per m²)",
    unitType: "m2",
    patterns: [/czyszczenie\s+wentylacj/gi, /duct\s+cleaning/gi],
  },
  {
    serviceKey: "leakRepair",
    labelPl: "Usuwanie wycieku (pilne)",
    labelEn: "Urgent leak repair",
    unitType: "fixed",
    patterns: [/usuwanie\s+wyciek/gi, /leak\s+repair/gi],
  },
  {
    serviceKey: "boilerService",
    labelPl: "Przegląd kotła / pieca",
    labelEn: "Boiler / furnace inspection",
    unitType: "fixed",
    patterns: [/przegl[ąa]d\s+kot[łl]a/gi, /boiler\s+inspection/gi],
  },
  {
    serviceKey: "drainUnclog",
    labelPl: "Udrażnianie kanalizacji",
    labelEn: "Drain & sewer unclogging",
    unitType: "fixed",
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

function normalizeUnitType(raw: unknown): ServiceUnitType {
  const val = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (val === "m2" || val === "sqm" || val === "m²") return "m2";
  if (val === "piece" || val === "pc" || val === "pcs" || val === "unit") {
    return "piece";
  }
  return "fixed";
}

function toAsciiSlug(input: string): string {
  const plMap: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ź: "z",
    ż: "z",
  };
  return input
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => plMap[ch] ?? ch)
    .replace(/^live:/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeExtractedServiceKey(
  rawKey: unknown,
  fallbackLabel: string,
): string {
  const raw = typeof rawKey === "string" ? rawKey.trim() : "";
  if (CANONICAL_SERVICE_KEYS.has(raw)) {
    return raw;
  }
  const slug = toAsciiSlug(raw || fallbackLabel);
  return slug ? `live:${slug}` : "";
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

function extractFromJsonLd(html: string): Map<string, ExtractedPrice> {
  const results = new Map<string, ExtractedPrice>();
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
    let matchedRule: FallbackKeywordRule | null = null;
    for (const entry of FALLBACK_SERVICE_RULES) {
      const matched = entry.patterns.some((re) => {
        const testRe = new RegExp(re.source, re.flags.replace("g", ""));
        return testRe.test(offer.name);
      });
      if (matched) {
        matchedRule = entry;
        break;
      }
    }
    const key =
      matchedRule?.serviceKey ?? normalizeExtractedServiceKey("", offer.name);
    if (!key || results.has(key)) continue;
    results.set(key, {
      serviceKey: key,
      labelPl: matchedRule?.labelPl ?? offer.name.slice(0, 70).trim(),
      labelEn: matchedRule?.labelEn ?? offer.name.slice(0, 70).trim(),
      unitType:
        matchedRule?.unitType ??
        (/m2|m²/i.test(offer.name)
          ? "m2"
          : /szt|pc/i.test(offer.name)
            ? "piece"
            : "fixed"),
      pricePln: toPln(offer.amount, offer.currency),
      detectedAmount: offer.amount,
      detectedCurrency: offer.currency,
      method: "json-ld",
      snippet: offer.name.slice(0, 95).trim(),
    });
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
    /(?:([a-zA-Z0-9_]{2,40}):\s*)?(?:"((?:[^"\\]|\\.){2,240})"|'((?:[^'\\]|\\.){2,240})')/g;
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
    /(z[łl]|pln|usd|eur|\$|€|cennik|price|pricing|od\s+\d+|m²|m2|szt\.?|dywan|wyk[łl]adzin|tapicerk|krzes|naro[żz]nik|sofa|kanap|fotel|wersalk|tapczan|materac|kostk|p[łl]yt|taras|dosusz|ozon|impregn|sk[óo]r|carpet|floor|chair|sofa|couch|armchair|mattress|paver|tile|drying|klimatyzac|pomp|wentylac|kocio|wyciek|kanaliz|hvac|plumb|boiler|drain|us[łl]ug|pranie|mycie|czyszczen)/i;
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
  const seen = new Set<string>();
  const uniqueLines: string[] = [];
  Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .forEach((idx) => {
      const trimmed = lines[idx]?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        uniqueLines.push(trimmed);
      }
    });
  const fallbackLines = uniqueLines.length > 0 ? uniqueLines : lines;
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
  byService: Map<string, ExtractedPrice>,
) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 1);

  const tryMatchSegment = (
    entry: FallbackKeywordRule,
    segment: string,
  ): boolean => {
    for (const pattern of entry.patterns) {
      const testRe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const match = segment.match(testRe);
      if (!match || match.index === undefined) continue;
      const forward = segment.slice(match.index, match.index + 140);
      const found = matchPriceInWindow(forward) ?? matchPriceInWindow(segment);
      if (found) {
        byService.set(entry.serviceKey, {
          serviceKey: entry.serviceKey,
          labelPl: entry.labelPl,
          labelEn: entry.labelEn,
          unitType: entry.unitType,
          ...found,
          method,
          snippet: segment.slice(0, 110).trim(),
        });
        return true;
      }
    }
    return false;
  };

  for (const entry of FALLBACK_SERVICE_RULES) {
    if (byService.has(entry.serviceKey)) continue;
    let matched = false;
    for (let i = 0; i < lines.length && !matched; i++) {
      matched = tryMatchSegment(entry, lines[i]);
    }
    if (!matched) {
      for (let i = 0; i < lines.length - 1 && !matched; i++) {
        const pair = `${lines[i]} · ${lines[i + 1]}`;
        if (pair.length <= 180) {
          matched = tryMatchSegment(entry, pair);
        }
      }
    }
  }
}

async function extractWithGemini(
  websiteUrl: string,
  contextText: string,
): Promise<GeminiExtractResult> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      prices: null,
      warning: "GEMINI_API_KEY is not available in Next.js server process.",
    };
  }
  if (!contextText.trim()) {
    return {
      prices: null,
      warning:
        "No high-signal pricing text was extracted from the target site.",
    };
  }
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Target website: ${websiteUrl}\n\nExtracted pricing & service text:\n${contextText}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction:
          "You dynamically discover and extract EVERY explicitly priced customer service published on a company website or its SPA JS bundle (up to 20 distinct services). " +
          "Canonical keys to reuse ONLY when the service clearly matches: " +
          "[carpetArea (carpet/dywan per m²), carpetFlooring (fitted carpet/wykładzina per m²), upholsteryChair (chair/krzesło per piece), twoSeatCouch (couch/sofa/kanapa/wersalka), cornerSofa (corner sofa/narożnik), acService, heatPumpCheck, ductCleaning, leakRepair, boilerService, drainUnclog]. " +
          "For ANY other service offered on the site (e.g., armchair/fotel, mattress/materac, paver washing/kostka brukowa, tile/terrace washing/płytki, drying fan/dosuszanie, leather care, ozone treatment, etc.), generate a clean descriptive slug prefixed with 'live:' (e.g., 'live:armchair-cleaning', 'live:paver-cleaning', 'live:mattress-double', 'live:tile-cleaning', 'live:drying-service'). " +
          "For EVERY item provide concise natural 'labelPl' and 'labelEn' (include unit hint like '(za m²)' / '(per m²)' or '(za szt.)' / '(per pc)' when unit-priced), 'unitType' ('m2', 'piece', or 'fixed'), and 'detectedAmount' (for price ranges like '200-250 zł', use the starting price 200). " +
          "Never invent prices, never include minimum order thresholds or travel fees as services, and never merge distinct items (e.g., keep chair, armchair, couch, corner sofa, single vs double mattress separate when separately priced).",
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
                  labelPl: { type: Type.STRING },
                  labelEn: { type: Type.STRING },
                  unitType: { type: Type.STRING },
                  detectedAmount: { type: Type.NUMBER },
                  detectedCurrency: { type: Type.STRING },
                  snippet: { type: Type.STRING },
                },
                required: [
                  "serviceKey",
                  "labelPl",
                  "labelEn",
                  "unitType",
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
        labelPl?: string;
        labelEn?: string;
        unitType?: string;
        detectedAmount?: number;
        detectedCurrency?: string;
        snippet?: string;
      }>;
    }>(response.text, {});
    if (!Array.isArray(parsed.prices)) {
      console.warn(
        "[/api/pricing/sync] Gemini returned non-JSON or missing prices array:",
        (response.text ?? "").slice(0, 200),
      );
      return {
        prices: null,
        warning: "Gemini response did not contain a valid prices array.",
      };
    }
    const deduped = new Map<string, ExtractedPrice>();
    for (const item of parsed.prices) {
      const labelEn = String(item.labelEn ?? item.labelPl ?? "").trim();
      const labelPl = String(item.labelPl ?? item.labelEn ?? "").trim();
      if (!labelPl && !labelEn) continue;
      const key = normalizeExtractedServiceKey(
        item.serviceKey,
        labelEn || labelPl,
      );
      if (!key || deduped.has(key)) continue;
      const amount = Number(item.detectedAmount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const currency = normalizeCurrency(item.detectedCurrency);
      deduped.set(key, {
        serviceKey: key,
        labelPl: labelPl.slice(0, 80),
        labelEn: labelEn.slice(0, 80),
        unitType: normalizeUnitType(item.unitType),
        pricePln: toPln(amount, currency),
        detectedAmount: amount,
        detectedCurrency: currency,
        method: "gemini-ai",
        snippet: String(item.snippet ?? "")
          .slice(0, 110)
          .trim(),
      });
    }
    const list = Array.from(deduped.values());
    if (list.length === 0) {
      return {
        prices: null,
        warning: "Gemini extracted 0 priced services from target context.",
      };
    }
    return { prices: list };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? "Unknown error");
    console.error("[/api/pricing/sync] extractWithGemini error:", message);
    return {
      prices: null,
      warning: `Gemini extraction error: ${message.slice(0, 260)}`,
    };
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
  return Array.from(candidates).slice(0, 3);
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
  return Array.from(scripts).slice(0, 4);
}

async function fetchTextSafe(targetUrl: string): Promise<string | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NorthstarOps-PriceSync/2.0 (+https://northstar-ops.app)",
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

  const normalizedKey = parsedUrl.toString().toLowerCase();
  const cached = syncSuccessCache.get(normalizedKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      cached: true,
      url: cached.url,
      fetchedAt: cached.fetchedAt,
      extractedCount: cached.prices.length,
      prices: cached.prices,
    });
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
  const aiResult = await extractWithGemini(
    parsedUrl.toString(),
    highSignalContext,
  );
  if (aiResult.prices && aiResult.prices.length > 0) {
    const fetchedAt = new Date().toISOString();
    syncSuccessCache.set(normalizedKey, {
      expiresAt: Date.now() + SYNC_CACHE_TTL_MS,
      url: parsedUrl.toString(),
      fetchedAt,
      prices: aiResult.prices,
    });
    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      url: parsedUrl.toString(),
      fetchedAt,
      extractedCount: aiResult.prices.length,
      prices: aiResult.prices,
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
    warning:
      aiResult.warning ??
      "AI extraction returned no prices; used regex/JSON-LD fallback.",
    url: parsedUrl.toString(),
    fetchedAt: new Date().toISOString(),
    extractedCount: extracted.length,
    prices: extracted,
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
    if (!url) {
      return NextResponse.json(
        { error: "Missing ?url= parameter" },
        { status: 400 },
      );
    }
    return await handleSync(url);
  } catch (err) {
    console.error("[/api/pricing/sync GET] error:", err);
    return NextResponse.json({ error: "Pricing sync failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { url?: string };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { error: "Missing url in request body" },
        { status: 400 },
      );
    }
    return await handleSync(url);
  } catch (err) {
    console.error("[/api/pricing/sync POST] error:", err);
    return NextResponse.json({ error: "Pricing sync failed" }, { status: 502 });
  }
}
