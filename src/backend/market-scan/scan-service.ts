import { ThinkingLevel } from "@google/genai";
import {
  GEMINI_TEXT_MODEL,
  getGeminiClient,
} from "@/src/backend/ai/gemini-client";
import {
  INDUSTRY_TEMPLATES,
  type IndustryId,
  type IndustryServiceItem,
} from "@/src/config/industries";
import {
  buildSearchQueries,
  cleanServicePhrase,
  discoverCompetitorUrlsViaDuckDuckGo,
  discoverCompetitorUrlsViaOsm,
  discoverViaSerper,
  filterCandidateUrls,
} from "./discovery";
import {
  buildFallbackCompetitors,
  sanitizeStructuredPayload,
  structureReportWithGemini,
  structureReportWithGroq,
} from "./report-synthesizer";
import {
  deduplicateSources,
  extractGroundingSources,
  isQuotaError,
} from "./request-and-safety";
import { buildCompactGroqResearch, fetchSiteContext } from "./site-crawler";
import {
  GEMINI_SCAN_TIMEOUT_MS,
  MAX_GROQ_RESEARCH_CHARS,
  type ActiveServiceDescriptor,
  type FetchedSiteContext,
  type GroundingSource,
  type ScanRequestParams,
  type SerperCompetitorEntry,
  type StructuredScanPayload,
} from "./types";

export interface MarketScanHttpResult {
  status: number;
  body: Record<string, unknown>;
}

export async function runMarketScan(
  params: ScanRequestParams,
): Promise<MarketScanHttpResult> {
  const scannedAt = new Date().toISOString();
  const template = INDUSTRY_TEMPLATES[params.industryId];
  const presetKeys = new Set(
    template.services.map((s: IndustryServiceItem) => s.serviceKey),
  );
  const isExplicitCustomProfile =
    params.siteProfile?.matchedIndustryId === "custom" ||
    (Boolean(
      params.siteProfile?.searchQueriesPl?.length ||
      params.siteProfile?.searchQueriesEn?.length ||
      params.siteProfile?.nichePl ||
      params.siteProfile?.nicheEn,
    ) &&
      params.siteProfile?.matchedIndustryId !== params.industryId);

  const activeServices: ActiveServiceDescriptor[] =
    params.services.length > 0
      ? params.services
      : isExplicitCustomProfile
        ? []
        : template.services.map((s: IndustryServiceItem) => ({
            serviceKey: s.serviceKey,
            unitType: s.unitType,
            ourPricePln: s.ourPricePln,
          }));

  const hasPresetOverlap = activeServices.some((s) =>
    presetKeys.has(s.serviceKey),
  );
  const hasLiveServices = activeServices.some((s) =>
    s.serviceKey.startsWith("live:"),
  );
  const isCustomSiteNiche =
    isExplicitCustomProfile || (hasLiveServices && !hasPresetOverlap);

  const validServiceKeys = new Set<string>(
    isCustomSiteNiche
      ? activeServices.map((s) => s.serviceKey)
      : [
          ...template.services.map((s: IndustryServiceItem) => s.serviceKey),
          ...activeServices.map((s) => s.serviceKey),
        ],
  );

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

  const detectedIndustryLabel = isCustomSiteNiche
    ? (params.locale === "pl"
        ? params.siteProfile?.nichePl
        : params.siteProfile?.nicheEn) ||
      params.services
        .slice(0, 2)
        .map((s) => cleanServicePhrase(s.label || ""))
        .filter(Boolean)
        .join(", ") ||
      undefined
    : undefined;

  const nicheContextLabel =
    detectedIndustryLabel || industryDescriptionMap[params.industryId];

  const queries = buildSearchQueries(
    params.city,
    params.industryId,
    params.locale,
    isCustomSiteNiche,
    activeServices,
    params.siteProfile,
    params.countryCode,
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
        `Find 8-12 real local service providers in ${params.city}, ${params.country} (radius ~${params.radiusKm} km) for: ${nicheContextLabel}.`,
        `Search BOTH Google Business Profiles / Google Maps listings (company name, star rating, review count, travel zone, customer complaints) AND company websites with published service info or price lists.`,
        `Cover distinct local search intents such as: ${queries.join("; ")}.`,
        params.excludeHost
          ? `Exclude ${params.excludeHost} (that is our own website).`
          : "",
        serviceHints
          ? `Research local prices for ${serviceHints} and real customer review complaints.`
          : `Research local competitors, service offerings, pricing or quote models, and real customer review complaints.`,
        `Only cite real companies, facts, ratings, and numbers found via Google Search.`,
      ]
        .filter(Boolean)
        .join("\n");

      const searchResponse = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: searchPrompt,
        config: {
          abortSignal: AbortSignal.timeout(GEMINI_SCAN_TIMEOUT_MS),
          httpOptions: {
            timeout: GEMINI_SCAN_TIMEOUT_MS,
          },
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
          nicheContextLabel,
        );
        const clean = sanitizeStructuredPayload(
          parsed,
          validServiceKeys,
          activeServices,
          params.locale,
          params.excludeHost,
        );

        return {
          status: 200,
          body: {
            source: "ai-web-grounding",
            aiEnhanced: true,
            city: params.city,
            country: params.country,
            industryId: params.industryId,
            detectedIndustryLabel,
            radiusKm: params.radiusKm,
            scannedAt,
            ...clean,
            sources,
            searchQueries,
          },
        };
      }
    } catch (err) {
      if (isQuotaError(err)) {
        quotaExceeded = true;
        console.warn("[/api/market/scan] Search grounding hit Gemini limit.");
      } else {
        console.warn("[/api/market/scan] Search grounding failed.");
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
      params.city,
      params.country,
      params.countryCode,
      params.locale,
      params.excludeHost,
    );
    targetUrls = serperResult.urls;
    gbpContext = serperResult.gbpContext;
    mapsSources = serperResult.mapsSources;
    serperPlaces = serperResult.places;
  }

  if (targetUrls.length === 0) {
    const ddgPromise = discoverCompetitorUrlsViaDuckDuckGo(
      queries,
      params.locale,
      params.excludeHost,
    );
    const osmPromise = isCustomSiteNiche
      ? Promise.resolve([] as string[])
      : discoverCompetitorUrlsViaOsm(
          params.city,
          params.country,
          params.industryId,
          params.excludeHost,
        );
    const [ddgUrls, osmUrls] = await Promise.all([ddgPromise, osmPromise]);
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
    const sortedSites = [...fetchedSites].sort(
      (a, b) => Number(b.hasPriceSignals) - Number(a.hasPriceSignals),
    );
    const siteSections = sortedSites.map(
      (s) => `=== SITE: ${s.title} (${s.url}) ===\n${s.text}`,
    );
    const combinedText = [gbpContext, ...siteSections]
      .filter(Boolean)
      .join("\n\n");

    let parsed: StructuredScanPayload | null = null;
    if (ai) {
      try {
        parsed = await structureReportWithGemini(
          combinedText,
          params,
          validServiceKeys,
          activeServices,
          nicheContextLabel,
        );
      } catch (err) {
        if (isQuotaError(err)) {
          quotaExceeded = true;
          console.warn(
            "[/api/market/scan] structureReportWithGemini hit limit; trying Groq fallback.",
          );
        } else {
          console.warn("[/api/market/scan] structureReportWithGemini failed.");
        }
      }
    }

    if (
      !parsed ||
      !Array.isArray(parsed.competitors) ||
      parsed.competitors.length === 0
    ) {
      const compactGroqText = buildCompactGroqResearch(
        gbpContext,
        sortedSites,
        MAX_GROQ_RESEARCH_CHARS,
      );
      const groqParsed = await structureReportWithGroq(
        compactGroqText || combinedText,
        params,
        validServiceKeys,
        activeServices,
        nicheContextLabel,
      );
      if (groqParsed) {
        parsed = groqParsed;
      }
    }

    if (
      parsed &&
      Array.isArray(parsed.competitors) &&
      parsed.competitors.length > 0
    ) {
      const clean = sanitizeStructuredPayload(
        parsed,
        validServiceKeys,
        activeServices,
        params.locale,
        params.excludeHost,
      );
      return {
        status: 200,
        body: {
          source: gbpContext ? "live-maps-and-sites" : "live-competitor-sites",
          aiEnhanced: true,
          city: params.city,
          country: params.country,
          industryId: params.industryId,
          detectedIndustryLabel,
          radiusKm: params.radiusKm,
          scannedAt,
          ...clean,
          sources: allSources,
          searchQueries: queries,
        },
      };
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
          ? "Chwilowy limit zapytań AI — wyświetlono znalezione wizytówki Google Maps i strony konkurencji."
          : "Temporary AI quota limit — showing retrieved Google Maps listings & competitor sites."
        : params.locale === "pl"
          ? "Analiza AI chwilowo niedostępna — wyświetlono znalezione wizytówki i strony konkurencji."
          : "AI synthesis temporarily unavailable — showing retrieved local listings & competitor sites.";

    return {
      status: 200,
      body: {
        source: "live-maps-direct",
        aiEnhanced: false,
        warning: warningMsg,
        city: params.city,
        country: params.country,
        industryId: params.industryId,
        detectedIndustryLabel,
        radiusKm: params.radiusKm,
        scannedAt,
        summary:
          params.locale === "pl"
            ? `Znaleziono ${fallbackCompetitors.length} lokalnych firm w ${params.city} (Google Maps + strony WWW).`
            : `Retrieved ${fallbackCompetitors.length} local competitors in ${params.city} (Google Maps + websites).`,
        competitors: fallbackCompetitors,
        marketBenchmarks: [],
        painPoints: [],
        sources: allSources,
        searchQueries: queries,
      },
    };
  }

  return {
    status: 200,
    body: {
      source: "template-fallback",
      aiEnhanced: false,
      warning: quotaExceeded
        ? params.locale === "pl"
          ? "Chwilowy limit AI i brak automatycznych wyników. Wklej 1-3 adresy WWW konkurencji ręcznie."
          : "Temporary AI limit and no competitor pages retrieved automatically. Add 1-3 competitor URLs manually."
        : "No competitor pages retrieved automatically right now. Add 1-3 competitor URLs to scan them directly.",
      city: params.city,
      country: params.country,
      industryId: params.industryId,
      detectedIndustryLabel,
      radiusKm: params.radiusKm,
      scannedAt,
      summary: "",
      competitors: [],
      marketBenchmarks: [],
      painPoints: [],
      sources: [],
      searchQueries: queries,
    },
  };
}
