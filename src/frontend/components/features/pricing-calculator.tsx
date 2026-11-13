"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Calculator, Check } from "lucide-react";
import {
  getTownTravelFeePln,
  type MarketProfile,
  type TownGeo,
} from "@/src/config/markets";
import {
  convertFromPln,
  formatCurrencyValue,
  formatPrice,
} from "@/src/lib/currency";
import type { AppDictionary, Locale } from "@/src/locales";

interface PricingCalculatorProps {
  t: AppDictionary;
  market: MarketProfile;
  locale: Locale;
  radiusKm: number;
  selectedTown: TownGeo | null;
}

export function PricingCalculator({
  t,
  market,
  locale,
  radiusKm,
  selectedTown,
}: PricingCalculatorProps) {
  const [serviceIndex, setServiceIndex] = useState(0);
  const [townName, setTownName] = useState(market.centerName);

  useEffect(() => {
    setTownName(market.centerName);
    setServiceIndex(0);
  }, [market.id, market.centerName]);

  useEffect(() => {
    if (selectedTown && !selectedTown.isRegionalHub) {
      setTownName(selectedTown.name);
    }
  }, [selectedTown]);

  const localTowns = market.towns.filter((town) => !town.isRegionalHub);
  const activeBenchmark =
    market.benchmarks[serviceIndex] ?? market.benchmarks[0];

  if (!activeBenchmark) return null;

  const effectiveTownName =
    townName === market.centerName ||
    localTowns.some((town) => town.name === townName)
      ? townName
      : market.centerName;

  const activeTown = localTowns.find((town) => town.name === effectiveTownName);
  const isCenter = effectiveTownName === market.centerName;
  const isInZone =
    isCenter || (activeTown ? activeTown.distKm <= radiusKm : true);
  const travelFeePln = getTownTravelFeePln(market, effectiveTownName);
  const isPerUnit = Boolean(activeBenchmark.isPerUnit);

  const convertedService = convertFromPln(activeBenchmark.ourPricePln, locale);
  const convertedTravel = convertFromPln(travelFeePln, locale);
  const totalConverted = convertedService + convertedTravel;

  const totalDisplay = isPerUnit
    ? `${formatCurrencyValue(convertedService, locale)} ${t.perM2}`
    : formatCurrencyValue(totalConverted, locale);

  return (
    <section
      id="pricing"
      className="rounded-xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#172123]"
    >
      <div className="flex items-center justify-between gap-3 p-5 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            <Calculator size={17} />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{t.calculatorTitle}</h2>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              {t.calculatorSubtitle}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isInZone
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300"
          }`}
        >
          {isInZone ? t.inZoneStatus : t.outOfZoneStatus}
        </span>
      </div>

      <div className="flex flex-col gap-3 px-5">
        <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {t.chooseService}
          <select
            value={serviceIndex}
            onChange={(e) => setServiceIndex(Number(e.target.value))}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {market.benchmarks.map((row, idx) => (
              <option key={row.serviceKey} value={idx}>
                {t[row.serviceKey]} ({formatPrice(row.ourPricePln, locale)})
              </option>
            ))}
          </select>
        </label>

        <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {t.serviceTown}
          <select
            value={effectiveTownName}
            onChange={(e) => setTownName(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value={market.centerName}>
              {market.centerName} ({t.centerCityTag})
            </option>
            {localTowns.map((town) => (
              <option key={town.name} value={town.name}>
                {town.name} ({town.distKm} {t.kmUnit})
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-[10px] dark:bg-slate-800">
          <span className="text-slate-500 dark:text-slate-400">
            {t.estimatedTravel}
          </span>
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {travelFeePln > 0
              ? formatCurrencyValue(convertedTravel, locale)
              : t.included}
          </span>
        </div>
      </div>

      <div className="mx-5 mb-5 mt-4 flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/70 p-3 dark:border-teal-900 dark:bg-teal-950/40">
        <div>
          <p className="text-[9px] text-teal-800 dark:text-teal-300">
            {t.estimatedTotal}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-teal-950 dark:text-teal-100">
            {totalDisplay}
            {isPerUnit && travelFeePln > 0 && (
              <span className="ml-2 text-xs font-medium text-teal-700 dark:text-teal-300">
                (+ {formatCurrencyValue(convertedTravel, locale)} {t.plusTravel}
                )
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label={t.openBooking}
          className="grid size-8 place-items-center rounded-lg bg-teal-700 text-white hover:bg-teal-800"
        >
          <ArrowRight size={15} />
        </button>
      </div>

      <p className="-mt-3 mb-4 flex items-center gap-1.5 px-5 text-[9px] text-slate-500 dark:text-slate-400">
        <Check size={11} className="text-emerald-600" />
        {t.priceDisclaimer}
      </p>
    </section>
  );
}
