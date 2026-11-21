"use client";

import Link from "next/link";
import {
  Bot,
  BrainCircuit,
  CircleHelp,
  Command,
  Globe2,
  LayoutDashboard,
  MapPin,
  Moon,
  Search,
  Sun,
  TrendingUp,
  Waves,
} from "lucide-react";
import type { AppDictionary, Locale } from "@/src/locales";
import type { WorkspaceProfile } from "./types-and-helpers";

interface DashboardSidebarProps {
  t: AppDictionary;
  workspaceProfile: WorkspaceProfile;
  onFocusSearch: () => void;
}

export function DashboardSidebar({
  t,
  workspaceProfile,
  onFocusSearch,
}: DashboardSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white px-5 py-6 dark:border-slate-800 dark:bg-[#141c1e] lg:flex">
      <a className="flex items-center gap-3 px-1" href="#overview">
        <span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white">
          <Waves size={21} />
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-tight">
            {t.brand}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {t.workspace}
          </span>
        </span>
      </a>

      <p className="mb-3 mt-10 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-500 dark:text-slate-400">
        {t.workspace}
      </p>
      <nav
        className="flex flex-col gap-1 text-[13px] font-medium"
        aria-label={t.primaryNav}
      >
        <a
          href="#overview"
          className="flex items-center gap-3 rounded-lg bg-teal-50 px-3 py-2.5 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
        >
          <LayoutDashboard size={17} />
          {t.overview}
        </a>
        <a
          href="#market"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <TrendingUp size={17} />
          {t.marketIntelligence}
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            {t.new}
          </span>
        </a>
        <a
          href="#coverage"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <MapPin size={17} />
          {t.serviceAreas}
        </a>
        <a
          href="#agent"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Bot size={17} />
          {t.rovoAgent}
        </a>
        <a
          href="#pricing"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Command size={17} />
          {t.pricePreview}
        </a>
        <a
          href="#council"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <BrainCircuit size={17} />
          {t.councilTitle}
        </a>
      </nav>

      <div className="mt-auto rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <CircleHelp size={15} className="text-teal-700 dark:text-teal-300" />
          {t.needHelp}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
          {t.helpCopy}
        </p>
        <button
          type="button"
          onClick={onFocusSearch}
          className="mt-3 text-xs font-semibold text-teal-700 dark:text-teal-300"
        >
          {t.viewGuide} →
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
        <div
          className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold ${
            workspaceProfile.isDomainBound
              ? "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-200"
              : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
          }`}
        >
          {workspaceProfile.initials}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-xs font-semibold"
            title={workspaceProfile.displayName}
          >
            {workspaceProfile.displayName}
          </p>
          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
            {t.adminRole}
          </p>
        </div>
      </div>
    </aside>
  );
}

interface DashboardHeaderProps {
  t: AppDictionary;
  locale: Locale;
  dark: boolean;
  onFocusSearch: () => void;
  onToggleDark: () => void;
  onToggleLocale: () => void;
}

export function DashboardHeader({
  t,
  locale,
  dark,
  onFocusSearch,
  onToggleDark,
  onToggleLocale,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#141c1e]/90 sm:px-5 md:px-9">
      <div className="flex min-w-0 items-center gap-2 truncate text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">{t.workspace}</span>
        <span>/</span>
        <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
          {t.overview}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onFocusSearch}
          aria-label={t.search}
          title={`${t.search} (Ctrl+K)`}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Search size={15} />
          <kbd className="hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300 sm:inline">
            Ctrl+K
          </kbd>
        </button>
        <button
          type="button"
          aria-label={t.toggleTheme}
          onClick={onToggleDark}
          className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {dark ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          type="button"
          onClick={onToggleLocale}
          className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold dark:border-slate-700"
        >
          <Globe2 size={15} />
          {locale.toUpperCase()}
        </button>
      </div>
    </header>
  );
}

interface DashboardFooterProps {
  t: AppDictionary;
  copyrightRange: string;
  isCaseStudy: boolean;
  legalRoutes: { privacy: string; terms: string };
  onOpenCookieSettings: () => void;
}

export function DashboardFooter({
  t,
  copyrightRange,
  isCaseStudy,
  legalRoutes,
  onOpenCookieSettings,
}: DashboardFooterProps) {
  return (
    <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-slate-200 py-5 text-[11px] text-slate-600 sm:flex-row sm:items-center dark:border-slate-800 dark:text-slate-400">
      <span>
        © {copyrightRange} {t.brand} · {t.footerLeft}
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <span>{isCaseStudy ? t.footerRight : t.citySourceLiveGeo}</span>
        <Link
          href={legalRoutes.privacy}
          className="font-medium hover:text-teal-700 dark:hover:text-teal-300"
        >
          {t.privacyPolicy}
        </Link>
        <Link
          href={legalRoutes.terms}
          className="font-medium hover:text-teal-700 dark:hover:text-teal-300"
        >
          {t.termsOfService}
        </Link>
        <button
          type="button"
          onClick={onOpenCookieSettings}
          className="font-medium text-teal-700 hover:underline dark:text-teal-300"
        >
          {t.cookieSettingsBtn}
        </button>
      </div>
    </footer>
  );
}
