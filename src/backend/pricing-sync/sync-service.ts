import {
  buildFallbackSiteProfile,
  extractWithGemini,
  extractWithGroq,
  mergeMissingCatalogRows,
} from "./ai-extractor";
import {
  buildHighSignalContext,
  extractDeterministicFallback,
  parseCatalogItemsFromContext,
} from "./deterministic-extractor";
import {
  extractHtmlMetadata,
  fetchTextSafe,
  findLazyRouteChunks,
  findPricingSubpages,
  findSameOriginScripts,
  htmlToCleanText,
  isBlockedHost,
  isBotChallengeHtml,
} from "./html-and-crawler";
import { decodeJsBundles } from "./spa-bundle-decoder";
import {
  FETCH_ASSET_TIMEOUT_MS,
  FETCH_HTML_TIMEOUT_MS,
  MAX_SYNC_CACHE_ENTRIES,
  SYNC_CACHE_TTL_MS,
  type CachedSyncPayload,
  type PricingSyncCode,
} from "./types";

export interface PricingSyncHttpResult {
  status: number;
  body: Record<string, unknown>;
}

const syncSuccessCache = new Map<string, CachedSyncPayload>();

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

export async function syncWebsitePricing(
  rawUrl: string,
  forceRefresh = false,
): Promise<PricingSyncHttpResult> {
  let parsedUrl: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl)
      ? rawUrl
      : `https://${rawUrl}`;
    parsedUrl = new URL(withProtocol);
  } catch {
    return {
      status: 400,
      body: {
        error: "Invalid URL format",
        code: "INVALID_URL" satisfies PricingSyncCode,
      },
    };
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return {
      status: 400,
      body: {
        error: "Only HTTP/HTTPS URLs are allowed",
        code: "INVALID_PROTOCOL" satisfies PricingSyncCode,
      },
    };
  }

  if (isBlockedHost(parsedUrl.hostname)) {
    return {
      status: 400,
      body: {
        error: "Private or local network hosts are blocked",
        code: "PRIVATE_HOST_BLOCKED" satisfies PricingSyncCode,
      },
    };
  }

  if (!parsedUrl.hostname || !parsedUrl.hostname.includes(".")) {
    return {
      status: 400,
      body: {
        error: "Invalid URL format",
        code: "INVALID_URL" satisfies PricingSyncCode,
      },
    };
  }

  const cleanHost = parsedUrl.hostname.replace(/^www\./i, "");
  const normalizedKey = parsedUrl.toString().toLowerCase();
  const cached = !forceRefresh
    ? syncSuccessCache.get(normalizedKey)
    : undefined;
  if (cached && cached.expiresAt > Date.now()) {
    return {
      status: 200,
      body: {
        source: "live-website",
        aiEnhanced: true,
        aiProvider: cached.aiProvider,
        hasPublicPrices: cached.prices.length > 0,
        cached: true,
        url: cached.url,
        fetchedAt: cached.fetchedAt,
        extractedCount: cached.prices.length,
        siteProfile: cached.siteProfile,
        prices: cached.prices,
      },
    };
  }

  const html = await fetchTextSafe(parsedUrl.toString(), FETCH_HTML_TIMEOUT_MS);
  if (!html || isBotChallengeHtml(html)) {
    return {
      status: 502,
      body: {
        error: "Failed to fetch target website",
        code: "SITE_UNREACHABLE" satisfies PricingSyncCode,
        host: cleanHost,
      },
    };
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
      if (!subHtml || isBotChallengeHtml(subHtml)) continue;
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
  if (
    !aiResult.aiSucceeded ||
    ((aiResult.prices?.length ?? 0) === 0 && catalogPrices.length > 0)
  ) {
    const groqResult = await extractWithGroq(
      parsedUrl.toString(),
      highSignalContext,
      metadata,
    );
    if (
      groqResult.aiSucceeded &&
      (!aiResult.aiSucceeded || (groqResult.prices?.length ?? 0) > 0)
    ) {
      aiResult = groqResult;
    }
  }

  if (aiResult.aiSucceeded && aiResult.prices && aiResult.prices.length > 0) {
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

    return {
      status: 200,
      body: {
        source: "live-website",
        aiEnhanced: true,
        aiProvider: aiResult.aiProvider,
        hasPublicPrices: true,
        url: parsedUrl.toString(),
        fetchedAt,
        extractedCount: finalPrices.length,
        siteProfile: aiResult.siteProfile,
        prices: finalPrices,
      },
    };
  }

  const extracted = extractDeterministicFallback(
    contextLines,
    html,
    subpages.length > 0,
    hasSpaBundle,
  );

  if (extracted.length > 0) {
    const resolvedProfile =
      aiResult.siteProfile ?? buildFallbackSiteProfile(metadata, extracted);

    return {
      status: 200,
      body: {
        source: "live-website",
        aiEnhanced: aiResult.aiSucceeded,
        aiProvider: aiResult.aiProvider,
        hasPublicPrices: true,
        code: aiResult.aiSucceeded
          ? undefined
          : ("AI_FALLBACK_USED" satisfies PricingSyncCode),
        warning: aiResult.aiSucceeded
          ? undefined
          : "AI extraction temporarily unavailable; used structured parser & JSON-LD fallback.",
        url: parsedUrl.toString(),
        fetchedAt: new Date().toISOString(),
        extractedCount: extracted.length,
        siteProfile: resolvedProfile,
        prices: extracted,
      },
    };
  }

  const noPriceProfile =
    aiResult.siteProfile ?? buildFallbackSiteProfile(metadata, []);

  return {
    status: 200,
    body: {
      source: "live-website",
      aiEnhanced: aiResult.aiSucceeded,
      aiProvider: aiResult.aiProvider,
      hasPublicPrices: false,
      code: "NO_PUBLIC_PRICES" satisfies PricingSyncCode,
      url: parsedUrl.toString(),
      fetchedAt: new Date().toISOString(),
      extractedCount: 0,
      siteProfile: noPriceProfile,
      prices: [],
    },
  };
}
