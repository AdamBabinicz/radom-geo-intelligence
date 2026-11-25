import {
  resolveServiceLabel,
  resolveUnitType,
  type IndustryId,
  type IndustryServiceItem,
} from "@/src/config/industries";
import type { MarketProfile } from "@/src/config/markets";
import type { DisplayCurrency } from "@/src/lib/currency";
import { formatTemplate, type AppDictionary, type Locale } from "@/src/locales";
import type { SyncNotice } from "../features/market-controls/market-switcher";
import {
  buildSyncedCatalog,
  CLIENT_SYNC_TIMEOUT_MS,
  GEO_RESOLVE_TIMEOUT_MS,
  isPresetIndustryId,
  isTimeoutFailure,
  MCP_SCAN_TIMEOUT_MS,
  readJsonSafe,
  resolveSyncErrorMessage,
  type GeoResolvePayload,
  type LiveScanWithNiche,
  type McpAnalysisSummary,
  type McpAnalyzeJsonRpcResponse,
  type PricingSyncResponse,
  type SiteProfile,
} from "./types-and-helpers";

function resolveGeoErrorMessage(
  t: AppDictionary,
  city: string,
  status?: number,
  payload?: GeoResolvePayload | null,
  err?: unknown,
): string {
  if (payload?.code === "CITY_EMPTY") {
    return t.cityEmptyError;
  }
  if (payload?.code === "CITY_NOT_FOUND" || status === 404) {
    return formatTemplate(t.cityNotFoundError, { city });
  }
  if (payload?.code === "GEO_TIMEOUT" || isTimeoutFailure(err, status)) {
    return t.cityTimeoutError;
  }
  if (typeof status === "number" && status >= 400) {
    return formatTemplate(t.cityHttpError, { status });
  }
  return t.cityErrorFallback;
}

export async function fetchGeoCityMarket(
  rawQuery: string,
  t: AppDictionary,
): Promise<
  { ok: true; market: MarketProfile } | { ok: false; errorMessage: string }
> {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { ok: false, errorMessage: t.cityEmptyError };
  }

  try {
    const response = await fetch(
      `/api/geo/resolve?city=${encodeURIComponent(trimmed)}`,
      { signal: AbortSignal.timeout(GEO_RESOLVE_TIMEOUT_MS) },
    );
    const data = await readJsonSafe<GeoResolvePayload>(response);
    if (!response.ok || !data?.market) {
      return {
        ok: false,
        errorMessage: resolveGeoErrorMessage(t, trimmed, response.status, data),
      };
    }

    return {
      ok: true,
      market: {
        ...data.market,
        source: data.source === "case-study" ? "case-study" : "live-geo",
        centerGps: data.centerGps,
      },
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: resolveGeoErrorMessage(t, trimmed, undefined, null, err),
    };
  }
}

export type FetchSyncedPricingResult =
  | {
      ok: true;
      hasPublicPrices: boolean;
      catalog: IndustryServiceItem[];
      siteProfile: SiteProfile | null;
      industryId: IndustryId;
      notice: SyncNotice | null;
    }
  | {
      ok: false;
      notice: SyncNotice;
    };

export async function fetchSyncedPricing(params: {
  url: string;
  host: string;
  locale: Locale;
  currentIndustryId: IndustryId;
  resolvedBaseMarket: MarketProfile;
  t: AppDictionary;
}): Promise<FetchSyncedPricingResult> {
  const { url, host, locale, currentIndustryId, resolvedBaseMarket, t } =
    params;

  try {
    const response = await fetch(
      `/api/pricing/sync?url=${encodeURIComponent(url)}`,
      {
        signal: AbortSignal.timeout(CLIENT_SYNC_TIMEOUT_MS),
      },
    );
    const data = await readJsonSafe<PricingSyncResponse>(response);

    if (!data || !response.ok) {
      return {
        ok: false,
        notice: {
          tone: "error",
          message: resolveSyncErrorMessage(data, response.status, host, t),
        },
      };
    }

    const resolvedHost = data.host || host;
    const detectedNiche = (
      (locale === "pl"
        ? data.siteProfile?.nichePl
        : data.siteProfile?.nicheEn) ||
      data.siteProfile?.nichePl ||
      data.siteProfile?.nicheEn ||
      ""
    ).trim();

    if (
      data.hasPublicPrices === false ||
      data.code === "NO_PUBLIC_PRICES" ||
      !Array.isArray(data.prices) ||
      data.prices.length === 0
    ) {
      if (detectedNiche && data.siteProfile) {
        const detectedPreset = data.siteProfile.matchedIndustryId;
        const effectiveIndustryId = isPresetIndustryId(detectedPreset)
          ? detectedPreset
          : currentIndustryId;
        return {
          ok: true,
          hasPublicPrices: false,
          catalog: [],
          siteProfile: data.siteProfile,
          industryId: effectiveIndustryId,
          notice: {
            tone: "info",
            message: formatTemplate(t.syncNoPublicPricesInfo, {
              niche: detectedNiche,
              host: resolvedHost,
            }),
          },
        };
      }

      return {
        ok: false,
        notice: {
          tone: "error",
          message: formatTemplate(t.syncNoPublicPricesNoNicheError, {
            host: resolvedHost,
          }),
        },
      };
    }

    const detectedPreset = data.siteProfile?.matchedIndustryId;
    const effectiveIndustryId: IndustryId = isPresetIndustryId(detectedPreset)
      ? detectedPreset
      : currentIndustryId;

    const nextCatalog = buildSyncedCatalog(
      data.prices,
      effectiveIndustryId,
      resolvedBaseMarket,
    );

    if (nextCatalog.length === 0) {
      if (detectedNiche && data.siteProfile) {
        return {
          ok: true,
          hasPublicPrices: false,
          catalog: [],
          siteProfile: data.siteProfile,
          industryId: effectiveIndustryId,
          notice: {
            tone: "info",
            message: formatTemplate(t.syncNoPublicPricesInfo, {
              niche: detectedNiche,
              host: resolvedHost,
            }),
          },
        };
      }

      return {
        ok: false,
        notice: { tone: "error", message: t.syncWebsiteError },
      };
    }

    let notice: SyncNotice | null = null;
    if (data.code === "AI_FALLBACK_USED") {
      notice = {
        tone: "warning",
        message: t.syncFallbackParserNotice,
      };
    } else if (data.aiEnhanced === false && data.warning) {
      notice = {
        tone: "warning",
        message: data.warning,
      };
    }

    return {
      ok: true,
      hasPublicPrices: true,
      catalog: nextCatalog,
      siteProfile: data.siteProfile ?? null,
      industryId: effectiveIndustryId,
      notice,
    };
  } catch (err) {
    return {
      ok: false,
      notice: {
        tone: "error",
        message: isTimeoutFailure(err)
          ? t.syncWebsiteTimeoutError
          : t.syncWebsiteError,
      },
    };
  }
}

export type FetchLiveMarketScanResult =
  | {
      ok: true;
      data: LiveScanWithNiche;
      scannedBenchmarks: Record<string, number>;
      warningNotice: SyncNotice | null;
    }
  | {
      ok: false;
      notice: SyncNotice;
    };

export async function fetchLiveMarketScan(params: {
  city: string;
  country?: string;
  countryCode?: string;
  industryId: IndustryId;
  radiusKm: number;
  locale: Locale;
  excludeUrl?: string;
  siteProfile?: SiteProfile;
  services: IndustryServiceItem[];
  t: AppDictionary;
}): Promise<FetchLiveMarketScanResult> {
  const {
    city,
    country,
    countryCode,
    industryId,
    radiusKm,
    locale,
    excludeUrl,
    siteProfile,
    services,
    t,
  } = params;

  try {
    const response = await fetch("/api/market/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city,
        country,
        countryCode,
        industryId,
        radiusKm,
        locale,
        excludeUrl,
        siteProfile,
        services: services.map((row) => ({
          serviceKey: row.serviceKey,
          label: resolveServiceLabel(row, t, locale),
          unitType: resolveUnitType(row),
          ourPricePln: row.ourPricePln,
        })),
      }),
      signal: AbortSignal.timeout(CLIENT_SYNC_TIMEOUT_MS),
    });

    const data = await readJsonSafe<
      LiveScanWithNiche & {
        error?: string;
        warning?: string;
      }
    >(response);

    if (!data) {
      return {
        ok: false,
        notice: {
          tone: "error",
          message: isTimeoutFailure(null, response.status)
            ? t.scanMarketTimeoutError
            : formatTemplate(t.scanMarketHttpError, {
                status: response.status,
              }),
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        notice: {
          tone: "error",
          message: data.error ?? data.warning ?? t.scanMarketError,
        },
      };
    }

    const scannedBenchmarks: Record<string, number> = {};
    for (const item of data.marketBenchmarks ?? []) {
      if (
        typeof item.serviceKey === "string" &&
        typeof item.avgPricePln === "number" &&
        Number.isFinite(item.avgPricePln) &&
        item.avgPricePln > 0
      ) {
        scannedBenchmarks[item.serviceKey] = Math.round(item.avgPricePln);
      }
    }

    const warningNotice: SyncNotice | null =
      !data.aiEnhanced && data.warning
        ? { tone: "warning", message: data.warning }
        : null;

    return {
      ok: true,
      data,
      scannedBenchmarks,
      warningNotice,
    };
  } catch (err) {
    return {
      ok: false,
      notice: {
        tone: "error",
        message: isTimeoutFailure(err)
          ? t.scanMarketTimeoutError
          : t.scanMarketError,
      },
    };
  }
}

export async function invokeMcpAnalyzeCompetitors(params: {
  center: string;
  radiusKm: number;
  industryId: IndustryId;
  townsInRadius: string[];
  competitorsTracked: number;
  locale: Locale;
  currency?: DisplayCurrency;
  t: AppDictionary;
}): Promise<
  | { ok: true; summary: McpAnalysisSummary }
  | { ok: false; errorMessage: string }
> {
  const {
    center,
    radiusKm,
    industryId,
    townsInRadius,
    competitorsTracked,
    locale,
    currency,
    t,
  } = params;

  const startedAt = performance.now();

  try {
    const response = await fetch("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(MCP_SCAN_TIMEOUT_MS),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "analyzeCompetitors",
          arguments: {
            center,
            radiusKm,
            industryId,
            townsInRadius,
            competitorsTracked,
            locale,
            ...(currency ? { currency } : {}),
          },
        },
      }),
    });

    const durationMs = Math.max(1, Math.round(performance.now() - startedAt));
    const payload = await readJsonSafe<McpAnalyzeJsonRpcResponse>(response);
    if (!response.ok) {
      return {
        ok: false,
        errorMessage: isTimeoutFailure(null, response.status)
          ? t.mcpTimeoutError
          : (payload?.error?.message ??
            formatTemplate(t.mcpHttpError, { status: response.status })),
      };
    }

    if (payload?.error?.message) {
      return { ok: false, errorMessage: payload.error.message };
    }

    const structured = payload?.result?.structuredContent;
    if (!structured) {
      return { ok: false, errorMessage: t.mcpEmptyError };
    }

    const sourceStatus =
      structured.sourceStatus === "connected" ||
      structured.sourceStatus === "demo"
        ? structured.sourceStatus
        : undefined;

    return {
      ok: true,
      summary: {
        center: structured.center ?? center,
        radiusKm:
          typeof structured.radiusKm === "number"
            ? structured.radiusKm
            : radiusKm,
        serviceableTownsCount:
          typeof structured.serviceableTownsCount === "number"
            ? structured.serviceableTownsCount
            : townsInRadius.length,
        competitorsTracked:
          typeof structured.competitorsTracked === "number"
            ? structured.competitorsTracked
            : competitorsTracked,
        completedAtIso: new Date().toISOString(),
        durationMs,
        ...(sourceStatus ? { sourceStatus } : {}),
      },
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: isTimeoutFailure(err)
        ? t.mcpTimeoutError
        : err instanceof Error && err.message.trim()
          ? err.message
          : t.mcpEmptyError,
    };
  }
}
