import type { Metadata } from 'next'
import { LegalPage } from '@/src/frontend/components/features/legal/legal-page'
import { legalTranslations } from '@/src/locales'

export function generateMetadata(): Metadata {
  const copy = legalTranslations.pl
  return { title: copy.privacyTitle, description: copy.privacyDescription }
}

export default function PolishPrivacyPage() {
  return <LegalPage locale="pl" page="privacy" currentYear={new Date().getFullYear()} />
}
