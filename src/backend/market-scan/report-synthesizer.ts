import { ThinkingLevel, Type } from "@google/genai";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
  parseJsonSafe,
} from "@/src/backend/ai/gemini-client";
import {
  getNormalizedHostFromUrl,
  isExcludedCompetitorWebsite,
} from "./request-and-safety";
import {
  GEMINI_SCAN_TIMEOUT_MS,
  GROQ_CHAT_COMPLETIONS_URL,
  GROQ_FALLBACK_MODELS,
  GROQ_MODEL_TIMEOUT_MS,
  GROQ_TOTAL_BUDGET_MS,
  MAX_GROQ_RESEARCH_CHARS,
  type ActiveServiceDescriptor,
  type BenchmarkFinding,
  type CompetitorFinding,
  type FetchedSiteContext,
  type PainPointFinding,
  type ScanRequestParams,
  type SerperCompetitorEntry,
  type StructuredScanPayload,
} from "./types";

export function buildFallbackCompetitors(
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
  const fallbackPriceRe =
    /([^\n]{0,45}(?:(?:\$|€|£)\s*\d{1,4}(?:[.,]\d{1,2})?|\d{1,4}(?:[.,]\d{1,2})?\s*(?:zł|pln|eur|usd|gbp|chf|cad|aud|\$|€|£))[^\n]{0,45})/i;

  for (const place of places) {
    if (isExcludedCompetitorWebsite(place.website, excludeHost)) continue;
    const host = getNormalizedHostFromUrl(place.website);
    const nameKey = place.name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    if (host && seenHosts.has(host)) continue;
    seenNames.add(nameKey);
    if (host) seenHosts.add(host);

    const matchedSite = host ? siteByHost.get(host) : undefined;
    const priceMatch = matchedSite?.text.match(fallbackPriceRe);
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
    const priceMatch = site.text.match(fallbackPriceRe);

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

function buildSynthesisPrompt(
  researchText: string,
  params: ScanRequestParams,
  _validServiceKeys: Set<string>,
  activeServices: ActiveServiceDescriptor[],
  nicheContextLabel: string,
  maxResearchChars = 22_000,
): string {
  const languageLabel = params.locale === "pl" ? "Polish" : "English";
  const summaryCurrency = params.locale === "en" ? "USD ($)" : "PLN (zł)";
  const trackedServicesList = activeServices
    .map((s) =>
      [
        `"${s.serviceKey}"`,
        s.label ? `(${s.label})` : "",
        s.unitType ? `[${s.unitType}]` : "",
        s.ourPricePln
          ? params.locale === "en"
            ? `[our price: ~$${Math.round(s.ourPricePln / 4)} USD]`
            : `[our price: ${s.ourPricePln} PLN]`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join(", ");

  const excludeInstruction = params.excludeHost
    ? `Do NOT include our own business (${params.excludeHost}) in the competitors list.`
    : "";

  const noteCurrencyRule =
    params.locale === "en"
      ? `Keep the original local currency in competitors[].priceSummary and cite prices solely in local currency (e.g. USD/EUR/GBP) inside marketBenchmarks[].note — do NOT write "PLN" or "zł" inside prose.`
      : `Keep the original local currency in competitors[].priceSummary and cite both original local currency and converted PLN in marketBenchmarks[].note.`;

  const currencyDisplayRule =
    params.locale === "en"
      ? `CRITICAL CURRENCY DISPLAY RULE: When writing in English, NEVER mention "PLN" or "zł" inside "summary", "competitors[].priceSummary", or "marketBenchmarks[].note" — express all narrative, summary, and note figures solely in local currency / ${summaryCurrency}. Reserve integer PLN strictly for numeric JSON fields (avgPricePln, minPricePln, maxPricePln).`
      : `In the narrative "summary", express monetary figures in ${summaryCurrency} matching the active UI currency.`;

  const benchmarkInstruction = trackedServicesList
    ? [
        `Active tracked services to benchmark (use these EXACT serviceKey values, including "live:*" keys): ${trackedServicesList}.`,
        `CURRENCY NORMALIZATION RULE: Output ALL marketBenchmarks numeric prices (avgPricePln, minPricePln, maxPricePln) as integer PLN values. Convert foreign currencies to PLN using: 1 USD = 4.0 PLN, 1 EUR = 4.3 PLN, 1 GBP = 5.1 PLN, 1 CHF = 4.5 PLN, 1 CAD = 2.9 PLN, 1 AUD = 2.6 PLN (e.g. $99 = 396 PLN, $125 = 500 PLN). ${noteCurrencyRule}`,
        `CRITICAL SCOPE & UNIT RULE: Match each service strictly by its human label and billing unit — never rely on internal serviceKey naming alone. NEVER map prices between different item sizes, furniture types, or service tiers (for example: NEVER assign a small chair/pouf/cushion price like 15-25 PLN to an armchair/fotel, NEVER assign a 2-seat sofa price to a corner sofa/narożnik, NEVER assign a doormat price to a full carpet, NEVER assign a 1-seat mattress price to a double mattress, and NEVER compare hourly/add-on/deposit/travel fees against full-service or full-day prices). For HVAC: a standard residential AC tune-up / AC inspection / diagnostic fee is valid for "acService", and a heat pump tune-up / maintenance is valid for "heatPumpCheck"; never map a gas furnace-only tune-up to AC split service, and never map a whole-house flat duct-cleaning package to a per-m2 rate.`,
        `If a competitor only lists an incompatible item or unit, mention it in competitors[].priceSummary and OMIT that service from marketBenchmarks.`,
        `Compute avgPricePln, minPricePln, maxPricePln across found local companies for every tracked serviceKey (including "live:*" keys) with exact item-and-unit-compatible price evidence, and briefly cite the matched competitor items/prices in "note".`,
      ]
    : [
        `No fixed price-list rows were provided for the client (custom or individual-quote B2B niche); leave "marketBenchmarks" as an empty array [] and focus on discovering local competitors, summarizing their service range, quote/pricing models in competitors[].priceSummary, and real customer painPoints.`,
      ];

  return [
    `Extract structured market intelligence strictly from the verified competitor data below.`,
    `Target business niche: ${nicheContextLabel}.`,
    `Return ALL distinct local competitors present in the source data (aim for 8-12 companies when available, covering both Google Business Profiles / Maps listings and websites).`,
    excludeInstruction,
    `Populate "rating" and "reviewCount" whenever verified Google review numbers appear in the source text.`,
    `NEVER leave "competitors[].priceSummary" empty — when no numeric price list is published for a company, summarize its core service scope and pricing/quote model in 1 brief line (e.g., "Wycena indywidualna / brak jawnego cennika WWW" or "Local service — quote on request").`,
    `Always return 2-4 niche-specific "painPoints" for ${nicheContextLabel} in ${params.city}: extract verified customer complaints when available, or derive the main buyer friction points directly implied by the local competitor offers and pricing models (e.g., unclear pricing, travel surcharges, minimum booking fees, scheduling delays) with calibrated severityScore (25-85).`,
    `Do NOT invent companies, numbers, ratings, or prices not supported by the text.`,
    `Write "summary", "priceSummary", "travelFeeNote", "note", "label", and "evidence" in ${languageLabel}.`,
    currencyDisplayRule,
    ...benchmarkInstruction,
    `\n=== VERIFIED LOCAL COMPETITOR DATA (${params.city}, ${params.country}) ===\n${researchText.slice(0, maxResearchChars)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function structureReportWithGemini(
  researchText: string,
  params: ScanRequestParams,
  validServiceKeys: Set<string>,
  activeServices: ActiveServiceDescriptor[],
  nicheContextLabel: string,
): Promise<StructuredScanPayload> {
  const ai = getGeminiClient();
  if (!ai) return {};

  const extractionPrompt = buildSynthesisPrompt(
    researchText,
    params,
    validServiceKeys,
    activeServices,
    nicheContextLabel,
    22_000,
  );

  const structuredResponse = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: extractionPrompt,
    config: {
      abortSignal: AbortSignal.timeout(GEMINI_SCAN_TIMEOUT_MS),
      httpOptions: {
        timeout: GEMINI_SCAN_TIMEOUT_MS,
      },
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

export async function structureReportWithGroq(
  compactResearchText: string,
  params: ScanRequestParams,
  validServiceKeys: Set<string>,
  activeServices: ActiveServiceDescriptor[],
  nicheContextLabel: string,
): Promise<StructuredScanPayload | null> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || !compactResearchText.trim()) return null;

  const extractionPrompt = buildSynthesisPrompt(
    compactResearchText,
    params,
    validServiceKeys,
    activeServices,
    nicheContextLabel,
    MAX_GROQ_RESEARCH_CHARS,
  );
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
          max_tokens: 6000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'Return strict JSON matching shape: {"summary":"...","competitors":[{"name":"...","website":"...","rating":4.8,"reviewCount":50,"travelFeeNote":"...","priceSummary":"..."}],"marketBenchmarks":[{"serviceKey":"...","avgPricePln":100,"minPricePln":80,"maxPricePln":120,"sampleCount":2,"note":"..."}],"painPoints":[{"key":"...","label":"...","evidence":"...","severityScore":70}]}. Include up to 12 competitors present in input, convert foreign currencies to integer PLN (1 USD = 4.0 PLN, 1 EUR = 4.3 PLN, 1 GBP = 5.1 PLN), benchmark every tracked serviceKey with exact item-and-unit match (or [] when none provided), always include non-empty priceSummary and 2-4 niche painPoints, and never mix furniture sizes, item categories, or billing units.',
            },
            {
              role: "user",
              content: extractionPrompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(
          Math.min(GROQ_MODEL_TIMEOUT_MS, remainingMs),
        ),
      });

      if (!response.ok) {
        const errSnippet = (await response.text().catch(() => "")).slice(
          0,
          120,
        );
        console.warn(
          `[/api/market/scan] Groq ${model} HTTP ${response.status}:`,
          errSnippet,
        );
        continue;
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      const parsed = parseJsonSafe<StructuredScanPayload>(content, {});
      if (Array.isArray(parsed.competitors) && parsed.competitors.length > 0) {
        return parsed;
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Unknown error");
      console.warn(
        `[/api/market/scan] Groq ${model} failed:`,
        msg.slice(0, 160),
      );
    }
  }

  return null;
}

export function sanitizeStructuredPayload(
  parsed: StructuredScanPayload,
  validServiceKeys: Set<string>,
  activeServices: ActiveServiceDescriptor[],
  locale: "pl" | "en",
  excludeHost?: string,
) {
  const seenNames = new Set<string>();
  const seenHosts = new Set<string>();
  const ourPriceByKey = new Map<string, number>();

  for (const svc of activeServices) {
    if (
      typeof svc.ourPricePln === "number" &&
      Number.isFinite(svc.ourPricePln) &&
      svc.ourPricePln > 0
    ) {
      ourPriceByKey.set(svc.serviceKey, svc.ourPricePln);
    }
  }

  const emptyPriceFallback =
    locale === "pl"
      ? "Brak jawnego cennika WWW — wycena indywidualna."
      : "No public rate card — individual quote.";

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
    .map((c: CompetitorFinding) => {
      const trimmedSummary =
        typeof c.priceSummary === "string"
          ? c.priceSummary.replace(/\s+/g, " ").trim()
          : "";
      const trimmedTravelNote =
        typeof c.travelFeeNote === "string"
          ? c.travelFeeNote.replace(/\s+/g, " ").trim() || undefined
          : undefined;
      const trimmedWebsite =
        typeof c.website === "string"
          ? c.website.trim() || undefined
          : undefined;

      return {
        ...c,
        name: c.name.trim(),
        website: trimmedWebsite,
        travelFeeNote: trimmedTravelNote,
        priceSummary: trimmedSummary || emptyPriceFallback,
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
      };
    });

  const seenBenchmarkKeys = new Set<string>();
  const marketBenchmarks = (parsed?.marketBenchmarks ?? [])
    .filter((b: BenchmarkFinding) => {
      if (
        typeof b?.serviceKey !== "string" ||
        !validServiceKeys.has(b.serviceKey) ||
        seenBenchmarkKeys.has(b.serviceKey) ||
        typeof b.avgPricePln !== "number" ||
        !Number.isFinite(b.avgPricePln) ||
        b.avgPricePln <= 0
      ) {
        return false;
      }

      const ourPrice = ourPriceByKey.get(b.serviceKey);
      if (ourPrice && ourPrice > 0) {
        const samples = Math.max(1, Math.round(b.sampleCount || 1));
        const ratio = b.avgPricePln / ourPrice;
        if (samples <= 2 && (ratio < 0.35 || ratio > 3.5)) {
          return false;
        }
        if (ratio < 0.25 || ratio > 4.5) {
          return false;
        }
      }

      seenBenchmarkKeys.add(b.serviceKey);
      return true;
    })
    .map((b: BenchmarkFinding) => ({
      ...b,
      avgPricePln: Math.round(b.avgPricePln),
      minPricePln:
        typeof b.minPricePln === "number" &&
        Number.isFinite(b.minPricePln) &&
        b.minPricePln > 0
          ? Math.round(b.minPricePln)
          : undefined,
      maxPricePln:
        typeof b.maxPricePln === "number" &&
        Number.isFinite(b.maxPricePln) &&
        b.maxPricePln > 0
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
      label: p.label.trim(),
      evidence: typeof p.evidence === "string" ? p.evidence.trim() : "",
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
