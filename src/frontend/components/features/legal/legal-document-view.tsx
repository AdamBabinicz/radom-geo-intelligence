"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Globe2, Moon, Sun } from "lucide-react";
import { translations, type Locale } from "@/src/locales";

const LOCALE_KEY = "northstar_locale";
const THEME_KEY = "northstar_theme";

export function LegalDocumentView({
  docType,
  initialLocale,
}: {
  docType: "privacy" | "terms";
  initialLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    if (savedTheme === "dark") setDark(true);
    if (!initialLocale) {
      const savedLocale = window.localStorage.getItem(LOCALE_KEY);
      if (savedLocale === "pl" || savedLocale === "en") setLocale(savedLocale);
    }
  }, [initialLocale]);

  const toggleLocale = () => {
    const next: Locale = locale === "en" ? "pl" : "en";
    setLocale(next);
    window.localStorage.setItem(LOCALE_KEY, next);
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  };

  const t = translations[locale];
  const isPrivacy = docType === "privacy";

  return (
    <div className={dark ? "dark" : ""}>
      <main className="min-h-screen bg-[#f5f7f8] px-6 py-12 text-slate-900 dark:bg-[#101719] dark:text-slate-100">
        <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-[#172123]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/?lang=${locale}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
            >
              <ArrowLeft size={14} />
              {t.backToDashboard}
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t.toggleTheme}
                onClick={toggleTheme}
                className="grid size-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button
                type="button"
                onClick={toggleLocale}
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold dark:border-slate-700"
              >
                <Globe2 size={14} />
                {locale.toUpperCase()}
              </button>
            </div>
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {isPrivacy ? t.privacyHeading : t.termsHeading}
          </h1>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {isPrivacy ? t.privacyMeta : t.termsMeta}
          </p>

          <section className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                {isPrivacy ? t.privacySec1Title : t.termsSec1Title}
              </h2>
              <p className="mt-1">
                {isPrivacy ? t.privacySec1Body : t.termsSec1Body}
              </p>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                {isPrivacy ? t.privacySec2Title : t.termsSec2Title}
              </h2>
              <p className="mt-1">
                {isPrivacy ? t.privacySec2Body : t.termsSec2Body}
              </p>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">
                {isPrivacy ? t.privacySec3Title : t.termsSec3Title}
              </h2>
              <p className="mt-1">
                {isPrivacy ? t.privacySec3Body : t.termsSec3Body}
              </p>
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
