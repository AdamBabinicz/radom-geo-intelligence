"use client";

import { useEffect, useState } from "react";
import { Cookie, ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import type { AppDictionary } from "@/src/locales";

interface ConsentState {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
}

const STORAGE_KEY = "northstar_consent_v2";

function applyGoogleConsent(analytics: boolean, marketing: boolean) {
  const win = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  win.dataLayer = win.dataLayer || [];
  const payload = {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: marketing ? "granted" : "denied",
    ad_user_data: marketing ? "granted" : "denied",
    ad_personalization: marketing ? "granted" : "denied",
  };
  if (typeof win.gtag === "function") {
    win.gtag("consent", "update", payload);
  } else {
    win.dataLayer.push(["consent", "update", payload]);
  }
}

export function CookieConsent({
  t,
  reopenSignal,
}: {
  t: AppDictionary;
  reopenSignal: number;
}) {
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setOpen(true);
        return;
      }
      const parsed = JSON.parse(raw) as ConsentState;
      setAnalytics(Boolean(parsed.analytics));
      setMarketing(Boolean(parsed.marketing));
      applyGoogleConsent(Boolean(parsed.analytics), Boolean(parsed.marketing));
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (reopenSignal > 0) {
      setCustomize(true);
      setOpen(true);
    }
  }, [reopenSignal]);

  const saveDecision = (nextAnalytics: boolean, nextMarketing: boolean) => {
    const record: ConsentState = {
      necessary: true,
      analytics: nextAnalytics,
      marketing: nextMarketing,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    applyGoogleConsent(nextAnalytics, nextMarketing);
    setOpen(false);
    setCustomize(false);
  };

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-label={t.cookieTitle}
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-slate-700 dark:bg-[#141c1e]/95"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
            <Cookie size={16} />
          </span>
          <div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {t.cookieTitle}
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              {t.cookieDescription}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t.clearSelection}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <X size={14} />
        </button>
      </div>

      {customize && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                {t.necessaryLabel}
              </p>
              <p className="text-[10px] text-slate-600 dark:text-slate-400">
                {t.necessaryDesc}
              </p>
            </div>
            <ShieldCheck
              size={16}
              className="shrink-0 text-emerald-600 dark:text-emerald-400"
            />
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
            <div>
              <span className="block font-semibold text-slate-800 dark:text-slate-100">
                {t.analyticsLabel}
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">
                {t.analyticsDesc}
              </span>
            </div>
            <input
              type="checkbox"
              checked={analytics}
              onChange={(e) => setAnalytics(e.target.checked)}
              className="mt-1 size-4 accent-teal-700"
            />
          </label>

          <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-slate-200 pt-2 dark:border-slate-700">
            <div>
              <span className="block font-semibold text-slate-800 dark:text-slate-100">
                {t.marketingLabel}
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">
                {t.marketingDesc}
              </span>
            </div>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-1 size-4 accent-teal-700"
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setCustomize((prev) => !prev)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <SlidersHorizontal size={12} />
          {t.customize}
        </button>
        <button
          type="button"
          onClick={() => saveDecision(false, false)}
          className="h-8 rounded-lg border border-slate-200 px-3 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t.rejectOptional}
        </button>
        {customize ? (
          <button
            type="button"
            onClick={() => saveDecision(analytics, marketing)}
            className="h-8 rounded-lg bg-teal-700 px-3 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            {t.savePreferences}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => saveDecision(true, true)}
            className="h-8 rounded-lg bg-teal-700 px-3 text-[11px] font-semibold text-white hover:bg-teal-800"
          >
            {t.acceptAll}
          </button>
        )}
      </div>
    </aside>
  );
}
