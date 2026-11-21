"use client";

import { Sparkles } from "lucide-react";
import { DashboardKpiGrid } from "./dashboard/dashboard-kpi-grid";
import {
  DashboardFooter,
  DashboardHeader,
  DashboardSidebar,
} from "./dashboard/dashboard-shell";
import { useDashboardIntelligence } from "./dashboard/use-dashboard-intelligence";
import { AiCouncilPanel } from "./features/ai-council/ai-council-panel";
import { CompetitorTable } from "./features/competitor-table/competitor-table";
import { CookieConsent } from "./features/legal/cookie-consent";
import { ScrollToTop } from "./features/legal/scroll-to-top";
import { MarketSwitcher } from "./features/market-controls/market-switcher";
import { PricingCalculator } from "./features/pricing-calculator";
import { CoverageMap } from "./features/radius-map/coverage-map";
import { RovoConsole } from "./features/rovo-console/rovo-console";

export function Dashboard() {
  const {
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
  } = useDashboardIntelligence();

  const hasPricingCalculator = market.benchmarks.length > 0;

  return (
    <div className={dark ? "dark" : ""}>
      <div className="min-h-screen bg-[#f5f7f8] text-slate-900 dark:bg-[#101719] dark:text-slate-100">
        <DashboardSidebar
          t={t}
          workspaceProfile={workspaceProfile}
          onFocusSearch={focusCitySearch}
        />

        <main
          id="overview"
          className="min-h-screen min-w-0 overflow-x-clip lg:ml-[248px]"
        >
          <DashboardHeader
            t={t}
            locale={locale}
            dark={dark}
            onFocusSearch={focusCitySearch}
            onToggleDark={toggleDark}
            onToggleLocale={toggleLocale}
          />

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
              industryMode={industryMode}
              activeIndustryDisplay={activeIndustryLabel}
              customNiche={customNiche}
              onCustomNicheChange={handleCustomNicheChange}
              websiteUrl={websiteUrl}
              onWebsiteUrlChange={handleWebsiteUrlChange}
              onSyncPrices={handleSyncPrices}
              onScanMarket={handleScanMarket}
              isSyncingPrices={isSyncingPrices}
              isScanningMarket={isScanningMarket}
              syncNotice={syncNotice}
              syncedCount={syncedCount}
              scannedCompetitorsCount={liveCompetitorsCount}
            />

            <DashboardKpiGrid
              t={t}
              radiusKm={radiusKm}
              centerName={market.centerName}
              serviceableTownsCount={metrics.serviceableTownsCount}
              competitorsTracked={metrics.competitorsTracked}
              liveCompetitorsCount={liveCompetitorsCount}
              avgGapPct={metrics.avgGapPct}
              gapMetricLabel={gapMetricLabel}
              hasComparableBenchmarks={hasComparableBenchmarks}
            />

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
                detectedIndustryLabel={detectedIndustryLabel}
                onScanMarket={handleScanMarket}
                isScanningMarket={isScanningMarket}
              />
            </div>

            <div
              className={`mt-5 grid grid-cols-1 gap-5 xl:items-start [&>*]:min-w-0 ${
                hasPricingCalculator
                  ? "xl:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)]"
                  : ""
              }`}
            >
              <RovoConsole
                t={t}
                market={market}
                locale={locale}
                radiusKm={radiusKm}
                running={running}
                onRun={runScan}
                industryId={industryId}
                liveCompetitorsCount={liveCompetitorsCount}
                detectedIndustryLabel={detectedIndustryLabel}
                topPainPoint={topLivePainPoint}
              />
              {hasPricingCalculator && (
                <PricingCalculator
                  t={t}
                  market={market}
                  locale={locale}
                  radiusKm={radiusKm}
                  selectedTown={selectedTown}
                />
              )}
            </div>

            <AiCouncilPanel
              t={t}
              market={market}
              locale={locale}
              industryId={industryId}
              detectedIndustryLabel={detectedIndustryLabel}
              radiusKm={radiusKm}
              avgGapPct={metrics.avgGapPct}
              townsInRadius={townsInRadius}
              liveScan={liveScan}
            />

            <DashboardFooter
              t={t}
              copyrightRange={copyrightRange}
              isCaseStudy={isCaseStudy}
              legalRoutes={legalRoutes}
              onOpenCookieSettings={openCookieSettings}
            />
          </div>
        </main>
        <CookieConsent t={t} reopenSignal={cookieModalSignal} />
        <ScrollToTop label={t.scrollToTop} />
      </div>
    </div>
  );
}
