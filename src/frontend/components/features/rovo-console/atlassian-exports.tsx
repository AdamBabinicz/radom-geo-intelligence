'use client'

import { useState } from 'react'
import { BookOpen, Check, ListChecks, LoaderCircle } from 'lucide-react'
import type { IntelligenceDictionary, Locale } from '@/src/locales'
import { formatPriceFromPln } from '@/src/frontend/lib/format-currency'

type ExportKind = 'confluence' | 'jira'
type ExportStatus = 'idle' | 'running' | 'success'

export function AtlassianExports({ t, locale, city, radiusKm }: { t: IntelligenceDictionary; locale: Locale; city: string; radiusKm: number }) {
  const [kind, setKind] = useState<ExportKind | null>(null)
  const [status, setStatus] = useState<ExportStatus>('idle')
  const fill = (value: string) => value.replaceAll('{city}', city).replaceAll('{radius}', String(radiusKm))
  const log = status === 'idle' || !kind ? '' : status === 'running' ? (kind === 'confluence' ? t.confluenceMcpStart : t.jiraMcpStart) : (kind === 'confluence' ? t.confluenceMcpDone : t.jiraMcpDone)
  const exportDraft = (nextKind: ExportKind) => {
    setKind(nextKind)
    setStatus('running')
    window.setTimeout(() => {
      setStatus('success')
    }, 900)
  }
  const tasks = [t.jiraTaskLocalAds, t.jiraTaskFlyers, t.jiraTaskWebsite, t.jiraTaskSocial, t.jiraTaskReviews]
  const benchmarks = [
    [t.draftSofaBenchmark, t.serviceCornerSofa, 280, 249],
    [t.draftCouchBenchmark, t.serviceTwoSeatCouch, 190, 169],
    [t.draftCarpetBenchmark, t.serviceCarpet, 18, 16],
  ] as const
  return (
    <div className="border-t border-slate-200 px-5 py-4 dark:border-slate-800">
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => exportDraft('confluence')} disabled={status === 'running'} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-center text-[10px] font-semibold text-slate-700 transition hover:border-teal-600 hover:text-teal-800 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:text-teal-200"><BookOpen size={14}/>{status === 'running' && kind === 'confluence' ? t.exportConfluenceWorking : t.exportConfluenceButton}</button>
        <button type="button" onClick={() => exportDraft('jira')} disabled={status === 'running'} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-center text-[10px] font-semibold text-white transition hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-600"><ListChecks size={14}/>{status === 'running' && kind === 'jira' ? t.exportJiraWorking : t.exportJiraButton}</button>
      </div>
      {status !== 'idle' && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60" aria-live="polite">
        <p className="flex items-center gap-2 font-mono text-[9px] text-teal-800 dark:text-teal-200">{status === 'running' ? <LoaderCircle size={12} className="animate-spin"/> : <Check size={12}/>}<span>{log}</span></p>
        {status === 'success' && kind === 'confluence' && <article className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><h3 className="text-xs font-semibold">{fill(t.confluencePageTitle)}</h3><h4 className="mt-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{t.draftBenchmarksHeading}</h4><ul className="mt-1 grid gap-1 text-[10px] text-slate-500">{benchmarks.map(([template, service, marketPrice, offerPrice]) => <li key={service}>{template.replace('{service}', service).replace('{marketPrice}', formatPriceFromPln(marketPrice, locale)).replace('{offerPrice}', formatPriceFromPln(offerPrice, locale))}</li>)}</ul><h4 className="mt-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{t.draftCampaignHeading}</h4><p className="mt-1 text-[10px] leading-relaxed text-slate-500">{fill(t.draftCampaignCopy)}</p><p className="mt-2 text-[9px] text-slate-400">{t.draftPreviewNote}</p></article>}
        {status === 'success' && kind === 'jira' && <article className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><h3 className="text-xs font-semibold">{t.jiraEpicHeading}</h3><p className="mt-1 text-[10px] text-slate-600 dark:text-slate-300">{fill(t.jiraEpicTitle)}</p><h4 className="mt-3 text-[10px] font-semibold text-slate-600 dark:text-slate-300">{t.jiraSubtasksHeading}</h4><ol className="mt-1 list-inside list-decimal space-y-1 text-[10px] text-slate-500">{tasks.map((task) => <li key={task}>{task}</li>)}</ol><p className="mt-2 text-[9px] text-slate-400">{t.jiraPreviewNote}</p></article>}
      </div>}
    </div>
  )
}
