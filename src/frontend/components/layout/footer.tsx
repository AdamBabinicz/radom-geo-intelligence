'use client'

import { cookieTranslations, legalTranslations, type Locale } from '@/src/locales'
import { OPEN_PREFERENCES_EVENT } from '../features/legal/consent-storage'

type AppFooterProps = {
  locale: Locale
  currentYear: number
  caseStudy?: string
}

export function AppFooter({ locale, currentYear, caseStudy }: AppFooterProps) {
  const legal = legalTranslations[locale]
  const cookies = cookieTranslations[locale]
  const years = currentYear >= 2027 ? `2026 - ${currentYear}` : '2026'
  return (
    <footer className="mt-8 flex flex-col gap-3 border-t border-slate-200 py-5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
      <p>{legal.copyrightTemplate.replace('{years}', years)}</p>
      {caseStudy && <p>{caseStudy}</p>}
      <nav aria-label={legal.footerNavigationLabel} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={locale === 'pl' ? '/polityka-prywatnosci' : '/privacy'} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{legal.privacyLink}</a>
        <a href={locale === 'pl' ? '/regulamin' : '/terms'} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{legal.termsLink}</a>
        <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PREFERENCES_EVENT))} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{cookies.settingsLink}</button>
      </nav>
    </footer>
  )
}
