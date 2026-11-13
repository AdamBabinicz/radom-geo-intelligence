"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  MoreHorizontal,
  Sparkles,
  Store,
} from "lucide-react";
import { INDUSTRY_TEMPLATES, type IndustryId } from "@/src/config/industries";
import type { MarketProfile } from "@/src/config/markets";
import { formatPrice } from "@/src/lib/currency";
import type { AppDictionary, Locale } from "@/src/locales";

export interface LiveCompetitorItem {
  name: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  travelFeeNote?: string;
  priceSummary: string;
}

export interface LivePainPointItem {
  key: string;
  label: string;
  evidence: string;
  severityScore: number;
}

export interface LiveSourceItem {
  title: string;
  uri: string;
}

export interface LiveBenchmarkItem {
  serviceKey: string;
  avgPricePln: number;
  minPricePln?: number;
  maxPricePln?: number;
  sampleCount: number;
  note?: string;
}

export interface LiveMarketScanResult {
  source: string;
  aiEnhanced: boolean;
  summary?: string;
  competitors: LiveCompetitorItem[];
  marketBenchmarks: LiveBenchmarkItem[];
  painPoints: LivePainPointItem[];
  sources: LiveSourceItem[];
  scannedAt?: string;
  warning?: string;
}

interface CompetitorTableProps {
  t: AppDictionary;
  market: MarketProfile;
  locale: Locale;
  industryId?: IndustryId;
  syncedCount?: number;
  liveScan?: LiveMarketScanResult | null;
}

function getSafeHref(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function cleanDisplayText(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function CompetitorTable({
  t,
  market,
  locale,
  industryId = "upholstery",
  syncedCount = 0,
  liveScan = null,
}: CompetitorTableProps) {
  const activeIndustry = INDUSTRY_TEMPLATES[industryId];
  const hasLiveCompetitors = Boolean(
    liveScan?.aiEnhanced && liveScan.competitors.length > 0,
  );
  const hasLivePainPoints = Boolean(
    liveScan?.aiEnhanced && liveScan.painPoints.length > 0,
  );

  return (
    <section
      id="market"
      className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="flex items-start justify-between p-5 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{t.competitorTitle}</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t[activeIndustry.labelKey]}
            </span>
            {syncedCount > 0 && (
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                {t.websiteSyncedBadge} · {syncedCount}
              </span>
            )}
            {hasLiveCompetitors && (
              <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
                {t.competitorsScannedBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t.competitorSubtitle}
          </p>
        </div>
        <button
          type="button"
          aria-label={t.moreOptions}
          className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-left">
          <thead>
            <tr className="border-y border-slate-100 text-[9px] uppercase tracking-[.1em] text-slate-400 dark:border-slate-800">
              <th className="px-5 py-2.5 font-semibold">{t.serviceType}</th>
              <th className="px-3 py-2.5 font-semibold">{t.localAvg}</th>
              <th className="px-3 py-2.5 font-semibold">{t.ourPrice}</th>
              <th className="px-5 py-2.5 text-right font-semibold">
                {t.marketGap}
              </th>
            </tr>
          </thead>
          <tbody>
            {market.benchmarks.map((row) => {
              const gapPct =
                row.localPricePln > 0
                  ? Math.round(
                      ((row.ourPricePln - row.localPricePln) /
                        row.localPricePln) *
                        100,
                    )
                  : 0;
              const isCheaperOrEqual = gapPct <= 0;

              return (
                <tr
                  key={row.serviceKey}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-5 py-3.5 text-xs font-medium text-slate-800 dark:text-slate-100">
                    {t[row.serviceKey]}
                  </td>
                  <td className="px-3 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {formatPrice(row.localPricePln, locale)}
                  </td>
                  <td className="px-3 py-3.5 text-xs font-semibold text-slate-900 dark:text-white">
                    {formatPrice(row.ourPricePln, locale)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
                        isCheaperOrEqual
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {isCheaperOrEqual ? (
                        <ArrowDownRight size={11} />
                      ) : (
                        <ArrowUpRight size={11} />
                      )}
                      {gapPct < 0 ? `−${Math.abs(gapPct)}%` : `+${gapPct}%`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mx-5 mb-4 mt-3 rounded-lg bg-amber-50/80 p-3 dark:bg-amber-950/30">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">
            {t.reviewInsights}
          </span>
          <span className="text-[9px] text-slate-500 dark:text-slate-400">
            {hasLivePainPoints ? t.competitorsScannedBadge : t.last30days}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hasLivePainPoints
            ? liveScan!.painPoints.map((pain) => (
                <span
                  key={pain.key}
                  title={cleanDisplayText(pain.evidence)}
                  className="rounded-md bg-white px-2 py-1 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {cleanDisplayText(pain.label)}{" "}
                  <b className="text-amber-700 dark:text-amber-300">
                    {pain.severityScore}%
                  </b>
                </span>
              ))
            : activeIndustry.painPoints.map((pain) => (
                <span
                  key={pain.topicKey}
                  className="rounded-md bg-white px-2 py-1 text-[9px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {t[pain.topicKey]}{" "}
                  <b className="text-amber-700 dark:text-amber-300">
                    {pain.percent}%
                  </b>
                </span>
              ))}
        </div>
      </div>

      {hasLiveCompetitors && (
        <div className="mx-5 mb-5 rounded-lg border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
            <Sparkles size={13} className="text-teal-700 dark:text-teal-400" />
            {t.marketScanSummaryTitle}
          </div>

          {liveScan!.summary && (
            <p className="mb-3 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              {cleanDisplayText(liveScan!.summary)}
            </p>
          )}

          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t.discoveredCompetitorsLabel}
          </p>
          <div className="space-y-2">
            {liveScan!.competitors.map((comp) => {
              const safeHref = getSafeHref(comp.website);
              return (
                <div
                  key={`${comp.name}-${comp.website ?? ""}`}
                  className="rounded-md border border-slate-200/70 bg-white p-2.5 text-[11px] dark:border-slate-800 dark:bg-[#172123]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                      <Store
                        size={12}
                        className="text-teal-700 dark:text-teal-400"
                      />
                      {cleanDisplayText(comp.name)}
                    </span>
                    {safeHref && (
                      <a
                        href={safeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 hover:underline dark:text-teal-300"
                      >
                        WWW
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {cleanDisplayText(comp.priceSummary)}
                  </p>
                  {comp.travelFeeNote && (
                    <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {cleanDisplayText(comp.travelFeeNote)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {liveScan!.sources.length > 0 && (
            <div className="mt-3 border-t border-slate-200/70 pt-2 dark:border-slate-800">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {t.verifiedSourcesLabel}:{" "}
              </span>
              <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
                {liveScan!.sources.map((src) => {
                  const safeHref = getSafeHref(src.uri);
                  if (!safeHref) return null;
                  return (
                    <a
                      key={safeHref}
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-teal-700 hover:underline dark:text-teal-300"
                    >
                      {cleanDisplayText(src.title)}
                    </a>
                  );
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
