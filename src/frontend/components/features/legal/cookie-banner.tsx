'use client'

import { useEffect, useRef, useState } from 'react'
import { cookieTranslations, type Locale } from '@/src/locales'
import { CookiePreferencesDialog } from './cookie-preferences-dialog'
import { OPEN_PREFERENCES_EVENT, publishConsent, readConsent, saveConsent, type ConsentChoice } from './consent-storage'

export function CookieBanner() {
  const [locale, setLocale] = useState<Locale>('en')
  const [choice, setChoice] = useState<ConsentChoice | null>(null)
  const choiceRef = useRef<ConsentChoice | null>(null)
  choiceRef.current = choice
  const [analytics, setAnalytics] = useState(false)
  const [advertising, setAdvertising] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const copy = cookieTranslations[locale]

  useEffect(() => {
    const updateLocale = () => setLocale(document.documentElement.lang.toLowerCase().startsWith('pl') ? 'pl' : 'en')
    const openPreferences = () => { const current = readConsent() ?? choiceRef.current; setAnalytics(current?.analytics ?? false); setAdvertising(current?.advertising ?? false); setPreferencesOpen(true) }
    const stored = readConsent()
    setChoice(stored)
    setAnalytics(stored?.analytics ?? false)
    setAdvertising(stored?.advertising ?? false)
    if (stored) publishConsent(stored)
    updateLocale()
    setHydrated(true)
    window.addEventListener('app-locale-change', updateLocale)
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPreferences)
    return () => {
      window.removeEventListener('app-locale-change', updateLocale)
      window.removeEventListener(OPEN_PREFERENCES_EVENT, openPreferences)
    }
  }, [])

  const save = (allowAnalytics: boolean, allowAdvertising: boolean) => {
    const saved = saveConsent(allowAnalytics, allowAdvertising)
    setChoice(saved)
    setAnalytics(saved.analytics)
    setAdvertising(saved.advertising)
    publishConsent(saved)
    setPreferencesOpen(false)
  }

  return (
    <>
      {hydrated && !choice && !preferencesOpen && <section aria-label={copy.bannerTitle} className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white p-4 text-slate-900 shadow-[0_-10px_40px_rgba(15,23,42,.14)] sm:p-5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:shadow-black/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl"><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{copy.bannerTitle}</h2><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{copy.bannerDescription}</p></div>
          <div className="grid shrink-0 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => save(false, false)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:outline-teal-300">{copy.rejectNonEssential}</button>
            <button type="button" onClick={() => { setAnalytics(false); setAdvertising(false); setPreferencesOpen(true) }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:outline-teal-300">{copy.customizePreferences}</button>
            <button type="button" onClick={() => save(true, true)} className="min-h-10 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:col-span-2 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200 dark:focus-visible:outline-teal-300">{copy.acceptAll}</button>
          </div>
        </div>
      </section>}
      <CookiePreferencesDialog locale={locale} copy={copy} open={preferencesOpen} analytics={analytics} advertising={advertising} onAnalyticsChange={setAnalytics} onAdvertisingChange={setAdvertising} onAcceptAll={() => save(true, true)} onRejectNonEssential={() => save(false, false)} onSave={() => save(analytics, advertising)} onClose={() => setPreferencesOpen(false)} />
    </>
  )
}
