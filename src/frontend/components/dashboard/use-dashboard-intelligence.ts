"use client";

import { useEffect, useState } from "react";
import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  resolveUnitType,
  type IndustryId,
  type IndustryServiceItem,
} from "@/src/config/industries";
import {
  applyIndustryToMarket,
  getMarketMetrics,
  RADOM_UPHOLSTERY_MARKET,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import {
  formatTemplate,
  SUPPORTED_LOCALES,
  translations,
  type Locale,
} from "@/src/locales";
import type {
  IndustryControlMode,
  SyncNotice,
} from "../features/market-controls/market-switcher";
import {
  buildSyncedCatalog,
  CLIENT_SYNC_TIMEOUT_MS,
  DEFAULT_WEBSITE_URL,
  isPresetIndustryId,
  isSupportedLocale,
  isTimeoutFailure,
  LEGAL_ROUTE_OVERRIDES,
  LOCALE_KEY,
  readJsonSafe,
  resolveSyncErrorMessage,
  resolveWorkspaceProfile,
  THEME_KEY,
  validateClientWebsiteUrl,
  type LiveScanWithNiche,
  type PricingSyncResponse,
  type SiteProfile,
} from "./types-and-helpers";

export function useDashboardIntelligence() {
  const [locale, setLocale] = useState<Locale>("en");
  const [dark, setDark] = useState(false);
  const [running, setRunning] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(30);
  const [baseMarket, setBaseMarket] = useState<MarketProfile>(
    RADOM_UPHOLSTERY_MARKET,
  );
  const [industryId, setIndustryId] = useState<IndustryId>("upholstery");
  const [customNiche, setCustomNiche] = useState<string | null>(null);
  const [selectedTown, setSelectedTown] = useState<TownGeo | null>(null);
  const [cookieModalSignal, setCookieModalSignal] = useState(0);

  const [websiteUrl, setWebsiteUrl] = useState<string>(DEFAULT_WEBSITE_URL);
  const [syncedCatalog, setSyncedCatalog] = useState<
    IndustryServiceItem[] | null
  >(null);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [siteProfile, setSiteProfile] = useState<SiteProfile | null>(null);
  const [isSyncingPrices, setIsSyncingPrices] = useState<boolean>(false);

  const [liveScan, setLiveScan] = useState<LiveScanWithNiche | null>(null);
  const [scannedBenchmarks, setScannedBenchmarks] = useState<
    Record<string, number>
  >({});
  const [isScanningMarket, setIsScanningMarket] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);

  const focusCitySearch = () => {
    const input = document.getElementById(
      "city-search-input",
    ) as HTMLInputElement | null;
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
    input.select();
  };

  useEffect(() => {
    const queryLang = new URLSearchParams(window.location.search).get("lang");
    const savedLocale = window.localStorage.getItem(LOCALE_KEY);
    if (isSupportedLocale(queryLang)) {
      setLocale(queryLang);
      window.localStorage.setItem(LOCALE_KEY, queryLang);
    } else if (isSupportedLocale(savedLocale)) {
      setLocale(savedLocale);
    }
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark") setDark(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusCitySearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleLocale = () => {
    const currentIndex = SUPPORTED_LOCALES.indexOf(locale);
    const nextIndex = (currentIndex + 1) % SUPPORTED_LOCALES.length;
    const next = SUPPORTED_LOCALES[nextIndex];
    setLocale(next);
    window.localStorage.setItem(LOCALE_KEY, next);
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  };

  const resetLiveIntelligence = () => {
    setSyncedCatalog(null);
    setSyncedCount(0);
    setSiteProfile(null);
    setLiveScan(null);
    setScannedBenchmarks({});
    setSyncNotice(null);
  };

  const handleMarketChange = (nextMarket: MarketProfile) => {
    setBaseMarket(nextMarket);
    setSelectedTown(null);
    resetLiveIntelligence();
    if (
      nextMarket.id === RADOM_UPHOLSTERY_MARKET.id &&
      industryId === "upholstery" &&
      !customNiche?.trim()
    ) {
      setWebsiteUrl(DEFAULT_WEBSITE_URL);
    } else if (websiteUrl === DEFAULT_WEBSITE_URL) {
      setWebsiteUrl("");
    }
  };

  const handleIndustryChange = (nextIndustry: IndustryId) => {
    setIndustryId(nextIndustry);
    setCustomNiche(null);
    resetLiveIntelligence();
    if (
      baseMarket.id === RADOM_UPHOLSTERY_MARKET.id &&
      nextIndustry === "upholstery"
    ) {
      setWebsiteUrl(DEFAULT_WEBSITE_URL);
    } else if (websiteUrl === DEFAULT_WEBSITE_URL) {
      setWebsiteUrl("");
    }
  };

  const handleCustomNicheChange = (nextNiche: string | null) => {
    setCustomNiche(nextNiche);
    if (syncNotice) setSyncNotice(null);
    if (nextNiche !== null) {
      setLiveScan(null);
      setScannedBenchmarks({});
      if (
        websiteUrl === DEFAULT_WEBSITE_URL &&
        nextNiche.trim().length > 0 &&
        nextNiche.trim().toLowerCase() !==
          translations[locale].industryUpholstery.toLowerCase()
      ) {
        setWebsiteUrl("");
      }
    }
  };

  const handleWebsiteUrlChange = (next: string) => {
    if (next.trim() !== websiteUrl.trim()) {
      setSiteProfile(null);
      setSyncedCatalog(null);
      setSyncedCount(0);
      setLiveScan(null);
      setScannedBenchmarks({});
    }
    setWebsiteUrl(next);
    if (syncNotice) setSyncNotice(null);
  };

  const t = translations[locale];
  const trimmedCustomNiche = (customNiche ?? "").trim();
  const hasManualCustomNiche = trimmedCustomNiche.length > 0;

  const isWebsiteAutoNiche =
    Boolean(liveScan?.detectedIndustryLabel) ||
    Boolean(
      siteProfile &&
      (siteProfile.matchedIndustryId === "custom" ||
        (siteProfile.matchedIndustryId &&
          siteProfile.matchedIndustryId !== industryId)),
    );

  const industryMode: IndustryControlMode = hasManualCustomNiche
    ? "custom"
    : isWebsiteAutoNiche
      ? "auto"
      : "preset";

  const detectedSiteNicheLabel =
    liveScan?.detectedIndustryLabel ||
    (siteProfile
      ? locale === "pl"
        ? siteProfile.nichePl
        : siteProfile.nicheEn
      : "");

  const activeIndustryLabel = hasManualCustomNiche
    ? trimmedCustomNiche
    : isWebsiteAutoNiche && detectedSiteNicheLabel
      ? detectedSiteNicheLabel
      : t[INDUSTRY_TEMPLATES[industryId].labelKey];

  const detectedIndustryLabel =
    isWebsiteAutoNiche || hasManualCustomNiche
      ? activeIndustryLabel
      : undefined;

  const workspaceProfile = resolveWorkspaceProfile(websiteUrl, t.accountName);
  const baseIndustryMarket = applyIndustryToMarket(baseMarket, industryId);
  const isCaseStudy =
    (baseIndustryMarket.source ?? "case-study") === "case-study";

  const activeBenchmarksSource = hasManualCustomNiche
    ? []
    : syncedCatalog !== null
      ? syncedCatalog
      : isWebsiteAutoNiche
        ? []
        : baseIndustryMarket.benchmarks;

  const hasLiveAiScan = Boolean(liveScan?.aiEnhanced);
  const market: MarketProfile = {
    ...baseIndustryMarket,
    benchmarks: activeBenchmarksSource.map((row) => {
      const scanned = scannedBenchmarks[row.serviceKey];
      const resolvedLocalPrice =
        typeof scanned === "number" && scanned > 0
          ? scanned
          : hasLiveAiScan && (row.isLiveDiscovered || !isCaseStudy)
            ? 0
            : row.localPricePln;
      return {
        ...row,
        localPricePln: resolvedLocalPrice,
      };
    }),
  };

  const metrics = getMarketMetrics(market, radiusKm);
  const townsInRadius = [
    market.centerName,
    ...metrics.localTowns
      .filter((town) => town.distKm <= radiusKm)
      .map((town) => town.name),
  ];

  const currentYear = new Date().getFullYear();
  const copyrightRange = currentYear >= 2027 ? `2026 - ${currentYear}` : "2026";
  const liveCompetitorsCount = liveScan?.competitors.length ?? 0;
  const topLivePainPoint =
    liveScan?.aiEnhanced && liveScan.painPoints.length > 0
      ? liveScan.painPoints[0].label
      : undefined;

  const legalRoutes = LEGAL_ROUTE_OVERRIDES[locale] ?? {
    privacy: "/privacy",
    terms: "/terms",
  };

  const handleSyncPrices = async () => {
    const trimmed = websiteUrl.trim();
    if (!trimmed) return;

    const validation = validateClientWebsiteUrl(trimmed, t);
    if (!validation.valid) {
      setSiteProfile(null);
      setSyncedCatalog(null);
      setSyncedCount(0);
      setLiveScan(null);
      setScannedBenchmarks({});
      setSyncNotice({ tone: "error", message: validation.message });
      return;
    }

    setIsSyncingPrices(true);
    setSyncNotice(null);
    setLiveScan(null);
    setScannedBenchmarks({});

    try {
      const response = await fetch(
        `/api/pricing/sync?url=${encodeURIComponent(trimmed)}`,
        {
          signal: AbortSignal.timeout(CLIENT_SYNC_TIMEOUT_MS),
        },
      );
      const data = await readJsonSafe<PricingSyncResponse>(response);

      if (!data || !response.ok) {
        setSiteProfile(null);
        setSyncedCatalog(null);
        setSyncedCount(0);
        setSyncNotice({
          tone: "error",
          message: resolveSyncErrorMessage(
            data,
            response.status,
            validation.host,
            t,
          ),
        });
        return;
      }

      const resolvedHost = data.host || validation.host;
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
          setCustomNiche(null);
          const detectedPreset = data.siteProfile.matchedIndustryId;
          if (isPresetIndustryId(detectedPreset)) {
            setIndustryId(detectedPreset);
          }
          setSiteProfile(data.siteProfile);
          setSyncedCatalog([]);
          setSyncedCount(0);
          setSyncNotice({
            tone: "info",
            message: formatTemplate(t.syncNoPublicPricesInfo, {
              niche: detectedNiche,
              host: resolvedHost,
            }),
          });
          return;
        }

        setSiteProfile(null);
        setSyncedCatalog(null);
        setSyncedCount(0);
        setSyncNotice({
          tone: "error",
          message: formatTemplate(t.syncNoPublicPricesNoNicheError, {
            host: resolvedHost,
          }),
        });
        return;
      }

      const detectedPreset = data.siteProfile?.matchedIndustryId;
      const effectiveIndustryId: IndustryId = isPresetIndustryId(detectedPreset)
        ? detectedPreset
        : industryId;
      if (effectiveIndustryId !== industryId) {
        setIndustryId(effectiveIndustryId);
      }

      const nextCatalog = buildSyncedCatalog(
        data.prices,
        effectiveIndustryId,
        baseMarket,
      );

      if (nextCatalog.length === 0) {
        if (detectedNiche && data.siteProfile) {
          setCustomNiche(null);
          setSiteProfile(data.siteProfile);
          setSyncedCatalog([]);
          setSyncedCount(0);
          setSyncNotice({
            tone: "info",
            message: formatTemplate(t.syncNoPublicPricesInfo, {
              niche: detectedNiche,
              host: resolvedHost,
            }),
          });
        } else {
          setSiteProfile(null);
          setSyncedCatalog(null);
          setSyncedCount(0);
          setSyncNotice({ tone: "error", message: t.syncWebsiteError });
        }
        return;
      }

      setCustomNiche(null);
      setSiteProfile(data.siteProfile ?? null);
      setSyncedCatalog(nextCatalog);
      setSyncedCount(nextCatalog.length);
      if (data.code === "AI_FALLBACK_USED") {
        setSyncNotice({
          tone: "warning",
          message: t.syncFallbackParserNotice,
        });
      } else if (data.aiEnhanced === false && data.warning) {
        setSyncNotice({
          tone: "warning",
          message: data.warning,
        });
      }
    } catch (err) {
      setSyncNotice({
        tone: "error",
        message: isTimeoutFailure(err)
          ? t.syncWebsiteTimeoutError
          : t.syncWebsiteError,
      });
    } finally {
      setIsSyncingPrices(false);
    }
  };

  const handleScanMarket = async () => {
    setIsScanningMarket(true);
    setSyncNotice(null);
    const effectiveSiteProfile: SiteProfile | undefined = hasManualCustomNiche
      ? {
          businessName: siteProfile?.businessName,
          nichePl: trimmedCustomNiche,
          nicheEn: trimmedCustomNiche,
          matchedIndustryId: "custom",
          searchQueriesPl: [trimmedCustomNiche],
          searchQueriesEn: [trimmedCustomNiche],
        }
      : (siteProfile ?? undefined);

    try {
      const response = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: market.centerName,
          country: market.country,
          countryCode: market.countryCode,
          industryId,
          radiusKm,
          locale,
          excludeUrl: websiteUrl.trim() || undefined,
          siteProfile: effectiveSiteProfile,
          services: market.benchmarks.map((row) => ({
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
        setSyncNotice({
          tone: "error",
          message: isTimeoutFailure(null, response.status)
            ? t.scanMarketTimeoutError
            : formatTemplate(t.scanMarketHttpError, {
                status: response.status,
              }),
        });
        return;
      }

      if (!response.ok) {
        setSyncNotice({
          tone: "error",
          message: data.error ?? data.warning ?? t.scanMarketError,
        });
        return;
      }

      setLiveScan(data);
      const nextBenchmarks: Record<string, number> = {};
      for (const item of data.marketBenchmarks ?? []) {
        if (
          typeof item.serviceKey === "string" &&
          typeof item.avgPricePln === "number" &&
          Number.isFinite(item.avgPricePln) &&
          item.avgPricePln > 0
        ) {
          nextBenchmarks[item.serviceKey] = Math.round(item.avgPricePln);
        }
      }
      setScannedBenchmarks(nextBenchmarks);
      if (!data.aiEnhanced && data.warning) {
        setSyncNotice({
          tone: "warning",
          message: data.warning,
        });
      }
    } catch (err) {
      setSyncNotice({
        tone: "error",
        message: isTimeoutFailure(err)
          ? t.scanMarketTimeoutError
          : t.scanMarketError,
      });
    } finally {
      setIsScanningMarket(false);
    }
  };

  const runScan = async () => {
    setRunning(true);
    try {
      await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "analyzeCompetitors",
            arguments: {
              center: market.centerName,
              radiusKm,
              industryId,
              townsInRadius,
              competitorsTracked:
                liveCompetitorsCount > 0
                  ? liveCompetitorsCount
                  : metrics.competitorsTracked,
              locale,
            },
          },
        }),
      });
    } finally {
      window.setTimeout(() => setRunning(false), 600);
    }
  };

  const hasComparableBenchmarks = market.benchmarks.some(
    (row) => row.localPricePln > 0,
  );
  const gapMetricLabel = !hasComparableBenchmarks
    ? "—"
    : metrics.avgGapPct < 0
      ? `−${Math.abs(metrics.avgGapPct)}%`
      : metrics.avgGapPct === 0
        ? "0%"
        : `+${metrics.avgGapPct}%`;

  const openCookieSettings = () => setCookieModalSignal((v) => v + 1);

  return {
    locale,
    dark,
    t,
    running,
    radiusKm,
    setRadiusKm,
    industryId,
    industryMode,
    customNiche,
    selectedTown,
    setSelectedTown,
    cookieModalSignal,
    openCookieSettings,
    websiteUrl,
    syncedCount,
    isSyncingPrices,
    liveScan,
    isScanningMarket,
    syncNotice,
    market,
    metrics,
    townsInRadius,
    activeIndustryLabel,
    detectedIndustryLabel,
    workspaceProfile,
    isCaseStudy,
    copyrightRange,
    legalRoutes,
    liveCompetitorsCount,
    topLivePainPoint,
    hasComparableBenchmarks,
    gapMetricLabel,
    focusCitySearch,
    toggleLocale,
    toggleDark,
    handleMarketChange,
    handleIndustryChange,
    handleCustomNicheChange,
    handleWebsiteUrlChange,
    handleSyncPrices,
    handleScanMarket,
    runScan,
  };
}
