import type { Metadata } from 'next'
import { LegalPage } from '@/src/frontend/components/features/legal/legal-page'
import { legalTranslations } from '@/src/locales'

export function generateMetadata(): Metadata {
  const copy = legalTranslations.en
  return { title: copy.termsTitle, description: copy.termsDescription }
}

export default function TermsPage() {
  return <LegalPage locale="en" page="terms" currentYear={new Date().getFullYear()} />
}
