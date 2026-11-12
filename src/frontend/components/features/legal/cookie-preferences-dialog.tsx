'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { cookieTranslations, Locale } from '@/src/locales'

type CookieCopy = (typeof cookieTranslations)[Locale]

type CookiePreferencesDialogProps = {
  locale: Locale
  copy: CookieCopy
  open: boolean
  analytics: boolean
  advertising: boolean
  onAnalyticsChange: (value: boolean) => void
  onAdvertisingChange: (value: boolean) => void
  onAcceptAll: () => void
  onRejectNonEssential: () => void
  onSave: () => void
  onClose: () => void
}

export function CookiePreferencesDialog({ locale, copy, open, analytics, advertising, onAnalyticsChange, onAdvertisingChange, onAcceptAll, onRejectNonEssential, onSave, onClose }: CookiePreferencesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={dialogRef} aria-labelledby="cookie-preferences-title" aria-describedby="cookie-preferences-description" aria-modal="true" lang={locale} onCancel={(event) => { event.preventDefault(); onClose() }} className="m-auto max-h-[90dvh] w-[min(92vw,34rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:backdrop:bg-slate-950/80">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="cookie-preferences-title" className="text-lg font-semibold tracking-tight">{copy.preferencesTitle}</h2>
            <p id="cookie-preferences-description" className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.preferencesDescription}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={copy.closePreferences} className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:outline-teal-300"><X aria-hidden="true" /></button>
        </div>
        <fieldset className="mt-6 flex flex-col gap-3">
          <legend className="sr-only">{copy.preferencesTitle}</legend>
          <PreferenceRow id="cookie-essential" title={copy.essentialTitle} description={copy.essentialDescription} checked disabled />
          <PreferenceRow id="cookie-analytics" title={copy.analyticsTitle} description={copy.analyticsDescription} checked={analytics} onChange={onAnalyticsChange} />
          <PreferenceRow id="cookie-advertising" title={copy.advertisingTitle} description={copy.advertisingDescription} checked={advertising} onChange={onAdvertisingChange} />
        </fieldset>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button type="button" onClick={onRejectNonEssential} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:outline-teal-300">{copy.rejectNonEssential}</button>
          <button type="button" onClick={onSave} className="min-h-10 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-300 dark:text-slate-950 dark:hover:bg-teal-200 dark:focus-visible:outline-teal-300">{copy.savePreferences}</button>
          <button type="button" onClick={onAcceptAll} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:outline-teal-300">{copy.acceptAll}</button>
        </div>
      </div>
    </dialog>
  )
}

type PreferenceRowProps = {
  id: string
  title: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (value: boolean) => void
}

function PreferenceRow({ id, title, description, checked, disabled, onChange }: PreferenceRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700 dark:bg-slate-800/60">
      <div>
        <label htmlFor={id} className="text-sm font-semibold">{title}</label>
        <p id={`${id}-description`} className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p>
      </div>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} aria-describedby={`${id}-description`} onChange={(event) => onChange?.(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-teal-700 disabled:opacity-70" />
    </div>
  )
}
