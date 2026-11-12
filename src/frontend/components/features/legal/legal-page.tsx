'use client'

import { useEffect } from 'react'
import { legalTranslations, type Locale } from '@/src/locales'
import { AppFooter } from '../../layout/footer'

type LegalPageProps = {
  locale: Locale
  page: 'privacy' | 'terms'
  currentYear: number
}

export function LegalPage({ locale, page, currentYear }: LegalPageProps) {
  const copy = legalTranslations[locale]
  const isPrivacy = page === 'privacy'
  const title = isPrivacy ? copy.privacyTitle : copy.termsTitle
  const updated = isPrivacy ? copy.privacyUpdated : copy.termsUpdated
  const sections = isPrivacy ? copy.privacySections : copy.termsSections

  useEffect(() => {
    document.documentElement.lang = locale
    window.dispatchEvent(new Event('app-locale-change'))
  }, [locale])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <a href="/" className="text-sm font-semibold text-teal-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">{copy.backToDashboard}</a>
        <header className="mb-8 mt-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{isPrivacy ? copy.privacyDescription : copy.termsDescription}</p>
          <p className="mt-3 text-xs text-slate-500">{updated}</p>
        </header>
        <div className="flex flex-col gap-7">
          {sections.map((section) => <section key={section.title} aria-labelledby={`legal-${section.title}`}>
            <h2 id={`legal-${section.title}`} className="text-lg font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-2 flex flex-col gap-3 text-sm leading-7 text-slate-700">
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>)}
        </div>
        <AppFooter locale={locale} currentYear={currentYear} />
      </div>
    </main>
  )
}
