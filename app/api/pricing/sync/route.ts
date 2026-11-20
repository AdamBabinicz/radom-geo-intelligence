import { ThinkingLevel, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import type { ServiceUnitType } from "@/src/config/industries";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AI_CONTEXT_CHARS = 11_000;
const MAX_EXTRACTED_ITEMS = 35;
const SYNC_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_SYNC_CACHE_ENTRIES = 80;
const FETCH_HTML_TIMEOUT_MS = 8_000;
const FETCH_ASSET_TIMEOUT_MS = 6_000;
const GEMINI_TIMEOUT_MS = 15_000;
const GROQ_MODEL_TIMEOUT_MS = 10_000;
const GROQ_TOTAL_BUDGET_MS = 20_000;

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
const GROQ_FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
] as const;

export type DetectedIndustryMatch =
  | "upholstery"
  | "hvac"
  | "plumbing"
  | "custom";

export interface SiteProfile {
  businessName?: string;
  nichePl: string;
  nicheEn: string;
  matchedIndustryId: DetectedIndustryMatch;
  searchQueriesPl: string[];
  searchQueriesEn: string[];
}

interface ExtractedPrice {
  serviceKey: string;
  labelPl: string;
  labelEn: string;
  unitType: ServiceUnitType;
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: "PLN" | "USD" | "EUR";
  method:
    | "gemini-ai"
    | "groq-ai"
    | "json-ld"
    | "html-text"
    | "subpage"
    | "spa-bundle";
  snippet: string;
}

interface AiExtractResult {
  prices: ExtractedPrice[] | null;
  siteProfile?: SiteProfile;
  aiProvider?: "gemini" | "groq";
  warning?: string;
}

interface CachedSyncPayload {
  expiresAt: number;
  url: string;
  fetchedAt: string;
  aiProvider?: "gemini" | "groq";
  siteProfile?: SiteProfile;
  prices: ExtractedPrice[];
}

interface HtmlMetadata {
  title: string;
  description: string;
  headings: string[];
}

interface JsStringDictionary {
  flat: Map<string, string>;
  scoped: Map<string, string>;
}

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

const UPHOLSTERY_DETECTION_KEYS = new Set<string>([
  "carpetArea",
  "carpetFlooring",
  "upholsteryChair",
  "cornerSofa",
  "twoSeatCouch",
  "live:armchair-cleaning",
  "live:mattress-cleaning",
  "live:paver-cleaning",
]);

const HVAC_DETECTION_KEYS = new Set<string>([
  "acService",
  "heatPumpCheck",
  "ductCleaning",
]);

const PLUMBING_DETECTION_KEYS = new Set<string>([
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
      /\bcarpet\b/gi,
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
      /wyk[łl]adzin/gi,
      /fitted\s+carpet/gi,
      /\bfloor\b/gi,
    ],
  },
  {
    serviceKey: "upholsteryChair",
    labelPl: "Tapicerka — krzesło (za szt.)",
    labelEn: "Upholstery — chair (per pc)",
    unitType: "piece",
    patterns: [/krzes[łl][oa]/gi, /upholstery\s+chair/gi, /\bchair\b/gi],
  },
  {
    serviceKey: "live:pouf-cleaning",
    labelPl: "Pranie pufy (za szt.)",
    labelEn: "Pouf / ottoman cleaning (per pc)",
    unitType: "piece",
    patterns: [/puf[ayę]?/gi, /\bpouf\b/gi, /ottoman/gi],
  },
  {
    serviceKey: "live:armchair-cleaning",
    labelPl: "Pranie fotela",
    labelEn: "Armchair cleaning",
    unitType: "fixed",
    patterns: [/fotel[aui]?/gi, /\barmchair\b/gi],
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
      /\bsofa[23]?\b/gi,
      /\bcouch\b/gi,
    ],
  },
  {
    serviceKey: "cornerSofa",
    labelPl: "Czyszczenie narożnika / sofy",
    labelEn: "Corner sofa cleaning",
    unitType: "fixed",
    patterns: [/naro[żz]nik/gi, /corner\s+sofa/gi, /\bcorner\b/gi],
  },
  {
    serviceKey: "live:mattress-cleaning",
    labelPl: "Pranie materaca",
    labelEn: "Mattress cleaning",
    unitType: "fixed",
    patterns: [/materac/gi, /\bmattress[12]?\b/gi],
  },
  {
    serviceKey: "live:car-upholstery",
    labelPl: "Pranie tapicerki samochodowej",
    labelEn: "Car interior upholstery cleaning",
    unitType: "fixed",
    patterns: [/tapicerk[aię]\s+samochodow/gi, /car\s+upholstery/gi],
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
    patterns: [/kostk[aię]\s+brukow/gi, /\bpaver\b/gi],
  },
  {
    serviceKey: "live:tile-cleaning",
    labelPl: "Mycie płytek / tarasu (za m²)",
    labelEn: "Tile & patio washing (per m²)",
    unitType: "m2",
    patterns: [/p[łl]yt(?:ki|ek|y)|taras/gi, /tile\s+clean/gi, /\btile\b/gi],
  },
  {
    serviceKey: "live:drying-service",
    labelPl: "Dosuszanie / wynajem wentylatora (za szt.)",
    labelEn: "Air mover drying service (per pc)",
    unitType: "piece",
    patterns: [/dosusz/gi, /\bdrying\b/gi],
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

function writeSuccessCache(key: string, payload: CachedSyncPayload) {
  if (syncSuccessCache.has(key)) {
    syncSuccessCache.delete(key);
  }
  const now = Date.now();
  for (const [entryKey, entryVal] of syncSuccessCache.entries()) {
    if (entryVal.expiresAt <= now) {
      syncSuccessCache.delete(entryKey);
    }
  }
  while (syncSuccessCache.size >= MAX_SYNC_CACHE_ENTRIES) {
    const oldestKey = syncSuccessCache.keys().next().value;
    if (!oldestKey) break;
    syncSuccessCache.delete(oldestKey);
  }
  syncSuccessCache.set(key, payload);
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlMetadata(html: string): HtmlMetadata {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities(titleMatch?.[1] ?? "").slice(0, 140);
  const descMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]*?)["']/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]*name=["']description["']/i,
    );
  const description = decodeHtmlEntities(descMatch?.[1] ?? "").slice(0, 260);
  const headings: string[] = [];
  const headingRe = /<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi;
  for (const match of html.matchAll(headingRe)) {
    const cleaned = decodeHtmlEntities(match[1] ?? "");
    if (
      cleaned.length >= 3 &&
      cleaned.length <= 120 &&
      !headings.includes(cleaned)
    ) {
      headings.push(cleaned);
    }
    if (headings.length >= 3) break;
  }
  return { title, description, headings };
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
  if (
    val === "piece" ||
    val === "pc" ||
    val === "pcs" ||
    val === "unit" ||
    val === "szt" ||
    val === "szt."
  ) {
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
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/(&sup2;|&#178;)/gi, "²")
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function decodeJsEscapes(raw: string): string {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\n/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\u00a0/g, " ");
}

function isJsArtifactLine(line: string): boolean {
  return (
    /\$1|\$2|=>|&&|\{\}|\bfunction\s*\(|\bclassName\b|\bdisplayName\b|\bcreateElement\b|^\s*[,;\]})]/i.test(
      line,
    ) ||
    /^(?:https?:|\/assets\/|\/static\/|#|rgba?\(|M\d|L\d|(?:flex|grid|text|bg|px|py|mx|my|rounded|border|shadow)-)/i.test(
      line,
    )
  );
}

function formatReadableKeySlug(rawKey: string): string {
  return rawKey
    .replace(
      /^(?:attractionsData|specification\.label|modalContent|service|services|offer|offers|pricing|priceList)\./i,
      "",
    )
    .replace(/(?:PriceTag|Price|Cost|Rate|Fee|Item|RentalItem)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBalancedObjectSlice(
  source: string,
  braceStartIdx: number,
  maxLen = 28_000,
): string {
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  const limit = Math.min(source.length, braceStartIdx + maxLen);
  for (let i = braceStartIdx; i < limit; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStartIdx + 1, i);
      }
    }
  }
  return "";
}

function extractParenCallSlice(
  source: string,
  parenStartIdx: number,
  maxLen = 2_400,
): string {
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  const limit = Math.min(source.length, parenStartIdx + maxLen);
  for (let i = parenStartIdx; i < limit; i += 1) {
    const ch = source[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(parenStartIdx, i + 1);
      }
    }
  }
  return "";
}

function extractJsxChildrenExpr(elementSlice: string): string {
  const childrenIdx = elementSlice.indexOf("children:");
  if (childrenIdx !== -1) {
    let i = childrenIdx + "children:".length;
    while (i < elementSlice.length && /\s/.test(elementSlice[i])) i += 1;
    let depth = 0;
    let inStr: string | null = null;
    let esc = false;
    for (let j = i; j < elementSlice.length; j += 1) {
      const ch = elementSlice[j];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === "\\") {
          esc = true;
          continue;
        }
        if (ch === inStr) {
          inStr = null;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === "(" || ch === "[" || ch === "{") {
        depth += 1;
      } else if (ch === ")" || ch === "]" || ch === "}") {
        if (depth === 0) return elementSlice.slice(i, j);
        depth -= 1;
      } else if (ch === "," && depth === 0) {
        return elementSlice.slice(i, j);
      }
    }
    return elementSlice.slice(i);
  }

  // Fallback for React.createElement("td", props, ...children)
  let commaCount = 0;
  let depth = 0;
  let inStr: string | null = null;
  let esc = false;
  for (let i = 0; i < elementSlice.length; i += 1) {
    const ch = elementSlice[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
    } else if (ch === "," && depth === 1) {
      commaCount += 1;
      if (commaCount === 2) {
        return elementSlice.slice(i + 1, -1);
      }
    }
  }
  return "";
}

function buildSharedJsDictionary(jsTexts: string[]): JsStringDictionary {
  const flat = new Map<string, string>();
  const scoped = new Map<string, string>();
  const keyPairRe =
    /(?:["']([a-zA-Z0-9_.-]{2,90})["']|([a-zA-Z0-9_.-]{2,48}))\s*:\s*(?:"((?:[^"\\]|\\.){1,220})"|'((?:[^'\\]|\\.){1,220})')/g;
  const nsRe =
    /(?:["']([a-zA-Z0-9_-]{2,48})["']|([a-zA-Z0-9_-]{2,48}))\s*:\s*\{/g;

  for (const js of jsTexts) {
    for (const match of js.matchAll(keyPairRe)) {
      const key = match[1] ?? match[2];
      const value = (match[3] ?? match[4] ?? "").replace(/\s+/g, " ").trim();
      if (!key || !value || isJsArtifactLine(value)) continue;
      if (!flat.has(key)) {
        flat.set(key, value);
      }
    }

    for (const nsMatch of js.matchAll(nsRe)) {
      const ns = nsMatch[1] ?? nsMatch[2];
      if (!ns) continue;
      const braceIdx = (nsMatch.index ?? 0) + nsMatch[0].length - 1;
      const block = extractBalancedObjectSlice(js, braceIdx);
      if (!block || block.includes("=>") || block.includes("children:")) {
        continue;
      }
      for (const km of block.matchAll(keyPairRe)) {
        const key = km[1] ?? km[2];
        const value = (km[3] ?? km[4] ?? "").replace(/\s+/g, " ").trim();
        if (!key || !value || isJsArtifactLine(value)) continue;
        const fullKey = `${ns}.${key}`;
        if (!scoped.has(fullKey)) {
          scoped.set(fullKey, value);
        }
      }
    }
  }

  return { flat, scoped };
}

function resolveDictionaryKey(
  key: string | undefined,
  dict: JsStringDictionary,
  fallbackToSlug = false,
): string {
  if (!key) return "";
  if (dict.scoped.has(key)) return dict.scoped.get(key) ?? "";
  if (dict.flat.has(key)) return dict.flat.get(key) ?? "";
  const tail = key.split(".").pop();
  if (tail && dict.flat.has(tail)) return dict.flat.get(tail) ?? "";
  return fallbackToSlug ? formatReadableKeySlug(key) : "";
}

function evaluateJsxCellText(expr: string, dict: JsStringDictionary): string {
  const sanitized = expr
    .replace(
      /\b(?:className|class|id|key|style|variant|size|aria-[a-z-]+|data-[a-z-]+)\s*:\s*(?:"[^"]*"|'[^']*')/g,
      "",
    )
    .replace(/(?:\.jsxs?|\.createElement)\(\s*["'][a-zA-Z0-9]+["']\s*,/g, "(")
    .replace(
      /[a-zA-Z0-9_$.]+\s*\?\s*(?:"([^"\\]{1,16})"|'([^'\\]{1,16})')\s*:\s*(?:"[^"\\]{1,16}"|'[^'\\]{1,16}')/g,
      (_, firstA: string | undefined, firstB: string | undefined) =>
        JSON.stringify(firstA ?? firstB ?? ""),
    );

  const parts: string[] = [];
  const tokenRe =
    /(?:[a-zA-Z_$][a-zA-Z0-9_$.]*\(\s*(?:"([a-zA-Z0-9_.-]{2,90})"|'([a-zA-Z0-9_.-]{2,90})')[^)]*\))|(?:"((?:[^"\\]|\\.){1,180})"|'((?:[^'\\]|\\.){1,180})')/g;

  for (const match of sanitized.matchAll(tokenRe)) {
    const i18nKey = match[1] ?? match[2];
    if (i18nKey) {
      const resolved = resolveDictionaryKey(i18nKey, dict, false);
      if (resolved) parts.push(resolved);
    } else {
      const literal = (match[3] ?? match[4] ?? "").trim();
      if (literal && !isJsArtifactLine(literal)) {
        parts.push(literal);
      }
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function decodeJsBundles(rawBundles: string[]): string[] {
  const jsTexts = rawBundles.map(decodeJsEscapes).filter(Boolean);
  if (jsTexts.length === 0) return [];

  const dict = buildSharedJsDictionary(jsTexts);
  const out: string[] = [];
  const seen = new Set<string>();
  let catalogCount = 0;

  const pushLine = (line: string) => {
    const clean = line.replace(/\s+/g, " ").trim();
    if (!clean || clean.length < 4 || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  // 1. Generic unquoted JS price objects: { ... base|price|cost|amount|rate|fee: <num> ... }
  const objPriceRe =
    /\b(?:base|price|cost|amount|rate|fee|minPrice|startingPrice)\s*:\s*(\d{1,6}(?:[.,]\d{1,2})?)\b/g;
  const catalogEntries: Array<{
    primary: string;
    label: string;
    period: string;
    line: string;
  }> = [];

  for (const js of jsTexts) {
    for (const match of js.matchAll(objPriceRe)) {
      const num = Number(match[1].replace(",", "."));
      if (!Number.isFinite(num) || num <= 0 || num > 100_000) continue;

      const idx = match.index ?? 0;
      const openBrace = js.lastIndexOf("{", idx);
      const closeBrace = js.indexOf("}", idx);
      const ownStart =
        openBrace !== -1
          ? Math.max(openBrace, idx - 260)
          : Math.max(0, idx - 200);
      const ownEnd =
        closeBrace > idx ? Math.min(closeBrace + 1, idx + 240) : idx + 200;
      const ownObj = js.slice(ownStart, ownEnd);

      const currencyRaw = ownObj.match(
        /\bcurrency\s*:\s*["']([a-zA-Z$€]{1,5})["']/i,
      )?.[1];
      const period =
        ownObj.match(/\bperiod\s*:\s*["']([^"']{1,40})["']/i)?.[1]?.trim() ??
        "";
      if (/^gratis|free$/i.test(period)) continue;

      const ownName = ownObj.match(
        /\b(?:name|title)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownLabelKey = ownObj.match(
        /\b(?:labelKey|titleKey|nameKey)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownCapKey = ownObj.match(
        /\b(?:capacityKey|variantKey|optionKey)\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];
      const ownDescKey = ownObj.match(
        /\bdescriptionKey\s*:\s*["']([^"']{2,90})["']/i,
      )?.[1];

      if (!currencyRaw && !period && !ownName && !ownLabelKey) continue;

      const widerLeft = js.slice(Math.max(0, idx - 1800), idx);
      const parentNameMatches = Array.from(
        widerLeft.matchAll(/\bname\s*:\s*["']([^"']{2,80})["']/g),
      );
      const parentName =
        parentNameMatches.length > 0
          ? parentNameMatches[parentNameMatches.length - 1][1]
          : "";
      const parentTitleMatches = Array.from(
        widerLeft.matchAll(/\btitle\s*:\s*["']([^"']{2,80})["']/g),
      );
      const parentTitle =
        parentTitleMatches.length > 0
          ? parentTitleMatches[parentTitleMatches.length - 1][1]
          : "";

      const primaryLabel = ownName || parentName || parentTitle;
      const resolvedLabel = ownLabelKey
        ? resolveDictionaryKey(ownLabelKey, dict, true)
        : "";
      const resolvedDesc = ownDescKey
        ? resolveDictionaryKey(ownDescKey, dict, true)
        : "";
      const resolvedCap = ownCapKey
        ? resolveDictionaryKey(ownCapKey, dict, true)
        : "";

      const labelParts = [
        primaryLabel,
        resolvedLabel,
        resolvedDesc,
        resolvedCap,
      ].filter((part, i, arr) => Boolean(part) && arr.indexOf(part) === i);

      if (labelParts.length === 0) continue;

      const fullLabel = labelParts.join(" — ");
      const currency = normalizeCurrency(currencyRaw || "PLN");
      const periodSuffix = period ? ` / ${period}` : "";
      catalogEntries.push({
        primary: primaryLabel,
        label: fullLabel,
        period,
        line: `CATALOG_ITEM: ${fullLabel} : ${num} ${currency}${periodSuffix}`,
      });
    }
  }

  const primariesWithDetails = new Set(
    catalogEntries
      .filter((e) => e.primary && !/^od|from$/i.test(e.period))
      .map((e) => e.primary),
  );
  for (const entry of catalogEntries) {
    if (
      /^od|from$/i.test(entry.period) &&
      entry.label === entry.primary &&
      primariesWithDetails.has(entry.primary)
    ) {
      continue;
    }
    pushLine(entry.line);
    catalogCount += 1;
  }

  // 2. Compiled React/JSX table rows (<tr><td>service</td><td>price</td></tr>) with shared i18n lookup
  for (const js of jsTexts) {
    const trRe = /(?:\.jsxs?|\.createElement)\(\s*["']tr["']\s*,/g;
    for (const trMatch of js.matchAll(trRe)) {
      const parenIdx = (trMatch.index ?? 0) + trMatch[0].indexOf("(");
      const trSlice = extractParenCallSlice(js, parenIdx, 2_200);
      if (!trSlice) continue;

      const cells: string[] = [];
      const tdRe = /(?:\.jsxs?|\.createElement)\(\s*["']td["']\s*,/g;
      for (const tdMatch of trSlice.matchAll(tdRe)) {
        const tdParenIdx = (tdMatch.index ?? 0) + tdMatch[0].indexOf("(");
        const tdSlice = extractParenCallSlice(trSlice, tdParenIdx, 800);
        if (!tdSlice) continue;
        const childrenExpr = extractJsxChildrenExpr(tdSlice);
        if (!childrenExpr) continue;
        const cellText = evaluateJsxCellText(childrenExpr, dict);
        if (cellText) cells.push(cellText);
      }

      if (cells.length < 2) continue;

      const rawLabel = cells[0].trim();
      const rawPriceCell = cells.slice(1).join(" ").trim();
      if (!rawLabel || rawLabel.length > 100) continue;
      if (
        /^(?:us[łl]uga|service|nazwa|name|opis|description)$/i.test(rawLabel)
      ) {
        continue;
      }
      if (
        /(?:dojazd|transport|kaucj|zadatek|deposit|travel|delivery|free|gratis)/i.test(
          rawLabel,
        )
      ) {
        continue;
      }

      const parsedPrice = matchPriceInWindow(rawPriceCell);
      if (!parsedPrice) continue;

      const tierPrefix = rawPriceCell.match(
        /^((?:powy[żz]ej|poni[żz]ej|do|above|over|under|up\s+to)\s+\d+\s*(?:m²|m2|szt\.?|os\.?))(?=$|\s)/i,
      )?.[1];
      const fullLabel =
        tierPrefix && !rawLabel.toLowerCase().includes(tierPrefix.toLowerCase())
          ? `${rawLabel} (${tierPrefix})`
          : rawLabel;

      const unitTarget = tierPrefix
        ? rawPriceCell.slice(tierPrefix.length)
        : rawPriceCell;
      const isPerM2 = /(?:\/\s*(?:m²|m2)|m²|m2)/i.test(unitTarget);
      const isPerPc = /(?:\/\s*(?:szt|pc|pcs)|szt\.?\b)/i.test(unitTarget);
      const periodSuffix = isPerM2 ? " / m2" : isPerPc ? " / szt" : "";

      pushLine(
        `CATALOG_ITEM: ${fullLabel} : ${parsedPrice.detectedAmount} ${parsedPrice.detectedCurrency}${periodSuffix}`,
      );
      catalogCount += 1;
    }
  }

  // 3. Generic key -> price string pairs (i18n bundles)
  const priceTextRe =
    /(?:\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])|(?:€|\$|pln|eur)\s*\d)/i;
  for (const [key, value] of dict.flat.entries()) {
    if (value.length > 180 || !priceTextRe.test(value)) continue;
    // When full catalog rows already exist, suppress generic *PriceTag card teaser badges
    if (catalogCount >= 4 && /PriceTag$/i.test(key)) continue;
    if (
      /^(?:€|\$|usd|eur)?\s*\d+(?:[.,]\d+)?\s*(?:z[łl]|pln)?$/i.test(value) &&
      key.length < 3
    ) {
      continue;
    }
    const baseKey = key.replace(/(?:PriceTag|Price|Cost|Rate|Fee)$/i, "");
    const resolvedBase =
      baseKey !== key
        ? (dict.flat.get(baseKey) ?? dict.flat.get(`${baseKey}Cleaning`) ?? "")
        : "";
    const basePrefix = resolvedBase ? `${resolvedBase} — ` : "";
    const readableKey = formatReadableKeySlug(key);
    const prefix = readableKey ? `${readableKey}: ` : "";
    pushLine(`KEY_PAIR: ${prefix}${basePrefix}${value}`);
  }

  // 4. Standalone quoted strings containing explicit currency/price
  const literalRe = /(?:"((?:[^"\\]|\\.){4,220})"|'((?:[^'\\]|\\.){4,220})')/g;
  for (const js of jsTexts) {
    for (const match of js.matchAll(literalRe)) {
      const val = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
      if (!val || isJsArtifactLine(val) || !priceTextRe.test(val)) continue;
      pushLine(val);
    }
  }

  return out;
}

function buildHighSignalContext(
  metadata: HtmlMetadata,
  lines: string[],
  maxChars = MAX_AI_CONTEXT_CHARS,
): string {
  const headerLines: string[] = [];
  if (metadata.title) headerLines.push(`SITE_TITLE: ${metadata.title}`);
  if (metadata.description) {
    headerLines.push(`SITE_DESC: ${metadata.description}`);
  }
  if (metadata.headings.length > 0) {
    headerLines.push(`SITE_HEADINGS: ${metadata.headings.join(" | ")}`);
  }

  const priceSignalRe =
    /(?:^CATALOG_ITEM:\s|^KEY_PAIR:\s|\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])|(?:€|\$|pln|eur)\s*\d|cennik|cena|od\s+\d|from\s+\d|\/\s*(?:m²|m2|szt|pc|h|godz|dzie[ńn]|day|hour|event|imprez|os))/i;

  const pickedIndices = new Set<number>();
  lines.forEach((line, idx) => {
    if (isJsArtifactLine(line)) return;
    if (priceSignalRe.test(line)) {
      if (
        !line.startsWith("CATALOG_ITEM:") &&
        !line.startsWith("KEY_PAIR:") &&
        idx > 0 &&
        !isJsArtifactLine(lines[idx - 1])
      ) {
        pickedIndices.add(idx - 1);
      }
      pickedIndices.add(idx);
    }
  });

  const seen = new Set<string>();
  const catalogLines: string[] = [];
  const keyLines: string[] = [];
  const generalLines: string[] = [];

  Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .forEach((idx) => {
      const trimmed = lines[idx]?.replace(/\s+/g, " ").trim();
      if (!trimmed || trimmed.length < 3 || seen.has(trimmed)) return;
      seen.add(trimmed);
      if (trimmed.startsWith("CATALOG_ITEM:")) {
        catalogLines.push(trimmed.replace(/^CATALOG_ITEM:\s*/, "- "));
      } else if (trimmed.startsWith("KEY_PAIR:")) {
        keyLines.push(trimmed);
      } else {
        generalLines.push(trimmed);
      }
    });

  if (
    catalogLines.length === 0 &&
    keyLines.length === 0 &&
    generalLines.length === 0
  ) {
    for (const line of lines.slice(0, 60)) {
      const trimmed = line.replace(/\s+/g, " ").trim();
      if (trimmed && !isJsArtifactLine(trimmed) && !seen.has(trimmed)) {
        seen.add(trimmed);
        generalLines.push(trimmed);
      }
    }
  }

  const ordered: string[] = [...headerLines];
  if (catalogLines.length > 0) {
    ordered.push("CATALOG_PRICE_ITEMS:");
    ordered.push(...catalogLines);
  }
  if (keyLines.length > 0) {
    ordered.push("KEYED_PRICES:");
    ordered.push(...keyLines);
  }
  if (generalLines.length > 0) {
    ordered.push("PAGE_PRICE_LINES:");
    ordered.push(...generalLines);
  }

  const chunks: string[] = [];
  let totalLen = 0;
  for (const line of ordered) {
    const nextLen = totalLen + line.length + 1;
    if (nextLen > maxChars) break;
    chunks.push(line);
    totalLen = nextLen;
  }
  return chunks.join("\n");
}

function matchPriceInWindow(windowText: string): {
  pricePln: number;
  detectedAmount: number;
  detectedCurrency: "PLN" | "USD" | "EUR";
} | null {
  if (/^\s*\+/.test(windowText)) return null;
  const priceSuffixRe =
    /(?:od|from)?\s*(\d{1,5}(?:[.,]\d{1,2})?)(?:\s*[-–]\s*\d{1,5}(?:[.,]\d{1,2})?)?\s*(z[łl]|pln|usd|eur|\$|€)/i;
  const pricePrefixRe = /(\$|€|usd|eur)\s*(\d{1,5}(?:[.,]\d{1,2})?)/i;

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

function inferUnitTypeFromText(text: string): ServiceUnitType {
  if (/m2|m²|mkw|sq\s*m/i.test(text)) return "m2";
  if (
    /(?:szt|pc|pcs|os\.|person|hour|godz|dzie[ńn]|day|imprez|event)/i.test(text)
  ) {
    return "piece";
  }
  return "fixed";
}

function parseCatalogItemsFromContext(
  contextLines: string[],
  hasSpaBundle: boolean,
): ExtractedPrice[] {
  const items: ExtractedPrice[] = [];
  const seenKeys = new Set<string>();

  for (const line of contextLines) {
    if (!line.startsWith("CATALOG_ITEM:")) continue;
    const match = line.match(
      /^CATALOG_ITEM:\s*(.+?)\s*:\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(PLN|USD|EUR)(?:\s*\/\s*(.+))?$/i,
    );
    if (!match) continue;
    const rawLabel = match[1].trim();
    const amount = Number(match[2].replace(",", "."));
    const currency = normalizeCurrency(match[3]);
    const period = (match[4] ?? "").trim();
    if (!rawLabel || !Number.isFinite(amount) || amount <= 0) continue;

    const unitSuffix = period ? ` (${period})` : "";
    const fullLabel = `${rawLabel}${unitSuffix}`.slice(0, 80);
    const slug = toAsciiSlug(fullLabel);
    if (!slug) continue;
    const key = `live:${slug}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    items.push({
      serviceKey: key,
      labelPl: fullLabel,
      labelEn: fullLabel,
      unitType: inferUnitTypeFromText(period || rawLabel),
      pricePln: toPln(amount, currency),
      detectedAmount: amount,
      detectedCurrency: currency,
      method: hasSpaBundle ? "spa-bundle" : "html-text",
      snippet: rawLabel.slice(0, 110),
    });
  }

  return items;
}

function extractDeterministicFallback(
  contextLines: string[],
  html: string,
  hasSubpages: boolean,
  hasSpaBundle: boolean,
): ExtractedPrice[] {
  const byService = extractFromJsonLd(html);

  // 1. Parse pre-extracted CATALOG_ITEM lines deterministically (industry-agnostic)
  for (const catalogItem of parseCatalogItemsFromContext(
    contextLines,
    hasSpaBundle,
  )) {
    if (!byService.has(catalogItem.serviceKey)) {
      byService.set(catalogItem.serviceKey, catalogItem);
    }
  }

  // 2. Match canonical & common service rules on KEY_PAIR + visible text lines
  interface CleanSegment {
    searchTarget: string;
    priceTarget: string;
    snippet: string;
  }

  const segments: CleanSegment[] = [];
  const plainLines: string[] = [];

  for (const line of contextLines) {
    if (line.startsWith("CATALOG_ITEM:") || line.startsWith("SITE_")) continue;
    if (line.startsWith("KEY_PAIR:")) {
      const rawBody = line.slice("KEY_PAIR:".length).trim();
      const colonIdx = rawBody.indexOf(":");
      if (colonIdx > 0) {
        const keyPart = rawBody.slice(0, colonIdx).trim();
        const valPart = rawBody.slice(colonIdx + 1).trim();
        if (!valPart || /^\s*\+/.test(valPart)) continue;
        if (/^(?:info|faq|cushions)\b/i.test(keyPart)) continue;
        segments.push({
          searchTarget: `${keyPart} ${valPart}`,
          priceTarget: valPart,
          snippet: valPart.slice(0, 110),
        });
      } else if (rawBody && !/^\s*\+/.test(rawBody)) {
        segments.push({
          searchTarget: rawBody,
          priceTarget: rawBody,
          snippet: rawBody.slice(0, 110),
        });
      }
      continue;
    }

    const cleaned = line.trim();
    if (cleaned.length > 1) {
      plainLines.push(cleaned);
      segments.push({
        searchTarget: cleaned,
        priceTarget: cleaned,
        snippet: cleaned.slice(0, 110),
      });
    }
  }

  const defaultMethod: ExtractedPrice["method"] = hasSubpages
    ? "subpage"
    : hasSpaBundle
      ? "spa-bundle"
      : "html-text";

  const tryMatchSegment = (
    entry: FallbackKeywordRule,
    seg: CleanSegment,
    useWindowFromMatch: boolean,
  ): boolean => {
    for (const pattern of entry.patterns) {
      const testRe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const match = seg.searchTarget.match(testRe);
      if (!match || match.index === undefined) continue;
      const candidateWindow = useWindowFromMatch
        ? seg.priceTarget.slice(match.index, match.index + 140)
        : seg.priceTarget;
      const found =
        matchPriceInWindow(candidateWindow) ??
        (seg.priceTarget.length <= 140
          ? matchPriceInWindow(seg.priceTarget)
          : null);
      if (found) {
        byService.set(entry.serviceKey, {
          serviceKey: entry.serviceKey,
          labelPl: entry.labelPl,
          labelEn: entry.labelEn,
          unitType: entry.unitType,
          ...found,
          method: defaultMethod,
          snippet: seg.snippet,
        });
        return true;
      }
    }
    return false;
  };

  if (byService.size < 4) {
    for (const entry of FALLBACK_SERVICE_RULES) {
      if (byService.has(entry.serviceKey)) continue;
      let matched = false;
      for (let i = 0; i < segments.length && !matched; i++) {
        const isKeyed = segments[i].searchTarget !== segments[i].priceTarget;
        matched = tryMatchSegment(entry, segments[i], !isKeyed);
      }

      if (!matched) {
        for (let i = 0; i < plainLines.length - 1 && !matched; i++) {
          const pair = `${plainLines[i]} · ${plainLines[i + 1]}`;
          if (pair.length <= 180) {
            matched = tryMatchSegment(
              entry,
              {
                searchTarget: pair,
                priceTarget: pair,
                snippet: pair.slice(0, 110),
              },
              true,
            );
          }
        }
      }
    }
  }

  return Array.from(byService.values()).slice(0, MAX_EXTRACTED_ITEMS);
}

interface RawAiPriceRow {
  serviceKey?: unknown;
  labelPl?: unknown;
  labelEn?: unknown;
  unitType?: unknown;
  detectedAmount?: unknown;
  detectedCurrency?: unknown;
  snippet?: unknown;
}

interface RawAiSiteProfile {
  businessName?: unknown;
  nichePl?: unknown;
  nicheEn?: unknown;
  matchedIndustryId?: unknown;
  searchQueriesPl?: unknown;
  searchQueriesEn?: unknown;
}

interface RawAiResponsePayload {
  siteProfile?: RawAiSiteProfile;
  prices?: RawAiPriceRow[];
}

function inferPresetFromPrices(
  prices: ExtractedPrice[],
): DetectedIndustryMatch {
  let upholsteryHits = 0;
  let hvacHits = 0;
  let plumbingHits = 0;
  for (const item of prices) {
    if (UPHOLSTERY_DETECTION_KEYS.has(item.serviceKey)) upholsteryHits++;
    if (HVAC_DETECTION_KEYS.has(item.serviceKey)) hvacHits++;
    if (PLUMBING_DETECTION_KEYS.has(item.serviceKey)) plumbingHits++;
  }
  if (upholsteryHits >= 2) return "upholstery";
  if (hvacHits >= 2) return "hvac";
  if (plumbingHits >= 2) return "plumbing";
  return "custom";
}

function normalizeSiteProfile(
  raw: RawAiSiteProfile | undefined,
  metadata: HtmlMetadata,
  prices: ExtractedPrice[],
): SiteProfile {
  const rawMatch = String(raw?.matchedIndustryId ?? "")
    .trim()
    .toLowerCase();
  const matchedIndustryId: DetectedIndustryMatch =
    rawMatch === "upholstery" || rawMatch === "hvac" || rawMatch === "plumbing"
      ? rawMatch
      : rawMatch === "custom"
        ? "custom"
        : inferPresetFromPrices(prices);

  const normalizeQueries = (list: unknown): string[] =>
    Array.isArray(list)
      ? list
          .map((q) => String(q ?? "").trim())
          .filter((q) => q.length >= 3 && q.length <= 90)
          .slice(0, 4)
      : [];

  const fallbackNiche =
    metadata.title ||
    metadata.headings[0] ||
    prices[0]?.labelPl ||
    "Lokalna firma usługowa";

  const nichePl = String(raw?.nichePl ?? "").trim() || fallbackNiche;
  const nicheEn = String(raw?.nicheEn ?? "").trim() || fallbackNiche;
  const businessName =
    String(raw?.businessName ?? "").trim() ||
    metadata.title.split(/[–—|-]/)[0]?.trim() ||
    undefined;

  const queriesPl = normalizeQueries(raw?.searchQueriesPl);
  const queriesEn = normalizeQueries(raw?.searchQueriesEn);
  if (queriesPl.length === 0) {
    const derived = prices
      .slice(0, 3)
      .map((p) => p.labelPl.replace(/\s*\([^)]*\)/g, "").trim())
      .filter(Boolean);
    if (derived.length > 0) queriesPl.push(...derived);
  }
  if (queriesEn.length === 0) {
    const derived = prices
      .slice(0, 3)
      .map((p) => p.labelEn.replace(/\s*\([^)]*\)/g, "").trim())
      .filter(Boolean);
    if (derived.length > 0) queriesEn.push(...derived);
  }

  return {
    businessName,
    nichePl: nichePl.slice(0, 90),
    nicheEn: nicheEn.slice(0, 90),
    matchedIndustryId,
    searchQueriesPl: queriesPl,
    searchQueriesEn: queriesEn,
  };
}

function normalizeAiPayload(
  parsed: RawAiResponsePayload,
  metadata: HtmlMetadata,
  method: "gemini-ai" | "groq-ai",
): { prices: ExtractedPrice[]; siteProfile: SiteProfile } | null {
  if (!Array.isArray(parsed.prices)) return null;

  const deduped = new Map<string, ExtractedPrice>();
  for (const item of parsed.prices) {
    const labelEn = String(item.labelEn ?? item.labelPl ?? "").trim();
    const labelPl = String(item.labelPl ?? item.labelEn ?? "").trim();
    if (!labelPl && !labelEn) continue;

    const amount = Number(item.detectedAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const currency = normalizeCurrency(item.detectedCurrency);
    let key = normalizeExtractedServiceKey(item.serviceKey, labelEn || labelPl);
    if (!key) continue;

    // Disambiguate distinct variants (e.g. Oriental Carpet vs Standard Carpet, <=50 m2 vs >50 m2, 2-seat vs 3-seat)
    // instead of dropping them if the model reuses a canonical key.
    const existing = deduped.get(key);
    if (existing) {
      const newSlug = toAsciiSlug(labelPl || labelEn);
      const existingSlug = toAsciiSlug(existing.labelPl || existing.labelEn);
      if (
        !newSlug ||
        (newSlug === existingSlug && existing.detectedAmount === amount)
      ) {
        continue;
      }
      let candidateKey = `live:${newSlug}`;
      let suffix = 2;
      while (deduped.has(candidateKey)) {
        candidateKey = `live:${newSlug.slice(0, 44)}-${suffix}`;
        suffix += 1;
      }
      key = candidateKey;
    }

    deduped.set(key, {
      serviceKey: key,
      labelPl: labelPl.slice(0, 80),
      labelEn: labelEn.slice(0, 80),
      unitType: normalizeUnitType(item.unitType),
      pricePln: toPln(amount, currency),
      detectedAmount: amount,
      detectedCurrency: currency,
      method,
      snippet: String(item.snippet ?? "")
        .slice(0, 110)
        .trim(),
    });
  }

  const list = Array.from(deduped.values()).slice(0, MAX_EXTRACTED_ITEMS);
  if (list.length === 0) return null;

  return {
    prices: list,
    siteProfile: normalizeSiteProfile(parsed.siteProfile, metadata, list),
  };
}

function mergeMissingCatalogRows(
  aiPrices: ExtractedPrice[],
  catalogPrices: ExtractedPrice[],
): ExtractedPrice[] {
  if (catalogPrices.length < 4 || aiPrices.length >= catalogPrices.length) {
    return aiPrices;
  }

  const normalizeWords = (text: string): string[] =>
    toAsciiSlug(text)
      .split("-")
      .filter((w) => w.length >= 3);

  const merged = [...aiPrices];
  const existingKeys = new Set(merged.map((p) => p.serviceKey));

  for (const cat of catalogPrices) {
    if (merged.length >= MAX_EXTRACTED_ITEMS) break;
    const catWords = normalizeWords(cat.labelPl);
    const catSlug = toAsciiSlug(cat.labelPl);

    const alreadyCovered = merged.some((existing) => {
      if (existing.serviceKey === cat.serviceKey) return true;
      const exSlugPl = toAsciiSlug(existing.labelPl);
      const exSlugEn = toAsciiSlug(existing.labelEn);
      if (exSlugPl === catSlug || exSlugEn === catSlug) return true;

      if (existing.detectedAmount !== cat.detectedAmount) return false;
      const exWords = new Set([
        ...normalizeWords(existing.labelPl),
        ...normalizeWords(existing.labelEn),
      ]);
      const overlap = catWords.filter((w) => exWords.has(w)).length;
      return overlap >= Math.max(1, Math.min(2, catWords.length));
    });

    if (!alreadyCovered) {
      let key = cat.serviceKey;
      let suffix = 2;
      while (existingKeys.has(key)) {
        key = `${cat.serviceKey.slice(0, 44)}-${suffix}`;
        suffix += 1;
      }
      existingKeys.add(key);
      merged.push({ ...cat, serviceKey: key });
    }
  }

  return merged;
}

const AI_SYSTEM_INSTRUCTION =
  "You are a universal pricing-page extractor and business-niche classifier for any local service website.\n" +
  "Given a compact site summary (SITE_TITLE/DESC/HEADINGS, CATALOG_PRICE_ITEMS, KEYED_PRICES, PAGE_PRICE_LINES), return strictly valid JSON:\n" +
  "1) Populate 'siteProfile': company 'businessName', concise 'nichePl' (Polish, 2-6 words), concise 'nicheEn' (English, 2-6 words), 'matchedIndustryId' ('upholstery' | 'hvac' | 'plumbing' | 'custom' — choose 'custom' unless the business is genuinely carpet/upholstery cleaning, HVAC, or plumbing), and 3-4 short local search query stems WITHOUT city names in 'searchQueriesPl' and 'searchQueriesEn'.\n" +
  "2) Extract EVERY distinct customer service, attraction, tier, or rental option into 'prices' (up to 35 items). CRITICAL: Preserve EVERY item listed under CATALOG_PRICE_ITEMS without merging separate tiers, sizes, or variants (for example keep standard vs oriental carpet, <=50 m2 vs >50 m2 flooring, 2-seat vs 3-seat sofa separate even when prices match). Never emit generic category badge teasers if detailed rows are present.\n" +
  "Reuse canonical keys ONLY for the single closest primary match: [carpetArea, carpetFlooring, upholsteryChair, twoSeatCouch, cornerSofa, acService, heatPumpCheck, ductCleaning, leakRepair, boilerService, drainUnclog]. For all additional services, sizes, or tiers generate unique descriptive 'live:<slug>' keys (never assign the same serviceKey twice).\n" +
  "For ranges like '20 - 50 zł' or '15 - 30 zł', use the starting price as 'detectedAmount'. Strictly exclude travel/distance fees (dojazd, PLN/km), security deposits (zadatek, kaucja), and 0 PLN freebies.";

async function extractWithGemini(
  websiteUrl: string,
  contextText: string,
  metadata: HtmlMetadata,
): Promise<AiExtractResult> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      prices: null,
      warning: "GEMINI_API_KEY is not configured.",
    };
  }

  if (!contextText.trim()) {
    return {
      prices: null,
      warning: "No high-signal pricing text was extracted from target site.",
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Target website: ${websiteUrl}\n\nCompact site context:\n${contextText}`,
      config: {
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        httpOptions: {
          timeout: GEMINI_TIMEOUT_MS,
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: AI_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            siteProfile: {
              type: Type.OBJECT,
              properties: {
                businessName: { type: Type.STRING },
                nichePl: { type: Type.STRING },
                nicheEn: { type: Type.STRING },
                matchedIndustryId: { type: Type.STRING },
                searchQueriesPl: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                searchQueriesEn: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "nichePl",
                "nicheEn",
                "matchedIndustryId",
                "searchQueriesPl",
                "searchQueriesEn",
              ],
            },
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
          required: ["siteProfile", "prices"],
        },
      },
    });

    const parsed = parseJsonSafe<RawAiResponsePayload>(response.text, {});
    const normalized = normalizeAiPayload(parsed, metadata, "gemini-ai");
    if (!normalized) {
      console.warn(
        "[/api/pricing/sync] Gemini returned empty or malformed pricing JSON.",
      );
      return {
        prices: null,
        warning: "Gemini did not return valid pricing rows.",
      };
    }

    return {
      prices: normalized.prices,
      siteProfile: normalized.siteProfile,
      aiProvider: "gemini",
    };
  } catch (err) {
    const rawMsg =
      err instanceof Error ? err.message : String(err ?? "Unknown error");
    console.warn(
      "[/api/pricing/sync] Gemini request failed:",
      rawMsg.slice(0, 220),
    );
    return {
      prices: null,
      warning: "Gemini temporary unavailability.",
    };
  }
}

async function extractWithGroq(
  websiteUrl: string,
  contextText: string,
  metadata: HtmlMetadata,
): Promise<AiExtractResult> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || !contextText.trim()) {
    return { prices: null };
  }

  const deadline = Date.now() + GROQ_TOTAL_BUDGET_MS;

  for (const model of GROQ_FALLBACK_MODELS) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 1_500) break;

    try {
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                AI_SYSTEM_INSTRUCTION +
                ' Return JSON matching exact shape: {"siteProfile":{"businessName":"...","nichePl":"...","nicheEn":"...","matchedIndustryId":"upholstery|hvac|plumbing|custom","searchQueriesPl":["..."],"searchQueriesEn":["..."]},"prices":[{"serviceKey":"...","labelPl":"...","labelEn":"...","unitType":"m2|piece|fixed","detectedAmount":100,"detectedCurrency":"PLN|USD|EUR","snippet":"..."}]}.',
            },
            {
              role: "user",
              content: `Target website: ${websiteUrl}\n\nCompact site context:\n${contextText}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(
          Math.min(GROQ_MODEL_TIMEOUT_MS, remainingMs),
        ),
      });

      if (!response.ok) {
        console.warn(
          `[/api/pricing/sync] Groq ${model} HTTP ${response.status}`,
        );
        continue;
      }

      const rawText = await response.text();
      const json = parseJsonSafe<{
        choices?: Array<{ message?: { content?: string } }>;
      }>(rawText, {});
      const content = json.choices?.[0]?.message?.content;
      const parsed = parseJsonSafe<RawAiResponsePayload>(content, {});
      const normalized = normalizeAiPayload(parsed, metadata, "groq-ai");
      if (normalized) {
        return {
          prices: normalized.prices,
          siteProfile: normalized.siteProfile,
          aiProvider: "groq",
        };
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.warn(
        `[/api/pricing/sync] Groq ${model} failed:`,
        msg.slice(0, 160),
      );
    }
  }

  return { prices: null };
}

function findPricingSubpages(html: string, baseUrl: URL): string[] {
  const candidates = new Set<string>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hintRe =
    /(cennik|pricing|oferta|ceny|us[łl]ug|services|rates|wynajem|atrakcj)/i;
  for (const match of html.matchAll(linkRe)) {
    const href = match[1].trim();
    const label = match[2].replace(/<[^>]+>/g, " ").trim();
    if (!hintRe.test(href) && !hintRe.test(label)) continue;
    if (/\.(pdf|jpg|jpeg|png|webp|svg|avif)$/i.test(href)) continue;
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

const VENDOR_SCRIPT_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|chunk-vendors)/i;
const APP_OR_PRICING_SCRIPT_RE =
  /(?:index|main|app|oferta|offer|cennik|price|pricing|calc|service|uslug|menu|wynajem|catalog|atrakcj|shop|store|produkt)/i;
const IGNORE_LAZY_CHUNK_RE =
  /^(?:react|react-dom|radix|lucide|icons|motion|framer-motion|query|tanstack|vendor|polyfill|privacy|polityk|regulamin|terms|rodo|cookie|404|error|gallery|galeria|about|o-firmie|realizacje|sprzet|contactform|footer|header)/i;

function findSameOriginScripts(html: string, baseUrl: URL): string[] {
  const scripts = new Map<string, number>();
  const assetPatterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']modulepreload["']/gi,
  ];

  for (const pattern of assetPatterns) {
    for (const match of html.matchAll(pattern)) {
      try {
        const resolved = new URL(match[1].trim(), baseUrl);
        if (resolved.origin !== baseUrl.origin) continue;
        if (!resolved.pathname.endsWith(".js")) continue;
        const fileName = resolved.pathname.split("/").pop() ?? "";
        if (VENDOR_SCRIPT_RE.test(fileName)) continue;
        const score = APP_OR_PRICING_SCRIPT_RE.test(fileName) ? 10 : 1;
        const urlStr = resolved.toString();
        if (!scripts.has(urlStr) || (scripts.get(urlStr) ?? 0) < score) {
          scripts.set(urlStr, score);
        }
      } catch {
        continue;
      }
    }
  }

  return Array.from(scripts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 5);
}

function findLazyRouteChunks(
  fetchedScripts: Array<{ url: string; text: string }>,
  baseUrl: URL,
): string[] {
  const alreadyFetched = new Set(fetchedScripts.map((s) => s.url));
  const pathSegments = baseUrl.pathname
    .toLowerCase()
    .split("/")
    .filter((seg) => seg.length >= 3);
  const candidates = new Map<string, number>();

  const assetPathRe =
    /["']((?:\.\.?\/|\/)?(?:assets|_next\/static\/chunks|static\/js)\/[a-zA-Z0-9_./-]+\.js)["']/g;
  const dynamicImportRe =
    /import\(\s*["'](\.\.?\/[a-zA-Z0-9_./-]+\.js)["']\s*\)/g;

  for (const script of fetchedScripts) {
    const parentUrl = new URL(script.url);
    const registerCandidate = (rawPath: string, resolveFromScript: boolean) => {
      try {
        const resolved = new URL(
          rawPath.startsWith("assets/") ||
            rawPath.startsWith("_next/") ||
            rawPath.startsWith("static/")
            ? `/${rawPath}`
            : rawPath,
          resolveFromScript ? parentUrl : baseUrl,
        );
        if (resolved.origin !== baseUrl.origin) return;
        if (!resolved.pathname.endsWith(".js")) return;
        const urlStr = resolved.toString();
        if (alreadyFetched.has(urlStr)) return;

        const fileName = (
          resolved.pathname.split("/").pop() ?? ""
        ).toLowerCase();
        if (IGNORE_LAZY_CHUNK_RE.test(fileName)) return;

        let score = 0;
        if (pathSegments.some((seg) => fileName.includes(seg))) {
          score += 100;
        }
        if (APP_OR_PRICING_SCRIPT_RE.test(fileName)) {
          score += 50;
        }
        if (score > 0 && (candidates.get(urlStr) ?? 0) < score) {
          candidates.set(urlStr, score);
        }
      } catch {
        // ignore invalid chunk path
      }
    };

    for (const m of script.text.matchAll(assetPathRe)) {
      registerCandidate(m[1], m[1].startsWith("."));
    }
    for (const m of script.text.matchAll(dynamicImportRe)) {
      registerCandidate(m[1], true);
    }
  }

  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, 4);
}

async function fetchTextSafe(
  targetUrl: string,
  timeoutMs = FETCH_HTML_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "NorthstarOps-PriceSync/3.1 (+https://northstar-ops.app)",
        Accept: "text/html,application/xhtml+xml,application/javascript,*/*",
      },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function buildFallbackSiteProfile(
  metadata: HtmlMetadata,
  prices: ExtractedPrice[],
): SiteProfile {
  return normalizeSiteProfile(undefined, metadata, prices);
}

async function handleSync(rawUrl: string, forceRefresh = false) {
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
  const cached = !forceRefresh
    ? syncSuccessCache.get(normalizedKey)
    : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      aiProvider: cached.aiProvider,
      cached: true,
      url: cached.url,
      fetchedAt: cached.fetchedAt,
      extractedCount: cached.prices.length,
      siteProfile: cached.siteProfile,
      prices: cached.prices,
    });
  }

  const html = await fetchTextSafe(parsedUrl.toString(), FETCH_HTML_TIMEOUT_MS);
  if (!html) {
    return NextResponse.json(
      { error: "Failed to fetch target website" },
      { status: 502 },
    );
  }

  const metadata = extractHtmlMetadata(html);
  const contextLines: string[] = [];
  const mainCleanText = htmlToCleanText(html);
  if (mainCleanText) contextLines.push(...mainCleanText.split("\n"));

  const subpages = findPricingSubpages(html, parsedUrl);
  if (subpages.length > 0) {
    const subHtmlList = await Promise.all(
      subpages.map((subUrl) => fetchTextSafe(subUrl, FETCH_ASSET_TIMEOUT_MS)),
    );
    for (const subHtml of subHtmlList) {
      if (!subHtml) continue;
      contextLines.push(...htmlToCleanText(subHtml).split("\n"));
    }
  }

  const combinedSoFar = contextLines.join("\n");
  const hasVisiblePriceSignals =
    /\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(
      combinedSoFar,
    );
  const isThinSpaShell =
    /<div\s+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html);

  let hasSpaBundle = false;
  if (
    isThinSpaShell ||
    !hasVisiblePriceSignals ||
    mainCleanText.length < 1200 ||
    contextLines.length < 20
  ) {
    const entryScripts = findSameOriginScripts(html, parsedUrl);
    if (entryScripts.length > 0) {
      const entryResponses = await Promise.all(
        entryScripts.map(async (scriptUrl) => ({
          url: scriptUrl,
          text: await fetchTextSafe(scriptUrl, FETCH_ASSET_TIMEOUT_MS),
        })),
      );
      const fetchedScripts = entryResponses.filter(
        (item): item is { url: string; text: string } => Boolean(item.text),
      );

      const lazyChunkUrls = findLazyRouteChunks(fetchedScripts, parsedUrl);
      if (lazyChunkUrls.length > 0) {
        const lazyResponses = await Promise.all(
          lazyChunkUrls.map(async (chunkUrl) => ({
            url: chunkUrl,
            text: await fetchTextSafe(chunkUrl, FETCH_ASSET_TIMEOUT_MS),
          })),
        );
        for (const lazyItem of lazyResponses) {
          if (lazyItem.text) {
            fetchedScripts.push({ url: lazyItem.url, text: lazyItem.text });
          }
        }
      }

      const bundleLines = decodeJsBundles(fetchedScripts.map((s) => s.text));
      if (bundleLines.length > 0) {
        hasSpaBundle = true;
        contextLines.push(...bundleLines);
      }
    }
  }

  const highSignalContext = buildHighSignalContext(metadata, contextLines);
  const catalogPrices = parseCatalogItemsFromContext(
    contextLines,
    hasSpaBundle,
  );

  let aiResult = await extractWithGemini(
    parsedUrl.toString(),
    highSignalContext,
    metadata,
  );
  if (!aiResult.prices || aiResult.prices.length === 0) {
    const groqResult = await extractWithGroq(
      parsedUrl.toString(),
      highSignalContext,
      metadata,
    );
    if (groqResult.prices && groqResult.prices.length > 0) {
      aiResult = groqResult;
    }
  }

  if (aiResult.prices && aiResult.prices.length > 0) {
    const finalPrices = mergeMissingCatalogRows(aiResult.prices, catalogPrices);
    const fetchedAt = new Date().toISOString();
    writeSuccessCache(normalizedKey, {
      expiresAt: Date.now() + SYNC_CACHE_TTL_MS,
      url: parsedUrl.toString(),
      fetchedAt,
      aiProvider: aiResult.aiProvider,
      siteProfile: aiResult.siteProfile,
      prices: finalPrices,
    });

    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      aiProvider: aiResult.aiProvider,
      url: parsedUrl.toString(),
      fetchedAt,
      extractedCount: finalPrices.length,
      siteProfile: aiResult.siteProfile,
      prices: finalPrices,
    });
  }

  const extracted = extractDeterministicFallback(
    contextLines,
    html,
    subpages.length > 0,
    hasSpaBundle,
  );
  const fallbackProfile = buildFallbackSiteProfile(metadata, extracted);

  return NextResponse.json({
    source: "live-website",
    aiEnhanced: false,
    warning:
      "AI extraction temporarily unavailable; used structured parser & JSON-LD fallback.",
    url: parsedUrl.toString(),
    fetchedAt: new Date().toISOString(),
    extractedCount: extracted.length,
    siteProfile: fallbackProfile,
    prices: extracted,
  });
}

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get("url")?.trim() ?? "";
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    if (!url) {
      return NextResponse.json(
        { error: "Missing ?url= parameter" },
        { status: 400 },
      );
    }
    return await handleSync(url, forceRefresh);
  } catch (err) {
    console.error("[/api/pricing/sync GET] error:", err);
    return NextResponse.json({ error: "Pricing sync failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      refresh?: boolean;
    };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { error: "Missing url in request body" },
        { status: 400 },
      );
    }
    return await handleSync(url, body.refresh === true);
  } catch (err) {
    console.error("[/api/pricing/sync POST] error:", err);
    return NextResponse.json({ error: "Pricing sync failed" }, { status: 502 });
  }
}
