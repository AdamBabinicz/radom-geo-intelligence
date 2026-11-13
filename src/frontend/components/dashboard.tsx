"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  ChevronDown,
  CircleHelp,
  Command,
  Globe2,
  LayoutDashboard,
  MapPin,
  Moon,
  Search,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";
import { INDUSTRY_TEMPLATES, type IndustryId } from "@/src/config/industries";
import {
  applyIndustryToMarket,
  getMarketMetrics,
  RADOM_UPHOLSTERY_MARKET,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import { translations, type Locale } from "@/src/locales";
import {
  CompetitorTable,
  type LiveMarketScanResult,
} from "./features/competitor-table/competitor-table";
import { CookieConsent } from "./features/legal/cookie-consent";
import { ScrollToTop } from "./features/legal/scroll-to-top";
import { MarketSwitcher } from "./features/market-controls/market-switcher";
import { PricingCalculator } from "./features/pricing-calculator";
import { CoverageMap } from "./features/radius-map/coverage-map";
import { RovoConsole } from "./features/rovo-console/rovo-console";

const LOCALE_KEY = "northstar_locale";
const THEME_KEY = "northstar_theme";
const DEFAULT_WEBSITE_URL = "https://pranie-dywanow.j.pl/";

interface PricingSyncItem {
  serviceKey: string;
  pricePln: number;
}

interface PricingSyncResponse {
  extractedCount?: number;
  prices?: PricingSyncItem[];
  error?: string;
}

export function Dashboard() {
  const [locale, setLocale] = useState<Locale>("en");
  const [dark, setDark] = useState(false);
  const [running, setRunning] = useState(false);
  const [radiusKm, setRadiusKm] = useState<number>(30);
  const [baseMarket, setBaseMarket] = useState<MarketProfile>(
    RADOM_UPHOLSTERY_MARKET,
  );
  const [industryId, setIndustryId] = useState<IndustryId>("upholstery");
  const [selectedTown, setSelectedTown] = useState<TownGeo | null>(null);
  const [cookieModalSignal, setCookieModalSignal] = useState(0);

  const [websiteUrl, setWebsiteUrl] = useState<string>(DEFAULT_WEBSITE_URL);
  const [syncedPrices, setSyncedPrices] = useState<Record<string, number>>({});
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [isSyncingPrices, setIsSyncingPrices] = useState<boolean>(false);

  const [liveScan, setLiveScan] = useState<LiveMarketScanResult | null>(null);
  const [scannedBenchmarks, setScannedBenchmarks] = useState<
    Record<string, number>
  >({});
  const [isScanningMarket, setIsScanningMarket] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

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
    if (queryLang === "pl" || queryLang === "en") {
      setLocale(queryLang);
      window.localStorage.setItem(LOCALE_KEY, queryLang);
    } else if (savedLocale === "pl" || savedLocale === "en") {
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
    const next: Locale = locale === "en" ? "pl" : "en";
    setLocale(next);
    window.localStorage.setItem(LOCALE_KEY, next);
  };

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  };

  const resetLiveIntelligence = () => {
    setSyncedPrices({});
    setSyncedCount(0);
    setLiveScan(null);
    setScannedBenchmarks({});
    setSyncError(null);
  };

  const handleMarketChange = (nextMarket: MarketProfile) => {
    setBaseMarket(nextMarket);
    setSelectedTown(null);
    resetLiveIntelligence();
    if (
      nextMarket.id === RADOM_UPHOLSTERY_MARKET.id &&
      industryId === "upholstery"
    ) {
      setWebsiteUrl(DEFAULT_WEBSITE_URL);
    } else if (websiteUrl === DEFAULT_WEBSITE_URL) {
      setWebsiteUrl("");
    }
  };

  const handleIndustryChange = (nextIndustry: IndustryId) => {
    setIndustryId(nextIndustry);
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

  const t = translations[locale];
  const baseIndustryMarket = applyIndustryToMarket(baseMarket, industryId);
  const market: MarketProfile = {
    ...baseIndustryMarket,
    benchmarks: baseIndustryMarket.benchmarks.map((row) => ({
      ...row,
      ourPricePln: syncedPrices[row.serviceKey] ?? row.ourPricePln,
      localPricePln: scannedBenchmarks[row.serviceKey] ?? row.localPricePln,
    })),
  };

  const metrics = getMarketMetrics(market, radiusKm);
  const townsInRadius = [
    market.centerName,
    ...metrics.localTowns
      .filter((town) => town.distKm <= radiusKm)
      .map((town) => town.name),
  ];
  const activeIndustryLabel = t[INDUSTRY_TEMPLATES[industryId].labelKey];
  const isCaseStudy = (market.source ?? "case-study") === "case-study";
  const currentYear = new Date().getFullYear();
  const copyrightRange = currentYear >= 2027 ? `2026 - ${currentYear}` : "2026";

  const handleSyncPrices = async () => {
    const trimmed = websiteUrl.trim();
    if (!trimmed) return;

    setIsSyncingPrices(true);
    setSyncError(null);

    try {
      const response = await fetch(
        `/api/pricing/sync?url=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as PricingSyncResponse;

      if (
        !response.ok ||
        !Array.isArray(data.prices) ||
        data.prices.length === 0
      ) {
        setSyncError(data.error ?? t.syncWebsiteError);
        return;
      }

      const nextPrices: Record<string, number> = {};
      for (const item of data.prices) {
        if (
          typeof item.serviceKey === "string" &&
          typeof item.pricePln === "number" &&
          Number.isFinite(item.pricePln) &&
          item.pricePln > 0
        ) {
          nextPrices[item.serviceKey] = Math.round(item.pricePln);
        }
      }

      const matchedInIndustry = baseIndustryMarket.benchmarks.filter(
        (b) => nextPrices[b.serviceKey] !== undefined,
      ).length;

      setSyncedPrices(nextPrices);
      setSyncedCount(
        matchedInIndustry > 0
          ? matchedInIndustry
          : Object.keys(nextPrices).length,
      );
    } catch {
      setSyncError(t.syncWebsiteError);
    } finally {
      setIsSyncingPrices(false);
    }
  };

  const handleScanMarket = async () => {
    setIsScanningMarket(true);
    setSyncError(null);

    try {
      const response = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: market.centerName,
          industryId,
          radiusKm,
          locale,
          excludeUrl: websiteUrl.trim() || undefined,
        }),
      });
      const data = (await response.json()) as LiveMarketScanResult & {
        error?: string;
      };

      if (!response.ok) {
        setSyncError(data.error ?? t.scanMarketError);
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
        setSyncError(data.warning);
      }
    } catch {
      setSyncError(t.scanMarketError);
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
              competitorsTracked: metrics.competitorsTracked,
              locale,
            },
          },
        }),
      });
    } finally {
      window.setTimeout(() => setRunning(false), 600);
    }
  };

  const gapMetricLabel =
    metrics.avgGapPct <= 0
      ? `−${Math.abs(metrics.avgGapPct)}%`
      : `+${metrics.avgGapPct}%`;

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f7f8] text-slate-900 dark:bg-[#101719] dark:text-slate-100">
        <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white px-5 py-6 dark:border-slate-800 dark:bg-[#141c1e] lg:flex">
          <a className="flex items-center gap-3 px-1" href="#overview">
            <span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white">
              <Waves size={21} />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">
                {t.brand}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {t.workspace}
              </span>
            </span>
          </a>
          <p className="mb-3 mt-10 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500 dark:text-slate-400">
            {t.workspace}
          </p>
          <nav
            className="flex flex-col gap-1 text-[13px] font-medium"
            aria-label={t.primaryNav}
          >
            <a
              href="#overview"
              className="flex items-center gap-3 rounded-lg bg-teal-50 px-3 py-2.5 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
            >
              <LayoutDashboard size={17} />
              {t.overview}
            </a>
            <a
              href="#market"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <TrendingUp size={17} />
              {t.marketIntelligence}
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                {t.new}
              </span>
            </a>
            <a
              href="#coverage"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <MapPin size={17} />
              {t.serviceAreas}
            </a>
            <a
              href="#agent"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Bot size={17} />
              {t.rovoAgent}
            </a>
            <a
              href="#pricing"
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Command size={17} />
              {t.pricePreview}
            </a>
          </nav>
          <div className="mt-auto rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <CircleHelp
                size={15}
                className="text-teal-700 dark:text-teal-300"
              />
              {t.needHelp}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              {t.helpCopy}
            </p>
            <button
              type="button"
              onClick={focusCitySearch}
              className="mt-3 text-xs font-semibold text-teal-700 dark:text-teal-300"
            >
              {t.viewGuide} →
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
            <div className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              MB
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{t.accountName}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {t.adminRole}
              </p>
            </div>
            <ChevronDown
              size={15}
              className="text-slate-500 dark:text-slate-400"
            />
          </div>
        </aside>

        <main
          id="overview"
          className="min-h-screen min-w-0 overflow-x-clip lg:ml-[248px]"
        >
          <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#141c1e]/90 sm:px-5 md:px-9">
            <div className="flex min-w-0 items-center gap-2 truncate text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{t.workspace}</span>
              <span>/</span>
              <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                {t.overview}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={focusCitySearch}
                aria-label={t.search}
                title={`${t.search} (Ctrl+K)`}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Search size={15} />
                <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:inline">
                  Ctrl+K
                </kbd>
              </button>
              <button
                type="button"
                aria-label={t.toggleTheme}
                onClick={toggleDark}
                className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                type="button"
                onClick={toggleLocale}
                className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold dark:border-slate-700"
              >
                <Globe2 size={15} />
                {locale.toUpperCase()}
              </button>
            </div>
          </header>

          <div className="mx-auto max-w-[1450px] px-4 py-6 sm:px-5 md:px-9 md:py-9">
            <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.15em] text-teal-700 dark:text-teal-300">
                  <span className="size-1.5 shrink-0 rounded-full bg-teal-600" />
                  <span className="truncate">
                    {market.centerName} · {activeIndustryLabel}
                  </span>
                </div>
                <h1 className="text-[28px] font-semibold tracking-[-.04em] md:text-[32px]">
                  {t.pageTitle}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  {t.pageSubtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={runScan}
                disabled={running}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-70"
              >
                <Sparkles size={15} />
                {running ? t.scanRunning : t.runScan}
              </button>
            </div>

            <MarketSwitcher
              t={t}
              market={market}
              industryId={industryId}
              onMarketChange={handleMarketChange}
              onIndustryChange={handleIndustryChange}
              websiteUrl={websiteUrl}
              onWebsiteUrlChange={(next) => {
                setWebsiteUrl(next);
                if (syncError) setSyncError(null);
              }}
              onSyncPrices={handleSyncPrices}
              onScanMarket={handleScanMarket}
              isSyncingPrices={isSyncingPrices}
              isScanningMarket={isScanningMarket}
              syncError={syncError}
              syncedCount={syncedCount}
              scannedCompetitorsCount={liveScan?.competitors.length ?? 0}
            />

            <section
              aria-label={t.performanceSummary}
              className="mb-5 grid grid-cols-2 gap-3 [&>*]:min-w-0 xl:grid-cols-4"
            >
              <Metric
                icon={<MapPin size={16} />}
                label={t.coverageArea}
                value={`${radiusKm} ${t.kmUnit}`}
                foot={`${t.radiusFromRadom} (${market.centerName})`}
                positive
              />
              <Metric
                icon={<Users size={16} />}
                label={t.serviceableTowns}
                value={String(metrics.serviceableTownsCount)}
                foot={t.townsInRadius}
                positive
              />
              <Metric
                icon={<Activity size={16} />}
                label={t.localCompetitors}
                value={String(
                  liveScan?.competitors.length
                    ? Math.max(
                        metrics.competitorsTracked,
                        liveScan.competitors.length,
                      )
                    : metrics.competitorsTracked,
                )}
                foot={t.competitorsTracked}
              />
              <Metric
                icon={<TrendingUp size={16} />}
                label={t.avgMarketGap}
                value={gapMetricLabel}
                foot={t.belowMarketAverage}
                positive={metrics.avgGapPct <= 0}
              />
            </section>

            <div className="grid grid-cols-1 gap-5 xl:items-start [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
              <CoverageMap
                t={t}
                market={market}
                radiusKm={radiusKm}
                onRadiusChange={setRadiusKm}
                selectedTown={selectedTown}
                onSelectTown={setSelectedTown}
              />
              <CompetitorTable
                t={t}
                market={market}
                locale={locale}
                industryId={industryId}
                syncedCount={syncedCount}
                liveScan={liveScan}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:items-start [&>*]:min-w-0 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)]">
              <RovoConsole
                t={t}
                market={market}
                locale={locale}
                radiusKm={radiusKm}
                running={running}
                onRun={runScan}
                industryId={industryId}
              />
              <PricingCalculator
                t={t}
                market={market}
                locale={locale}
                radiusKm={radiusKm}
                selectedTown={selectedTown}
              />
            </div>

            <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-slate-200 py-5 text-[11px] text-slate-600 sm:flex-row sm:items-center dark:border-slate-800 dark:text-slate-400">
              <span>
                © {copyrightRange} {t.brand} · {t.footerLeft}
              </span>
              <div className="flex flex-wrap items-center gap-4">
                <span>{isCaseStudy ? t.footerRight : t.citySourceLiveGeo}</span>
                <Link
                  href={`/privacy?lang=${locale}`}
                  className="font-medium hover:text-teal-700 dark:hover:text-teal-300"
                >
                  {t.privacyPolicy}
                </Link>
                <Link
                  href={`/terms?lang=${locale}`}
                  className="font-medium hover:text-teal-700 dark:hover:text-teal-300"
                >
                  {t.termsOfService}
                </Link>
                <button
                  type="button"
                  onClick={() => setCookieModalSignal((v) => v + 1)}
                  className="font-medium text-teal-700 hover:underline dark:text-teal-300"
                >
                  {t.cookieSettingsBtn}
                </button>
              </div>
            </footer>
          </div>
        </main>

        <CookieConsent t={t} reopenSignal={cookieModalSignal} />
        <ScrollToTop label={t.scrollToTop} />
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  foot,
  positive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  positive?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_8px_rgba(20,40,45,.025)] dark:border-slate-800 dark:bg-[#172123] md:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {label}
        </span>
        <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[25px] font-semibold tracking-tight">
          {value}
        </span>
        <span className="flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{" "}
          {positive ? "+8.4%" : "−3.2%"}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {foot}
      </p>
    </article>
  );
}
