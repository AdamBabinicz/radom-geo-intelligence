import { ThinkingLevel, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import type { ServiceUnitType } from "@/src/config/industries";

export const runtime = "nodejs";

const MAX_AI_CONTEXT_CHARS = 9_500;
const SYNC_CACHE_TTL_MS = 15 * 60 * 1000;
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
    .replace(/\\'/g, "'");
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
      /^(?:attractionsData|specification\.label|service|services|offer|offers|pricing|priceList)\./i,
      "",
    )
    .replace(/(?:PriceTag|Price|Cost|Rate|Fee|Item|RentalItem)$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeJsBundleLines(jsRaw: string): string[] {
  const js = decodeJsEscapes(jsRaw);
  const strMap = new Map<string, string>();
  // Match BOTH quoted ("specification.label.x": "val") AND unquoted (carpetPriceTag: "val") keys
  const keyPairRe =
    /(?:["']([a-zA-Z0-9_.-]{2,90})["']|([a-zA-Z0-9_.-]{2,48}))\s*:\s*(?:"((?:[^"\\]|\\.){1,180})"|'((?:[^'\\]|\\.){1,180})')/g;

  for (const match of js.matchAll(keyPairRe)) {
    const key = match[1] ?? match[2];
    const value = (match[3] ?? match[4] ?? "").replace(/\s+/g, " ").trim();
    if (!key || !value || isJsArtifactLine(value)) continue;
    if (!strMap.has(key)) {
      strMap.set(key, value);
    }
  }

  const resolveKeyText = (key: string | undefined): string => {
    if (!key) return "";
    if (strMap.has(key)) return strMap.get(key) ?? "";
    const tail = key.split(".").pop();
    if (tail && strMap.has(tail)) return strMap.get(tail) ?? "";
    return formatReadableKeySlug(key);
  };

  const out: string[] = [];
  const seen = new Set<string>();
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

  for (const match of js.matchAll(objPriceRe)) {
    const num = Number(match[1].replace(",", "."));
    if (!Number.isFinite(num) || num <= 0 || num > 100_000) continue;
    const idx = match.index ?? 0;

    // Keep scan strictly inside the same {...} object
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
      ownObj.match(/\bperiod\s*:\s*["']([^"']{1,40})["']/i)?.[1]?.trim() ?? "";
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

    // Enclosing product/category name strictly to the LEFT
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
    const resolvedLabel = ownLabelKey ? resolveKeyText(ownLabelKey) : "";
    const resolvedDesc = ownDescKey ? resolveKeyText(ownDescKey) : "";
    const resolvedCap = ownCapKey ? resolveKeyText(ownCapKey) : "";

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

  // Filter redundant section-level "od" summary rows if specific items for the same category exist
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
  }

  // 2. Generic key -> price string pairs (i18n bundles)
  const priceTextRe =
    /(?:\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)\b|(?:€|\$|pln|eur)\s*\d)/i;
  for (const [key, value] of strMap.entries()) {
    if (value.length > 180 || !priceTextRe.test(value)) continue;
    if (
      /^(?:€|\$|usd|eur)?\s*\d+(?:[.,]\d+)?\s*(?:z[łl]|pln)?$/i.test(value) &&
      key.length < 3
    ) {
      continue;
    }
    const baseKey = key.replace(/(?:PriceTag|Price|Cost|Rate|Fee)$/i, "");
    const resolvedBase =
      baseKey !== key && strMap.has(baseKey) ? `${strMap.get(baseKey)} — ` : "";
    const readableKey = formatReadableKeySlug(key);
    const prefix = readableKey ? `${readableKey}: ` : "";
    pushLine(`KEY_PAIR: ${prefix}${resolvedBase}${value}`);
  }

  // 3. Standalone quoted strings containing explicit currency/price
  const literalRe = /(?:"((?:[^"\\]|\\.){4,220})"|'((?:[^'\\]|\\.){4,220})')/g;
  for (const match of js.matchAll(literalRe)) {
    const val = (match[1] ?? match[2] ?? "").replace(/\s+/g, " ").trim();
    if (!val || isJsArtifactLine(val) || !priceTextRe.test(val)) continue;
    pushLine(val);
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
    /(?:^CATALOG_ITEM:\s|^KEY_PAIR:\s|\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)\b|(?:€|\$|pln|eur)\s*\d|cennik|cena|od\s+\d|from\s+\d|\/\s*(?:m²|m2|szt|pc|h|godz|dzie[ńn]|day|hour|event|imprez|os))/i;

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

function extractDeterministicFallback(
  contextLines: string[],
  html: string,
  hasSubpages: boolean,
  hasSpaBundle: boolean,
): ExtractedPrice[] {
  const byService = extractFromJsonLd(html);

  // 1. Parse pre-extracted CATALOG_ITEM lines deterministically (industry-agnostic)
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
    const key = slug ? `live:${slug}` : "";
    if (!key || byService.has(key)) continue;

    byService.set(key, {
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

  // 2. Match canonical service rules on remaining clean lines
  const cleanLines = contextLines
    .map((line) => line.replace(/^KEY_PAIR:\s*/i, "").trim())
    .filter(
      (line) =>
        line.length > 1 &&
        !line.startsWith("CATALOG_ITEM:") &&
        !line.startsWith("SITE_"),
    );

  const tryMatchSegment = (
    entry: FallbackKeywordRule,
    segment: string,
  ): boolean => {
    for (const pattern of entry.patterns) {
      const testRe = new RegExp(pattern.source, pattern.flags.replace("g", ""));
      const match = segment.match(testRe);
      if (!match || match.index === undefined) continue;
      const forward = segment.slice(match.index, match.index + 140);
      const found = matchPriceInWindow(forward);
      if (found) {
        byService.set(entry.serviceKey, {
          serviceKey: entry.serviceKey,
          labelPl: entry.labelPl,
          labelEn: entry.labelEn,
          unitType: entry.unitType,
          ...found,
          method: hasSubpages
            ? "subpage"
            : hasSpaBundle
              ? "spa-bundle"
              : "html-text",
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
    for (let i = 0; i < cleanLines.length && !matched; i++) {
      matched = tryMatchSegment(entry, cleanLines[i]);
    }
    if (!matched) {
      for (let i = 0; i < cleanLines.length - 1 && !matched; i++) {
        const pair = `${cleanLines[i]} · ${cleanLines[i + 1]}`;
        if (pair.length <= 180) {
          matched = tryMatchSegment(entry, pair);
        }
      }
    }
  }

  return Array.from(byService.values()).slice(0, 25);
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
      : "custom";

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
      method,
      snippet: String(item.snippet ?? "")
        .slice(0, 110)
        .trim(),
    });
  }

  const list = Array.from(deduped.values()).slice(0, 25);
  if (list.length === 0) return null;

  return {
    prices: list,
    siteProfile: normalizeSiteProfile(parsed.siteProfile, metadata, list),
  };
}

const AI_SYSTEM_INSTRUCTION =
  "You analyze compact website pricing extracts from ANY service or rental company (event/party rentals, cleaning, HVAC, plumbing, automotive, catering, medical, etc.) and return strict JSON.\n" +
  "1) Build 'siteProfile': detect 'businessName', concise 'nichePl' (Polish, 2-6 words), concise 'nicheEn' (English, 2-6 words), 'matchedIndustryId' ('upholstery' | 'hvac' | 'plumbing' | 'custom' — choose 'custom' unless the business is genuinely carpet/upholstery cleaning, HVAC, or plumbing), and 3-4 short local search query stems WITHOUT city names in 'searchQueriesPl' and 'searchQueriesEn'.\n" +
  "2) Extract EVERY distinct customer service, attraction, or rental option into 'prices' (up to 25 items). CRITICAL: You MUST include ALL items listed under CATALOG_PRICE_ITEMS (each tent size, table/chair rental, inflatable, machine, package, etc.) PLUS any additional priced services from PAGE_PRICE_LINES or KEYED_PRICES. Never return only add-ons while skipping main catalog items.\n" +
  "Reuse canonical keys ONLY if exact match: [carpetArea, carpetFlooring, upholsteryChair, twoSeatCouch, cornerSofa, acService, heatPumpCheck, ductCleaning, leakRepair, boilerService, drainUnclog]. For everything else generate unique descriptive 'live:<slug>' keys (keep distinct sizes/packages separate, e.g. 6x6m vs 6x10m).\n" +
  "For ranges like '20 - 50 zł' or '3,5 - 5 PLN', use the starting price as 'detectedAmount'. Strictly exclude travel/distance fees (dojazd, PLN/km), security deposits (zadatek, kaucja), and 0 PLN freebies.";

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

  for (const model of GROQ_FALLBACK_MODELS) {
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
        signal: AbortSignal.timeout(12_000),
      });

      if (!response.ok) {
        console.warn(
          `[/api/pricing/sync] Groq ${model} HTTP ${response.status}`,
        );
        continue;
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
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
        "User-Agent": "NorthstarOps-PriceSync/3.1 (+https://northstar-ops.app)",
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

function buildFallbackSiteProfile(
  metadata: HtmlMetadata,
  prices: ExtractedPrice[],
): SiteProfile {
  return normalizeSiteProfile(undefined, metadata, prices);
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
      aiProvider: cached.aiProvider,
      cached: true,
      url: cached.url,
      fetchedAt: cached.fetchedAt,
      extractedCount: cached.prices.length,
      siteProfile: cached.siteProfile,
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

  const metadata = extractHtmlMetadata(html);
  const contextLines: string[] = [];
  const mainCleanText = htmlToCleanText(html);
  if (mainCleanText) contextLines.push(...mainCleanText.split("\n"));

  const subpages = findPricingSubpages(html, parsedUrl);
  for (const subUrl of subpages) {
    const subHtml = await fetchTextSafe(subUrl);
    if (!subHtml) continue;
    contextLines.push(...htmlToCleanText(subHtml).split("\n"));
  }

  const combinedSoFar = contextLines.join("\n");
  const hasVisiblePriceSignals = /\d\s*(?:z[łl]|pln|eur|usd|\$|€|,-)\b/i.test(
    combinedSoFar,
  );

  let hasSpaBundle = false;
  if (
    !hasVisiblePriceSignals ||
    mainCleanText.length < 1200 ||
    contextLines.length < 20
  ) {
    const scripts = findSameOriginScripts(html, parsedUrl);
    for (const scriptUrl of scripts) {
      const jsText = await fetchTextSafe(scriptUrl);
      if (!jsText) continue;
      const bundleLines = decodeJsBundleLines(jsText);
      if (bundleLines.length > 0) {
        hasSpaBundle = true;
        contextLines.push(...bundleLines);
      }
    }
  }

  const highSignalContext = buildHighSignalContext(metadata, contextLines);

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
    const fetchedAt = new Date().toISOString();
    syncSuccessCache.set(normalizedKey, {
      expiresAt: Date.now() + SYNC_CACHE_TTL_MS,
      url: parsedUrl.toString(),
      fetchedAt,
      aiProvider: aiResult.aiProvider,
      siteProfile: aiResult.siteProfile,
      prices: aiResult.prices,
    });
    return NextResponse.json({
      source: "live-website",
      aiEnhanced: true,
      aiProvider: aiResult.aiProvider,
      url: parsedUrl.toString(),
      fetchedAt,
      extractedCount: aiResult.prices.length,
      siteProfile: aiResult.siteProfile,
      prices: aiResult.prices,
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
