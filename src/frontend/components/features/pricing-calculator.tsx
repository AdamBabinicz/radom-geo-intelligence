"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Calculator,
  Check,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
} from "lucide-react";
import { resolveServiceLabel, resolveUnitType } from "@/src/config/industries";
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

const MCP_QUOTE_TIMEOUT_MS = 25_000;

interface PricingCalculatorProps {
  t: AppDictionary;
  market: MarketProfile;
  locale: Locale;
  radiusKm: number;
  selectedTown: TownGeo | null;
}

interface QuoteSubmissionState {
  mode: "jira" | "clipboard";
  issueKey?: string;
  issueUrl?: string;
}

interface McpQuoteResponse {
  result?: {
    structuredContent?: {
      status?: string;
      issueKey?: string;
      issueUrl?: string;
    };
  };
  error?: { message?: string };
}

function toSafeHttpUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

async function readJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
  const [quantity, setQuantity] = useState(15);
  const [submitting, setSubmitting] = useState(false);
  const [quoteStatus, setQuoteStatus] = useState<QuoteSubmissionState | null>(
    null,
  );

  useEffect(() => {
    setTownName(market.centerName);
    setServiceIndex(0);
    setQuantity(15);
    setQuoteStatus(null);
  }, [market.id, market.centerName]);

  useEffect(() => {
    if (selectedTown && !selectedTown.isRegionalHub) {
      setTownName(selectedTown.name);
      setQuoteStatus(null);
    }
  }, [selectedTown]);

  const localTowns = market.towns.filter((town) => !town.isRegionalHub);
  const safeServiceIndex =
    serviceIndex < market.benchmarks.length ? serviceIndex : 0;
  const activeBenchmark = market.benchmarks[safeServiceIndex];
  if (!activeBenchmark) return null;

  const unitType = resolveUnitType(activeBenchmark);
  const isPerUnit = unitType !== "fixed";
  const unitLabel = unitType === "piece" ? t.unitPcShort : t.unitM2Short;

  const handleServiceChange = (nextIndex: number) => {
    setServiceIndex(nextIndex);
    setQuoteStatus(null);
    const nextRow = market.benchmarks[nextIndex];
    if (!nextRow) return;
    const nextUnit = resolveUnitType(nextRow);
    if (nextUnit === "piece") {
      setQuantity(nextRow.serviceKey === "upholsteryChair" ? 4 : 2);
    } else if (nextUnit === "m2") {
      setQuantity(15);
    }
  };

  const updateQuantity = (nextValue: number) => {
    const clamped = Math.max(1, Math.min(500, Math.round(nextValue || 1)));
    setQuantity(clamped);
    setQuoteStatus(null);
  };

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
  const effectiveUnits = isPerUnit ? quantity : 1;
  const serviceTotalPln = activeBenchmark.ourPricePln * effectiveUnits;
  const grandTotalPln = serviceTotalPln + travelFeePln;
  const convertedUnit = convertFromPln(activeBenchmark.ourPricePln, locale);
  const convertedTravel = convertFromPln(travelFeePln, locale);
  const totalConverted = convertFromPln(grandTotalPln, locale);
  const serviceName = resolveServiceLabel(activeBenchmark, t, locale);

  const handleSubmitQuote = async () => {
    setSubmitting(true);
    setQuoteStatus(null);
    const summaryText = isPerUnit
      ? `${serviceName} (${quantity} ${unitLabel}) · ${effectiveTownName} · ${formatCurrencyValue(totalConverted, locale)}`
      : `${serviceName} · ${effectiveTownName} · ${formatCurrencyValue(totalConverted, locale)}`;

    try {
      const response = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(MCP_QUOTE_TIMEOUT_MS),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: "createCustomerQuote",
            arguments: {
              center: market.centerName,
              town: effectiveTownName,
              serviceKey: activeBenchmark.serviceKey,
              serviceLabel: serviceName,
              quantity: effectiveUnits,
              unitLabel: isPerUnit ? unitLabel : undefined,
              unitPricePln: activeBenchmark.ourPricePln,
              travelFeePln,
              totalPln: grandTotalPln,
              inZone: isInZone,
              locale,
            },
          },
        }),
      });
      if (response.ok) {
        const data = await readJsonSafe<McpQuoteResponse>(response);
        const created = data?.result?.structuredContent;
        if (created?.status === "created" && created.issueKey) {
          setQuoteStatus({
            mode: "jira",
            issueKey: created.issueKey,
            issueUrl: toSafeHttpUrl(created.issueUrl) ?? undefined,
          });
          return;
        }
      }
    } catch {
      // Fallback to clipboard copy below
    } finally {
      setSubmitting(false);
    }

    try {
      await navigator.clipboard?.writeText(summaryText);
    } catch {
      // Ignore clipboard permission errors in restricted contexts
    }
    setQuoteStatus({ mode: "clipboard" });
  };

  const safeIssueUrl = toSafeHttpUrl(quoteStatus?.issueUrl);

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
            value={safeServiceIndex}
            onChange={(e) => handleServiceChange(Number(e.target.value))}
            className="mt-1.5 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {market.benchmarks.map((row, idx) => (
              <option key={row.serviceKey} value={idx}>
                {resolveServiceLabel(row, t, locale)} (
                {formatPrice(row.ourPricePln, locale)})
              </option>
            ))}
          </select>
        </label>

        {isPerUnit && (
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="calculator-unit-qty"
              className="text-[10px] font-medium text-slate-500 dark:text-slate-400"
            >
              {t.unitQuantityLabel} ({unitLabel})
            </label>
            <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                aria-label="-"
                className="grid size-8 place-items-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Minus size={13} />
              </button>
              <input
                id="calculator-unit-qty"
                type="number"
                min={1}
                max={500}
                value={quantity}
                onChange={(e) => updateQuantity(Number(e.target.value))}
                className="h-8 w-14 border-x border-slate-200 bg-transparent text-center text-xs font-semibold text-slate-900 outline-none dark:border-slate-700 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                aria-label="+"
                className="grid size-8 place-items-center text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}

        <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          {t.serviceTown}
          <select
            value={effectiveTownName}
            onChange={(e) => {
              setTownName(e.target.value);
              setQuoteStatus(null);
            }}
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

      <div className="mx-5 mb-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-teal-100 bg-teal-50/70 p-3 dark:border-teal-900 dark:bg-teal-950/40">
        <div>
          <p className="text-[9px] text-teal-800 dark:text-teal-300">
            {t.estimatedTotal}
          </p>
          <p className="mt-0.5 text-lg font-semibold text-teal-950 dark:text-teal-100">
            {formatCurrencyValue(totalConverted, locale)}
          </p>
          {(isPerUnit || travelFeePln > 0) && (
            <p className="mt-0.5 text-[10px] text-teal-800/80 dark:text-teal-300/80">
              {isPerUnit
                ? `${quantity} ${unitLabel} × ${formatCurrencyValue(convertedUnit, locale)}`
                : formatCurrencyValue(convertedUnit, locale)}
              {travelFeePln > 0
                ? ` + ${formatCurrencyValue(convertedTravel, locale)} ${t.plusTravel}`
                : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSubmitQuote}
          disabled={submitting}
          aria-label={submitting ? t.sendingBookingLead : t.openBooking}
          title={submitting ? t.sendingBookingLead : t.openBooking}
          className="grid size-9 shrink-0 place-items-center rounded-lg bg-teal-700 text-white transition hover:bg-teal-800 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ArrowRight size={15} />
          )}
        </button>
      </div>

      {quoteStatus && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-[10px] font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {quoteStatus.mode === "jira" && quoteStatus.issueKey ? (
            <>
              <span>
                {t.bookingLeadSentPrefix} <b>{quoteStatus.issueKey}</b>
              </span>
              {safeIssueUrl && (
                <a
                  href={safeIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline"
                >
                  Jira <ExternalLink size={11} />
                </a>
              )}
            </>
          ) : (
            <span>{t.bookingLeadFallback}</span>
          )}
        </div>
      )}

      <p className="mb-4 flex items-center gap-1.5 px-5 text-[9px] text-slate-500 dark:text-slate-400">
        <Check size={11} className="text-emerald-600" />
        {t.priceDisclaimer}
      </p>
    </section>
  );
}
