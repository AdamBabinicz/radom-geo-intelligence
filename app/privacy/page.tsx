import type { Metadata } from 'next'
import { LegalPage } from '@/src/frontend/components/features/legal/legal-page'
import { legalTranslations } from '@/src/locales'

export function generateMetadata(): Metadata {
  const copy = legalTranslations.en
  return { title: copy.privacyTitle, description: copy.privacyDescription }
}

export default function PrivacyPage() {
  return <LegalPage locale="en" page="privacy" currentYear={new Date().getFullYear()} />
}
