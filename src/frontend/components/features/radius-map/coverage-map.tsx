"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Minus,
  Navigation2,
  Plus,
  RotateCcw,
  Sliders,
  X,
} from "lucide-react";
import {
  getMarketMetrics,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import type { AppDictionary } from "@/src/locales";
import { CoverageSvg } from "./coverage-svg";

interface CoverageMapProps {
  t: AppDictionary;
  market: MarketProfile;
  radiusKm: number;
  onRadiusChange: (value: number) => void;
  selectedTown: TownGeo | null;
  onSelectTown: (town: TownGeo | null) => void;
}

export function CoverageMap({
  t,
  market,
  radiusKm,
  onRadiusChange,
  selectedTown,
  onSelectTown,
}: CoverageMapProps) {
  const [zoomMultiplier, setZoomMultiplier] = useState<number>(1.15);

  const baseExtentKm = Math.max(radiusKm * 1.25, 34);
  const currentExtentKm = baseExtentKm / zoomMultiplier;
  const pxPerKm = 340 / currentExtentKm;
  const scaleBarKm = currentExtentKm > 70 ? 25 : currentExtentKm > 25 ? 10 : 5;

  const { localTowns, localInRangeCount, farthestHubInRange } =
    getMarketMetrics(market, radiusKm);

  return (
    <section
      id="coverage"
      className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="p-5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                {t.coverageTitle}
              </h2>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                {t.zoomBadge} {Math.round(zoomMultiplier * 100)}%
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {t.radiusLabel}:{" "}
              <b className="text-slate-800 dark:text-slate-200">
                {radiusKm} {t.kmUnit}
              </b>{" "}
              · {localInRangeCount} {t.ofLabel} {localTowns.length}{" "}
              {t.townsCountSuffix}
            </p>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-800/60">
            <Sliders size={13} className="text-teal-700 dark:text-teal-400" />
            <span className="text-[10px] font-medium text-slate-500">
              {t.radiusLabel}:
            </span>
            <span className="text-xs font-bold text-teal-800 dark:text-teal-300">
              {radiusKm} {t.kmUnit}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-[10px] font-semibold text-slate-400">
            10 {t.kmUnit}
          </span>
          <input
            type="range"
            min={10}
            max={100}
            step={1}
            value={radiusKm}
            onChange={(e) => onRadiusChange(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-slate-200 accent-teal-700 dark:bg-slate-700 dark:accent-teal-400"
            aria-label={t.radiusLabel}
          />
          <span className="text-[10px] font-semibold text-slate-400">
            100 {t.kmUnit}
          </span>
        </div>
      </div>

      <div className="relative mx-4 mb-4 h-[480px] overflow-hidden rounded-lg border border-slate-200 bg-[#f4f7f6] dark:border-slate-700 dark:bg-[#111a1c]">
        <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-md backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={() => setZoomMultiplier((z) => Math.min(z + 0.4, 5.5))}
            className="grid size-9 place-items-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            title={t.zoomInTitle}
            aria-label={t.zoomInLabel}
          >
            <Plus size={18} />
          </button>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            onClick={() => setZoomMultiplier((z) => Math.max(z - 0.4, 0.4))}
            className="grid size-9 place-items-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            title={t.zoomOutTitle}
            aria-label={t.zoomOutLabel}
          >
            <Minus size={18} />
          </button>
          <div className="h-px bg-slate-200 dark:bg-slate-700" />
          <button
            type="button"
            onClick={() => setZoomMultiplier(1.15)}
            className="grid size-9 place-items-center text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            title={t.zoomResetTitle}
            aria-label={t.zoomResetLabel}
          >
            <RotateCcw size={14} />
          </button>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-200">
          <Compass size={14} className="text-teal-600" />
          {t.northLabel} {market.northDirectionLabel}
        </div>

        <CoverageSvg
          t={t}
          centerName={market.centerName}
          towns={market.towns}
          radiusKm={radiusKm}
          pxPerKm={pxPerKm}
          scaleBarKm={scaleBarKm}
          selectedTown={selectedTown}
          onSelectTown={(town) => onSelectTown(town)}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-200">
          <Navigation2 size={13} className="text-teal-600" />
          <span>
            {t.activeRangeLabel}: {radiusKm} {t.kmUnit}
          </span>
          {farthestHubInRange && (
            <span className="font-bold text-indigo-600 dark:text-indigo-400">
              · {t.hubReachedPrefix} {farthestHubInRange.name}
            </span>
          )}
        </div>
      </div>

      {selectedTown && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-[11px] dark:border-teal-800 dark:bg-teal-950/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white">
              {selectedTown.name}
            </span>
            <span className="font-mono text-teal-800 dark:text-teal-300">
              {selectedTown.distKm} {t.kmUnit}
              {selectedTown.driveMin
                ? ` · ~${selectedTown.driveMin} ${t.minUnit}`
                : ""}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                selectedTown.distKm <= radiusKm
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
              }`}
            >
              {selectedTown.distKm <= radiusKm
                ? t.inZoneStatus
                : t.outOfZoneStatus}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTown(null)}
            aria-label={t.clearSelection}
            className="rounded p-1 text-slate-500 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 px-5 pb-5">
        {localTowns.map((town) => {
          const inRange = town.distKm <= radiusKm;
          const isSelected = selectedTown?.name === town.name;
          return (
            <button
              key={town.name}
              type="button"
              onClick={() => onSelectTown(isSelected ? null : town)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                isSelected ? "ring-2 ring-teal-500/60" : ""
              } ${
                inRange
                  ? "border-teal-200 bg-teal-50/70 text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
                  : "border-slate-200 bg-slate-100 text-slate-500 line-through dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {inRange ? (
                <CheckCircle2
                  size={12}
                  className="text-teal-600 dark:text-teal-400"
                />
              ) : (
                <AlertCircle
                  size={12}
                  className="text-amber-600 dark:text-amber-400"
                />
              )}
              <span className="font-semibold">{town.name}</span>
              <span className="text-[10px] opacity-75">
                ({town.distKm} {t.kmUnit})
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
