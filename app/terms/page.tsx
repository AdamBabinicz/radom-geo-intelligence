import { LegalDocumentView } from "@/src/frontend/components/features/legal/legal-document-view";
import type { Locale } from "@/src/locales";

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const initialLocale: Locale = params.lang === "pl" ? "pl" : "en";
  return <LegalDocumentView docType="terms" initialLocale={initialLocale} />;
}
