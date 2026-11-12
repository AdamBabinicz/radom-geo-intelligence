'use client'

import { useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, Bell, Bot, ChevronDown, CircleHelp, Command, Globe2, LayoutDashboard, MapPin, Moon, Search, Settings2, Sparkles, Sun, TrendingUp, Users, Waves } from 'lucide-react'
import { translations, type Locale } from '@/src/locales'
import { CoverageMap } from './features/radius-map/coverage-map'
import { CompetitorTable } from './features/competitor-table/competitor-table'
import { RovoConsole } from './features/rovo-console/rovo-console'
import { PricingCalculator } from './features/pricing-calculator'

export function Dashboard() {
  const [locale, setLocale] = useState<Locale>('en')
  const [dark, setDark] = useState(false)
  const [running, setRunning] = useState(false)
  const t = translations[locale]
  const runScan = () => {
    setRunning(true)
    window.setTimeout(() => setRunning(false), 3200)
  }
  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-[#f5f7f8] text-slate-900 dark:bg-[#101719] dark:text-slate-100">
        <aside className="fixed inset-y-0 left-0 z-10 hidden w-[248px] flex-col border-r border-slate-200/80 bg-white px-5 py-6 dark:border-slate-800 dark:bg-[#141c1e] lg:flex">
          <a className="flex items-center gap-3 px-1" href="#overview"><span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white"><Waves size={21}/></span><span><span className="block text-sm font-semibold tracking-tight">{t.brand}</span><span className="text-[11px] text-slate-500">{t.workspace}</span></span></a>
          <p className="mb-3 mt-10 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">{t.workspace}</p>
          <nav className="flex flex-col gap-1 text-[13px] font-medium" aria-label={t.primaryNav}>
            <a href="#overview" className="flex items-center gap-3 rounded-lg bg-teal-50 px-3 py-2.5 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"><LayoutDashboard size={17}/>{t.overview}</a>
            <a href="#market" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><TrendingUp size={17}/>{t.marketIntelligence}<span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">{t.new}</span></a>
            <a href="#coverage" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><MapPin size={17}/>{t.serviceAreas}</a>
            <a href="#agent" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><Bot size={17}/>{t.rovoAgent}</a>
            <a href="#pricing" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"><Command size={17}/>{t.pricePreview}</a>
          </nav>
          <div className="mt-auto rounded-xl border border-slate-200 p-3.5 dark:border-slate-700"><div className="flex items-center gap-2 text-xs font-semibold"><CircleHelp size={15} className="text-teal-700"/>{t.needHelp}</div><p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">{t.helpCopy}</p><button className="mt-3 text-xs font-semibold text-teal-700 dark:text-teal-300">{t.viewGuide} →</button></div>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"><div className="grid size-9 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">MB</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{t.accountName}</p><p className="text-[10px] text-slate-500">{t.adminRole}</p></div><ChevronDown size={15} className="text-slate-400"/></div>
        </aside>
        <main id="overview" className="min-h-screen lg:ml-[248px]">
          <header className="sticky top-0 z-[5] flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-5 backdrop-blur-md dark:border-slate-800 dark:bg-[#141c1e]/90 md:px-9"><div className="flex items-center gap-2 text-xs text-slate-400">{t.workspace}<span>/</span><span className="font-semibold text-slate-700 dark:text-slate-200">{t.overview}</span></div><div className="flex items-center gap-2"><button aria-label={t.search} className="hidden size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:grid dark:hover:bg-slate-800"><Search size={17}/></button><button aria-label={t.notifications} className="relative grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Bell size={17}/><span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500"/></button><button aria-label={t.toggleTheme} onClick={() => setDark(!dark)} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">{dark ? <Sun size={17}/> : <Moon size={17}/>}</button><button onClick={() => setLocale(locale === 'en' ? 'pl' : 'en')} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold dark:border-slate-700"><Globe2 size={15}/>{locale.toUpperCase()}</button><button aria-label={t.settings} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Settings2 size={17}/></button></div></header>
          <div className="mx-auto max-w-[1450px] px-5 py-7 md:px-9 md:py-9">
            <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.15em] text-teal-700 dark:text-teal-300"><span className="size-1.5 rounded-full bg-teal-600"/>{t.radomRegion}</div><h1 className="text-[28px] font-semibold tracking-[-.04em] md:text-[32px]">{t.pageTitle}</h1><p className="mt-1.5 text-sm text-slate-500">{t.pageSubtitle}</p></div><button onClick={runScan} disabled={running} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:opacity-70"><Sparkles size={15}/>{running ? t.scanRunning : t.runScan}</button></div>
            <section aria-label={t.performanceSummary} className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric icon={<MapPin size={16}/>} label={t.coverageArea} value="30 km" foot={t.radiusFromRadom} positive/><Metric icon={<Users size={16}/>} label={t.serviceableTowns} value="8" foot={t.townsInRadius} positive/><Metric icon={<Activity size={16}/>} label={t.localCompetitors} value="24" foot={t.competitorsTracked}/><Metric icon={<TrendingUp size={16}/>} label={t.avgMarketGap} value="−12%" foot={t.belowMarketAverage}/></section>
            <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]"><CoverageMap t={t}/><CompetitorTable t={t}/></div>
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.08fr_.92fr]"><RovoConsole t={t} running={running} onRun={runScan}/><PricingCalculator t={t}/></div>
            <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-slate-200 py-5 text-[10px] text-slate-400 sm:flex-row dark:border-slate-800"><span>{t.footerLeft}</span><span>{t.footerRight}</span></footer>
          </div>
        </main>
      </div>
    </div>
  )
}

function Metric({ icon, label, value, foot, positive }: { icon: React.ReactNode; label: string; value: string; foot: string; positive?: boolean }) {
  return <article className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_2px_8px_rgba(20,40,45,.025)] dark:border-slate-800 dark:bg-[#172123] md:p-5"><div className="flex items-center justify-between"><span className="text-xs text-slate-500">{label}</span><span className="grid size-8 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">{icon}</span></div><div className="mt-3 flex items-baseline gap-2"><span className="text-[25px] font-semibold tracking-tight">{value}</span><span className="flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">{positive ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>} {positive ? '+8.4%' : '−3.2%'}</span></div><p className="mt-1 text-[10px] text-slate-400">{foot}</p></article>
}
