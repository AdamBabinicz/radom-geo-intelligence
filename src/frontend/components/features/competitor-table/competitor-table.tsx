"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Sparkles,
  Star,
  Store,
} from "lucide-react";
import {
  INDUSTRY_TEMPLATES,
  resolveServiceLabel,
  type IndustryId,
} from "@/src/config/industries";
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

  const uniqueSources = liveScan
    ? Array.from(
        new Map(
          liveScan.sources
            .map((src) => {
              const safeHref = getSafeHref(src.uri);
              return safeHref
                ? ([
                    safeHref,
                    { title: cleanDisplayText(src.title), uri: safeHref },
                  ] as const)
                : null;
            })
            .filter(
              (entry): entry is readonly [string, LiveSourceItem] =>
                entry !== null,
            ),
        ).values(),
      )
    : [];

  return (
    <section
      id="market"
      className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="p-5 pb-4">
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
            {market.benchmarks.map((row, idx) => {
              const hasLocalAvg = row.localPricePln > 0;
              const gapPct = hasLocalAvg
                ? Math.round(
                    ((row.ourPricePln - row.localPricePln) /
                      row.localPricePln) *
                      100,
                  )
                : 0;
              const isCheaperOrEqual = gapPct <= 0;
              const label = resolveServiceLabel(row, t, locale);
              return (
                <tr
                  key={`${row.serviceKey}-${idx}`}
                  className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                >
                  <td className="px-5 py-3.5 text-xs font-medium text-slate-800 dark:text-slate-100">
                    {label}
                  </td>
                  <td className="px-3 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                    {hasLocalAvg ? (
                      formatPrice(row.localPricePln, locale)
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-xs font-semibold text-slate-900 dark:text-white">
                    {formatPrice(row.ourPricePln, locale)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {hasLocalAvg ? (
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
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {t.noLocalBenchmark}
                      </span>
                    )}
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
            ? liveScan!.painPoints.map((pain, idx) => (
                <span
                  key={`${pain.key}-${idx}`}
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
            <p className="mb-3 break-words text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              {cleanDisplayText(liveScan!.summary)}
            </p>
          )}
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t.discoveredCompetitorsLabel} ({liveScan!.competitors.length})
          </p>
          <div className="max-h-[460px] space-y-2 overflow-y-auto pr-1">
            {liveScan!.competitors.map((comp, idx) => {
              const safeHref = getSafeHref(comp.website);
              return (
                <div
                  key={`${comp.name}-${comp.website ?? ""}-${idx}`}
                  className="min-w-0 rounded-md border border-slate-200/70 bg-white p-2.5 text-[11px] dark:border-slate-800 dark:bg-[#172123]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5 break-words font-semibold text-slate-800 dark:text-slate-100">
                        <Store
                          size={12}
                          className="shrink-0 text-teal-700 dark:text-teal-400"
                        />
                        {cleanDisplayText(comp.name)}
                      </span>
                      {typeof comp.rating === "number" && comp.rating > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                          <Star
                            size={10}
                            className="fill-amber-400 text-amber-500"
                          />
                          {comp.rating.toFixed(1)}
                          {typeof comp.reviewCount === "number" &&
                            comp.reviewCount > 0 && (
                              <span className="font-normal text-amber-700/80 dark:text-amber-300/80">
                                ({comp.reviewCount})
                              </span>
                            )}
                        </span>
                      )}
                    </div>
                    {safeHref && (
                      <a
                        href={safeHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-teal-700 hover:underline dark:text-teal-300"
                      >
                        WWW
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 break-words text-slate-600 dark:text-slate-300">
                    {cleanDisplayText(comp.priceSummary)}
                  </p>
                  {comp.travelFeeNote && (
                    <p className="mt-0.5 break-words text-[10px] text-slate-500 dark:text-slate-400">
                      {cleanDisplayText(comp.travelFeeNote)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {uniqueSources.length > 0 && (
            <div className="mt-3 border-t border-slate-200/70 pt-2 dark:border-slate-800">
              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {t.verifiedSourcesLabel}:{" "}
              </span>
              <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                {uniqueSources.map((src) => (
                  <a
                    key={src.uri}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={src.title}
                    className="inline-block max-w-[220px] truncate align-bottom text-[10px] text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {src.title}
                  </a>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
