"use client";

import { useEffect, useRef, useState } from "react";
import type { IndustryId, IndustryServiceItem } from "@/src/config/industries";
import {
  applyIndustryToMarket,
  getMarketMetrics,
  RADOM_UPHOLSTERY_MARKET,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import { SUPPORTED_LOCALES, translations, type Locale } from "@/src/locales";
import type { SyncNotice } from "../features/market-controls/market-switcher";
import {
  fetchGeoCityMarket,
  fetchLiveMarketScan,
  fetchSyncedPricing,
  invokeMcpAnalyzeCompetitors,
} from "./intelligence-api";
import {
  buildActiveMarketProfile,
  collectTownsInRadius,
  computeGapSummary,
  deriveIndustryPresentation,
} from "./intelligence-selectors";
import {
  DEFAULT_WEBSITE_URL,
  isSupportedLocale,
  LEGAL_ROUTE_OVERRIDES,
  LOCALE_KEY,
  resolveWorkspaceProfile,
  THEME_KEY,
  validateClientWebsiteUrl,
  type LiveScanWithNiche,
  type McpAnalysisSummary,
  type SiteProfile,
} from "./types-and-helpers";

interface SyncPricesInternalResult {
  ok: boolean;
  resolvedBaseMarket?: MarketProfile;
  catalog?: IndustryServiceItem[] | null;
  siteProfile?: SiteProfile | null;
  industryId?: IndustryId;
  notice?: SyncNotice | null;
}

interface ScanMarketInternalOptions {
  resolvedBaseMarket?: MarketProfile;
  catalogOverride?: IndustryServiceItem[] | null;
  siteProfileOverride?: SiteProfile | null;
  industryIdOverride?: IndustryId;
  preserveNotice?: SyncNotice | null;
}

interface ScanMarketInternalResult {
  ok: boolean;
  competitorsCount: number;
  resolvedBaseMarket?: MarketProfile;
  effectiveIndustryId?: IndustryId;
}

export function useDashboardIntelligence() {
  const [locale, setLocale] = useState<Locale>("en");
  const [dark, setDark] = useState(false);
  const [running, setRunning] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(30);
  const [baseMarket, setBaseMarket] = useState<MarketProfile>(
    RADOM_UPHOLSTERY_MARKET,
  );
  const [cityQuery, setCityQuery] = useState<string>("");
  const [isResolvingCity, setIsResolvingCity] = useState<boolean>(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const lastResolvedCityQueryRef = useRef<string>("");
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
  const [approvedPriceOverrides, setApprovedPriceOverrides] = useState<
    Record<string, number>
  >({});
  const [isScanningMarket, setIsScanningMarket] = useState<boolean>(false);
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [mcpSummary, setMcpSummary] = useState<McpAnalysisSummary | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);

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
    setApprovedPriceOverrides({});
    setSyncNotice(null);
    setMcpSummary(null);
    setMcpError(null);
  };

  const handleCityQueryChange = (nextQuery: string) => {
    setCityQuery(nextQuery);
    if (cityError) setCityError(null);
  };

  const handleMarketChange = (
    nextMarket: MarketProfile,
    options?: { preserveCustomWebsite?: boolean },
  ) => {
    setBaseMarket(nextMarket);
    setSelectedTown(null);

    const hasCustomWebsite =
      websiteUrl.trim().length > 0 && websiteUrl.trim() !== DEFAULT_WEBSITE_URL;
    if (options?.preserveCustomWebsite && hasCustomWebsite) {
      setLiveScan(null);
      setScannedBenchmarks({});
      setApprovedPriceOverrides({});
      setSyncNotice(null);
      setMcpSummary(null);
      setMcpError(null);
    } else {
      resetLiveIntelligence();
    }

    if (
      nextMarket.id === RADOM_UPHOLSTERY_MARKET.id &&
      industryId === "upholstery" &&
      !customNiche?.trim()
    ) {
      setWebsiteUrl(DEFAULT_WEBSITE_URL);
    } else if (websiteUrl === DEFAULT_WEBSITE_URL) {
      setWebsiteUrl("");
    }

    if (nextMarket.id === RADOM_UPHOLSTERY_MARKET.id) {
      lastResolvedCityQueryRef.current = "";
    }
  };

  const handleResetRadomMarket = () => {
    setCityQuery("");
    setCityError(null);
    lastResolvedCityQueryRef.current = "";
    handleMarketChange(RADOM_UPHOLSTERY_MARKET);
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
      setApprovedPriceOverrides({});
      setMcpSummary(null);
      setMcpError(null);
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
      setApprovedPriceOverrides({});
      setMcpSummary(null);
      setMcpError(null);
    }
    setWebsiteUrl(next);
    if (syncNotice) setSyncNotice(null);
  };

  const t = translations[locale];
  const {
    trimmedCustomNiche,
    hasManualCustomNiche,
    isWebsiteAutoNiche,
    industryMode,
    activeIndustryLabel,
    detectedIndustryLabel,
  } = deriveIndustryPresentation({
    locale,
    t,
    industryId,
    customNiche,
    siteProfile,
    liveScan,
  });

  useEffect(() => {
    setMcpSummary(null);
    setMcpError(null);
  }, [baseMarket.id, radiusKm, industryId, trimmedCustomNiche]);

  const workspaceProfile = resolveWorkspaceProfile(websiteUrl, t.accountName);
  const { isCaseStudy, market } = buildActiveMarketProfile({
    baseMarket,
    industryId,
    hasManualCustomNiche,
    isWebsiteAutoNiche,
    syncedCatalog,
    liveScan,
    scannedBenchmarks,
    approvedPriceOverrides,
  });

  const metrics = getMarketMetrics(market, radiusKm);
  const townsInRadius = collectTownsInRadius(market, radiusKm);
  const { hasComparableBenchmarks, gapMetricLabel } = computeGapSummary(
    market,
    metrics.avgGapPct,
  );

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

  const resolveCityByQuery = async (
    rawQuery: string,
    options?: { preserveCustomWebsite?: boolean },
  ): Promise<MarketProfile | null> => {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      setCityError(t.cityEmptyError);
      return null;
    }
    setIsResolvingCity(true);
    setCityError(null);
    try {
      const result = await fetchGeoCityMarket(trimmed, t);
      if (!result.ok) {
        setCityError(result.errorMessage);
        return null;
      }
      lastResolvedCityQueryRef.current = trimmed.toLowerCase();
      handleMarketChange(result.market, options);
      return result.market;
    } finally {
      setIsResolvingCity(false);
    }
  };

  const handleAnalyzeCity = async () => {
    await resolveCityByQuery(cityQuery);
  };

  const ensureCityResolved = async (options?: {
    preserveCustomWebsite?: boolean;
  }): Promise<MarketProfile | null> => {
    const trimmed = cityQuery.trim();
    if (!trimmed) {
      return baseMarket;
    }
    const normalized = trimmed.toLowerCase();
    if (
      normalized === baseMarket.centerName.trim().toLowerCase() ||
      (lastResolvedCityQueryRef.current.length > 0 &&
        normalized === lastResolvedCityQueryRef.current)
    ) {
      return baseMarket;
    }
    return resolveCityByQuery(trimmed, options);
  };

  const syncPricesInternal = async (
    resolvedBaseMarketOverride?: MarketProfile,
  ): Promise<SyncPricesInternalResult> => {
    const trimmed = websiteUrl.trim();
    if (!trimmed) return { ok: false };

    const validation = validateClientWebsiteUrl(trimmed, t);
    if (!validation.valid) {
      setSiteProfile(null);
      setSyncedCatalog(null);
      setSyncedCount(0);
      setLiveScan(null);
      setScannedBenchmarks({});
      setApprovedPriceOverrides({});
      const notice: SyncNotice = { tone: "error", message: validation.message };
      setSyncNotice(notice);
      return { ok: false, notice };
    }

    setIsSyncingPrices(true);
    setSyncNotice(null);

    try {
      const resolvedBaseMarket =
        resolvedBaseMarketOverride ??
        (await ensureCityResolved({ preserveCustomWebsite: true }));
      if (!resolvedBaseMarket) return { ok: false };

      setLiveScan(null);
      setScannedBenchmarks({});
      setApprovedPriceOverrides({});

      const result = await fetchSyncedPricing({
        url: trimmed,
        host: validation.host,
        locale,
        currentIndustryId: industryId,
        resolvedBaseMarket,
        t,
      });

      if (!result.ok) {
        setSiteProfile(null);
        setSyncedCatalog(null);
        setSyncedCount(0);
        setSyncNotice(result.notice);
        return { ok: false, notice: result.notice };
      }

      if (result.industryId !== industryId) {
        setIndustryId(result.industryId);
      }
      setCustomNiche(null);
      setSiteProfile(result.siteProfile);
      setSyncedCatalog(result.catalog);
      setSyncedCount(result.hasPublicPrices ? result.catalog.length : 0);
      if (result.notice) {
        setSyncNotice(result.notice);
      }

      return {
        ok: true,
        resolvedBaseMarket,
        catalog: result.catalog,
        siteProfile: result.siteProfile,
        industryId: result.industryId,
        notice: result.notice,
      };
    } finally {
      setIsSyncingPrices(false);
    }
  };

  const handleSyncPrices = async () => {
    await syncPricesInternal();
  };

  const scanMarketInternal = async (
    options?: ScanMarketInternalOptions,
  ): Promise<ScanMarketInternalResult> => {
    setIsScanningMarket(true);
    if (!options?.preserveNotice) {
      setSyncNotice(null);
    }

    try {
      const resolvedBaseMarket =
        options?.resolvedBaseMarket ??
        (await ensureCityResolved({ preserveCustomWebsite: true }));
      if (!resolvedBaseMarket) {
        return { ok: false, competitorsCount: 0 };
      }

      const effectiveIndustryId = options?.industryIdOverride ?? industryId;
      const effectiveSiteProfileState =
        options?.siteProfileOverride !== undefined
          ? options.siteProfileOverride
          : siteProfile;
      const hasEffectiveCustomNiche =
        options?.catalogOverride !== undefined ? false : hasManualCustomNiche;
      const effectiveAutoNiche =
        Boolean(
          options?.siteProfileOverride === undefined &&
          liveScan?.detectedIndustryLabel,
        ) ||
        Boolean(
          effectiveSiteProfileState &&
          (effectiveSiteProfileState.matchedIndustryId === "custom" ||
            (effectiveSiteProfileState.matchedIndustryId &&
              effectiveSiteProfileState.matchedIndustryId !==
                effectiveIndustryId)),
        );

      const cityChanged = resolvedBaseMarket.id !== baseMarket.id;
      const industryChanged = effectiveIndustryId !== industryId;
      const effectiveTargetMarket =
        cityChanged || industryChanged
          ? applyIndustryToMarket(resolvedBaseMarket, effectiveIndustryId)
          : market;
      const hasCustomSiteForNewCity =
        websiteUrl.trim().length > 0 &&
        websiteUrl.trim() !== DEFAULT_WEBSITE_URL;

      const targetServices = hasEffectiveCustomNiche
        ? []
        : options?.catalogOverride !== undefined
          ? (options.catalogOverride ?? [])
          : cityChanged || industryChanged
            ? hasCustomSiteForNewCity && syncedCatalog !== null
              ? syncedCatalog
              : effectiveAutoNiche
                ? []
                : effectiveTargetMarket.benchmarks
            : market.benchmarks;

      const effectiveSiteProfile: SiteProfile | undefined =
        hasEffectiveCustomNiche
          ? {
              businessName: effectiveSiteProfileState?.businessName,
              nichePl: trimmedCustomNiche,
              nicheEn: trimmedCustomNiche,
              matchedIndustryId: "custom",
              searchQueriesPl: [trimmedCustomNiche],
              searchQueriesEn: [trimmedCustomNiche],
            }
          : (effectiveSiteProfileState ?? undefined);

      const result = await fetchLiveMarketScan({
        city: effectiveTargetMarket.centerName,
        country: effectiveTargetMarket.country,
        countryCode: effectiveTargetMarket.countryCode,
        industryId: effectiveIndustryId,
        radiusKm,
        locale,
        excludeUrl: websiteUrl.trim() || undefined,
        siteProfile: effectiveSiteProfile,
        services: targetServices,
        t,
      });

      if (!result.ok) {
        setSyncNotice(result.notice);
        return {
          ok: false,
          competitorsCount: 0,
          resolvedBaseMarket,
          effectiveIndustryId,
        };
      }

      setLiveScan(result.data);
      setScannedBenchmarks(result.scannedBenchmarks);
      if (result.warningNotice) {
        setSyncNotice(result.warningNotice);
      }

      return {
        ok: true,
        competitorsCount: result.data.competitors.length,
        resolvedBaseMarket,
        effectiveIndustryId,
      };
    } finally {
      setIsScanningMarket(false);
    }
  };

  const handleScanMarket = async () => {
    await scanMarketInternal();
  };

  const runMcpScanInternal = async (options?: {
    resolvedBaseMarket?: MarketProfile;
    industryIdOverride?: IndustryId;
    competitorsCountOverride?: number;
  }) => {
    setMcpError(null);
    const resolvedBaseMarket =
      options?.resolvedBaseMarket ??
      (await ensureCityResolved({ preserveCustomWebsite: true }));
    if (!resolvedBaseMarket) return;

    const effectiveIndustryId = options?.industryIdOverride ?? industryId;
    const targetMarket =
      resolvedBaseMarket.id !== baseMarket.id ||
      effectiveIndustryId !== industryId
        ? applyIndustryToMarket(resolvedBaseMarket, effectiveIndustryId)
        : market;
    const targetMetrics = getMarketMetrics(targetMarket, radiusKm);
    const targetTowns = collectTownsInRadius(targetMarket, radiusKm);
    const effectiveCompetitors =
      typeof options?.competitorsCountOverride === "number" &&
      options.competitorsCountOverride > 0
        ? options.competitorsCountOverride
        : liveCompetitorsCount > 0
          ? liveCompetitorsCount
          : targetMetrics.competitorsTracked;

    const result = await invokeMcpAnalyzeCompetitors({
      center: targetMarket.centerName,
      radiusKm,
      industryId: effectiveIndustryId,
      townsInRadius: targetTowns,
      competitorsTracked: effectiveCompetitors,
      locale,
      t,
    });

    if (!result.ok) {
      setMcpError(result.errorMessage);
      return;
    }
    setMcpSummary(result.summary);
  };

  const runMcpScan = async () => {
    setRunning(true);
    try {
      await runMcpScanInternal();
    } finally {
      setRunning(false);
    }
  };

  const runScan = async () => {
    setRunning(true);
    setMcpError(null);
    try {
      const resolvedBaseMarket = await ensureCityResolved({
        preserveCustomWebsite: true,
      });
      if (!resolvedBaseMarket) return;

      let syncResult: SyncPricesInternalResult | null = null;
      const hasWebsite = websiteUrl.trim().length > 0;
      if (hasWebsite && syncedCatalog === null && !hasManualCustomNiche) {
        syncResult = await syncPricesInternal(resolvedBaseMarket);
        if (!syncResult.ok) return;
      }

      const activeBaseMarket =
        syncResult?.resolvedBaseMarket ?? resolvedBaseMarket;
      const scanResult = await scanMarketInternal({
        resolvedBaseMarket: activeBaseMarket,
        catalogOverride: syncResult?.catalog,
        siteProfileOverride: syncResult?.siteProfile,
        industryIdOverride: syncResult?.industryId,
        preserveNotice: syncResult?.notice,
      });

      await runMcpScanInternal({
        resolvedBaseMarket: scanResult.resolvedBaseMarket ?? activeBaseMarket,
        industryIdOverride:
          scanResult.effectiveIndustryId ?? syncResult?.industryId,
        competitorsCountOverride:
          scanResult.competitorsCount > 0
            ? scanResult.competitorsCount
            : undefined,
      });
    } finally {
      setRunning(false);
    }
  };

  const handleApplyApprovedPrices = (
    adjustments: Array<{ serviceKey: string; finalPricePln: number }>,
  ) => {
    if (!adjustments.length) return;
    setApprovedPriceOverrides((prev) => {
      const next = { ...prev };
      for (const adj of adjustments) {
        if (
          typeof adj.serviceKey === "string" &&
          typeof adj.finalPricePln === "number" &&
          Number.isFinite(adj.finalPricePln) &&
          adj.finalPricePln > 0
        ) {
          next[adj.serviceKey] = Math.round(adj.finalPricePln);
        }
      }
      return next;
    });
  };

  const openCookieSettings = () => setCookieModalSignal((v) => v + 1);

  return {
    locale,
    dark,
    t,
    running,
    radiusKm,
    setRadiusKm,
    cityQuery,
    isResolvingCity,
    cityError,
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
    mcpSummary,
    mcpError,
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
    handleCityQueryChange,
    handleAnalyzeCity,
    handleResetRadomMarket,
    handleMarketChange,
    handleIndustryChange,
    handleCustomNicheChange,
    handleWebsiteUrlChange,
    handleSyncPrices,
    handleScanMarket,
    handleApplyApprovedPrices,
    runScan,
    runMcpScan,
  };
}
