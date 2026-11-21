"use client";

import type { ReactNode } from "react";
import { Activity, MapPin, TrendingUp, Users } from "lucide-react";
import type { AppDictionary } from "@/src/locales";

interface DashboardKpiGridProps {
  t: AppDictionary;
  radiusKm: number;
  centerName: string;
  serviceableTownsCount: number;
  competitorsTracked: number;
  liveCompetitorsCount: number;
  avgGapPct: number;
  gapMetricLabel: string;
  hasComparableBenchmarks: boolean;
}

export function DashboardKpiGrid({
  t,
  radiusKm,
  centerName,
  serviceableTownsCount,
  competitorsTracked,
  liveCompetitorsCount,
  avgGapPct,
  gapMetricLabel,
  hasComparableBenchmarks,
}: DashboardKpiGridProps) {
  return (
    <section
      aria-label={t.performanceSummary}
      className="mb-5 grid grid-cols-2 gap-3 [&>*]:min-w-0 xl:grid-cols-4"
    >
      <Metric
        icon={<MapPin size={16} />}
        label={t.coverageArea}
        value={`${radiusKm} ${t.kmUnit}`}
        foot={`${t.radiusFromRadom} (${centerName})`}
      />
      <Metric
        icon={<Users size={16} />}
        label={t.serviceableTowns}
        value={String(serviceableTownsCount)}
        foot={t.townsInRadius}
      />
      <Metric
        icon={<Activity size={16} />}
        label={t.localCompetitors}
        value={String(
          liveCompetitorsCount > 0 ? liveCompetitorsCount : competitorsTracked,
        )}
        foot={
          liveCompetitorsCount > 0
            ? t.competitorsLiveFoot
            : t.competitorsTracked
        }
        badge={liveCompetitorsCount > 0 ? "LIVE AI" : undefined}
      />
      <Metric
        icon={<TrendingUp size={16} />}
        label={t.avgMarketGap}
        value={gapMetricLabel}
        foot={
          hasComparableBenchmarks ? t.belowMarketAverage : t.noLocalBenchmark
        }
        highlight={hasComparableBenchmarks && avgGapPct <= 0}
      />
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  foot,
  badge,
  highlight,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  foot: string;
  badge?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_8px_rgba(20,40,45,.025)] dark:border-slate-800 dark:bg-[#172123] md:p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {label}
        </span>
        <span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-[25px] font-semibold tracking-tight ${
            highlight
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {value}
        </span>
        {badge && (
          <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:bg-teal-950/70 dark:text-teal-300">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {foot}
      </p>
    </div>
  );
}
