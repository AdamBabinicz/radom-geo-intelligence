import type { Metadata } from 'next'
import { LegalPage } from '@/src/frontend/components/features/legal/legal-page'
import { legalTranslations } from '@/src/locales'

export function generateMetadata(): Metadata {
  const copy = legalTranslations.pl
  return { title: copy.termsTitle, description: copy.termsDescription }
}

export default function PolishTermsPage() {
  return <LegalPage locale="pl" page="terms" currentYear={new Date().getFullYear()} />
}
