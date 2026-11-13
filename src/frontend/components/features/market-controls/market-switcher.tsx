"use client";

import { useState, type FormEvent } from "react";
import {
  Building2,
  CheckCircle2,
  Globe,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { INDUSTRY_LIST, type IndustryId } from "@/src/config/industries";
import {
  RADOM_UPHOLSTERY_MARKET,
  type MarketDataSource,
  type MarketProfile,
} from "@/src/config/markets";
import type { AppDictionary } from "@/src/locales";

interface GeoResolvePayload {
  source?: MarketDataSource;
  market?: MarketProfile;
  centerGps?: { lat: number; lon: number };
  error?: string;
}

interface MarketSwitcherProps {
  t: AppDictionary;
  market: MarketProfile;
  industryId: IndustryId;
  onMarketChange: (nextMarket: MarketProfile) => void;
  onIndustryChange: (nextIndustry: IndustryId) => void;
  websiteUrl?: string;
  onWebsiteUrlChange?: (nextUrl: string) => void;
  onSyncPrices?: () => void;
  onScanMarket?: () => void;
  isSyncingPrices?: boolean;
  isScanningMarket?: boolean;
  syncError?: string | null;
  syncedCount?: number;
  scannedCompetitorsCount?: number;
}

export function MarketSwitcher({
  t,
  market,
  industryId,
  onMarketChange,
  onIndustryChange,
  websiteUrl = "",
  onWebsiteUrlChange,
  onSyncPrices,
  onScanMarket,
  isSyncingPrices = false,
  isScanningMarket = false,
  syncError = null,
  syncedCount = 0,
  scannedCompetitorsCount = 0,
}: MarketSwitcherProps) {
  const [cityQuery, setCityQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCaseStudy = (market.source ?? "case-study") === "case-study";

  async function handleCitySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = cityQuery.trim();
    if (!trimmed) {
      setErrorMsg(t.cityEmptyError);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch(
        `/api/geo/resolve?city=${encodeURIComponent(trimmed)}`,
      );
      const data = (await response.json()) as GeoResolvePayload;

      if (!response.ok || !data.market) {
        setErrorMsg(data.error ?? t.cityErrorFallback);
        return;
      }

      onMarketChange({
        ...data.market,
        source: data.source === "case-study" ? "case-study" : "live-geo",
        centerGps: data.centerGps,
      });
    } catch {
      setErrorMsg(t.cityErrorFallback);
    } finally {
      setIsLoading(false);
    }
  }

  function handleResetRadom() {
    setCityQuery("");
    setErrorMsg(null);
    onMarketChange(RADOM_UPHOLSTERY_MARKET);
  }

  return (
    <section
      aria-label={t.marketSwitcherLabel}
      className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
        <form onSubmit={handleCitySubmit} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="city-search-input"
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
            >
              <Globe size={13} className="text-teal-700 dark:text-teal-400" />
              {t.marketSwitcherLabel}
            </label>
            <div className="flex items-center gap-2 text-[10px]">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium ${
                  isCaseStudy
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                    : "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300"
                }`}
              >
                <MapPin size={10} />
                {market.centerName} ·{" "}
                {isCaseStudy ? t.citySourceCaseStudy : t.citySourceLiveGeo}
              </span>
              {market.centerGps && (
                <span className="hidden font-mono text-[10px] text-slate-500 dark:text-slate-400 sm:inline">
                  {market.centerGps.lat.toFixed(2)}°,{" "}
                  {market.centerGps.lon.toFixed(2)}°
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                id="city-search-input"
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder={t.cityPlaceholder}
                disabled={isLoading}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {isLoading && <Loader2 size={13} className="animate-spin" />}
              {isLoading ? t.loadingCityButton : t.loadCityButton}
            </button>

            {market.id !== RADOM_UPHOLSTERY_MARKET.id && (
              <button
                type="button"
                onClick={handleResetRadom}
                disabled={isLoading}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <RotateCcw size={12} />
                {t.presetRadomButton}
              </button>
            )}
          </div>
        </form>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="industry-select"
            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
          >
            <Building2 size={13} className="text-teal-700 dark:text-teal-400" />
            {t.industryLabel}
          </label>
          <select
            id="industry-select"
            value={industryId}
            onChange={(e) => onIndustryChange(e.target.value as IndustryId)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {INDUSTRY_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {t[item.labelKey]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(onSyncPrices || onScanMarket) && (
        <div className="mt-3.5 border-t border-slate-100 pt-3.5 dark:border-slate-800">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="website-url-input"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                >
                  <Link2
                    size={13}
                    className="text-teal-700 dark:text-teal-400"
                  />
                  {t.websiteSyncLabel}
                </label>

                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  {syncedCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                      <CheckCircle2 size={10} />
                      {t.websiteSyncedBadge} · {syncedCount}{" "}
                      {t.syncedCountSuffix}
                    </span>
                  )}
                  {scannedCompetitorsCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
                      <Sparkles size={10} />
                      {t.competitorsScannedBadge} ({scannedCompetitorsCount})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <input
                  id="website-url-input"
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => onWebsiteUrlChange?.(e.target.value)}
                  placeholder={t.websiteUrlPlaceholder}
                  disabled={isSyncingPrices}
                  className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />

                {onSyncPrices && (
                  <button
                    type="button"
                    onClick={onSyncPrices}
                    disabled={isSyncingPrices || !websiteUrl.trim()}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <RefreshCw
                      size={12}
                      className={isSyncingPrices ? "animate-spin" : ""}
                    />
                    {isSyncingPrices
                      ? t.syncingPricesButton
                      : t.syncPricesButton}
                  </button>
                )}

                {onScanMarket && (
                  <button
                    type="button"
                    onClick={onScanMarket}
                    disabled={isScanningMarket}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-600"
                  >
                    {isScanningMarket ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {isScanningMarket
                      ? t.scanningMarketButton
                      : t.scanMarketButton}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {(errorMsg || syncError) && (
        <p
          role="alert"
          className="mt-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          {errorMsg ?? syncError}
        </p>
      )}
    </section>
  );
}
