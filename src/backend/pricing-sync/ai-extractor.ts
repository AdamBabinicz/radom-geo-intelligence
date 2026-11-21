import { ThinkingLevel, Type } from "@google/genai";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import {
  CANONICAL_SERVICE_KEYS,
  buildUniqueLiveKey,
  inferPresetFromPrices,
  isCanonicalKeyCompatibleWithLabel,
  normalizeCurrency,
  normalizeExtractedServiceKey,
  normalizeUnitType,
  resolveCanonicalPromotionKey,
  toAsciiSlug,
  toPln,
} from "./service-rules";
import {
  GEMINI_TIMEOUT_MS,
  GROQ_CHAT_COMPLETIONS_URL,
  GROQ_FALLBACK_MODELS,
  GROQ_MODEL_TIMEOUT_MS,
  GROQ_TOTAL_BUDGET_MS,
  MAX_EXTRACTED_ITEMS,
  type AiExtractResult,
  type DetectedIndustryMatch,
  type ExtractedPrice,
  type HtmlMetadata,
  type RawAiResponsePayload,
  type RawAiSiteProfile,
  type SiteProfile,
} from "./types";

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

  const titleSummary = metadata.title
    .split(/[–—|-]/)
    .slice(0, 2)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" — ");
  const fallbackNiche =
    titleSummary || metadata.headings[0] || prices[0]?.labelPl || "";

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

export function buildFallbackSiteProfile(
  metadata: HtmlMetadata,
  prices: ExtractedPrice[],
): SiteProfile {
  return normalizeSiteProfile(undefined, metadata, prices);
}

function normalizeAiPayload(
  parsed: RawAiResponsePayload,
  metadata: HtmlMetadata,
  method: "gemini-ai" | "groq-ai",
): { prices: ExtractedPrice[]; siteProfile: SiteProfile } | null {
  const hasPricesArray = Array.isArray(parsed.prices);
  const hasProfileNiche =
    typeof parsed.siteProfile?.nichePl === "string" &&
    parsed.siteProfile.nichePl.trim().length > 0;
  if (!hasPricesArray && !hasProfileNiche) return null;

  const rawRows = hasPricesArray && parsed.prices ? parsed.prices : [];
  const deduped = new Map<string, ExtractedPrice>();
  const takenKeys = new Set<string>();

  for (const item of rawRows) {
    const labelEn = String(item.labelEn ?? item.labelPl ?? "").trim();
    const labelPl = String(item.labelPl ?? item.labelEn ?? "").trim();
    if (!labelPl && !labelEn) continue;

    const amount = Number(item.detectedAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const currency = normalizeCurrency(item.detectedCurrency);
    let key = normalizeExtractedServiceKey(item.serviceKey, labelEn || labelPl);
    if (!key) continue;

    if (
      CANONICAL_SERVICE_KEYS.has(key) &&
      !isCanonicalKeyCompatibleWithLabel(key, labelPl, labelEn)
    ) {
      const fallbackLive = buildUniqueLiveKey(labelPl, labelEn, takenKeys);
      if (!fallbackLive) continue;
      key = fallbackLive;
    }

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
      const candidateKey = buildUniqueLiveKey(labelPl, labelEn, takenKeys);
      if (!candidateKey) continue;
      key = candidateKey;
    }

    takenKeys.add(key);
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

  const activeKeys = new Set(list.map((entry) => entry.serviceKey));
  for (const entry of list) {
    if (!entry.serviceKey.startsWith("live:")) continue;
    const promoted = resolveCanonicalPromotionKey(entry.labelPl, entry.labelEn);
    if (promoted && !activeKeys.has(promoted)) {
      activeKeys.delete(entry.serviceKey);
      activeKeys.add(promoted);
      entry.serviceKey = promoted;
    }
  }

  return {
    prices: list,
    siteProfile: normalizeSiteProfile(parsed.siteProfile, metadata, list),
  };
}

export function mergeMissingCatalogRows(
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
  "3) If the website operates on custom B2B quotes or has NO public service prices (for example a printing house, packaging manufacturer, custom workshop, or inquiry-only website), still populate 'siteProfile' accurately from SITE_TITLE/DESC/HEADINGS and page text, and return an empty array 'prices': [] (never invent, guess, or fabricate prices).\n" +
  "Reuse canonical keys ONLY for the exact matching service scope:\n" +
  "- carpetArea: standard carpet/rug washing per m2 (NOT oriental/silk rugs and NOT fitted carpet flooring)\n" +
  "- carpetFlooring: fitted wall-to-wall/office carpet flooring per m2 (prefer the standard >50 m2 base tier if multiple tiers exist)\n" +
  "- upholsteryChair: ONLY small dining/office chair (krzeslo/chair) — NEVER armchair (fotel), pouf (pufa), or cushions (armchair/fotel MUST use 'live:fotel')\n" +
  "- twoSeatCouch: ONLY 2-seat sofa / standard couch (sofa 2-osobowa/kanapa) — NEVER 3-seat sofa or corner sofa\n" +
  "- cornerSofa: ONLY corner / L-shaped sofa (naroznik/corner sofa)\n" +
  "- acService, heatPumpCheck, ductCleaning, leakRepair, boilerService, drainUnclog: exact HVAC/plumbing equivalents.\n" +
  "For all other services, sizes, or variants (including armchair/fotel, 3-seat sofa, oriental carpet, mattress, pouf, daybed), generate unique descriptive 'live:<slug>' keys (never assign the same serviceKey twice).\n" +
  "For ranges like '20 - 50 zł' or '15 - 30 zł', use the starting price as 'detectedAmount'. Strictly exclude travel/distance fees (dojazd, PLN/km), security deposits (zadatek, kaucja), and 0 PLN freebies.";

export async function extractWithGemini(
  websiteUrl: string,
  contextText: string,
  metadata: HtmlMetadata,
): Promise<AiExtractResult> {
  const ai = getGeminiClient();
  if (!ai) {
    return {
      aiSucceeded: false,
      prices: null,
      warning: "GEMINI_API_KEY is not configured.",
    };
  }

  if (!contextText.trim()) {
    return {
      aiSucceeded: false,
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
        aiSucceeded: false,
        prices: null,
        warning: "Gemini did not return valid structured JSON.",
      };
    }

    return {
      aiSucceeded: true,
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
      aiSucceeded: false,
      prices: null,
      warning: "Gemini temporary unavailability.",
    };
  }
}

export async function extractWithGroq(
  websiteUrl: string,
  contextText: string,
  metadata: HtmlMetadata,
): Promise<AiExtractResult> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || !contextText.trim()) {
    return { aiSucceeded: false, prices: null };
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
          aiSucceeded: true,
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

  return { aiSucceeded: false, prices: null };
}
